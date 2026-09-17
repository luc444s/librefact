# A.SPEC 0021 — Localize stock ledger operations

> `risk: low` — frontend display-only change for ledger operation labels.

## WHY

The stock ledger frontend showed internal operation codes such as `sale_out` and
`purchase_in`. Users need Spanish labels in the UI while preserving stable
internal codes in DB/API.

## WHAT

- Render the ledger `Operación` column through `OPERATION_LABELS`.
- Add Spanish labels for `reserve` and `release`.
- Keep existing labels for sale, purchase, returns, damage, transfers, and
  adjustments.
- Leave raw operation values unchanged in backend, API payloads, and database.

## SCOPE

- `plugins/stock/frontend/components/ModalDetalleStock.tsx`

## OUT OF SCOPE

- Renaming DB enum/check values.
- Changing stock ledger API responses.
- Changing movement creation behavior.

## CONTRACT

Preconditions:

- Ledger rows include an internal `operation` string.

Postconditions:

- Known stock operations render in Spanish in the UI.
- Unknown operations still render their raw value as a safe fallback.

## INVARIANTS

```yaml
invariants:
  - internal operation codes remain stable
  - database rows are not mutated
  - API responses remain backward-compatible
```

## VERIFICATION

- `npm run typecheck`: PASS.

## ROLLBACK

- Revert the stock frontend commit.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/stock/frontend/components/ModalDetalleStock.tsx
    - A-SPECS/0021-localize-stock-ledger-operations.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/commerce/**
    - plugins/ventas/**
    - secrets
    - .env
```

## Traceability

- Requirement: User asked to show ledger operation labels in Spanish.
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
