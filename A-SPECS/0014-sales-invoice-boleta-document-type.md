# A.SPEC 0014 — Select sales document type

> `risk: medium` — changes sales order persistence and create-order validation,
> but stays inside the ventas plugin and does not emit fiscal documents.

## WHY

When creating a sale, Librefact must distinguish the commercial capture rules for
Peruvian invoice vs boleta flows. A factura requires an identified customer with
RUC. A boleta may be issued without a registered customer, optionally capturing a
document number/name typed at the sale.

The minimal useful change is to choose the sales document type in the order form
and persist the chosen type with enough customer/document fields to validate the
capture rule.

## WHAT

Sales orders must support two document types selected in the create order UI:

- `FACTURA`: requires a CRM customer whose document type is `RUC` and whose
  document number is present.
- `BOLETA`: allows no CRM customer; when no customer is selected, manual
  `customer_name` and `customer_document_number` are optional.

The choice must be persisted and returned by the sales order APIs.

## SCOPE

- `plugins/ventas/backend/models.py`
- `plugins/ventas/backend/schemas/orders.py`
- `plugins/ventas/backend/services/orders.py`
- `plugins/ventas/backend/routers/orders.py`
- `plugins/ventas/migrations/*.py`
- `plugins/ventas/frontend/types.ts`
- `plugins/ventas/frontend/pages/sales/OrdersPanel.tsx`
- Sales plugin tests or smoke checks needed to prove create-order validation.

## OUT OF SCOPE

- SUNAT submission, CDR, XML generation, signatures, or Greenter integration.
- Fiscal numbering/series allocation.
- Printing/PDF generation.
- Creating CRM customers from boleta manual data.
- Changing ventas route paths or status transitions.
- Changing CRM schemas.
- Changing stock dispatch behavior.

## CONTRACT

Preconditions:

- `ventas_orders` exists and currently stores `customer_id` as required.
- CRM customers store `document_type_code` and `document_number`.
- The sales create-order UI already lists CRM customers.

Postconditions:

- `ventas_orders` stores `document_type` for each order.
- Existing orders default to `FACTURA` after migration.
- `FACTURA` create/update rejects missing customer.
- `FACTURA` create/update rejects customers whose CRM `document_type_code` is not
  `RUC` or whose `document_number` is empty.
- `BOLETA` create/update accepts `customer_id = null`.
- `BOLETA` create/update accepts optional manual `customer_document_type` and
  `customer_document_number` fields.
- Sales order list/detail responses include `document_type` and the manual
  document fields.
- The create order UI exposes a selector/dropdown for Factura vs Boleta and only
  requires/selects a CRM customer for Factura.

## INVARIANTS

```yaml
invariants:
  - ventas order route paths remain unchanged
  - existing status transitions remain unchanged
  - product item creation and line totals remain unchanged
  - no SUNAT/Greenter behavior is claimed or added
  - no CRM schema files are changed
  - no vendor/systutor-core source files are changed
```

## VERIFICATION

- `PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile plugins/ventas/backend/models.py plugins/ventas/backend/schemas/orders.py plugins/ventas/backend/services/orders.py plugins/ventas/backend/routers/orders.py`
- `npm run typecheck`
- `npm run plugins:migrate`
- DB check shows ventas order document columns exist:

```sql
select column_name
from information_schema.columns
where table_name = 'ventas_orders'
and column_name in (
  'document_type',
  'customer_document_type',
  'customer_document_number'
)
order by column_name;
```

Local result:

- Python compile command: PASS.
- `npm run typecheck`: PASS.
- `npm run plugins:migrate`: PASS, `ventas` reports migration `0006`.
- DB column check: PASS, returns `customer_document_number`,
  `customer_document_type`, and `document_type`.

## ROLLBACK

Rollback is migration-based for DB and code revert for runtime:

- Downgrade drops `document_type`, `customer_document_type`, and
  `customer_document_number` from `ventas_orders`.
- Revert ventas code to require `customer_id` for every order.
- Any boleta orders without `customer_id` must be either removed or assigned to a
  placeholder CRM customer before rollback.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/ventas/backend/models.py
    - plugins/ventas/backend/schemas/orders.py
    - plugins/ventas/backend/services/orders.py
    - plugins/ventas/backend/routers/orders.py
    - plugins/ventas/migrations/*.py
    - plugins/ventas/frontend/types.ts
    - plugins/ventas/frontend/pages/sales/OrdersPanel.tsx
    - plugins/ventas/tests/**
    - A-SPECS/0014-sales-invoice-boleta-document-type.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/crm/**
    - plugins/stock/**
    - secrets
    - .env
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - sales order create/update schema
    - sales order persistence
    - sales order create UI
    - ventas migration
  indirect:
    - cotizacion to order conversion if it creates ventas orders
    - downstream order confirmation/dispatch reading order customer fields
  must_not_affect:
    - CRM customer schema
    - stock movements
    - SUNAT/Greenter adapter
    - ventas status transitions
```

## Composition

```yaml
composition:
  requires_aspecs: []
  must_compose_with:
    - existing ventas order list/detail endpoints
    - existing CRM customer picker
  systemic_invariants:
    - Factura requires CRM RUC customer
    - Boleta can remain anonymous
  composition_checks:
    - typecheck covers frontend payload/response shape
    - migration records new ventas columns
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
```

## Traceability

- Requirement: User requested two sales document types: factura with mandatory
  RUC customer and boleta with optional customer/document chosen in the form.
- owner: agent
- approver: lucas
- Commit: `8cbbe3cbf6c4c8e0c62bde60d11fa5a7ceedaa7f` (Librefact),
  `c152dd6c7c3d7977f99a3f322645fe1266a797c1` (`systutor-ventas`)
- TRACE: PASS — surface respected, ventas gitlink accepted, migration downgrade
  present, deployment applied locally.
- Deployment: local Librefact dev DB after plugin migration

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
