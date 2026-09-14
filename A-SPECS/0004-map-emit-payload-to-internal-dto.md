# A.SPEC 0004 — Map emit payload to internal DTO

> `risk: normal` — Adds internal adapter DTOs and a mapper from the already validated payload. It must not call SUNAT, generate XML, mutate databases, or change Librefact core.

## WHY

A.SPEC 0003 made `POST /documents/emit` reject structurally invalid payloads, but the adapter still works with raw arrays. Before mapping to Greenter objects, the valid payload needs to become an internal typed model that can serve as the stable boundary for later specs.

This keeps later Greenter work from depending on loose array keys scattered through the adapter.

## WHAT

Create an internal mapper that converts the existing valid emit payload fixture into adapter DTOs.

New independent falsable truth:

```text
The Greenter adapter can map the canonical valid emit payload into an `EmitDocumentRequest` object with typed nested DTOs and preserved values, without using Greenter classes or contacting SUNAT.
```

## SCOPE

- Add a test-first mapper test for the canonical valid fixture.
- Create internal DTOs for the emit request.
- Create a mapper from valid payload array to DTO.
- Preserve all values required by A.SPEC 0003.
- Keep DTOs adapter-internal and independent from Greenter classes.

Expected DTOs:

- `Librefact\GreenterAdapter\Domain\EmitDocumentRequest`
- `Librefact\GreenterAdapter\Domain\TaxAuthority`
- `Librefact\GreenterAdapter\Domain\DocumentIdentity`
- `Librefact\GreenterAdapter\Domain\Issuer`
- `Librefact\GreenterAdapter\Domain\Customer`
- `Librefact\GreenterAdapter\Domain\DocumentItem`
- `Librefact\GreenterAdapter\Domain\DocumentTotals`
- `Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper`

## OUT OF SCOPE

- No SUNAT beta or production calls.
- No XML generation.
- No certificate handling.
- No CDR processing.
- No Greenter object mapping.
- No backend Python integration.
- No database migrations.
- No dashboard UI.
- No endpoint behavior change required.
- No validation rules beyond reusing the already valid fixture.

## CONTRACT

Preconditions:

- A.SPEC 0003 has committed payload validation for `POST /documents/emit`.
- `services/greenter-adapter/tests/fixtures/emit_invoice_minimal.json` remains the canonical valid fixture.
- Composer autoload for `Librefact\GreenterAdapter\` already points to `src/`.

Postconditions:

- `EmitDocumentRequestMapper::fromPayload(array $payload): EmitDocumentRequest` exists.
- Mapping the canonical fixture returns an `EmitDocumentRequest`.
- The DTO preserves these values:

```text
taxAuthority.country = PE
taxAuthority.code = SUNAT
taxAuthority.provider = greenter
document.type = invoice
document.serie = F001
document.number = 1
document.currency = PEN
document.issueDate = 2026-09-14
issuer.ruc = 20123456789
issuer.legalName = LIBREFACT DEMO SAC
customer.documentType = 6
customer.documentNumber = 20601234567
customer.legalName = CLIENTE DEMO SAC
items[0].description = Servicio demo
items[0].quantity = 1
items[0].unitValue = 100
items[0].igv = 18
items[0].total = 118
totals.taxable = 100
totals.igv = 18
totals.total = 118
```

The mapper may assume the payload has already passed A.SPEC 0003 validation. It does not need to duplicate validation in this A.SPEC.

## INVARIANTS

```yaml
invariants:
  - id: payload-validation-preserved
    statement: A.SPEC 0003 payload validation tests continue passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentPayloadValidationTest`
  - id: emit-endpoint-contract-preserved
    statement: A.SPEC 0002 endpoint contract test continues passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentEndpointContractTest`
  - id: no-greenter-or-sunat-runtime-use
    statement: DTO mapping must not use Greenter classes, SUNAT network URLs, certificates, XML generation, or CDR processing.
    proof: `! grep -R -E 'use Greenter\\|sunat\.gob|beta\.sunat|sendXml|setClaveSOL|certificate|xml|cdr' services/greenter-adapter/src/Domain services/greenter-adapter/src/Mapping services/greenter-adapter/tests/EmitDocumentRequestMapperTest.php`
  - id: root-npm-scripts-preserved
    statement: Root `package.json` scripts `frontend`, `services`, `db`, `dev`, and `typecheck` remain present.
    proof: `node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'`
```

## VERIFICATION

Test-first gate before implementation:

```bash
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentRequestMapperTest
```

Expected result before implementation:

```text
FAILURES!
The mapper class Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper must exist before this contract can pass.
```

Full checks after implementation:

```bash
composer validate --strict --working-dir services/greenter-adapter
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentRequestMapperTest
composer test --working-dir services/greenter-adapter
php -r 'require "services/greenter-adapter/vendor/autoload.php"; exit(class_exists("Librefact\\GreenterAdapter\\Mapping\\EmitDocumentRequestMapper") ? 0 : 1);'
! grep -R -E 'use Greenter\\|sunat\.gob|beta\.sunat|sendXml|setClaveSOL|certificate|xml|cdr' services/greenter-adapter/src/Domain services/greenter-adapter/src/Mapping services/greenter-adapter/tests/EmitDocumentRequestMapperTest.php
node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'
npm run typecheck
```

## ROLLBACK

This change is reversible.

Rollback steps:

```bash
rm -f A-SPECS/0004-map-emit-payload-to-internal-dto.md
rm -f services/greenter-adapter/tests/EmitDocumentRequestMapperTest.php
rm -rf services/greenter-adapter/src/Domain
rm -rf services/greenter-adapter/src/Mapping
```

No database rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0004-map-emit-payload-to-internal-dto.md
    - services/greenter-adapter/src/Domain/**
    - services/greenter-adapter/src/Mapping/**
    - services/greenter-adapter/tests/EmitDocumentRequestMapperTest.php
  prohibited:
    - vendor/systutor-core/**
    - apps/web/**
    - scripts/systutor-db.sh
    - package.json
    - docs/architecture.md
    - services/greenter-adapter/composer.json
    - services/greenter-adapter/composer.lock
    - services/greenter-adapter/src/Http/**
    - services/greenter-adapter/src/Validation/**
    - database schema or migrations
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - Greenter adapter internal DTOs
    - Greenter adapter payload-to-DTO mapper
  indirect:
    - Later Greenter object mapping specs will consume these DTOs
  must_not_affect:
    - Existing Systutor backend
    - Existing dashboard frontend
    - Existing PostgreSQL librefact DB script
    - Existing root npm scripts
    - A.SPEC 0002 endpoint contract
    - A.SPEC 0003 payload validation
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0001-greenter-adapter-in-repo.md
    - A-SPECS/0002-greenter-emit-endpoint-contract.md
    - A-SPECS/0003-validate-greenter-emit-payload.md
  must_compose_with:
    - docs/architecture.md
  systemic_invariants:
    - Internal DTOs remain adapter-internal and do not enter Librefact core.
    - No SUNAT behavior is claimed by this A.SPEC.
  composition_checks:
    - `test -f A-SPECS/0001-greenter-adapter-in-repo.md`
    - `test -f A-SPECS/0002-greenter-emit-endpoint-contract.md`
    - `test -f A-SPECS/0003-validate-greenter-emit-payload.md`
    - `test -f docs/architecture.md`
    - `grep -q 'Tax authority adapters, no tax authority in core' docs/architecture.md`
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - services/greenter-adapter/src/Domain
    - services/greenter-adapter/src/Mapping
    - services/greenter-adapter/tests
```

## Traceability

- Requirement: Librefact must convert a valid Greenter emit payload into internal adapter DTOs before mapping to Greenter objects.
- owner: Lucas
- approver: Lucas
- Commit:
- Deployment: local repository only; no runtime deployment in this A.SPEC.

## Definition of Done

- [ ] Objective satisfied
- [ ] Scope respected
- [ ] Contract satisfied
- [ ] Independent falsable truth exists now
- [ ] Invariants preserved
- [ ] Verification passed
- [ ] Rollback / compensation is honest
- [ ] Composition checks passed when applicable
- [ ] No unrelated changes
- [ ] Structural constraints respected
- [ ] Traceability established
