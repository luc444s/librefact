# A.SPEC 0016 — Configuration document series

> `risk: medium` — introduces a new plugin and a tenant-scoped configuration
> table, but does not emit fiscal documents or reserve numbers.

## WHY

Librefact needs an explicit fiscal configuration area before invoice/boleta
emission work. Sales can already capture `FACTURA` and `BOLETA`, but document
series and correlatives must be configured by the user instead of being
hardcoded in backend code.

This A.SPEC merges the next fiscal-configuration need with the existing plugin
reporting/navigation pattern from A.SPEC 0015: a small, boring, independently
mounted plugin screen under `Configuracion > Facturacion > Series y
correlativos`.

## WHAT

Add a new Systutor plugin `configuracion` with:

- Backend CRUD for document series at
  `/api/v1/plugins/configuracion/billing/document-series`.
- Frontend route `/app/configuracion/facturacion/series`.
- Sidebar navigation grouped as `Configuracion` with item `Series y
  correlativos`.
- Tenant-scoped table `cfg_document_series`.

Supported document types for now:

- `FACTURA`: series must match `F` plus exactly three digits, for example
  `F001`.
- `BOLETA`: series must match `B` plus exactly three digits, for example
  `B001`.

Users configure:

- `document_type`
- `series`
- `initial_number`
- optional `branch_id`
- `is_default`
- `is_active`

The system stores `next_number`, initialized from `initial_number` on create.
`next_number` is returned for visibility but is not editable through this UI/API
in this A.SPEC.

## SCOPE

- `plugins/configuracion/**`
- `scripts/systutor-plugins-migrate.sh`
- `A-SPECS/0016-configuration-document-series.md`
- Tests or smoke checks needed to prove plugin discovery, migration, and CRUD.

## OUT OF SCOPE

- SUNAT submission, Greenter, CDR, XML, PDF, or printing.
- Number reservation/allocation during sales emission.
- Editing `next_number` directly after use.
- Changing ventas order creation, confirmation, dispatch, or reports.
- Changing core settings, permissions, or plugin runtime source.
- Adding `.gitmodules` entries or extracting this plugin to a separate remote.

## CONTRACT

Preconditions:

- The Systutor plugin runtime discovers plugins under `plugins/*/plugin.json`.
- `scripts/systutor-plugins-migrate.sh` controls which local plugins are upgraded
  in this project.
- Core tables `tenants`, `users`, and `branches` exist.

Postconditions:

- Plugin `configuracion` is discoverable and declares permissions under its own
  namespace.
- `npm run plugins:migrate` upgrades `configuracion` and creates
  `cfg_document_series`.
- `cfg_document_series` rows are tenant-scoped.
- A series is unique per tenant, document type, series, and optional branch scope.
- Creating a `FACTURA` series rejects non-`F###` values.
- Creating a `BOLETA` series rejects non-`B###` values.
- Creating a series sets `next_number = initial_number`.
- Updating a series can change `branch_id`, `is_default`, and `is_active`, but not
  `document_type`, `series`, `initial_number`, or `next_number`.
- Only one active default series exists per tenant, document type, and optional
  branch scope; setting one row as default unsets the others in the same scope.
- Frontend lists existing series and supports create/update of the allowed fields.

## INVARIANTS

```yaml
invariants:
  - no SUNAT/Greenter/fiscal emission behavior is added
  - no ventas transactional behavior is changed
  - next_number is not user-editable through the new API or UI
  - document series validation stays in configuracion, not ventas
  - no vendor/systutor-core source files are changed
  - no existing plugin submodules are modified
```

## VERIFICATION

- `PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile plugins/configuracion/backend/plugin.py plugins/configuracion/backend/router.py plugins/configuracion/backend/models.py plugins/configuracion/backend/schemas.py plugins/configuracion/backend/services.py`
- `npm run plugins:migrate`
- `npm run typecheck`
- Authenticated HTTP smoke for `/api/v1/plugins/configuracion/billing/document-series` supports list/create/update for `FACTURA F001`.

Local result:

- Implemented under `plugins/configuracion/**` with migration and CRUD endpoint.
- `py_compile`, `npm run plugins:migrate`, `npm run typecheck`, and authenticated HTTP smoke passed locally.
- Login smoke confirmed `configuracion.document_series.read` is present for the
  demo admin role, so the sidebar item is visible after a fresh session.

## ROLLBACK

Rollback is migration-based for DB and code revert for runtime:

- Downgrade `configuracion` drops `cfg_document_series`.
- Revert `plugins/configuracion/**` and remove `configuracion` from
  `scripts/systutor-plugins-migrate.sh`.
- No sales or emission data migration is needed because this A.SPEC only stores
  configuration rows.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/configuracion/**
    - scripts/systutor-plugins-migrate.sh
    - A-SPECS/0016-configuration-document-series.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - plugins/ventas/**
    - plugins/commerce/**
    - plugins/productos/**
    - plugins/crm/**
    - plugins/stock/**
    - services/greenter-adapter/**
    - .gitmodules
    - secrets
    - .env
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - configuracion plugin discovery
    - configuracion plugin migration
    - document series CRUD endpoint
    - document series frontend page
  indirect:
    - plugin migration script selected plugin list
  must_not_affect:
    - sales order writes
    - purchase order writes
    - stock movements
    - SUNAT/Greenter adapter
    - existing plugin submodules
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0014-sales-invoice-boleta-document-type.md
    - A-SPECS/0015-commercial-orders-report.md
  must_compose_with:
    - ventas can keep creating FACTURA/BOLETA sales orders without reading series
    - reportes keep reading existing order data only
    - plugin runtime keeps discovering existing plugin registrations
  systemic_invariants:
    - configuration is persisted before emission work consumes it
    - numbering allocation is deferred to a later A.SPEC
  composition_checks:
    - plugin migration includes configuracion without removing existing plugins
    - frontend typecheck covers new route registration
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one plugin owns fiscal configuration screens
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - plugins/configuracion/backend/services.py
    - plugins/configuracion/frontend/pages/DocumentSeriesPage.tsx
```

## Traceability

- Requirement: User requested a merged A.SPEC from the pending 0015/0016 context,
  then asked to launch the generator after creating the spec.
- owner: agent
- approver: lucas
- Commit: This implementation commit.
- TRACE: PASS — surface respected, generator launched after spec creation, new
  plugin registered and migrated locally.
- Deployment: local Librefact dev DB after plugin migration

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
