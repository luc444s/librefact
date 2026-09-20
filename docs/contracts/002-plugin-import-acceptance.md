# Contract 002 — Plugin Import Acceptance

## Objective

Re-run database startup, plugin migrations, and lightweight registry/load checks for the imported plugin set: `crm`, `productos`, `commerce`/`compras`, `ventas`, and `stock`.

## Scope

- In scope: host scripts, plugin manifests, plugin migrations, compile checks.
- Out of scope: deployment runtime, SUNAT/Greenter backend behavior, logistics/TMS/notes plugins, and vendored core changes.

## Requirements

- `npm run plugins:migrate` must migrate the imported plugins without missing-table failures from logistics coupling.
- The imported plugin manifests must remain discoverable under root `plugins/` using the configured plugin directory.
- Frontend plugin entrypoints must be typecheckable by the host web app.

## Verification

- `npm run db`
- `npm run plugins:migrate`
- `npm run typecheck`

## Status (A.SPEC 0012)

- All five plugin entrypoints import cleanly (previously `compras` and `ventas`
  failed with `ModuleNotFoundError: plugins.logistics`).
- `npm run plugins:migrate` PASS: crm=0005, productos=0010, compras=0020,
  ventas=0002, stock=0009.
- Known pre-existing gap: a migration-only fresh database still fails on
  `crm/migrations/005` and `stock/migrations/006` due to `lg_*` tables. This is
  outside the A.SPEC 0012 change surface and tracked as follow-up.
