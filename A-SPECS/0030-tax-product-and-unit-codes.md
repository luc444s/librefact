# A.SPEC 0030 - Generic tax product and unit codes

> `risk: medium` - adds fiscal catalog fields to products and units and stops
> hardcoding `SERVICE`/`ZZ` in the SUNAT XML, without changing the sales or
> emission lifecycle.

## WHY

Today the emitted invoice always sends `codProducto = SERVICE` and
`unidad = ZZ`:

- `services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php:85-86`.

That is only correct for generic services. For real goods (e.g. a Pepsi) SUNAT
expects a real product code from the UNSPSC catalog (Catálogo de Bienes y
Servicios) and a real unit of measure from Catálogo No. 03.

The business has a real retail catalog (13 lines: ABARROTES, BEBIDAS, CONSERVAS,
DESAYUNO, GALLETAS, GOLOSINAS, HIGIENE, LACTEOS, LIMPIEZA, PANIFICADOS, SALSAS,
SNACKS) but `prod_products` has no fiscal product code and `prod_units` has no
fiscal unit code.

The naming must stay generic (`tax_*`, not `sunat_*`) so the same model can be
reused for another country or tax authority by changing the scheme.

## WHAT

Add generic fiscal code fields to products and units, seed small curated
catalogs, and use them in the SUNAT XML with safe fallbacks.

Required behavior:

- `prod_products.tax_product_code` and `prod_products.tax_product_scheme`
  (`UNSPSC` for Peru).
- `prod_units.tax_unit_code` and `prod_units.tax_unit_scheme`
  (`SUNAT_03` for Peru).
- Global curated catalogs `tax_products` and `tax_units` (not per tenant).
- Curated seed derived from the business lines, not the full 49k UNSPSC file.
- `sales_mapper` sends the product code, scheme, SKU, and unit code per item.
- Adapter maps the product code to Greenter `setCodProdSunat`, the SKU to
  `setCodProducto`, and the unit code to `setUnidad`.
- Fallbacks preserve current behavior when a product has no fiscal codes:
  `unidad = ZZ` and `codProducto = SERVICE`.

## SCOPE

### Productos plugin

- `plugins/productos/backend/models.py`
  - Add `tax_product_code`, `tax_product_scheme` to `Product`.
  - Add `tax_unit_code`, `tax_unit_scheme` to `ProductUnit`.
  - Add `TaxProduct`, `TaxProductHint`, and `TaxUnit` catalog models.
- `plugins/productos/backend/schemas.py`
  - Expose the new fields on read/create/update schemas.
- `plugins/productos/migrations/011_tax_product_and_unit_codes.py`
  - Create `tax_products`, `tax_product_hints`, `tax_units`.
  - Add the new columns to `prod_products` and `prod_units`.
  - Seed the curated catalogs.

### Ventas / facturacion

- `plugins/ventas/facturacion/backend/services/sales_mapper.py`
  - Read product fiscal code/scheme and unit fiscal code/scheme per item.
  - Include `product_code`, `product_scheme`, `sku`, `unit_code`,
    `unit_scheme` in each adapter item.

### Adapter

- `services/greenter-adapter/src/Domain/DocumentItem.php`
  - Add `productCode`, `unitCode`, and `sku` with backwards-compatible defaults.
- `services/greenter-adapter/src/Mapping/EmitDocumentRequestMapper.php`
  - Read the new item fields with defaults.
- `services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php`
  - `setUnidad($item->unitCode ?: 'ZZ')`.
  - `setCodProdSunat($item->productCode)` when present.
  - `setCodProducto($item->sku ?: 'SERVICE')`.

### Tests

- Productos migration/seed test.
- `sales_mapper` test for product/unit code propagation.
- Adapter mapper test for `codProdSunat`, `codProducto`, `unidad`.
- XML generator test asserting the emitted nodes.
- Fallback test: product without fiscal codes still emits `ZZ`/`SERVICE`.

## OUT OF SCOPE

- Importing the full 49k UNSPSC catalog.
- Automatic UNSPSC inference from free text or line names.
- Product selection UI beyond exposing the fields.
- Catálogo No. 07 (tipo de afectación IGV) and tax exemptions.
- Non-Peru authorities beyond keeping the scheme generic.
- Changing the sales or emission lifecycle.

## CONTRACT

### Product and unit fields

- `prod_products.tax_product_code` is nullable and stores the fiscal catalog
  code (UNSPSC 8 digits for Peru).
- `prod_products.tax_product_scheme` defaults to `UNSPSC` when a code is set.
- `prod_units.tax_unit_code` is nullable and stores the fiscal unit code
  (Catálogo No. 03, e.g. `NIU`, `KGM`, `LTR`, `ZZ`).
- `prod_units.tax_unit_scheme` defaults to `SUNAT_03` when a code is set.

### Adapter payload item

Each `items[]` entry may include:

```json
{
  "description": "gaseosa pepsi 500ml",
  "quantity": 1,
  "unit_value": 2.54,
  "igv": 0.46,
  "tax_rate": 18,
  "total": 3.0,
  "sku": "7750670014984",
  "product_code": "50202306",
  "product_scheme": "UNSPSC",
  "unit_code": "NIU",
  "unit_scheme": "SUNAT_03"
}
```

### Emission rules

- `product_code` present -> `cac:StandardItemIdentification` (UNSPSC).
- `sku` present -> `cac:SellersItemIdentification`; otherwise `SERVICE`.
- `unit_code` present -> `cbc:InvoicedQuantity unitCode`; otherwise `ZZ`.
- Missing fiscal codes must never block emission.

## DATA MODEL

```sql
-- global catalogs (no tenant_id)

CREATE TABLE IF NOT EXISTS tax_products (
    id VARCHAR(36) PRIMARY KEY,
    scheme VARCHAR(20) NOT NULL DEFAULT 'UNSPSC',
    code VARCHAR(20) NOT NULL,
    description VARCHAR(255) NOT NULL,
    segment_code VARCHAR(8),
    segment_name VARCHAR(255),
    family_code VARCHAR(8),
    family_name VARCHAR(255),
    class_code VARCHAR(8),
    class_name VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (scheme, code)
);

CREATE TABLE IF NOT EXISTS tax_product_hints (
    scheme VARCHAR(20) NOT NULL DEFAULT 'UNSPSC',
    code VARCHAR(20) NOT NULL,
    hint_level VARCHAR(20) NOT NULL, -- 'category' | 'line' | 'subline' | 'group'
    hint_value VARCHAR(60) NOT NULL,
    PRIMARY KEY (scheme, code, hint_level, hint_value)
);

CREATE TABLE IF NOT EXISTS tax_units (
    id VARCHAR(36) PRIMARY KEY,
    scheme VARCHAR(20) NOT NULL DEFAULT 'SUNAT_03',
    code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (scheme, code)
);

ALTER TABLE prod_products ADD COLUMN IF NOT EXISTS tax_product_code VARCHAR(20);
ALTER TABLE prod_products ADD COLUMN IF NOT EXISTS tax_product_scheme VARCHAR(20);

ALTER TABLE prod_units ADD COLUMN IF NOT EXISTS tax_unit_code VARCHAR(10);
ALTER TABLE prod_units ADD COLUMN IF NOT EXISTS tax_unit_scheme VARCHAR(20);
```

## SEED

### `tax_units` (scheme `SUNAT_03`)

```text
NIU  Unidad
KGM  Kilogramo
GRM  Gramo
LTR  Litro
MLT  Mililitro
MTR  Metro
MTK  Metro cuadrado
MTQ  Metro cúbico
HUR  Hora
DAY  Día
ZZ   Unidad de servicio
```

### `tax_products` (scheme `UNSPSC`, curated)

Curated from the SUNAT/UNSPSC v14 file, grouped by the current product lines.

```text
# BEBIDAS
50202301 Agua
50202306 Refrescos
50202305 Jugo fresco
50202304 Jugos de repisa
50202309 Bebidas deportivas o de energía
50202310 Agua mineral
50202311 Bebida mixta de polvo
50202201 Cerveza
50201706 Café
50201710 Té de hoja

# ABARROTES
50221101 Grano de cereal
50192901 Pasta sencilla o fideos
50192902 Pasta o fideos de repisa
50151513 Aceites vegetales comestibles
50221301 Harina vegetal
50221303 Almidón o harina comestible
50161509 Azúcares naturales o endulzantes
50192403 Miel

# CONSERVAS
50467007 Atún enlatada
50121901 Pulpo en escabeche
50121902 Huevos de abadejo salado
50121903 Camarón salado
50192401 Mermeladas o preservativos de fruta

# DESAYUNO
50201709 Café instantáneo
50201713 Bolsas de té
50221201 Listo para comer o cereal caliente
50131704 Leche en polvo

# GALLETAS
50181903 Galletas sencillas de sal
50181905 Galletas de dulce
50181909 Galletas de soda
50182005 Galletas de arroz
50181904 Pan seco o cáscaras de pan o pan tostado

# GOLOSINAS
50161813 Chocolate o sustituto de chocolate, confite
50161814 Azúcar o sustituto de azúcar, confite
50161815 Goma de mascar
50161511 Chocolate o sustituto de chocolate

# HIGIENE
53131608 Jabones
53131606 Desodorantes
53131602 Artículos para el cuidado del cabello
53131604 Cepillos o peinillas para el cabello
53131609 Productos de protección solar
53131612 Geles de baño

# LACTEOS
50131701 Productos de leche o mantequilla frescos
50131702 Productos de leche o mantequilla de estante
50131801 Queso natural
50131802 Queso procesado

# LIMPIEZA
47131801 Limpiadores de pisos
47131803 Desinfectantes para uso doméstico
47131805 Limpiadores de propósito general
47131807 Blanqueadores
47131811 Productos de lavandería
47131810 Productos para el lavaplatos
47121803 Esponjas o esponjillas
47121804 Baldes para limpieza

# PANIFICADOS
50181901 Pan fresco
50181902 Pan congelado
50181906 Pan de repisa

# SALSAS
50171830 Salsas o condimentos o cremas de untar o marinados
50171831 Salsas para cocinar
50171832 Salsas para ensaladas o dips
50171833 Cremas de untar saladas o patés

# SNACKS
50192109 Papas fritas de talego o mezclas
50192110 Nueces o fruta disecada
50192112 Maíz pira
50192111 Carne seca o procesada
```

Codes shared by more than one line are expressed through `tax_product_hints`,
e.g. `50201706 -> line BEBIDAS, line DESAYUNO`,
`50192403 -> line ABARROTES, line DESAYUNO`,
`50181904 -> line GALLETAS, line PANIFICADOS`,
`50131704 -> line ABARROTES, line DESAYUNO, line LACTEOS`.

### Suggestion resolution

Hints are level-agnostic. The UI resolves suggestions by specificity, walking
the product hierarchy from most specific to least specific:

```text
group / subline  ->  line  ->  category
```

The first level with hints wins. Today every product has `line_id` (1262/1262),
so suggestions resolve at `line`; `subline`, `group`, and `category` hints can
be added later without a migration. `category` exists but is coarser than
`line` and currently duplicates line names, so it is not seeded.

Known gaps to resolve manually later: arroz as a finished good, sal, papel
higiénico, pasta dental.

## INVARIANTS

```yaml
invariants:
  - tax field naming is generic, never sunat-prefixed
  - tax_product_code is UNSPSC and separate from the seller SKU
  - tax_unit_code defaults the emitter to ZZ only when absent
  - missing fiscal codes never block emission
  - catalogs are global, product assignments are per product
  - suggestion hints are level-agnostic and resolved most-specific first
  - NOTA_VENTA remains non-emitable
  - existing payloads without the new item fields still validate
```

## VERIFICATION

```bash
PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile \
  plugins/productos/backend/models.py \
  plugins/productos/backend/schemas.py \
  plugins/productos/migrations/011_tax_product_and_unit_codes.py \
  plugins/ventas/facturacion/backend/services/sales_mapper.py
php -l services/greenter-adapter/src/Domain/DocumentItem.php
php -l services/greenter-adapter/src/Mapping/EmitDocumentRequestMapper.php
php -l services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php
composer test --working-dir services/greenter-adapter
npm run plugins:migrate
npm run typecheck
```

Final acceptance check:

- `npm run plugins:migrate` reaches `productos=0011`.
- `tax_units` has 11 rows and `tax_products` has the curated rows.
- A product with `tax_product_code=50202306` and unit `NIU` emits
  `cac:StandardItemIdentification` `50202306` and `unitCode="NIU"`.
- A product without fiscal codes still emits `SERVICE`/`ZZ`.
- Adapter suite stays green.

## ROLLBACK

- Revert code changes.
- Downgrade migration drops `tax_products`, `tax_product_hints`,
  `tax_units` and the new columns.
- Already assigned codes are lost on downgrade; re-assign after rollback.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/productos/backend/models.py
    - plugins/productos/backend/schemas.py
    - plugins/productos/backend/services/products.py
    - plugins/productos/backend/services/catalog.py
    - plugins/productos/migrations/011_tax_product_and_unit_codes.py
    - plugins/ventas/facturacion/backend/services/sales_mapper.py
    - services/greenter-adapter/src/Domain/DocumentItem.php
    - services/greenter-adapter/src/Mapping/EmitDocumentRequestMapper.php
    - services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php
    - services/greenter-adapter/tests/**
    - A-SPECS/0030-tax-product-and-unit-codes.md
    - A-SPECS/TODO.md
  prohibited:
    - plugins/pos/**
    - plugins/stock/**
    - plugins/compras/**
    - services/greenter-adapter/src/Http/**
    - services/greenter-adapter/src/Sunat/**
    - secrets or .env
```

## Traceability

- Requirement: user wants the invoice to send a real product code (UNSPSC) and
  unit code instead of hardcoded `SERVICE`/`ZZ`, keeping the model generic for
  use outside Peru.
- owner: agent
- approver: lucas
- Commit: 69daa9d.
- TRACE: PASS - commit validated against TRACE.md.
- Deployment: Pending.

## Definition of Done

- [x] Spec created
- [x] `tax_products`, `tax_product_hints`, `tax_units` created
- [x] Curated seed applied (11 units, curated products)
- [x] `prod_products` fiscal fields added
- [x] `prod_units` fiscal fields added
- [x] `sales_mapper` sends product/unit fiscal codes
- [x] Adapter maps `codProdSunat`, `codProducto`, `unidad`
- [x] Fallback `SERVICE`/`ZZ` preserved
- [x] Productos services persist/list new fields
- [x] Productos and adapter tests pass
- [x] `npm run plugins:migrate` reaches `productos=0011`
- [x] `npm run typecheck` passes
- [x] No secrets committed
