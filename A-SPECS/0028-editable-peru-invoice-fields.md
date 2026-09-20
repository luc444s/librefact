# A.SPEC 0028 - Editable Peru invoice fields in sales

> `risk: medium` - expands sales order capture and SUNAT mapping, but keeps the
> existing order lifecycle and emission flow.

## WHY

The sales create flow currently shows only a RUC customer picker for `FACTURA`.
For a Peruvian invoice, the operator needs to see and adjust the fiscal data that
will be sent downstream: RUC, razon social, fiscal address, item taxable value,
IGV, and totals. During early adoption these fields must remain editable because
the source customer/product data may be incomplete or wrong.

## WHAT

When creating a sales order:

- `FACTURA` shows editable fiscal customer fields: RUC, razon social, and fiscal
  address.
- `FACTURA` may still use a CRM customer as a helper, but the fiscal fields are
  editable and persisted on the order.
- Order items expose editable quantity, unit price, line total, and IGV rate.
- The form shows a Peru invoice fiscal summary: op. gravada/base imponible, IGV,
  and total.
- SUNAT emission maps the persisted fiscal fields and per-line IGV rate.

## SCOPE

- `plugins/ventas/backend/models.py`
- `plugins/ventas/backend/schemas/orders.py`
- `plugins/ventas/backend/services/orders.py`
- `plugins/ventas/backend/routers/orders.py`
- `plugins/ventas/migrations/*.py`
- `plugins/ventas/frontend/types.ts`
- `plugins/ventas/frontend/pages/sales/OrdersPanel.tsx`
- `plugins/ventas/facturacion/backend/services/sales_mapper.py`
- `services/greenter-adapter/src/Domain/DocumentItem.php`
- `services/greenter-adapter/src/Mapping/EmitDocumentRequestMapper.php`
- `services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php`
- `services/greenter-adapter/src/Validation/EmitDocumentPayloadValidator.php`

## OUT OF SCOPE

- PDF/printing layout.
- Automatic SUNAT/RUC lookup.
- Full exemption/inafecto/gratuito tax catalogs.
- Editing already confirmed/dispatched orders from the detail dialog.

## CONTRACT

- `ventas_orders.customer_address` persists the fiscal address entered at sale time.
- `ventas_order_items.tax_rate` persists the IGV percentage per item, defaulting to `18.00`.
- `FACTURA` no longer requires a CRM customer, but it requires an 11-digit RUC and customer name.
- Create/list/detail sales APIs return the fiscal address and item tax rate.
- The create-order UI lets the user edit RUC, razon social, fiscal address, quantity, unit price, total, and IGV rate.
- The SUNAT mapper sends line-level `igv` and `tax_rate` in each adapter item.
- The adapter defaults missing `tax_rate` to `18.0` for backwards compatibility.

## INVARIANTS

```yaml
invariants:
  - ventas route paths remain unchanged
  - order status transitions remain unchanged
  - NOTA_VENTA remains non-emitable by SUNAT
  - existing payloads without item.tax_rate still validate as 18% IGV
```

## VERIFICATION

- Python compile for touched ventas files.
- PHP syntax check for touched adapter files.
- Frontend typecheck if available.
- Plugin migrations apply successfully.

## ROLLBACK

- Revert code changes.
- Downgrade migration drops `customer_address` and `tax_rate` after ensuring no new orders depend on them.

## Traceability

- Requirement: user requested showing and editing complete Peruvian fiscal data
  (RUC, razon social, fiscal address, taxable value, IGV rate, totals) in the
  sales create flow.
- owner: agent
- approver: lucas
- Commit: `f2b33ff` (root: adapter per-line tax rate), `ff716d4` (plugins/ventas: persisted `customer_address`, `tax_rate`, editable mappings).
- TRACE: `py_compile` PASS for touched ventas backend files; `php -l` PASS for
  the touched adapter files; `composer test` PASS (26 tests, 2 skipped);
  `npm run typecheck` PASS; `npm run plugins:migrate` reaches `ventas=0010`.
  Adapter defaults missing `item.tax_rate` to `18.0`. No failed checks.
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
