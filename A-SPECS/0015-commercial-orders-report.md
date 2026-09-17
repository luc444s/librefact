# A.SPEC 0015 — Commercial orders mini report

> `risk: medium` — adds read-only report endpoints and small report modals across
> purchase and sales orders, without changing transactional behavior.

## WHY

Users need to answer a basic operational question: what was bought or sold in a
selected day/month/hour range? Librefact already stores purchase orders and sales
orders with `created_at`; the minimal report should aggregate those existing
orders without introducing accounting, SUNAT, exports, or stock logic.

## WHAT

Add boring read-only report modals from the existing order screens:

- `Reporte de compras` button in purchase orders opens a compras report modal.
- `Reporte de ventas` button in sales orders opens a ventas report modal.
- Range: `from` and `to` date-time, evaluated against order `created_at`.
- Summary: total amount, order count, line count.
- Products table: product SKU/name, quantity, amount.
- Orders table: order id, created_at, party name, status, amount.

## SCOPE

- `plugins/commerce/purchase/backend/routers/*.py`
- `plugins/commerce/purchase/backend/schemas/*.py`
- `plugins/commerce/purchase/backend/services/*.py`
- `plugins/commerce/purchase/backend/router.py`
- `plugins/commerce/purchase/frontend/api.ts`
- `plugins/commerce/purchase/frontend/pages/PurchaseOrdersPage.tsx`
- `plugins/commerce/purchase/frontend/pages/purchase/*.tsx`
- `plugins/ventas/backend/routers/*.py`
- `plugins/ventas/backend/schemas/*.py`
- `plugins/ventas/backend/services/*.py`
- `plugins/ventas/backend/router.py`
- `plugins/ventas/frontend/api.ts`
- `plugins/ventas/frontend/types.ts`
- `plugins/ventas/frontend/pages/*.tsx`
- `plugins/ventas/frontend/pages/**/*.tsx`
- Tests or smoke checks for the new report endpoints/UI.

## OUT OF SCOPE

- Schema migrations.
- SUNAT, Greenter, invoices, boletas/facturas emission, CDR, XML, PDF, Excel.
- Stock movement reporting.
- Profit/margin, taxes, discounts, accounts receivable/payable.
- Changing order creation/update/confirmation/dispatch/receipt behavior.
- Changing products, CRM, stock, or core schemas.

## CONTRACT

Preconditions:

- Purchase orders exist in `com_purchase_orders` with `created_at` and items in
  `com_purchase_items`.
- Sales orders exist in `ventas_orders` with `created_at` and items in
  `ventas_order_items`.
- Product names/SKUs are available in `prod_products`.

Postconditions:

- A purchase report endpoint returns compras order aggregates filtered by
  `com_purchase_orders.created_at >= from` and `<= to`.
- A sales report endpoint returns ventas order aggregates filtered by
  `ventas_orders.created_at >= from` and `<= to`.
- Both reports are tenant-scoped.
- Empty ranges return zero totals and empty arrays, not errors.
- Purchase orders screen has a `Reporte de compras` button that opens a modal
  with from/to date-time inputs,
  summary cards, products table, and orders table.
- Sales orders screen has a `Reporte de ventas` button that opens a modal with
  from/to date-time inputs,
  summary cards, products table, and orders table.
- Report totals use current order line amounts only:
  - Compras: `quantity * unit_cost`.
  - Ventas: `line_total`.

## INVARIANTS

```yaml
invariants:
  - report endpoints are read-only
  - order transactional behavior is unchanged
  - no database schema migration is introduced
  - filtering uses created_at, not order_date
  - no SUNAT/fiscal emission behavior is claimed
  - no stock movement behavior is changed
  - no vendor/systutor-core source files are changed
```

## VERIFICATION

- `PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile plugins/commerce/purchase/backend/routers/reports.py plugins/commerce/purchase/backend/services/reports.py plugins/commerce/purchase/backend/schemas/reports.py plugins/ventas/backend/routers/reports.py plugins/ventas/backend/services/reports.py plugins/ventas/backend/schemas/reports.py`
- `npm run typecheck`
- Authenticated HTTP smoke for compras report returns `200` for today's range.
- Authenticated HTTP smoke for ventas report returns `200` for today's range.

Local result:

- Python compile command: PASS.
- `npm run typecheck`: PASS.
- Compras HTTP smoke: PASS, `200`.
- Ventas HTTP smoke: PASS, `200`.

## ROLLBACK

Rollback is code revert only:

- Remove the report routers/services/schemas and frontend modal/API wiring.
- No DB rollback is needed because this A.SPEC adds no migration and writes no
  report data.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/commerce/purchase/backend/routers/*.py
    - plugins/commerce/purchase/backend/schemas/*.py
    - plugins/commerce/purchase/backend/services/*.py
    - plugins/commerce/purchase/backend/router.py
    - plugins/commerce/purchase/frontend/api.ts
    - plugins/ventas/backend/routers/*.py
    - plugins/ventas/backend/schemas/*.py
    - plugins/ventas/backend/services/*.py
    - plugins/ventas/backend/router.py
    - plugins/ventas/frontend/api.ts
    - plugins/ventas/frontend/types.ts
    - plugins/ventas/frontend/pages/*.tsx
    - plugins/ventas/frontend/pages/**/*.tsx
    - plugins/ventas/tests/**
    - A-SPECS/0015-commercial-orders-report.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/productos/**
    - plugins/crm/**
    - plugins/stock/**
    - plugins/commerce/migrations/**
    - plugins/ventas/migrations/**
    - secrets
    - .env
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - purchase order report endpoint
    - sales order report endpoint
    - purchase report modal
    - sales report modal
  indirect:
    - frontend API type contracts
  must_not_affect:
    - order writes
    - product catalog schema
    - CRM customer schema
    - stock balances and ledger
    - plugin migrations
```

## Composition

```yaml
composition:
  requires_aspecs: []
  must_compose_with:
    - compras order list remains usable
    - ventas order list remains usable
  systemic_invariants:
    - reports read existing order data only
    - report date-time range is based on created_at
  composition_checks:
    - HTTP smoke checks both compras and ventas report endpoints
    - frontend typecheck covers report modal API usage
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one read-only commercial order reporting capability
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - plugins/commerce/purchase/backend/services/reports.py
    - plugins/ventas/backend/services/reports.py
    - plugins/commerce/purchase/frontend/pages/purchase/PurchaseReportDialog.tsx
    - plugins/ventas/frontend/pages/sales/SalesReportDialog.tsx
```

## Traceability

- Requirement: User requested a generic boring mini dashboard to see purchases
  or sales in selectable day/month/hour ranges using `created_at`.
- owner: agent
- approver: lucas
- Commit: pending Librefact trace;
  `a0167d38a4c389d87dcb7714dc0c37c0ee95cc92` (`systutor-compras`),
  `5c8b058ff0d5d6a1246bbfc7d803270425a9d677` (`systutor-ventas`)
- Deployment: local Librefact dev runtime after implementation

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
- [ ] Traceability established
