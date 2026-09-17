# A.SPEC 0017 — Use document series in sales

> `risk: medium` — connects sales order confirmation with the document series
> configured in `plugins/configuracion`, adding a new migration and changing
> confirmation behavior, but without touching SUNAT/Greenter.

## WHY

Sales already distinguishes `FACTURA` / `BOLETA`, but does not assign series or
correlatives. `plugins/configuracion` stores active series with `next_number`, but
nobody consumes them. The next step is to connect both: when a sales order is
confirmed, the system takes the default active series for that document type,
generates the document number, and stores it in the order.

This creates a visible document number for the customer (`F001-00000001` /
`B001-00000001`) while keeping the internal UUID as the primary key for all
system operations.

## WHAT

Add document series fields to `ventas_orders` and assign them on confirmation:

- New columns in `ventas_orders`:
  - `document_series_id` → FK to `cfg_document_series`
  - `document_series` → for example `F001`
  - `document_number` → integer, for example `1`
  - `document_full_number` → for example `F001-00000001`

- On confirmation (`DRAFT → CONFIRMED`):
  - Look up the default active series for the order's `document_type`.
  - Validate that a series exists; reject confirmation if not.
  - Assign series/number and increment `next_number` in `cfg_document_series`.
  - Store the generated document number in the order.

- Frontend updates:
  - Show `document_full_number` in the order actions dialog.
  - Show `document_full_number` in the sales order table (replacing raw UUID as
    the visible identifier).
  - Show `document_full_number` in the sales report orders table.

## SCOPE

- `plugins/ventas/backend/models.py`
- `plugins/ventas/backend/schemas/orders.py`
- `plugins/ventas/backend/services/orders.py`
- `plugins/ventas/backend/routers/orders.py`
- `plugins/ventas/backend/services/reports.py`
- `plugins/ventas/backend/schemas/reports.py`
- `plugins/ventas/migrations/*.py`
- `plugins/ventas/frontend/types.ts`
- `plugins/ventas/frontend/pages/sales/OrdersPanel.tsx`
- `plugins/ventas/frontend/pages/sales/SalesReportDialog.tsx`
- `plugins/ventas/frontend/pages/SalesOrdersPage.tsx`
- Sales plugin tests or smoke checks.

## OUT OF SCOPE

- SUNAT submission, CDR, XML generation, signatures, or Greenter integration.
- Printing/PDF generation.
- Changing purchase orders or purchase reports.
- Changing CRM schemas.
- Changing stock dispatch behavior.
- Changing `configuracion` plugin (series CRUD remains unchanged).
- Changing `vendor/systutor-core` source files.

## CONTRACT

Preconditions:

- `ventas_orders` exists with `document_type` column.
- `cfg_document_series` exists with active series for `FACTURA` and `BOLETA`.
- The sales order confirmation endpoint exists at
  `POST /api/v1/plugins/ventas/orders/{id}/confirm`.

Postconditions:

- `ventas_orders` stores `document_series_id`, `document_series`,
  `document_number`, and `document_full_number`.
- Confirming an order without an available default series rejects with message
  `"No hay serie configurada para {document_type}"`.
- Confirming an order with an available default series assigns the series,
  generates the document number, and increments `next_number`.
- The sales order API responses include the new document fields.
- The sales report includes `document_full_number` in the orders table.
- Existing orders before this migration have `NULL` in the new columns.

## INVARIANTS

```yaml
invariants:
  - the internal UUID remains the primary key for all system operations
  - document series are only assigned on confirmation, not on creation
  - confirmation is rejected if no active default series exists
  - next_number is incremented atomically on confirmation
  - existing orders are not modified by the migration
  - no SUNAT/Greenter behavior is claimed or added
  - no purchase order behavior is changed
  - no CRM schema files are changed
  - no vendor/systutor-core source files are changed
```

## VERIFICATION

- `PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile plugins/ventas/backend/models.py plugins/ventas/backend/schemas/orders.py plugins/ventas/backend/services/orders.py plugins/ventas/backend/routers/orders.py plugins/ventas/backend/services/reports.py plugins/ventas/backend/schemas/reports.py`
- `npm run plugins:migrate`
- `npm run typecheck`
- DB check shows new columns in `ventas_orders`:

```sql
select column_name
from information_schema.columns
where table_name = 'ventas_orders'
and column_name in (
  'document_series_id',
  'document_series',
  'document_number',
  'document_full_number'
)
order by column_name;
```

- Authenticated HTTP smoke: create a draft order, confirm it, verify
  `document_full_number` is present in the response.

Local result: PASS.

## ROLLBACK

Rollback is migration-based for DB and code revert for runtime:

- Downgrade drops `document_series_id`, `document_series`, `document_number`,
  and `document_full_number` from `ventas_orders`.
- Revert ventas code to confirmation without series assignment.
- Any orders confirmed with document numbers will lose that data on rollback.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/ventas/backend/models.py
    - plugins/ventas/backend/schemas/orders.py
    - plugins/ventas/backend/services/orders.py
    - plugins/ventas/backend/routers/orders.py
    - plugins/ventas/backend/services/reports.py
    - plugins/ventas/backend/schemas/reports.py
    - plugins/ventas/migrations/*.py
    - plugins/ventas/frontend/types.ts
    - plugins/ventas/frontend/pages/sales/OrdersPanel.tsx
    - plugins/ventas/frontend/pages/sales/SalesReportDialog.tsx
    - plugins/ventas/frontend/pages/SalesOrdersPage.tsx
    - plugins/ventas/tests/**
    - A-SPECS/0017-use-document-series-in-sales.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/configuracion/**
    - plugins/crm/**
    - plugins/stock/**
    - plugins/commerce/**
    - plugins/productos/**
    - secrets
    - .env
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - sales order confirmation behavior
    - sales order persistence
    - sales order API responses
    - sales report orders table
    - ventas migration
  indirect:
    - downstream order dispatch reading order document fields
  must_not_affect:
    - CRM customer schema
    - stock movements
    - SUNAT/Greenter adapter
    - purchase order behavior
    - configuracion series CRUD
    - ventas status transitions
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0014-sales-invoice-boleta-document-type.md
    - A-SPECS/0016-configuration-document-series.md
  must_compose_with:
    - existing ventas order list/detail endpoints
    - existing configuracion series CRUD
    - existing sales report modal
  systemic_invariants:
    - Factura requires CRM RUC customer
    - Boleta can remain anonymous
    - document series are configured before sales consumes them
  composition_checks:
    - typecheck covers frontend payload/response shape
    - migration records new ventas columns
    - confirmation assigns series from configuracion
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - plugins/ventas/backend/services/orders.py
    - plugins/ventas/frontend/pages/sales/OrdersPanel.tsx
    - plugins/ventas/frontend/pages/SalesOrdersPage.tsx
```

## Traceability

- Requirement: User requested to connect sales confirmation with the document
  series configured in `plugins/configuracion`, showing the document number in
  the sales UI and reports.
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
