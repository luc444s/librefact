# A.SPEC 0033 — Hide customer fields and fiscal totals for NOTA_VENTA

> `risk: low` — frontend-only UI change, no persistence or backend changes.

## WHY

When a user selects "Nota de venta" as the document type, the form currently shows customer fields (Nombre del cliente, Tipo doc., Número doc., Dirección) and fiscal totals (Op. gravada, IGV, Total). These fields are irrelevant for NOTA_VENTA because it is a non-fiscal document where the customer is completely optional and no SUNAT emission occurs.

Showing these fields confuses users and suggests required inputs that are actually unnecessary.

## WHAT

Sales order create form must hide the following sections when document type is NOTA_VENTA:

- Customer section: Combobox "Cliente registrado opcional", "Nombre del cliente", "Tipo doc.", "Número doc.", "Dirección"
- Fiscal totals section: "Op. gravada", "IGV", "Total"

The form for NOTA_VENTA should only show:
- Document type selector
- Product table
- Notes field
- Submit button

## SCOPE

- `plugins/ventas/frontend/pages/sales/OrdersPanel.tsx`

## OUT OF SCOPE

- Backend changes
- Changes to FACTURA or BOLETA flows
- CRM customer creation
- SUNAT/Greenter integration
- Order list view or detail view

## CONTRACT

### UI behavior

| Document type | Customer fields | Fiscal totals | Submit enabled |
|---------------|----------------|---------------|----------------|
| FACTURA | RUC fields (required) | Shown | When RUC + name present |
| BOLETA | DNI fields (optional) | Shown | When 8 digits + name |
| NOTA_VENTA | Hidden | Hidden | Always |

## DoD

- [x] Customer fields hidden when NOTA_VENTA is selected
- [x] Fiscal totals (Op. gravada, IGV, Total) hidden when NOTA_VENTA is selected
- [x] FACTURA and BOLETA behavior unchanged
- [x] `npm run typecheck` PASS
