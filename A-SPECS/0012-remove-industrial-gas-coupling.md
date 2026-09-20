# A.SPEC 0012 — Remove industrial-gas coupling from imported plugins

> `risk: high` — Cuts live imports of the non-imported `plugins.logistics` package
> and drops columns/tables from `productos`, `compras` and `ventas`. Requires
> explicit human approval before execution because it changes database schema and
> removes runtime endpoints.

## WHY

A.SPEC 0011 imported the Systutor OSS **Gas** business plugins (`crm`,
`productos`, `commerce`/`compras`, `ventas`, `stock`) into root `plugins/`, but
the gas-industry domain stayed welded to the imported code. Two independent
problems exist:

1. **Dangling logistics coupling (blocking).** `compras` and `ventas` import
   `plugins.logistics.backend.models[.cylinder]` at module top level, but
   `plugins.logistics/**` was explicitly out of scope for A.SPEC 0011 and does
   not exist in the repo. Verified failure:

   ```text
   $ PYTHONPATH=$PWD .venv/bin/python -c "import plugins.ventas.backend.routers.dispatches"
   ModuleNotFoundError: No module named 'plugins.logistics'

   $ PYTHONPATH=$PWD .venv/bin/python -c "import plugins.commerce.purchase.backend.routers"
   ModuleNotFoundError: No module named 'plugins.logistics'

   $ PYTHONPATH=$PWD .venv/bin/python -c "import plugins.productos.backend.router"
   (OK)
   ```

   `npm run plugins:migrate` passes only because migrations import models (whose
   `ForeignKey("lg_cylinders.id")` is a lazy string), never the services/routers
   that raise. Contract 002 only proved migration success, not plugin load.

2. **Gas-domain business logic.** Cryogenic recipes, ADR gas fields, gas-product
   mapping and cryogenic tanks are modelled across `productos`, `compras` and
   `ventas`, including four gas-specific migrations (`006`–`009`).

## WHAT

Remove the industrial-gas domain and the dangling logistics dependency so the
imported plugins load, migrate and typecheck as generic business modules.

New independent falsable truth:

```text
Given a fresh database and the root plugins directory, every imported plugin
entrypoint imports without `plugins.logistics` and a residual-term scan finds no
industrial-gas identifiers in active backend/frontend code.
```

## SCOPE

### Backend — dangling `plugins.logistics` imports (must be removed)

- `plugins/ventas/backend/services/dispatches.py`
- `plugins/ventas/backend/services/receipts.py`
- `plugins/ventas/backend/routers/dispatches.py`
- `plugins/ventas/cotizacion/backend/services/cotizacion.py`
- `plugins/commerce/ingreso_desde_proveedor/backend/services/receipts.py`
- `plugins/commerce/ingreso_desde_proveedor/backend/routers/receipts.py`
- `plugins/commerce/purchase/backend/services/service_lines.py`
- `plugins/commerce/purchase/backend/services/dispatches.py`
- `plugins/commerce/purchase/backend/services/returns.py`
- `plugins/commerce/purchase/backend/services/cylinder_history.py`
- `plugins/commerce/purchase/backend/services/physical_counts.py`
- `plugins/commerce/purchase/backend/routers/dispatches.py`
- `plugins/commerce/purchase/backend/routers/receipts.py`

### Backend — gas domain

- `productos`: `gas_product_id` in `ProductGroup`; `ProductAdr` and its
  cryogenic fields (`source_product_id`, `source_quantity_liters`,
  `net_weight_kg`, `net_volume_m3`); `adr_configs` relationship;
  `services/adr.py` (density and mass-conservation validation);
  `list_gas_products` / `GasProductRead`; `/catalog/gas-products` router;
  `productos.adr.*` permissions and `productos.product.adr_updated` event.
- `ventas`: `tank_id` on `SalesDispatch` and `SalesReceipt` (model, schemas,
  services, routers).
- `compras`: `tank_id` / `CRYOGENIC_TANK` / `content_kg` receipt logic and
  `/tanks` endpoints; cylinder references on `ComDispatchCylinder`,
  `ComReceiptServiceLine`, `ComPhysicalCountExpectedSerial`, `ComPhysicalCountItem`.

### Frontend (plugins/*/frontend, not apps/web)

- `productos`: `types.ts` (`gas_product_id`), `api.ts`, `CatalogManagerPage.tsx`,
  `ModalCatalogo.tsx`, `ModalDetalleProducto.tsx` (ADR cryogenic form),
  `ProductDetailPage.tsx`.
- `ventas`: `types.ts` (`tank_id`), `pages/SalesDispatchesPage.tsx`.
- `compras`: `types.ts`, `api.ts`, `components/DispatchFormModal.tsx`,
  `pages/purchase/ReceiptPanel.tsx`, `pages/purchase/DispatchesPage.tsx`.

### Migrations

- New `plugins/productos/migrations/010_remove_industrial_gas_v1.py`
  (`revision = "0010"`), idempotent drop of gas columns/table, with `downgrade`.
- New forward migration in `ventas` (`0003_remove_tank_id.py`) and `compras`
  (`020_remove_cylinder_coupling.py`) to drop `tank_id` and `lg_cylinders`
  foreign keys.
- Keep `006`–`009` as immutable history unless decision **D3** approves a squash.

## OUT OF SCOPE

- No changes to `vendor/systutor-core/src/systutor/**`.
- No changes to `services/greenter-adapter/**`.
- No re-implementation or import of `plugins/logistics/**`, `tms`, `notes`.
- No new generic cylinder/packaging subsystem (only removal of the coupling).
- No secrets, `.env`, dumps, or deployment changes.

## CONTRACT

Preconditions:

```text
Fresh database created with `npm run db`
Root plugins directory discoverable from SYSTUTOR_PLUGINS_DIR
No `plugins/logistics` package present
```

Postconditions:

- `python -c "import <entrypoint>"` succeeds for `crm`, `productos`,
  `compras`, `ventas`, `stock`.
- Residual scan for `gas_product`, `cryogenic`, `CRYOGENIC_TANK`, `lg_cylinders`,
  `plugins.logistics`, `content_kg`, `tank_id` returns no active hits in
  `plugins/**` backend/frontend.
- `npm run db`, `npm run plugins:migrate`, `npm run typecheck` and
  `npx vite build` all pass.
- Product/weight fields that are generic (`default_weight_kg`, `weight_kg`,
  `content_m3`) are retained; only their cryogenic semantics are removed.

## INVARIANTS

```yaml
invariants:
  - id: no-logistics-import
    statement: No active module imports plugins.logistics.
    proof: grep -rn "plugins.logistics" plugins --include=*.py returns nothing on the load path.
  - id: plugins-loadable
    statement: Every imported plugin entrypoint imports cleanly.
    proof: python import smoke test over each plugin backend entrypoint.
  - id: migration-version-continuity
    statement: Existing databases at revision "0009" (productos) or "0002" (ventas) can still migrate forward.
    proof: forward migration "0010" / "0003" keeps prior revisions resolvable; no historical file deleted.
  - id: generic-fields-kept
    statement: Non-gas product fields survive.
    proof: default_weight_kg, weight_kg and content_m3 remain in Product model and migrations.
  - id: core-untouched
    statement: Kernel and Greenter adapter are unchanged.
    proof: changed files stay under plugins/** and A-SPECS/docs.
```

## VERIFICATION

Baseline (must be captured before starting) and final gate:

```bash
npm run db
npm run plugins:migrate
npm run typecheck
npx vite build
PYTHONPATH="$PWD" .venv/bin/python -c "import plugins.productos.backend.plugin"
PYTHONPATH="$PWD" .venv/bin/python -c "import plugins.commerce.purchase.backend.plugin"
PYTHONPATH="$PWD" .venv/bin/python -c "import plugins.ventas.backend.plugin"
PYTHONPATH="$PWD" .venv/bin/python -c "import plugins.stock.backend.plugin"
PYTHONPATH="$PWD" .venv/bin/python -c "import plugins.crm.backend.plugin"
```

Residual gate:

```bash
grep -rn "gas_product\|GasProduct\|cryogenic\|Cryogenic\|CRYOGENIC\|lg_cylinders\|plugins.logistics\|content_kg\|tank_id\|prod_adr\|ProductAdr" plugins --include=*.py --include=*.ts --include=*.tsx
```

Observed result (working database `librefact`):

```text
ALL MIGRATIONS IMPORT OK
OK   plugins.crm.backend.plugin
OK   plugins.productos.backend.plugin
OK   plugins.commerce.purchase.backend.plugin
OK   plugins.ventas.backend.plugin
OK   plugins.stock.backend.plugin
npm run db: PASS — core migrated, plugin runtime loaded, demo seed returned
npm run plugins:migrate: PASS — crm=0005, productos=0010, compras=0020, ventas=0002, stock=0009
npm run typecheck: PASS
npx vite build: PASS — 2102 modules transformed
schema check: prod_adr, com_dispatches, com_dispatch_cylinders, com_receipt_service_lines,
  com_physical_count*, gas_product_id and dispatch_id all dropped
```

Fresh-database check (isolated database, only the plugins changed by this spec):

```text
productos: 0010, compras: 0020, ventas: 0002 applied on an empty database
prod_adr never created; gas_product_id absent; cylinder tables absent; dispatch_id absent
```

Known pre-existing gaps (NOT introduced by this spec, outside `change_surface`):
`crm/migrations/005` indexes `crm_customer_commercial_assignments`, a table no
migration creates; `stock/migrations/006` declares `REFERENCES lg_warehouses(id)`.
Both break a migration-only fresh database and both are logistics coupling that a
follow-up spec must address.

## ROLLBACK

- Revert the A.SPEC integration commit.
- Migration `0010` (and `0003` in ventas, `020` in compras) ship `downgrade()`
  to re-add columns so a migrated database can be reverted without a dump.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0012-remove-industrial-gas-coupling.md
    - A-SPECS/TODO.md
    - docs/contracts/001-plugin-independence.md
    - docs/contracts/002-plugin-import-acceptance.md
    - plugins/productos/**
    - plugins/commerce/**
    - plugins/ventas/**
    - plugins/crm/**
    - plugins/stock/**
  prohibited:
    - .env
    - .env.*
    - secrets/**
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/logistics/**
    - plugins/tms/**
    - plugins/notes/**
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - compras and ventas plugin load (currently broken)
    - productos ADR / gas-product catalog
    - cryogenic tank receipt/dispatch flows
    - productos/ventas/compras database schema
  indirect:
    - compras/ventas frontend pages that consume tank/dispatch APIs
    - stock flows triggered by receipts (unchanged behaviour expected)
  must_not_affect:
    - systutor core plugin runtime and migrations engine
    - Greenter/SUNAT adapter
    - crm, stock non-gas behaviour
    - secrets handling
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A.SPEC 0011
  must_compose_with:
    - Contract 001 plugin independence
    - Contract 002 plugin import acceptance
    - plugin runtime discovery and migrations engine
  systemic_invariants:
    - no-logistics-import
    - plugins-loadable
    - migration-version-continuity
    - core-untouched
  composition_checks:
    - npm run db
    - npm run plugins:migrate
    - python import smoke test per plugin
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  deletion_preferred_over_abstraction: true
```

## Traceability

- Requirement: Remove industrial-gas coupling from imported plugins.
- owner: Lucas
- approver: Lucas (pending)
- Commit: TBD
- Deployment: not exposable

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Independent falsable truth exists now
- [x] Invariants preserved
- [x] Verification passed
- [x] Rollback / compensation is honest
- [x] Composition checks passed when applicable
- [x] No unrelated changes
- [x] Structural constraints respected
- [x] Traceability established

## Resolved Decisions

- **D1 — ADR scope (RESOLVED):** delete `ProductAdr` and all ADR logic entirely,
  including `productos.adr.*` permissions and the `productos.product.adr_updated`
  event.
- **D2 — Cylinders (RESOLVED):** delete the entire cylinder/custody subsystem
  (models, services, routers, frontend) and all `plugins.logistics` imports. The
  serial-based packaging concept is not kept.
- **D3 — Migration strategy (RESOLVED):** forward-only drops; keep `006`–`009`
  as immutable history and add new drop migrations.
- **D4 — Weight fields (RESOLVED):** keep `default_weight_kg`, `weight_kg` and
  `content_m3` as generic product fields; remove only cryogenic validation that
  consumed them.
