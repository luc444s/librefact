# A.SPEC 0013 — Use branches as stock warehouses

> `risk: high` — touches stock identity semantics, database foreign keys, and
> runtime query joins for central inventory flows.

## WHY

The stock plugin still assumes a separate warehouse source inherited from the
old logistics domain. Runtime code references `LogisticsWarehouse`, which no
longer exists, causing stock balance endpoints to fail with `NameError`.

Librefact already has core `branches`. The minimal real domain decision is:
every stock warehouse is a core branch. Stock may keep `warehouse_id` field names
for compatibility, but those IDs must refer to `branches.id`.

## WHAT

Stock must use active core branches as its warehouse catalog and as the referent
for all `warehouse_id` values in stock balances, ledger, config, and allocations.

## SCOPE

- `plugins/stock/backend/services/catalog.py`
- `plugins/stock/backend/services/balances.py`
- `plugins/stock/backend/router.py`
- `plugins/stock/backend/models.py` only if needed to align FK declarations.
- `plugins/stock/migrations/*` for a forward migration from `stk_warehouses` FK
  semantics to `branches` FK semantics.
- Stock plugin tests or smoke checks needed to prove the runtime path.

## OUT OF SCOPE

- Renaming public API fields from `warehouse_id` to `branch_id`.
- Renaming DB columns from `warehouse_id` to `branch_id`.
- Deleting `stk_warehouses` in this A.SPEC.
- Reworking tenant/branch RBAC beyond existing `TenantContext` warehouse access
  behavior.
- Frontend copy/UX rename from warehouse/almacen to branch/sucursal.
- Any changes to `vendor/systutor-core/src/systutor/**`.

## CONTRACT

Preconditions:

- Core `branches` table exists and contains the tenant branches.
- Stock plugin tables may currently contain `warehouse_id` values.
- `stk_warehouses` may exist but must no longer be the active stock warehouse
  catalog after this A.SPEC.

Postconditions:

- `/stock/catalog/warehouses` lists active `branches` as warehouses.
- Stock read/write services validate `warehouse_id` against `branches.id`.
- Stock joins for balances, ledger, config, and allocations use `branches`.
- Stock FKs for `warehouse_id` reference `branches(id)` where the DB enforces
  warehouse integrity.
- `LogisticsWarehouse` is not referenced in active stock backend code.

## INVARIANTS

```yaml
invariants:
  - stock public request/response field names remain warehouse_id/warehouse_name/warehouse_code
  - product stock balances remain per tenant/product/warehouse_id
  - stock ledger idempotency remains unchanged
  - existing branch IDs remain stable
  - no vendor/systutor-core source files are changed
```

## VERIFICATION

- `grep -R "LogisticsWarehouse" plugins/stock --include='*.py'` returns no active
  backend references.
- Fresh Python import of stock backend services succeeds.
- `npm run plugins:migrate` completes and reports `stock` at the new migration.
- DB check shows stock warehouse FKs reference `branches`:

```sql
select conrelid::regclass::text as table_name,
       conname,
       confrelid::regclass::text as references_table
from pg_constraint
where conrelid::regclass::text in (
  'stk_balance', 'stk_ledger', 'stk_config', 'stk_allocation'
)
and contype = 'f'
order by table_name, conname;
```

- `/stock/catalog/warehouses` returns core branches for the current tenant.
- `/stock/balance` no longer raises `NameError: LogisticsWarehouse is not defined`.

Local authenticated smoke result:

- Login: `POST /api/v1/auth/login` with seed user `admin@example.com` passed.
- `GET /api/v1/plugins/stock/catalog/warehouses`: `200`, marker `1`.
- `GET /api/v1/plugins/stock/balance`: `200`, marker `1`.

## ROLLBACK

Rollback is migration-based for schema and code revert for runtime:

- Restore stock services to use `StockWarehouse`/`stk_warehouses`.
- Downgrade or compensating migration drops the new `branches` FKs and restores
  `stk_warehouses` FKs.
- If production data has been written with branch IDs, rollback must first create
  matching `stk_warehouses` rows for those branch IDs or reject rollback.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/stock/backend/services/catalog.py
    - plugins/stock/backend/services/balances.py
    - plugins/stock/backend/router.py
    - plugins/stock/backend/models.py
    - plugins/stock/migrations/*.py
    - plugins/stock/tests/**
    - A-SPECS/0013-use-branches-as-stock-warehouses.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/logistics/**
    - secrets
    - .env
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - stock warehouse catalog
    - stock balances
    - stock ledger
    - stock config
    - stock allocations
    - stock migrations
  indirect:
    - compras/ventas flows that call stock with warehouse_id
    - tenant branch setup
    - frontend stock screens that display warehouse fields
  must_not_affect:
    - productos catalog schema and product identity
    - crm customer schema
    - ventas order schema
    - greenter/sunat adapter
    - systutor core branch APIs
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A.SPEC 0012
  must_compose_with:
    - stock remains decoupled from removed logistics domain
    - plugin migrations remain runnable through npm run plugins:migrate
  systemic_invariants:
    - no active dependency on plugins.logistics
    - branch IDs are the warehouse IDs for stock
  composition_checks:
    - grep check for LogisticsWarehouse in active stock backend code
    - plugin migration registry reports stock at new migration version
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - plugins/stock/backend/services/catalog.py
    - plugins/stock/backend/services/balances.py
    - plugins/stock/migrations/*.py
```

## Traceability

- Requirement: User requested using core branches as warehouses system-wide after
  stock failed with missing `LogisticsWarehouse`.
- owner: agent
- approver: lucas
- Commit: `fb0ec23` (`systutor-stock`), Librefact gitlink commit pending
- Deployment: local Librefact dev DB and plugin runtime

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
