# Contract 003 — Systutor Plugin Repo Extraction

## Objective

Extract each mature root plugin into an independent GitHub repository under the
`systutor-*` naming scheme while keeping Librefact as a host application that can
install, load, migrate, and validate those modules reproducibly.

## Repository Names

- `systutor-crm` for `plugins/crm` (`plugin_id`: `crm`).
- `systutor-productos` for `plugins/productos` (`plugin_id`: `productos`).
- `systutor-stock` for `plugins/stock` (`plugin_id`: `stock`).
- `systutor-compras` for `plugins/commerce` (`plugin_id`: `compras`).
- `systutor-ventas` for `plugins/ventas` (`plugin_id`: `ventas`).

## License Decision

Use MIT for each extracted module.

Rationale:

- Existing Systutor packages in this repository are already MIT:
  `vendor/systutor-core`, `vendor/systutor-shell`, and `vendor/systutor-themes`.
- The Greenter adapter boundary is also MIT.
- MIT keeps adoption friction low for companies, SaaS deployments, forks, and
  plugin reuse across Librefact or other Systutor hosts.
- GPL is intentionally avoided because it would impose copyleft obligations on
  host applications and downstream business deployments.
- Apache-2.0 is acceptable, but MIT matches the current Systutor ecosystem and is
  simpler for the first extraction round.

## Module Layout

Each repository must keep this top-level structure when applicable:

```text
plugin.json
backend/
frontend/
migrations/
permissions/
events/
tests/
README.md
LICENSE
CHANGELOG.md
```

The module source must remain directly mountable under Librefact's `plugins/`
directory without changing the Systutor core.

## Host Install Model

Librefact should keep a plugin lock file that pins module repositories by tag or
commit. The lock file is the source of truth for reproducible installs.

Example target shape:

```json
{
  "productos": {
    "repo": "git@github.com:luc444s/systutor-productos.git",
    "ref": "v0.1.0",
    "path": "plugins/productos"
  }
}
```

The first implementation can clone/check out sources into `plugins/*`. Packaging
as Python/npm artifacts is a later phase.

## Extraction Order

1. `systutor-productos`: low-level catalog dependency for stock, compras, and
   ventas.
2. `systutor-crm`: customer domain dependency for ventas.
3. `systutor-stock`: depends on productos.
4. `systutor-compras`: depends on productos; current folder remains
   `plugins/commerce` unless the host path is migrated separately.
5. `systutor-ventas`: depends on crm and productos.

## Independence Rules

- No module may import private internals from another sibling plugin.
- Cross-plugin coupling must go through one of these contracts:
  `plugin.json.requires`, events, public HTTP/API routes, or stable SDK objects.
- No module may mutate `vendor/systutor-core/src/systutor/**`.
- No module may depend on removed industrial-gas/logistics/cylinder domains.
- Migrations must be forward-safe and idempotent where practical.
- Repository names may use `systutor-*`, but `plugin_id` values stay stable.

## Pilot: `systutor-productos`

The first extraction must prove that a plugin can live outside the Librefact repo
and still be installed into `plugins/productos` with the same runtime behavior.

Acceptance gates:

- `plugin.json` is present and unchanged in identity (`plugin_id`: `productos`).
- `backend/`, `frontend/`, `migrations/`, `permissions/`, and `events/` are copied
  with no unrelated Librefact host files.
- `LICENSE` is MIT.
- `README.md` documents install into a Systutor host.
- Librefact can install the module into `plugins/productos` from the pinned repo.
- `npm run plugins:migrate` completes with `productos` at its latest migration.
- Backend import check for the plugin passes.

## Deferred Work

- GitHub repository creation and first pushes.
- Lockfile/script implementation for installing pinned plugin repos.
- CI templates per extracted module.
- Optional Python/npm packaging after source-based installs are stable.
