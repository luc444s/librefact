# A.SPEC 0018 — Use purchase order correlative

> `risk: medium` — connects purchase order confirmation with a correlative
> configured in `plugins/configuracion`, adding a new migration and changing
> confirmation behavior.

## WHY

Purchase orders currently have no visible identifier beyond their internal UUID.
Users need a simple, sequential correlativo (like `OC-00000001`) to reference
purchase orders in reports, printing, and communication with suppliers.

The correlativo must be configured from the `configuracion` module as a document
type `ORDEN_COMPRA` with a prefix (like `OC`), and assigned automatically when
the purchase order is confirmed (`DRAFT → ORDERED`).

## WHAT

Add correlativo fields to `com_purchase_orders` and assign them on confirmation:

- New columns in `com_purchase_orders`:
  - `correlative_series_id` → FK to `cfg_document_series`
  - `correlative_series` → for example `OC`
  - `correlative_number` → integer, for example `1`
  - `correlative_full_number` → for example `OC-00000001`

- On confirmation (`DRAFT → ORDERED`):
  - Look up the default active series for document type `ORDEN_COMPRA`.
  - Validate that a series exists; reject confirmation if not.
  - Assign series/number and increment `next_number` in `cfg_document_series`.
  - Store the generated correlativo in the order.

- Migration seed:
  - Create a default `ORDEN_COMPRA` series in `cfg_document_series` with
    prefix `OC` and `initial_number = 1` for the demo tenant, so the feature
    works out of the box.

- Frontend updates:
  - Show `correlative_full_number` in the purchase order table (replacing raw
    UUID as the visible identifier).
  - Show `correlative_full_number` in the purchase report orders table.

## SCOPE

- `plugins/commerce/purchase/backend/models.py`
- `plugins/commerce/purchase/backend/schemas/orders.py`
- `plugins/commerce/purchase/backend/schemas/reports.py`
- `plugins/commerce/purchase/backend/services/orders.py`
- `plugins/commerce/purchase/backend/services/reports.py`
- `plugins/commerce/purchase/backend/routers/orders.py`
- `plugins/commerce/migrations/*.py`
- `plugins/commerce/purchase/frontend/types.ts`
- `plugins/commerce/purchase/frontend/pages/PurchaseOrdersPage.tsx`
- `plugins/commerce/purchase/frontend/pages/purchase/PurchaseReportDialog.tsx`
- `plugins/configuracion/backend/services.py` (for seed helper only)
- Purchase plugin tests or smoke checks.

## OUT OF SCOPE

- SUNAT submission, CDR, XML generation, signatures, or Greenter integration.
- Printing/PDF generation.
- Changing sales orders or sales reports.
- Changing CRM schemas.
- Changing stock dispatch behavior.
- Changing `configuracion` series CRUD UI.
- Changing `vendor/systutor-core` source files.

## CONTRACT

Preconditions:

- `com_purchase_orders` exists without correlativo columns.
- `cfg_document_series` exists with the `ORDEN_COMPRA` document type (or it
  will be seeded by the migration).
- The purchase order confirmation endpoint exists at
  `POST /api/v1/plugins/compras/purchase/orders/{id}/confirm`.

Postconditions:

- `com_purchase_orders` stores `correlative_series_id`, `correlative_series`,
  `correlative_number`, and `correlative_full_number`.
- Confirming an order without an available default series for `ORDEN_COMPRA`
  rejects with message `"No hay correlativo configurado para órdenes de compra"`.
- Confirming an order with an available default series assigns the correlativo
  and increments `next_number`.
- The purchase order API responses include the new correlativo fields.
- The purchase report includes `correlative_full_number` in the orders table.
- A default `ORDEN_COMPRA` series `OC-001` exists for the demo tenant after
  migration.

## INVARIANTS

```yaml
invariants:
  - the internal UUID remains the primary key for all system operations
  - correlativos are only assigned on confirmation, not on creation
  - confirmation is rejected if no active default series exists for ORDEN_COMPRA
  - next_number is incremented atomically on confirmation
  - existing orders are not modified by the migration
  - no SUNAT/Greenter behavior is claimed or added
  - no sales order behavior is changed
  - no CRM schema files are changed
  - no vendor/systutor-core source files are changed
```

## VERIFICATION

- `PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile plugins/commerce/purchase/backend/models.py plugins/commerce/purchase/backend/schemas/orders.py plugins/commerce/purchase/backend/schemas/reports.py plugins/commerce/purchase/backend/services/orders.py plugins/commerce/purchase/backend/services/reports.py plugins/commerce/purchase/backend/routers/orders.py`
- `npm run plugins:migrate`
- `npm run typecheck`
- DB check shows new columns in `com_purchase_orders`:

```sql
select column_name
from information_schema.columns
where table_name = 'com_purchase_orders'
and column_name in (
  'correlative_series_id',
  'correlative_series',
  'correlative_number',
  'correlative_full_number'
)
order by column_name;
```

- DB check shows seeded series:

```sql
select series, document_type, next_number
from cfg_document_series
where document_type = 'ORDEN_COMPRA';
```

Local result: Pending.

## ROLLBACK

Rollback is migration-based for DB and code revert for runtime:

- Downgrade drops `correlative_series_id`, `correlative_series`,
  `correlative_number`, and `correlative_full_number` from `com_purchase_orders`.
- Downgrade removes the seeded `ORDEN_COMPRA` series from `cfg_document_series`.
- Revert commerce code to confirmation without correlativo assignment.
- Any orders confirmed with correlativos will lose that data on rollback.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/commerce/purchase/backend/models.py
    - plugins/commerce/purchase/backend/schemas/orders.py
    - plugins/commerce/purchase/backend/schemas/reports.py
    - plugins/commerce/purchase/backend/services/orders.py
    - plugins/commerce/purchase/backend/services/reports.py
    - plugins/commerce/purchase/backend/routers/orders.py
    - plugins/commerce/migrations/*.py
    - plugins/commerce/purchase/frontend/types.ts
    - plugins/commerce/purchase/frontend/pages/PurchaseOrdersPage.tsx
    - plugins/commerce/purchase/frontend/pages/purchase/PurchaseReportDialog.tsx
    - plugins/commerce/tests/**
    - A-SPECS/0018-use-purchase-order-correlative.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/configuracion/backend/**
    - plugins/configuracion/frontend/**
    - plugins/crm/**
    - plugins/stock/**
    - plugins/ventas/**
    - plugins/productos/**
    - secrets
    - .env
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - purchase order confirmation behavior
    - purchase order persistence
    - purchase order API responses
    - purchase report orders table
    - commerce migration
    - configuracion seeded series
  indirect:
    - downstream order receipt reading order correlativo fields
  must_not_affect:
    - CRM customer schema
    - stock movements
    - SUNAT/Greenter adapter
    - sales order behavior
    - configuracion series CRUD
    - purchase status transitions
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0016-configuration-document-series.md
  must_compose_with:
    - existing purchase order list/detail endpoints
    - existing configuracion series CRUD
    - existing purchase report modal
  systemic_invariants:
    - correlativos are configured before purchase consumes them
    - ORDEN_COMPRA series is seeded for demo tenant
  composition_checks:
    - typecheck covers frontend payload/response shape
    - migration records new purchase columns
    - confirmation assigns correlativo from configuracion
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - plugins/commerce/purchase/backend/services/orders.py
    - plugins/commerce/purchase/frontend/pages/PurchaseOrdersPage.tsx
```

## Traceability

- Requirement: User requested a simple correlativo for purchase orders,
  configurable from the configuracion module, assigned on confirmation.
- owner: agent
- approver: lucas
- Commit: Pending.
- TRACE: Pending.
- Deployment: Pending.

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
