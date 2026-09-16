# Contract 001 — Plugin Independence

## Objective

Imported business plugins must load and migrate as root `plugins/*` modules in Librefact without requiring the source repo's logistics plugin or mutating the Systutor core.

## Scope

- In scope: `plugins/commerce/**`, `plugins/stock/**`, `plugins/ventas/**`, plugin manifests, root plugin migrations.
- Out of scope: `plugins/logistics/**`, `plugins/tms/**`, `plugins/notes/**`, `vendor/systutor-core/src/systutor/**`, `services/greenter-adapter/**`, secrets, dumps.

## Requirements

- Plugin import and migration paths must not import `plugins.logistics.*`.
- Selected plugin manifests must be discoverable from root `plugins/`.
- Logistics-only functionality may remain out of the active root router when logistics is not imported.

## Verification

- Search shows no active `plugins.logistics` imports in required commerce, stock, or ventas migration/load paths.
- `npm run plugins:migrate` completes after `npm run db` on a fresh local database.
