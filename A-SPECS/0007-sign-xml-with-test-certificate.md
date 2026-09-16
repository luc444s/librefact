# A.SPEC 0007 - Sign XML with test certificate

> `risk: normal` - Adds local XML signing with a test certificate. It must not call SUNAT, configure SOL credentials, send documents, process CDR, persist real certificates, mutate databases, or change Librefact core.

## WHY

A.SPEC 0006 proved that the adapter can generate a local unsigned UBL XML string from the canonical valid invoice. Before sending anything to SUNAT, Librefact must prove that the generated XML can be signed locally with a test certificate and verified as a valid XML Digital Signature.

This keeps signing inside the PHP Greenter adapter and separates cryptographic signing from SUNAT submission.

## WHAT

Create a local XML signer that accepts unsigned XML plus a PEM test certificate string and returns signed XML.

New independent falsable truth:

```text
The Greenter adapter can sign the locally generated invoice XML with a test certificate, producing parseable XML with a verifiable `ds:Signature`, without SUNAT calls, SOL credentials, CDR processing, or document submission.
```

## SCOPE

- Add a test-first XML signer test using the canonical valid fixture through the A.SPEC 0004, 0005, and 0006 path.
- Create `Librefact\GreenterAdapter\Xml\EmitDocumentXmlSigner`.
- Use `Greenter\XMLSecLibs\Sunat\SignedXml` directly for local signing.
- Accept certificate material as an in-memory PEM string.
- Generate or assemble the test certificate only inside the test.
- Return signed XML as a string in memory.
- Prove the signed XML is parseable by `DOMDocument`.
- Prove the signed XML contains XMLDSig nodes.
- Prove the signed XML verifies with `SignedXml::verifyXml()`.
- Preserve canonical invoice facts from the unsigned XML.

Required signing pipeline:

```text
emit_invoice_minimal.json
-> EmitDocumentRequestMapper::fromPayload()
-> EmitDocumentXmlGenerator::generate()
-> EmitDocumentXmlSigner::sign($unsignedXml, $certificatePem)
-> signed XML string
-> Greenter\XMLSecLibs\Sunat\SignedXml::verifyXml()
```

## OUT OF SCOPE

- No SUNAT beta or production calls.
- No `Greenter\See` usage.
- No `send()`, `sendXml()`, or `sendBill()` calls.
- No `setCredentials()` or `setClaveSOL()` calls.
- No CDR processing.
- No certificate files committed to the repository.
- No real certificates, secrets, passwords, or credentials.
- No XML persistence to disk or temporary files in production code.
- No endpoint behavior change required.
- No response contract changes.
- No backend Python integration.
- No database migrations.
- No dashboard UI.
- No new payload fields.
- No boletas, credit notes, debit notes, voiding, summaries, or status endpoints.

## CONTRACT

Preconditions:

- A.SPEC 0004 has committed internal adapter DTOs and `EmitDocumentRequestMapper`.
- A.SPEC 0005 has committed `EmitDocumentGreenterMapper`.
- A.SPEC 0006 has committed `EmitDocumentXmlGenerator`.
- `services/greenter-adapter/tests/fixtures/emit_invoice_minimal.json` remains the canonical valid fixture.
- Composer autoload can load `Greenter\XMLSecLibs\Sunat\SignedXml` from `greenter/xmldsig`.

Postconditions:

- `EmitDocumentXmlSigner::sign(string $unsignedXml, string $certificatePem): string` exists.
- The signer returns a non-empty string.
- The returned string is parseable XML.
- The returned XML still has root element `Invoice`.
- The returned XML contains these XMLDSig facts:

```text
contains <ds:Signature
contains <ds:SignedInfo
contains <ds:SignatureValue
contains <ds:X509Certificate
SignedXml::verifyXml($signedXml) returns true
```

- The returned XML preserves these invoice facts:

```text
cbc:ID = F001-1
cbc:IssueDate = 2026-09-14
issuer ruc = 20123456789
issuer legal name = LIBREFACT DEMO SAC
customer document number = 20601234567
customer legal name = CLIENTE DEMO SAC
item description = Servicio demo
```

The signer is allowed to throw if the unsigned XML or certificate PEM is invalid. Invalid certificate UX/errors are not part of this A.SPEC.

## INVARIANTS

```yaml
invariants:
  - id: local-xml-generation-preserved
    statement: A.SPEC 0006 XML generator test continues passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentXmlGeneratorTest`
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
  - id: no-sunat-send-see-credentials-or-cdr
    statement: XML signing must not use Greenter See, SUNAT network URLs, send APIs, SOL credentials, or CDR processing.
    proof: `! grep -R -E 'Greenter\\See|sendXml|sendBill|->send\(|setCredentials|setClaveSOL|sunat\.gob|beta\.sunat|Cdr|cdr' services/greenter-adapter/src/Xml/EmitDocumentXmlSigner.php services/greenter-adapter/tests/EmitDocumentXmlSignerTest.php`
  - id: no-committed-certificate-fixtures
    statement: No PEM/PFX/P12/CRT/KEY certificate fixture is committed for this A.SPEC.
    proof: `! find services/greenter-adapter -type f \( -name '*.pem' -o -name '*.pfx' -o -name '*.p12' -o -name '*.crt' -o -name '*.key' \)`
  - id: root-npm-scripts-preserved
    statement: Root `package.json` scripts `frontend`, `services`, `db`, `dev`, and `typecheck` remain present.
    proof: `node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'`
```

## VERIFICATION

Test-first gate before implementation:

```bash
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentXmlSignerTest
```

Expected result before implementation:

```text
FAILURES!
The XML signer class Librefact\GreenterAdapter\Xml\EmitDocumentXmlSigner must exist before this contract can pass.
```

Full checks after implementation:

```bash
composer validate --strict --working-dir services/greenter-adapter
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentXmlSignerTest
composer test --working-dir services/greenter-adapter
php -r 'require "services/greenter-adapter/vendor/autoload.php"; exit(class_exists("Librefact\\GreenterAdapter\\Xml\\EmitDocumentXmlSigner") ? 0 : 1);'
! grep -R -E 'Greenter\\See|sendXml|sendBill|->send\(|setCredentials|setClaveSOL|sunat\.gob|beta\.sunat|Cdr|cdr' services/greenter-adapter/src/Xml/EmitDocumentXmlSigner.php services/greenter-adapter/tests/EmitDocumentXmlSignerTest.php
! find services/greenter-adapter -type f \( -name '*.pem' -o -name '*.pfx' -o -name '*.p12' -o -name '*.crt' -o -name '*.key' \)
node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'
npm run typecheck
```

## ROLLBACK

This change is reversible.

Rollback steps:

```bash
rm -f A-SPECS/0007-sign-xml-with-test-certificate.md
rm -f services/greenter-adapter/tests/EmitDocumentXmlSignerTest.php
rm -f services/greenter-adapter/src/Xml/EmitDocumentXmlSigner.php
```

No database rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0007-sign-xml-with-test-certificate.md
    - services/greenter-adapter/src/Xml/EmitDocumentXmlSigner.php
    - services/greenter-adapter/tests/EmitDocumentXmlSignerTest.php
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
    - services/greenter-adapter/src/Mapping/**
    - services/greenter-adapter/src/Xml/EmitDocumentXmlGenerator.php
    - services/greenter-adapter/tests/fixtures/**
    - database schema or migrations
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - Greenter adapter XML signer
    - Greenter adapter XML signer test
  indirect:
    - Later SUNAT submission specs will consume signed XML
  must_not_affect:
    - Existing Systutor backend
    - Existing dashboard frontend
    - Existing PostgreSQL librefact DB script
    - Existing root npm scripts
    - A.SPEC 0002 endpoint contract
    - A.SPEC 0003 payload validation
    - A.SPEC 0004 DTO mapping
    - A.SPEC 0005 Greenter object mapping
    - A.SPEC 0006 XML generation
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
    - A-SPECS/0006-generate-local-xml-with-greenter.md
  must_compose_with:
    - docs/architecture.md
  systemic_invariants:
    - Greenter-specific XML signing remains inside the Greenter adapter.
    - Librefact core remains tax-authority agnostic.
    - No SUNAT submission behavior is claimed by this A.SPEC.
    - Test certificate material is generated or assembled only in tests and is not committed as a secret fixture.
  composition_checks:
    - `test -f A-SPECS/0001-greenter-adapter-in-repo.md`
    - `test -f A-SPECS/0002-greenter-emit-endpoint-contract.md`
    - `test -f A-SPECS/0003-validate-greenter-emit-payload.md`
    - `test -f A-SPECS/0004-map-emit-payload-to-internal-dto.md`
    - `test -f A-SPECS/0005-map-internal-dto-to-greenter-objects.md`
    - `test -f A-SPECS/0006-generate-local-xml-with-greenter.md`
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

- Requirement: Librefact must sign locally generated UBL XML with test certificate material before any SUNAT submission work.
- owner: Lucas
- approver: Lucas
- Commit: `b5dee373c8d8f871d644b41aba4685581b401281`
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
