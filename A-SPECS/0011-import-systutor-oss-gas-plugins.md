# A.SPEC 0011 — Import Systutor OSS Gas business plugins

## Goal

Import selected mature Systutor OSS Gas business plugins into Librefact as root `plugins/` modules without touching the vendored Systutor core or the Greenter/SUNAT adapter.

## Scope

- In scope: `crm`, `productos`, `commerce`/`compras`, `ventas`, `stock`.
- Out of scope: `logistics`, `tms`, `notes`, legacy billing, `vendor/systutor-core/**`, `services/greenter-adapter/**`, secrets, database dumps.

## Acceptance

- Root `plugins/` contains only the selected imported business plugins.
- Core plugin registry can discover the selected manifests from `SYSTUTOR_PLUGINS_DIR`.
- Plugin migrations can be executed through `npm run plugins:migrate`.
- Imported plugins do not require the non-imported logistics plugin on the active migration/load path.

## Verification

- `npm run db`
- `npm run plugins:migrate`
- `npm run typecheck`

Observed implementation verification:

```text
Commit: 7edfdad02abd540bfece31e9cede6ff086d07606
apps/web support commit: 78ed698
npm run plugins:migrate: PASS — crm=0005, productos=0009, compras=0019, ventas=0002, stock=0009
npm run typecheck: PASS
npx vite build: PASS
TRACE: GAP accepted — productos migrations 002, 003, 006, 007, 008, 009 lack downgrade/down; deployment not exposable.
```

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0011-import-systutor-oss-gas-plugins.md
    - A-SPECS/TODO.md
    - docs/contracts/001-plugin-independence.md
    - docs/contracts/002-plugin-import-acceptance.md
    - package.json
    - scripts/systutor-db.sh
    - scripts/systutor-plugins-migrate.sh
    - apps/web
    - plugins/**
  prohibited:
    - .env
    - .env.*
    - secrets/**
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - plugins/logistics/**
    - plugins/tms/**
    - plugins/notes/**
```

## Rollback

Revert the integration commit and the matching `apps/web` submodule commit.
