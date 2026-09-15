# A.SPEC 0005 - Map internal DTO to Greenter objects

> `risk: normal` - Adds a mapper from the adapter's internal emit DTO to Greenter model objects in memory. It must not call SUNAT, generate XML, sign XML, process CDR, mutate databases, or change Librefact core.

## WHY

A.SPEC 0004 made the valid emit payload become a typed internal adapter DTO. The next boundary is Greenter's own model layer: before XML generation can be tested, Librefact must prove that its internal invoice DTO can become a deterministic `Greenter\Model\Sale\Invoice` object graph.

This keeps Greenter-specific classes isolated inside the adapter while giving later specs a stable object input for XML generation.

## WHAT

Create a mapper that converts `Librefact\GreenterAdapter\Domain\EmitDocumentRequest` into Greenter sale model objects.

New independent falsable truth:

```text
The Greenter adapter can map the canonical internal emit DTO into a `Greenter\Model\Sale\Invoice` object graph with preserved invoice, issuer, customer, item, and totals data, without generating XML or contacting SUNAT.
```

## SCOPE

- Add a test-first mapper test using the canonical valid fixture through the A.SPEC 0004 DTO mapper.
- Create `Librefact\GreenterAdapter\Mapping\EmitDocumentGreenterMapper`.
- Map the internal `EmitDocumentRequest` into these Greenter objects:
  - `Greenter\Model\Sale\Invoice`
  - `Greenter\Model\Company\Company`
  - `Greenter\Model\Client\Client`
  - `Greenter\Model\Sale\SaleDetail`
- Preserve the canonical fixture values already proven by A.SPEC 0004.
- Define explicit defaults required by Greenter for this minimal taxed invoice.

Minimal Greenter defaults for this A.SPEC:

```text
document.type invoice -> tipoDoc 01
item.unidad = ZZ
item.codProducto = SERVICE
item.tipAfeIgv = 10
item.porcentajeIgv = 18
invoice.tipoOperacion = 0101
invoice.ublVersion = 2.1
```

## OUT OF SCOPE

- No SUNAT beta or production calls.
- No XML generation.
- No XML builder, renderer, storage, or response contract changes.
- No certificate handling.
- No XML signing.
- No CDR processing.
- No Greenter `See` configuration.
- No backend Python integration.
- No database migrations.
- No dashboard UI.
- No endpoint behavior change required.
- No new payload fields.
- No boletas, credit notes, debit notes, voiding, summaries, or status endpoints.
- No amount-in-words legend; this belongs to a later XML-ready spec unless the payload/model grows first.

## CONTRACT

Preconditions:

- A.SPEC 0004 has committed internal adapter DTOs and `EmitDocumentRequestMapper`.
- `services/greenter-adapter/tests/fixtures/emit_invoice_minimal.json` remains the canonical valid fixture.
- Composer autoload can load Greenter model classes from `greenter/greenter`.

Postconditions:

- `EmitDocumentGreenterMapper::toInvoice(EmitDocumentRequest $request): Greenter\Model\Sale\Invoice` exists.
- The mapper returns a Greenter `Invoice` object.
- The returned object graph preserves these values:

```text
invoice.ublVersion = 2.1
invoice.tipoOperacion = 0101
invoice.tipoDoc = 01
invoice.serie = F001
invoice.correlativo = 1
invoice.fechaEmision = 2026-09-14
invoice.tipoMoneda = PEN
invoice.company.ruc = 20123456789
invoice.company.razonSocial = LIBREFACT DEMO SAC
invoice.client.tipoDoc = 6
invoice.client.numDoc = 20601234567
invoice.client.rznSocial = CLIENTE DEMO SAC
invoice.details count = 1
invoice.details[0].unidad = ZZ
invoice.details[0].codProducto = SERVICE
invoice.details[0].descripcion = Servicio demo
invoice.details[0].cantidad = 1
invoice.details[0].mtoValorUnitario = 100
invoice.details[0].mtoBaseIgv = 100
invoice.details[0].porcentajeIgv = 18
invoice.details[0].igv = 18
invoice.details[0].tipAfeIgv = 10
invoice.details[0].totalImpuestos = 18
invoice.details[0].mtoPrecioUnitario = 118
invoice.details[0].mtoValorVenta = 100
invoice.mtoOperGravadas = 100
invoice.mtoIGV = 18
invoice.totalImpuestos = 18
invoice.mtoImpVenta = 118
```

The mapper may assume the request comes from A.SPEC 0004 and was already validated by A.SPEC 0003. It does not need to duplicate payload validation.

## INVARIANTS

```yaml
invariants:
  - id: internal-dto-mapping-preserved
    statement: A.SPEC 0004 DTO mapper test continues passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentRequestMapperTest`
  - id: payload-validation-preserved
    statement: A.SPEC 0003 payload validation tests continue passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentPayloadValidationTest`
  - id: emit-endpoint-contract-preserved
    statement: A.SPEC 0002 endpoint contract test continues passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentEndpointContractTest`
  - id: no-xml-signing-sunat-or-cdr
    statement: Greenter object mapping must not use XML builders, SUNAT network URLs, certificates, signing, sending, or CDR processing.
    proof: `! grep -R -E 'See|sunat\.gob|beta\.sunat|sendXml|sendBill|setClaveSOL|certificate|cert|sign|Xml|Builder|Cdr|cdr' services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php services/greenter-adapter/tests/EmitDocumentGreenterMapperTest.php`
  - id: root-npm-scripts-preserved
    statement: Root `package.json` scripts `frontend`, `services`, `db`, `dev`, and `typecheck` remain present.
    proof: `node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'`
```

## VERIFICATION

Test-first gate before implementation:

```bash
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentGreenterMapperTest
```

Expected result before implementation:

```text
FAILURES!
The mapper class Librefact\GreenterAdapter\Mapping\EmitDocumentGreenterMapper must exist before this contract can pass.
```

Full checks after implementation:

```bash
composer validate --strict --working-dir services/greenter-adapter
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentGreenterMapperTest
composer test --working-dir services/greenter-adapter
php -r 'require "services/greenter-adapter/vendor/autoload.php"; exit(class_exists("Librefact\\GreenterAdapter\\Mapping\\EmitDocumentGreenterMapper") ? 0 : 1);'
! grep -R -E 'See|sunat\.gob|beta\.sunat|sendXml|sendBill|setClaveSOL|certificate|cert|sign|Xml|Builder|Cdr|cdr' services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php services/greenter-adapter/tests/EmitDocumentGreenterMapperTest.php
node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'
npm run typecheck
```

## ROLLBACK

This change is reversible.

Rollback steps:

```bash
rm -f A-SPECS/0005-map-internal-dto-to-greenter-objects.md
rm -f services/greenter-adapter/tests/EmitDocumentGreenterMapperTest.php
rm -f services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php
```

No database rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0005-map-internal-dto-to-greenter-objects.md
    - services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php
    - services/greenter-adapter/tests/EmitDocumentGreenterMapperTest.php
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
    - services/greenter-adapter/src/Domain/**
    - database schema or migrations
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - Greenter adapter DTO-to-Greenter mapper
    - Greenter adapter mapper test
  indirect:
    - Later XML generation specs will consume the Greenter Invoice object
  must_not_affect:
    - Existing Systutor backend
    - Existing dashboard frontend
    - Existing PostgreSQL librefact DB script
    - Existing root npm scripts
    - A.SPEC 0002 endpoint contract
    - A.SPEC 0003 payload validation
    - A.SPEC 0004 DTO mapping
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0001-greenter-adapter-in-repo.md
    - A-SPECS/0002-greenter-emit-endpoint-contract.md
    - A-SPECS/0003-validate-greenter-emit-payload.md
    - A-SPECS/0004-map-emit-payload-to-internal-dto.md
  must_compose_with:
    - docs/architecture.md
  systemic_invariants:
    - Greenter-specific classes remain inside the Greenter adapter.
    - Librefact core remains tax-authority agnostic.
    - No SUNAT behavior is claimed by this A.SPEC.
  composition_checks:
    - `test -f A-SPECS/0001-greenter-adapter-in-repo.md`
    - `test -f A-SPECS/0002-greenter-emit-endpoint-contract.md`
    - `test -f A-SPECS/0003-validate-greenter-emit-payload.md`
    - `test -f A-SPECS/0004-map-emit-payload-to-internal-dto.md`
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
    - services/greenter-adapter/src/Mapping
    - services/greenter-adapter/tests
```

## Traceability

- Requirement: Librefact must convert an internal Greenter emit DTO into Greenter model objects before XML generation.
- owner: Lucas
- approver: Lucas
- Commit:
- Deployment: local repository only; no runtime deployment in this A.SPEC.

## Definition of Done

- [ ] Objective satisfied
- [ ] Scope respected
- [ ] Contract satisfied
- [ ] Invariants checked
- [ ] Tests pass
- [ ] Rollback documented
- [ ] No prohibited paths changed
