# A.SPEC 0032 — Boleta DNI validation in frontend

> `risk: low` — frontend-only validation change, no persistence or backend changes.

## WHY

When a user creates a BOLETA, the customer document must be a DNI (8 digits). The backend already validates this in `EmitDocumentPayloadValidator.php`, but the frontend allows invalid data to be submitted, causing errors after the fact.

The minimal fix is to enforce DNI validation in the frontend before the order is created.

## WHAT

Sales order create form must enforce these rules when document type is BOLETA:

- `customer_document_type` must be `"1"` (DNI) — auto-set and disabled
- `customer_document_number` must be exactly 8 digits — validated before submit
- Submit button must be disabled when validation fails

## SCOPE

- `plugins/ventas/frontend/pages/sales/OrdersPanel.tsx`

## OUT OF SCOPE

- Backend changes (validation already exists)
- Changes to FACTURA or NOTA_VENTA flows
- CRM customer creation
- SUNAT/Greenter integration

## CONTRACT

### UI behavior

| Document type | customer_document_type | customer_document_number | Submit enabled |
|---------------|----------------------|------------------------|----------------|
| FACTURA | Editable (default "6") | 11 digits required | When both present |
| BOLETA | Auto "1", disabled | 8 digits required | When 8 digits + name |
| NOTA_VENTA | Editable | Optional | Always |

### Validation

- BOLETA: `/^\d{8}$/` test on customer_document_number
- FACTURA: existing validation (11 digits, RUC)

## DoD

- [x] Selecting BOLETA auto-sets customer_document_type to "1"
- [x] customer_document_type input disabled for BOLETA
- [x] customer_document_number placeholder shows "8 dígitos (DNI)" for BOLETA
- [x] Submit button disabled when BOLETA has invalid document number
- [x] No changes to FACTURA or NOTA_VENTA behavior
- [x] `npm run typecheck` PASS

## COMMIT

- Spec + TODO: `7521dab`
- Frontend (ventas submodule): `51ad343`
