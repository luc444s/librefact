# A.SPEC 0003 — Validate Greenter emit payload

> `risk: normal` — Adds request validation to the existing local adapter endpoint. It must not call SUNAT, generate XML, mutate databases, or change the Librefact core.

## WHY

A.SPEC 0002 established the minimal `POST /documents/emit` contract, but the endpoint currently accepts any payload and returns `received`. Before mapping to Greenter objects or generating XML, the adapter must reject malformed requests deterministically.

This prevents the Python backend from accidentally sending incomplete or structurally invalid tax payloads into the Greenter boundary.

## WHAT

Define and enforce the minimal valid payload for `POST /documents/emit`.

New independent falsable truth:

```text
The Greenter adapter accepts the minimal valid PE/SUNAT/greenter invoice payload and rejects invalid payloads with HTTP 400 plus field-level errors, without contacting SUNAT.
```

Central planning question:

```text
What does a payload need to be valid in this A.SPEC?
```

Answer:

```text
A payload is valid when it has the required tax_authority, document, issuer, customer, items, and totals sections; targets PE/SUNAT/greenter; represents an invoice in PEN; has structurally valid issuer/customer RUC values; has at least one valid item; has positive totals; and item/totals arithmetic matches within 0.01 tolerance.
```

## SCOPE

- Add payload validation for `POST /documents/emit`.
- Preserve the valid fixture from A.SPEC 0002 as an accepted request.
- Add PHPUnit tests for accepted valid payload and rejected invalid payloads.
- Return deterministic `400 invalid_request` responses with field-level errors.
- Keep validation structural and local to the adapter.

## OUT OF SCOPE

- No SUNAT beta or production calls.
- No XML generation.
- No certificate handling.
- No CDR processing.
- No backend Python integration.
- No database migrations.
- No dashboard UI.
- No inventory, sales, stock, purchases, or cash module work.
- No validation against SUNAT online services.
- No validation of authorized series.
- No full UBL validation.
- No boletas, credit notes, debit notes, voiding, summaries, or status endpoints.

## CONTRACT

Preconditions:

- A.SPEC 0002 has committed `Librefact\GreenterAdapter\Http\EmitDocumentEndpoint`.
- `services/greenter-adapter/tests/fixtures/emit_invoice_minimal.json` exists and remains the canonical valid payload fixture.
- The endpoint still handles `POST /documents/emit` locally without network access.

Valid payload requirements:

### tax_authority

Required object:

```json
{
  "country": "PE",
  "code": "SUNAT",
  "provider": "greenter"
}
```

Rules:

- `tax_authority.country` is required and must equal `PE`.
- `tax_authority.code` is required and must equal `SUNAT`.
- `tax_authority.provider` is required and must equal `greenter`.

### document

Required object:

```json
{
  "type": "invoice",
  "serie": "F001",
  "number": 1,
  "currency": "PEN",
  "issue_date": "2026-09-14"
}
```

Rules:

- `document.type` is required and must equal `invoice`.
- `document.serie` is required and must be non-empty.
- `document.number` is required and must be greater than `0`.
- `document.currency` is required and must equal `PEN`.
- `document.issue_date` is required and must match `YYYY-MM-DD`.

### issuer

Required object:

```json
{
  "ruc": "20123456789",
  "legal_name": "LIBREFACT DEMO SAC"
}
```

Rules:

- `issuer.ruc` is required and must be exactly 11 digits.
- `issuer.legal_name` is required and must be non-empty.

### customer

Required object:

```json
{
  "document_type": "6",
  "document_number": "20601234567",
  "legal_name": "CLIENTE DEMO SAC"
}
```

Rules:

- `customer.document_type` is required and must equal `6` in this A.SPEC.
- `customer.document_number` is required and, when `document_type` is `6`, must be exactly 11 digits.
- `customer.legal_name` is required and must be non-empty.

### items

Required array with at least one item.

Each item requires:

```json
{
  "description": "Servicio demo",
  "quantity": 1,
  "unit_value": 100,
  "igv": 18,
  "total": 118
}
```

Rules:

- `items` is required and must be a non-empty array.
- `items[n].description` is required and must be non-empty.
- `items[n].quantity` is required and must be greater than `0`.
- `items[n].unit_value` is required and must be greater than or equal to `0`.
- `items[n].igv` is required and must be greater than or equal to `0`.
- `items[n].total` is required and must be greater than or equal to `0`.
- `items[n].unit_value * items[n].quantity + items[n].igv` must equal `items[n].total` within `0.01` tolerance.

### totals

Required object:

```json
{
  "taxable": 100,
  "igv": 18,
  "total": 118
}
```

Rules:

- `totals.taxable` is required and must be greater than or equal to `0`.
- `totals.igv` is required and must be greater than or equal to `0`.
- `totals.total` is required and must be greater than `0`.
- `totals.taxable + totals.igv` must equal `totals.total` within `0.01` tolerance.

Valid response:

```json
{
  "success": true,
  "status": "received",
  "provider": "PE_SUNAT_GREENTER",
  "document": {
    "type": "invoice",
    "serie": "F001",
    "number": 1
  },
  "xml": null,
  "cdr": null,
  "sunat_code": null,
  "sunat_description": null,
  "errors": []
}
```

Invalid response:

```json
{
  "success": false,
  "status": "invalid_request",
  "provider": "PE_SUNAT_GREENTER",
  "errors": [
    {
      "field": "issuer.ruc",
      "message": "issuer.ruc is required"
    }
  ]
}
```

Required initial invalid cases:

- Missing `tax_authority.country`.
- Unsupported `tax_authority.country`.
- Missing `document.type`.
- Unsupported `document.type`.
- Missing `issuer.ruc`.
- Invalid `issuer.ruc` length or non-digit value.
- Missing `customer.document_number`.
- Empty `items`.
- Missing `items[0].description`.
- Invalid item arithmetic.
- Missing `totals.total`.
- Invalid totals arithmetic.

## INVARIANTS

```yaml
invariants:
  - id: valid-contract-preserved
    statement: The A.SPEC 0002 minimal valid fixture still returns HTTP 202 `received`.
    proof: `composer test --working-dir services/greenter-adapter -- --filter EmitDocumentEndpointContractTest`
  - id: greenter-dependency-test-preserved
    statement: Existing Greenter dependency autoload test remains present and passing.
    proof: `composer test --working-dir services/greenter-adapter -- --filter GreenterDependencyTest`
  - id: no-sunat-runtime-call
    statement: Payload validation must not require SUNAT credentials, network access, certificate files, XML generation, or CDR processing.
    proof: `grep -R "sunat.gob\|beta.sunat\|sendXml\|setClaveSOL\|certificate" services/greenter-adapter/src services/greenter-adapter/tests || true`
  - id: root-npm-scripts-preserved
    statement: Root `package.json` scripts `frontend`, `services`, `db`, `dev`, and `typecheck` remain present.
    proof: `node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'`
```

## VERIFICATION

Test-first gate before implementation:

```bash
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentPayloadValidationTest
```

Expected result before implementation:

```text
FAILURES!
Invalid payloads are currently accepted as received.
```

Full checks after implementation:

```bash
composer validate --strict --working-dir services/greenter-adapter
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentPayloadValidationTest
composer test --working-dir services/greenter-adapter
php -r 'require "services/greenter-adapter/vendor/autoload.php"; exit(class_exists("Librefact\\GreenterAdapter\\Http\\EmitDocumentEndpoint") ? 0 : 1);'
node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'
npm run typecheck
```

## ROLLBACK

This change is reversible.

Rollback steps:

```bash
rm -f A-SPECS/0003-validate-greenter-emit-payload.md
rm -f services/greenter-adapter/tests/EmitDocumentPayloadValidationTest.php
rm -f services/greenter-adapter/src/Validation/EmitDocumentPayloadValidator.php
```

If endpoint code is modified in `services/greenter-adapter/src/Http/EmitDocumentEndpoint.php`, revert only the validation-specific changes for this A.SPEC.

No database rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0003-validate-greenter-emit-payload.md
    - services/greenter-adapter/src/Http/EmitDocumentEndpoint.php
    - services/greenter-adapter/src/Validation/**
    - services/greenter-adapter/tests/EmitDocumentPayloadValidationTest.php
  prohibited:
    - vendor/systutor-core/**
    - apps/web/**
    - scripts/systutor-db.sh
    - package.json
    - docs/architecture.md
    - services/greenter-adapter/composer.json
    - services/greenter-adapter/composer.lock
    - database schema or migrations
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - Greenter adapter emit endpoint validation behavior
    - Greenter adapter validation tests
  indirect:
    - Existing emit contract response for valid payloads
  must_not_affect:
    - Existing Systutor backend
    - Existing dashboard frontend
    - Existing PostgreSQL librefact DB script
    - Existing root npm scripts
    - A.SPEC 0001 Greenter dependency proof
    - A.SPEC 0002 valid payload success contract
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0001-greenter-adapter-in-repo.md
    - A-SPECS/0002-greenter-emit-endpoint-contract.md
  must_compose_with:
    - docs/architecture.md
  systemic_invariants:
    - Adapter validation remains behind the tax authority adapter boundary.
    - No SUNAT behavior is claimed by this A.SPEC.
  composition_checks:
    - `test -f A-SPECS/0001-greenter-adapter-in-repo.md`
    - `test -f A-SPECS/0002-greenter-emit-endpoint-contract.md`
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
    - services/greenter-adapter/src/Validation
    - services/greenter-adapter/tests
```

## Traceability

- Requirement: Librefact must reject structurally invalid Greenter emit payloads before any Greenter/SUNAT work.
- owner: Lucas
- approver: Lucas
- Commit: 147544d4c3896da6dc19077734c4329466169d90
- Deployment: local repository only; no runtime deployment in this A.SPEC.

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
