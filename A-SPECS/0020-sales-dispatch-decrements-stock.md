# A.SPEC 0020 — Sales dispatch decrements stock

> `risk: medium` — connects sales order dispatch to stock ledger mutation.

## WHY

A sales order for `FIDEOS DON VITTORIO 480 GR` reached `DISPATCHED`, but stock
remained unchanged. The sales module only changed the order status and never
called stock nor advanced `dispatched_qty`.

Dispatching a sale must create a stock `sale_out` movement and leave the sales
line quantities consistent with stock.

## WHAT

- When `POST /ventas/orders/{id}/dispatch` runs, resolve the dispatch warehouse
  from the current branch/warehouse context.
- For each order item, compute remaining quantity as
  `quantity - dispatched_qty`.
- Call stock `sale_out_stock` in the same DB transaction for each remaining
  quantity.
- Use idempotency key `ventas-order-item:{item_id}:dispatch`.
- Update `ventas_order_items.dispatched_qty` after each successful stock move.
- Keep the sales order status transition to `DISPATCHED`.
- Backfill the already-dispatched local FIDEOS sale by creating its missing
  `sale_out` ledger and updating `dispatched_qty`.

## SCOPE

- `plugins/ventas/backend/services/orders.py`
- `plugins/ventas/backend/routers/orders.py`
- Local PostgreSQL data for the already affected sale only.

## OUT OF SCOPE

- Partial dispatch UI.
- Choosing a different warehouse from the UI.
- Sales returns or cancellations reversing stock.
- Changing stock movement semantics.

## CONTRACT

Preconditions:

- Sales order is in a state that can transition to `DISPATCHED`.
- The current user has a branch/warehouse context usable for stock.
- Stock has enough quantity unless negative stock is explicitly allowed by
  stock configuration.

Postconditions:

- Each pending item creates one idempotent `sale_out` ledger movement.
- Each item has `dispatched_qty` advanced by the dispatched quantity.
- The order transitions to `DISPATCHED` only after stock movements succeed.
- If stock rejects the movement, the sales dispatch transaction rolls back.

## INVARIANTS

```yaml
invariants:
  - stock remains source of truth for balances
  - warehouse_id values are branch IDs per A.SPEC 0013
  - idempotency prevents duplicate sale_out for the same order item dispatch
  - sales status and dispatched quantities change in the same transaction as stock
```

## VERIFICATION

- `PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile plugins/ventas/backend/services/orders.py plugins/ventas/backend/routers/orders.py`: PASS.
- Manual DB verification for affected sale:
  - Product `FIDEOS DON VITTORIO 480 GR` balance changed from `52.000` to
    `49.000`.
  - Sale item `8995cba5-ec35-490f-b713-cef967e0cf9e` has
    `dispatched_qty = 3.00`.
  - `stk_ledger` has a `sale_out` row with `quantity = -3.000` and
    `balance_after = 49.000`.

## ROLLBACK

- Revert the ventas commit.
- For local demo data only, compensate the manual backfill with an opposite
  stock adjustment if the sale should not have affected stock.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/ventas/backend/services/orders.py
    - plugins/ventas/backend/routers/orders.py
    - A-SPECS/0020-sales-dispatch-decrements-stock.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/commerce/**
    - plugins/stock/** except runtime import/use of public stock services
    - secrets
    - .env
```

## Traceability

- Requirement: User reported that a FIDEOS sale did not alter stock.
- owner: agent
- approver: lucas
- Commit: `2022afe163db2b50694cb4f91a9fc1d532826257` (`systutor-ventas`),
  `281f704092dd1765832662198cb263f18f409381` (Librefact gitlink/spec).

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Verification passed
- [x] Rollback / compensation is honest
- [x] No unrelated changes staged
