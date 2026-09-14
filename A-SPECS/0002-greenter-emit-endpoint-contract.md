# A.SPEC 0002 — Define Greenter emit endpoint contract

> `risk: normal` — Adds the first adapter contract test and later a minimal local endpoint boundary. It must not call SUNAT, generate XML, mutate databases, or change the Librefact core.

## WHY

Librefact needs a stable boundary between the Python backend and the PHP Greenter adapter. Before implementing SUNAT emission or XML generation, the project must define the smallest endpoint contract and prove it with a test-first flow.

This protects the architecture rule:

```text
Tax authority adapters, no tax authority in core.
```

## WHAT

Define the minimal adapter endpoint contract for receiving an electronic document emission request:

```text
POST /documents/emit
```

The first step of this A.SPEC is test-first only:

- Create the contract fixture.
- Create the PHPUnit contract test.
- Run the test before implementation.
- Confirm the failure is the expected missing endpoint class, not a malformed test.

New independent falsable truth when the full A.SPEC closes:

```text
The Greenter adapter exposes a local, testable `POST /documents/emit` contract that accepts a minimal invoice payload and returns a deterministic adapter-level received response without contacting SUNAT.
```

## SCOPE

- Add a minimal request fixture for an invoice emission payload.
- Add a PHPUnit contract test for `POST /documents/emit`.
- The test must assert the endpoint class exists before trying to call it.
- The test must expect an adapter-level response, not a SUNAT response.
- Later implementation in this same A.SPEC may add minimal adapter code under `services/greenter-adapter/src`.
- Later implementation may add Composer autoload for `Librefact\GreenterAdapter\`.

## OUT OF SCOPE

- No SUNAT beta or production calls.
- No XML generation.
- No certificate handling.
- No CDR processing.
- No backend Python integration.
- No database migrations.
- No dashboard UI.
- No inventory, sales, stock, purchases, or cash module work.
- No additional endpoints such as status, void, credit note, debit note, summaries, or certificate management.

## CONTRACT

Preconditions:

- A.SPEC 0001 has made `services/greenter-adapter` a Composer project with PHPUnit.
- `composer install --working-dir services/greenter-adapter` has generated `vendor/autoload.php`.
- This A.SPEC starts by writing the test before endpoint implementation.

Request contract:

```http
POST /documents/emit
Content-Type: application/json
```

Minimal request body:

```json
{
  "tax_authority": {
    "country": "PE",
    "code": "SUNAT",
    "provider": "greenter"
  },
  "document": {
    "type": "invoice",
    "serie": "F001",
    "number": 1,
    "currency": "PEN",
    "issue_date": "2026-09-14"
  },
  "issuer": {
    "ruc": "20123456789",
    "legal_name": "LIBREFACT DEMO SAC"
  },
  "customer": {
    "document_type": "6",
    "document_number": "20601234567",
    "legal_name": "CLIENTE DEMO SAC"
  },
  "items": [
    {
      "description": "Servicio demo",
      "quantity": 1,
      "unit_value": 100,
      "igv": 18,
      "total": 118
    }
  ],
  "totals": {
    "taxable": 100,
    "igv": 18,
    "total": 118
  }
}
```

Minimal response body:

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

Postconditions for the first test-first step:

- `services/greenter-adapter/tests/fixtures/emit_invoice_minimal.json` exists.
- `services/greenter-adapter/tests/EmitDocumentEndpointContractTest.php` exists.
- Running that test before implementation fails only because `Librefact\GreenterAdapter\Http\EmitDocumentEndpoint` does not exist yet.

Postconditions for the full A.SPEC later:

- The same test passes without changing the contract assertions.
- The endpoint response is deterministic and does not contact SUNAT.

## INVARIANTS

```yaml
invariants:
  - id: greenter-dependency-test-preserved
    statement: Existing Greenter dependency autoload test remains present and passing when running the adapter test suite after implementation.
    proof: `composer test --working-dir services/greenter-adapter`
  - id: no-sunat-runtime-call
    statement: This endpoint contract must not require SUNAT credentials, network access, certificate files, XML generation, or CDR processing.
    proof: `grep -R "sunat.gob\|beta.sunat\|sendXml\|setClaveSOL\|certificate" services/greenter-adapter/src services/greenter-adapter/tests || true`
  - id: root-npm-scripts-preserved
    statement: Root `package.json` scripts `frontend`, `services`, `db`, `dev`, and `typecheck` remain present.
    proof: `node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'`
```

## VERIFICATION

Test-first gate before implementation:

```bash
composer test --working-dir services/greenter-adapter -- --filter EmitDocumentEndpointContractTest
```

Expected result before implementation:

```text
FAILURES!
The endpoint class Librefact\GreenterAdapter\Http\EmitDocumentEndpoint must exist before this contract can pass.
```

Full checks after implementation:

```bash
composer validate --strict --working-dir services/greenter-adapter
composer test --working-dir services/greenter-adapter
php -r 'require "services/greenter-adapter/vendor/autoload.php"; exit(class_exists("Librefact\\GreenterAdapter\\Http\\EmitDocumentEndpoint") ? 0 : 1);'
node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'
npm run typecheck
```

## ROLLBACK

This change is reversible.

Rollback steps for the test-first step:

```bash
rm -f services/greenter-adapter/tests/EmitDocumentEndpointContractTest.php
rm -f services/greenter-adapter/tests/fixtures/emit_invoice_minimal.json
rm -f A-SPECS/0002-greenter-emit-endpoint-contract.md
```

No database rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0002-greenter-emit-endpoint-contract.md
    - services/greenter-adapter/composer.json
    - services/greenter-adapter/src/**
    - services/greenter-adapter/tests/**
  prohibited:
    - vendor/systutor-core/**
    - apps/web/**
    - scripts/systutor-db.sh
    - package.json
    - docs/architecture.md
    - services/greenter-adapter/composer.lock
    - database schema or migrations
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - Greenter adapter PHP contract tests
    - Future minimal adapter endpoint code
  indirect:
    - Composer autoload may be updated in `services/greenter-adapter/composer.json`
  must_not_affect:
    - Existing Systutor backend
    - Existing dashboard frontend
    - Existing PostgreSQL librefact DB script
    - Existing root npm scripts
    - A.SPEC 0001 Greenter dependency proof
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0001-greenter-adapter-in-repo.md
  must_compose_with:
    - docs/architecture.md
  systemic_invariants:
    - Adapter endpoint remains behind the tax authority adapter boundary.
    - No SUNAT behavior is claimed by this A.SPEC.
  composition_checks:
    - `test -f A-SPECS/0001-greenter-adapter-in-repo.md`
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
    - services/greenter-adapter/src/Http
    - services/greenter-adapter/tests
```

## Traceability

- Requirement: Librefact must define the first minimal Greenter adapter endpoint contract test-first.
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
