# A.SPEC 0026 — Sales nota de venta document type

> `risk: medium` — extends sales document-type rules and document-series
> constraints used by confirmation, but must not add SUNAT/Greenter emission.

## WHY

The main system currently lets sales choose between `FACTURA` and `BOLETA`.
Operationally, a store also needs a non-fiscal `Nota de venta` option alongside
those documents, with its own visible correlative and without implying electronic
tax submission.

## WHAT

Add `NOTA_VENTA` as a third sales document type:

- `FACTURA`: keeps requiring a registered CRM customer with RUC.
- `BOLETA`: keeps allowing optional registered/manual customer data.
- `NOTA_VENTA`: behaves like boleta for capture rules: registered customer is
  optional and manual customer/document data is optional.

The `Configuración / Facturación` module must also support `NOTA_VENTA` in its
series screen so confirming a sale can assign a visible number. The default
series convention is `N001`, using the existing 4-character `series` column and
the existing `N001-00000001` full-number format.

`NOTA_VENTA` must be the operational default for new sales: the sales order form
opens with `Nota de venta` selected and POS checkout creates `NOTA_VENTA` orders
when selling.

## SCOPE

- `plugins/ventas/backend/services/orders.py`
- `plugins/ventas/backend/schemas/orders.py`
- `plugins/ventas/frontend/types.ts`
- `plugins/ventas/frontend/pages/sales/OrdersPanel.tsx`
- `plugins/pos/backend/services/checkout.py`
- `plugins/configuracion/backend/schemas.py`
- `plugins/configuracion/frontend/types.ts`
- `plugins/configuracion/frontend/pages/DocumentSeriesPage.tsx`
- `plugins/configuracion/migrations/*.py`
- `plugins/commerce/migrations/022_use_purchase_order_correlative.py`
- `A-SPECS/0026-sales-nota-venta-document-type.md`
- `A-SPECS/TODO.md`

## OUT OF SCOPE

- SUNAT submission, CDR, XML generation, signatures, or Greenter integration.
- Changing `services/greenter-adapter/**`.
- Printing/PDF generation.
- Changing CRM schemas or creating CRM customers from manual data.
- Changing stock dispatch behavior.
- Changing status transitions.
- Changing existing `FACTURA` / `BOLETA` behavior.

## CONTRACT

Preconditions:

- Sales orders already persist `document_type`.
- Sales confirmation already assigns a default active series from
  `cfg_document_series`.
- `cfg_document_series` already supports commercial series and is also used by
  purchase order correlatives (`ORDEN_COMPRA`).

Postconditions:

- Sales create/update accepts `document_type = NOTA_VENTA`.
- `NOTA_VENTA` sales can be created without `customer_id`.
- `FACTURA` still rejects missing/non-RUC customer.
- Sales create UI exposes `Nota de venta` in the document selector.
- Sales create UI defaults to `NOTA_VENTA` for new orders.
- POS checkout creates and confirms `NOTA_VENTA` orders by default.
- Configuration UI can create a `NOTA_VENTA` series, defaulting the series code
  to `N001` when selected.
- Configuration migrations seed a default global `NOTA_VENTA` / `N001` series
  for existing tenants that do not already have one, so POS can sell after the
  migration without manual setup.
- The configuration module lists, creates, validates, activates and marks default
  `NOTA_VENTA` series with the same UX used for factura and boleta.
- Backend document-series validation accepts only `N###` format for
  `NOTA_VENTA`.
- Existing `ORDEN_COMPRA` constraint support remains valid when updating
  `cfg_document_series` constraints.
- The existing commerce migration that relaxes `cfg_document_series` for
  `ORDEN_COMPRA` must also preserve `NOTA_VENTA` for fresh database builds.
- Confirming a `NOTA_VENTA` without default active series rejects with the same
  existing message shape: `No hay serie configurada para NOTA_VENTA`.
- Confirming a `NOTA_VENTA` with default active series assigns
  `document_full_number` using the existing format, for example
  `N001-00000001`.

## INVARIANTS

```yaml
invariants:
  - Nota de venta is commercial/non-fiscal in this spec
  - no SUNAT/Greenter behavior is claimed or added
  - internal UUID remains the primary key for sales orders
  - document series are still assigned only on confirmation
  - next_number is still incremented by the existing confirmation path
  - FACTURA RUC validation remains strict
  - BOLETA customer rules remain unchanged
  - ORDEN_COMPRA support in cfg_document_series constraints is preserved
```

## VERIFICATION

- `PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile plugins/ventas/backend/services/orders.py plugins/ventas/backend/schemas/orders.py plugins/configuracion/backend/schemas.py`
- `npm run typecheck`
- `npm run plugins:migrate`
- DB check shows `cfg_document_series` accepts `NOTA_VENTA` / `N001`, seeds a
  default `N001` row, and still accepts existing `ORDEN_COMPRA` / `OC` rows.
- Authenticated smoke:
  - create `NOTA_VENTA` order without customer;
  - configure/default `NOTA_VENTA` series if missing;
  - confirm order from sales;
  - run a POS checkout;
  - verify `document_full_number` starts with `N001-`.

Local result:

- Python compile command: PASS.
- `npm run typecheck`: PASS.
- `npm run plugins:migrate`: PASS, `configuracion` reports migration `0003`.
- DB constraint check: PASS, `cfg_document_series` accepts `FACTURA`,
  `BOLETA`, `NOTA_VENTA` and `ORDEN_COMPRA` with formats `F###`, `B###`,
  `N###` and `OC`.
- DB seed check: PASS, local tenant has active default `NOTA_VENTA` / `N001`
  with `next_number = 1`.
- Authenticated HTTP smoke: PASS.
  - Login `admin@example.com`: PASS.
  - Sales create `NOTA_VENTA` without registered customer: PASS.
  - Sales confirm generated `N001-00000001`: PASS.
  - POS checkout generated `NOTA_VENTA` `N001-00000002` with status
    `DISPATCHED`: PASS.
  - DB check found both smoke orders as `NOTA_VENTA`: PASS.

## ROLLBACK

- Revert code changes to remove `NOTA_VENTA` from sales and configuration.
- Downgrade the configuration migration after deleting `cfg_document_series`
  rows with `document_type = 'NOTA_VENTA'`.
- Existing sales orders with `document_type = 'NOTA_VENTA'` must be converted or
  removed before enforcing the old runtime contract.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/ventas/backend/services/orders.py
    - plugins/ventas/backend/schemas/orders.py
    - plugins/ventas/frontend/types.ts
    - plugins/ventas/frontend/pages/sales/OrdersPanel.tsx
    - plugins/pos/backend/services/checkout.py
    - plugins/configuracion/backend/schemas.py
    - plugins/configuracion/frontend/types.ts
    - plugins/configuracion/frontend/pages/DocumentSeriesPage.tsx
    - plugins/configuracion/migrations/*.py
    - plugins/commerce/migrations/022_use_purchase_order_correlative.py
    - A-SPECS/0026-sales-nota-venta-document-type.md
    - A-SPECS/TODO.md
  prohibited:
    - services/greenter-adapter/**
    - plugins/crm/**
    - plugins/stock/**
    - vendor/systutor-core/src/systutor/**
    - secrets
    - .env
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - sales order create/update validation
    - sales create UI document selector
    - POS checkout default document type
    - document series validation and UI
    - cfg_document_series constraints
  indirect:
    - sales confirmation requiring a default NOTA_VENTA series
    - reports/tables displaying document_full_number generated by existing path
  must_not_affect:
    - SUNAT/Greenter adapter
    - CRM customer schema
    - stock movement behavior
    - existing FACTURA and BOLETA flows
    - purchase order ORDEN_COMPRA correlatives
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0014-sales-invoice-boleta-document-type.md
    - A-SPECS/0017-use-document-series-in-sales.md
    - A-SPECS/0018-use-purchase-order-correlative.md
  must_compose_with:
    - sales order create/update endpoints
    - sales confirmation document-series assignment
    - POS checkout service
    - configuration document-series CRUD
    - purchase order correlative constraints
  systemic_invariants:
    - tax authority adapters, no tax authority in core
    - NOTA_VENTA is not an electronic document in this increment
```

## Acceptance Criteria

- `Nota de venta` appears as an option in the sales create form.
- Sales create form opens with `Nota de venta` selected.
- POS checkout registers sales as `NOTA_VENTA` by default.
- Selecting `Nota de venta` does not require a RUC customer.
- `NOTA_VENTA` can be persisted by the sales API.
- The configuration module can create and manage a default `N001` series for
  `NOTA_VENTA`.
- Existing tenants get a default global `N001` series when missing.
- Confirmed `NOTA_VENTA` orders receive a visible `N001-########` number.
- Verification commands pass.

## Traceability

- Requirement: user requested adding `Nota de venta` in the main system as
  another option alongside boletas and facturas.
- owner: agent
- approver: lucas
- Commit: `488a6e9` (root: configuracion + POS checkout), `ff716d4` (plugins/ventas: NOTA_VENTA capture rules).
- TRACE: Local compile/typecheck/migration/constraint checks pass; authenticated
  HTTP smoke passed for sales confirmation and POS checkout. Verified
  `npm run plugins:migrate` reaches `configuracion=0003` and `ventas=0010`;
  `py_compile` PASS for configuracion and POS backend; `npm run typecheck` PASS.
  No failed checks.
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
