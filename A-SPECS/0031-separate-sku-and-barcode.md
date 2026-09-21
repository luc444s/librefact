# A.SPEC 0031 - Separate SKU and barcode in products

> `risk: medium` - separates the product internal SKU from scan barcodes in
> product UI and data migration, while preserving existing search and sales
> behavior.

## WHY

Today many products use `prod_products.sku` as if it were the barcode. The data
model already has two concepts:

- `prod_products.sku`: internal seller/product code.
- `prod_barcodes.barcode`: scan code such as EAN/UPC/GS1, with primary barcode
  support.

Keeping barcode values in `sku` creates confusion:

- Product list only shows `SKU`, even when that value is really a barcode.
- Product edit asks for `SKU`, but users often paste/scan the product barcode.
- POS and search already support barcodes through `prod_barcodes`, so barcode
  should live there.
- A.SPEC 0030 maps `sku` to `codProducto` in fiscal emission, so `sku` should be
  the seller/internal code, not necessarily the physical barcode.

## WHAT

Separate the visible and persisted responsibilities of SKU and barcode.

Required behavior:

- Product list shows both `SKU` and primary `Barcode`.
- Product form keeps `SKU` as internal code.
- Product creation/edit supports a primary barcode field separate from `SKU`.
- Existing barcode-like SKUs are backfilled into `prod_barcodes` as primary GS1
  barcodes when missing.
- Existing products get a generated internal SKU if their current SKU is moved to
  barcode.
- Search continues to work by name, SKU, and barcode.
- POS product search continues to work by barcode without changing checkout.
- Fiscal emission keeps using `sku` as seller item code (`codProducto`) and never
  requires barcode.

## SCOPE

### Productos backend

- `plugins/productos/backend/schemas.py`
  - Expose `primary_barcode` / `primary_barcode_type` on product list/detail
    reads.
  - Accept optional `primary_barcode` / `primary_barcode_type` on product
    create/update payloads.
- `plugins/productos/backend/services/products.py`
  - Join/read primary barcode for product list/detail serialization.
  - On create/update, write primary barcode through barcode service when provided.
  - Auto-generate SKU when create payload omits SKU, if schema is relaxed.
- `plugins/productos/backend/services/barcode.py`
  - Reuse existing uniqueness and primary barcode helpers.
  - Add helper to upsert/set primary barcode for a product if needed.
- `plugins/productos/migrations/012_separate_sku_and_barcode.py`
  - Detect SKU values that are probably barcodes.
  - Insert them into `prod_barcodes` as `GS1` primary when absent.
  - Replace product SKU with a generated internal SKU.

### Productos frontend

- `plugins/productos/frontend/types.ts`
  - Add primary barcode fields.
- `plugins/productos/frontend/pages/ProductListPage.tsx`
  - Show both `SKU` and `Barcode` columns.
  - Search placeholder says `Busca por nombre, SKU o barcode`.
- `plugins/productos/frontend/components/ModalNuevoProducto.tsx`
  - Show separate inputs: `SKU interno` and `Barcode principal`.
  - Barcode field persists as `prod_barcodes`, not as SKU.
- `plugins/productos/frontend/pages/ProductFormPage.tsx`
  - Same separation if this page remains in use.
- Product detail barcode section stays as advanced barcode management.

### POS quick product compatibility

No POS UI redesign is required. If quick product creation currently sends a
barcode, the backend path must ensure it is saved as `prod_barcodes`, not as
`sku`. Touch `plugins/pos/**` only if the existing payload forces barcode into
SKU and there is no productos-side way to preserve behavior.

## OUT OF SCOPE

- Changing fiscal emission mapping beyond confirming `sku` remains
  `codProducto`.
- Requiring barcode for all products.
- Requiring SKU to follow a specific business prefix beyond generated fallback.
- Removing support for multiple barcodes.
- Changing POS checkout or sales order lifecycle.
- Any SUNAT/UNSPSC changes.

## CONTRACT

### Product read/list fields

Each product list/detail response includes:

```json
{
  "sku": "PROD-000123",
  "primary_barcode": "7750670014984",
  "primary_barcode_type": "GS1"
}
```

### Product create/update payload

Payload may include:

```json
{
  "sku": "PROD-000123",
  "primary_barcode": "7750670014984",
  "primary_barcode_type": "GS1"
}
```

Rules:

- `sku` is internal seller code.
- `primary_barcode` is physical/scannable code.
- Empty `primary_barcode` leaves existing barcodes unchanged on update unless the
  API explicitly supports clearing in this spec.
- Duplicate barcodes across products must still be rejected.
- If `sku` is omitted on create, the system may generate one.

### Barcode-like SKU detection

Treat a SKU as barcode-like when:

```text
value contains only digits
AND length is one of 8, 12, 13, 14
```

Migration behavior:

- If product SKU is barcode-like and no identical barcode exists for the tenant,
  insert into `prod_barcodes` as `barcode_type='GS1'`, `is_primary=true`.
- If a primary barcode already exists, do not override it unless it equals the
  SKU value.
- Generate a new SKU such as `PROD-000001` or `PROD-{legacy_id}`.
- Preserve uniqueness of `(tenant_id, sku)`.
- Migration must be idempotent.

## INVARIANTS

```yaml
invariants:
  - SKU and barcode are distinct concepts
  - barcode lives in prod_barcodes, not prod_products.sku
  - products can exist without barcode
  - product search works by name, SKU, and barcode
  - POS scanning continues to work
  - fiscal codProducto uses SKU, not barcode by default
  - no tax/UNSPSC behavior changes
```

## VERIFICATION

```bash
PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile \
  plugins/productos/backend/schemas.py \
  plugins/productos/backend/services/products.py \
  plugins/productos/backend/services/barcode.py \
  plugins/productos/migrations/012_separate_sku_and_barcode.py

npm run plugins:migrate
npm run typecheck
```

Acceptance checks:

- Product list shows `SKU` and `Barcode` separately.
- Product form has separate fields for `SKU interno` and `Barcode principal`.
- Creating a product with both fields persists SKU in `prod_products.sku` and
  barcode in `prod_barcodes`.
- Searching by barcode still finds the product.
- Existing products whose SKU looked like barcode are backfilled safely.
- Fiscal mapper still sends `sku` as seller item code.

## ROLLBACK

- Revert frontend/backend code.
- Downgrade migration should not delete barcodes created from SKU unless they are
  clearly migration-generated; otherwise data loss risk is higher than leaving
  them.
- Already generated internal SKUs should be left in place unless a dedicated data
  rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/productos/backend/schemas.py
    - plugins/productos/backend/services/products.py
    - plugins/productos/backend/services/barcode.py
    - plugins/productos/migrations/012_separate_sku_and_barcode.py
    - plugins/productos/frontend/types.ts
    - plugins/productos/frontend/pages/ProductListPage.tsx
    - plugins/productos/frontend/pages/ProductFormPage.tsx
    - plugins/productos/frontend/components/ModalNuevoProducto.tsx
    - plugins/productos/frontend/components/ModalDetalleProducto.tsx
    - plugins/productos/tests/**
    - A-SPECS/0031-separate-sku-and-barcode.md
    - A-SPECS/TODO.md
  conditional:
    - plugins/pos/backend/services/quick_products.py
    - plugins/pos/frontend/components/QuickProductForm.tsx
  prohibited:
    - plugins/ventas/**
    - plugins/stock/**
    - plugins/compras/**
    - services/greenter-adapter/**
    - vendor/systutor-core/**
    - secrets or .env
```

## Traceability

- Requirement: user wants `sku` to be a real SKU and `barcode` to be a separate
  barcode, with both visible in productos frontend.
- owner: agent
- approver: lucas
- Commit: Pending.
- TRACE: Pending implementation.
- Deployment: Pending.

## Definition of Done

- [x] Spec created
- [x] Product list shows separate SKU and Barcode columns
- [x] Product create/edit exposes separate SKU and primary barcode inputs
- [x] Backend read schemas expose primary barcode
- [x] Backend write path persists primary barcode into `prod_barcodes`
- [x] Barcode-like SKUs are backfilled into barcodes
- [x] Generated internal SKUs are unique
- [x] Search by barcode still works
- [x] POS scan/quick product behavior remains compatible
- [x] `npm run plugins:migrate` passes
- [x] `npm run typecheck` passes
- [x] No secrets committed
