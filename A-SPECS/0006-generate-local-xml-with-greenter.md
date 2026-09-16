# A.SPEC 0006 - Generate local XML with Greenter

> `risk: normal` - Adds local unsigned XML generation from the Greenter invoice object graph. It must not call SUNAT, sign XML, configure certificates, process CDR, mutate databases, or change Librefact core.

## WHY

A.SPEC 0005 proved that the adapter can map the canonical internal emit DTO into Greenter model objects. The next boundary is local XML generation: before signing or sending anything, Librefact must prove that Greenter can render a deterministic UBL invoice XML string from the valid invoice model.

This keeps XML generation inside the PHP Greenter adapter and preserves the rule that tax authority behavior does not leak into Librefact core.

## WHAT

Create a local XML generator that converts `Librefact\GreenterAdapter\Domain\EmitDocumentRequest` into an unsigned UBL XML string using Greenter's invoice XML builder.

New independent falsable truth:

```text
The Greenter adapter can generate a parseable local UBL invoice XML string from the canonical valid emit request, without cryptographic signing, certificates, CDR processing, or SUNAT network calls.
```

## SCOPE

- Add a test-first XML generator test using the canonical valid fixture through the A.SPEC 0004 and 0005 mapping path.
- Create `Librefact\GreenterAdapter\Xml\EmitDocumentXmlGenerator`.
- Return XML as a string in memory.
- Use `Greenter\Xml\Builder\InvoiceBuilder::build()` for local XML rendering.
- Preserve the canonical invoice values in the XML.
- Validate the generated XML is parseable by `DOMDocument`.

Required generation pipeline:

```text
emit_invoice_minimal.json
-> EmitDocumentRequestMapper::fromPayload()
-> EmitDocumentXmlGenerator::generate()
-> EmitDocumentGreenterMapper::toInvoice()
-> Greenter\Xml\Builder\InvoiceBuilder::build()
-> XML string
```

## OUT OF SCOPE

- No SUNAT beta or production calls.
- No `Greenter\See` usage.
- No `getXmlSigned()` usage.
- No certificate handling.
- No cryptographic XML signing.
- No `send()`, `sendXml()`, or `sendBill()` calls.
- No CDR processing.
- No XML persistence to disk or temporary files.
- No endpoint behavior change required.
- No response contract changes.
- No backend Python integration.
- No database migrations.
- No dashboard UI.
- No new payload fields.
- No boletas, credit notes, debit notes, voiding, summaries, or status endpoints.

Note: Greenter's invoice template may include UBL placeholder nodes such as `cac:Signature` or `ext:ExtensionContent`. This A.SPEC forbids cryptographic signing and `ds:Signature`, not those UBL template placeholders.

## CONTRACT

Preconditions:

- A.SPEC 0004 has committed internal adapter DTOs and `EmitDocumentRequestMapper`.
- A.SPEC 0005 has committed `EmitDocumentGreenterMapper`.
- `services/greenter-adapter/tests/fixtures/emit_invoice_minimal.json` remains the canonical valid fixture.
- Composer autoload can load Greenter XML builder classes from `greenter/greenter`.

Postconditions:

- `EmitDocumentXmlGenerator::generate(EmitDocumentRequest $request): string` exists.
- The generator returns a non-empty string.
- The returned string is parseable XML.
- The returned XML contains these facts:

```text
root element = Invoice
default namespace = urn:oasis:names:specification:ubl:schema:xsd:Invoice-2
cbc:UBLVersionID = 2.1
cbc:ID = F001-1
cbc:IssueDate = 2026-09-14
cbc:InvoiceTypeCode = 01
cbc:InvoiceTypeCode@listID = 0101
cbc:DocumentCurrencyCode = PEN
issuer ruc = 20123456789
issuer legal name = LIBREFACT DEMO SAC
customer document number = 20601234567
customer legal name = CLIENTE DEMO SAC
item description = Servicio demo
taxable amount = 100.00
igv amount = 18.00
total amount = 118.00
```

The generator may assume the request comes from A.SPEC 0004 and was already validated by A.SPEC 0003. It does not need to duplicate payload validation.

## INVARIANTS

```yaml
invariants:
  - id: greenter-object-mapping-preserved
    statement: A.SPEC 0005 Greenter object mapper test continues passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentGreenterMapperTest`
  - id: internal-dto-mapping-preserved
    statement: A.SPEC 0004 DTO mapper test continues passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentRequestMapperTest`
  - id: payload-validation-preserved
    statement: A.SPEC 0003 payload validation tests continue passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentPayloadValidationTest`
  - id: emit-endpoint-contract-preserved
    statement: A.SPEC 0002 endpoint contract test continues passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentEndpointContractTest`
  - id: no-signing-sunat-send-or-cdr
    statement: XML generation must not use Greenter See, signing, certificates, SUNAT network URLs, send APIs, or CDR processing.
    proof: `! grep -R -E 'Greenter\\See|getXmlSigned|setCertificate|sendXml|sendBill|->send\(|sunat\.gob|beta\.sunat|ds:Signature|Cdr|cdr' services/greenter-adapter/src/Xml/EmitDocumentXmlGenerator.php services/greenter-adapter/tests/EmitDocumentXmlGeneratorTest.php`
  - id: root-npm-scripts-preserved
    statement: Root `package.json` scripts `frontend`, `services`, `db`, `dev`, and `typecheck` remain present.
    proof: `node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'`
```

## VERIFICATION

Test-first gate before implementation:

```bash
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentXmlGeneratorTest
```

Expected result before implementation:

```text
FAILURES!
The XML generator class Librefact\GreenterAdapter\Xml\EmitDocumentXmlGenerator must exist before this contract can pass.
```

Full checks after implementation:

```bash
composer validate --strict --working-dir services/greenter-adapter
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentXmlGeneratorTest
composer test --working-dir services/greenter-adapter
php -r 'require "services/greenter-adapter/vendor/autoload.php"; exit(class_exists("Librefact\\GreenterAdapter\\Xml\\EmitDocumentXmlGenerator") ? 0 : 1);'
! grep -R -E 'Greenter\\See|getXmlSigned|setCertificate|sendXml|sendBill|->send\(|sunat\.gob|beta\.sunat|ds:Signature|Cdr|cdr' services/greenter-adapter/src/Xml/EmitDocumentXmlGenerator.php services/greenter-adapter/tests/EmitDocumentXmlGeneratorTest.php
node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'
npm run typecheck
```

## ROLLBACK

This change is reversible.

Rollback steps:

```bash
rm -f A-SPECS/0006-generate-local-xml-with-greenter.md
rm -f services/greenter-adapter/tests/EmitDocumentXmlGeneratorTest.php
rm -f services/greenter-adapter/src/Xml/EmitDocumentXmlGenerator.php
rmdir services/greenter-adapter/src/Xml 2>/dev/null || true
```

No database rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0006-generate-local-xml-with-greenter.md
    - services/greenter-adapter/src/Xml/EmitDocumentXmlGenerator.php
    - services/greenter-adapter/tests/EmitDocumentXmlGeneratorTest.php
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
    - services/greenter-adapter/src/Mapping/EmitDocumentRequestMapper.php
    - services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php
    - database schema or migrations
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - Greenter adapter XML generator
    - Greenter adapter XML generator test
  indirect:
    - Later signing specs will consume the unsigned XML string
  must_not_affect:
    - Existing Systutor backend
    - Existing dashboard frontend
    - Existing PostgreSQL librefact DB script
    - Existing root npm scripts
    - A.SPEC 0002 endpoint contract
    - A.SPEC 0003 payload validation
    - A.SPEC 0004 DTO mapping
    - A.SPEC 0005 Greenter object mapping
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0001-greenter-adapter-in-repo.md
    - A-SPECS/0002-greenter-emit-endpoint-contract.md
    - A-SPECS/0003-validate-greenter-emit-payload.md
    - A-SPECS/0004-map-emit-payload-to-internal-dto.md
    - A-SPECS/0005-map-internal-dto-to-greenter-objects.md
  must_compose_with:
    - docs/architecture.md
  systemic_invariants:
    - Greenter-specific XML generation remains inside the Greenter adapter.
    - Librefact core remains tax-authority agnostic.
    - No SUNAT behavior is claimed by this A.SPEC.
    - XML generation is local and unsigned.
  composition_checks:
    - `test -f A-SPECS/0001-greenter-adapter-in-repo.md`
    - `test -f A-SPECS/0002-greenter-emit-endpoint-contract.md`
    - `test -f A-SPECS/0003-validate-greenter-emit-payload.md`
    - `test -f A-SPECS/0004-map-emit-payload-to-internal-dto.md`
    - `test -f A-SPECS/0005-map-internal-dto-to-greenter-objects.md`
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
    - services/greenter-adapter/src/Xml
    - services/greenter-adapter/tests
```

## Traceability

- Requirement: Librefact must generate local unsigned UBL XML from a valid Greenter invoice object before signing or SUNAT submission.
- owner: Lucas
- approver: Lucas
- Commit: `906f709203b9b226692781eab3ba3b6d26ebb109`
- TRACE: `VERDICT: GAP` for deployment only; `spec -> commit`, `commit -> code`, and `commit -> test` were backed by repo facts, with no failed checks.
- Deployment: local repository only; no runtime deployment in this A.SPEC.

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Invariants checked
- [x] Tests pass
- [x] Rollback documented
- [x] No prohibited paths changed
