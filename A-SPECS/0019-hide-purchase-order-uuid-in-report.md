# A.SPEC 0019 — Hide purchase order UUID in report

> `risk: low` — frontend-only report presentation change plus local data backfill
> already applied to the demo database.

## WHY

The purchase report exposed internal purchase order UUIDs in a visible column.
Users need a readable correlativo instead of implementation identifiers.

Existing historical purchase orders may have empty persisted correlativo fields
because correlativos are assigned on confirmation only after A.SPEC 0018.

## WHAT

- Remove the explicit `ID orden de compra` column from the purchase report.
- Keep showing `correlative_full_number` when it exists.
- For report rows that still lack a persisted correlativo, show an 8-digit visual
  fallback ordered by creation time.
- Update the frontend report type to include `correlative_full_number`.
- Backfill the three existing local demo purchase orders directly in DB:
  - `OC-00000001`
  - `OC-00000002`
  - `OC-00000003`
- Advance `cfg_document_series.next_number` for `ORDEN_COMPRA`/`OC` to `4`.

## SCOPE

- `plugins/commerce/purchase/frontend/api.ts`
- `plugins/commerce/purchase/frontend/pages/purchase/PurchaseReportDialog.tsx`
- Local PostgreSQL data only for the historical demo rows.

## OUT OF SCOPE

- Changing purchase order primary keys.
- Changing backend report query semantics.
- Changing purchase confirmation behavior from A.SPEC 0018.
- Adding migrations for historical local data.

## CONTRACT

Preconditions:

- Purchase report returns `orders[]` with `order_id`, `created_at`, and optional
  `correlative_full_number`.

Postconditions:

- The report orders table no longer displays raw UUIDs.
- Rows with `correlative_full_number` display that persisted value.
- Rows without a persisted value display an 8-digit fallback in creation order.
- The local demo database has the three reported orders persisted with
  `OC-00000001` through `OC-00000003`.
- The next configured purchase order correlativo is `OC-00000004`.

## INVARIANTS

```yaml
invariants:
  - internal UUIDs remain primary keys and API row keys
  - persisted correlativos still come from A.SPEC 0018 confirmation flow
  - visual fallback does not mutate remote/backend data
  - local manual backfill also advances cfg_document_series.next_number
```

## VERIFICATION

- `npm run typecheck`: PASS.
- DB check after backfill:

```sql
select id, correlative_series, correlative_number, correlative_full_number
from com_purchase_orders
where id in (
  '7535d9f7-80e5-4cc9-b5bf-cd7d5884ad8b',
  '819bb632-3cc6-44ad-99ba-5e6731ce0e46',
  '31fa2c61-80da-4ef6-b39d-63083a1c3eb1'
)
order by created_at;
```

Result: `OC-00000001`, `OC-00000002`, `OC-00000003`.

- DB check for series: `cfg_document_series.next_number = 4` for
  `document_type = 'ORDEN_COMPRA'` and `series = 'OC'`.

## ROLLBACK

- Revert the frontend commit in `systutor-compras`.
- If needed only for local demo data, clear the three backfilled correlativo
  fields and restore `cfg_document_series.next_number` carefully to avoid
  duplicates.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/commerce/purchase/frontend/api.ts
    - plugins/commerce/purchase/frontend/pages/purchase/PurchaseReportDialog.tsx
    - A-SPECS/0019-hide-purchase-order-uuid-in-report.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/ventas/**
    - plugins/stock/**
    - secrets
    - .env
```

## Traceability

- Requirement: User requested not to show explicit purchase IDs and to use
  correlativos for the three existing purchase orders.
- owner: agent
- approver: lucas
- Commit: Pending.

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Verification passed
- [x] Rollback / compensation is honest
- [x] No unrelated changes staged
