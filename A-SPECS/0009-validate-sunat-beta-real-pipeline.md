# A.SPEC 0009 - Validate SUNAT beta real pipeline

> `risk: high` - Adds an explicitly gated integration test and manual smoke script that can send a real signed invoice XML to SUNAT beta. It must never run by default, must refuse production endpoints, must not print secrets, and must not commit certificate material.

## WHY

A.SPEC 0008 created the SUNAT submission boundary. The next proof is an end-to-end beta validation using real local secrets: load credentials, generate XML, sign with the local certificate, send to SUNAT beta, and inspect the CDR/error.

SUNAT beta is a testing environment. An accepted beta CDR proves technical compatibility but does not create a production tax document.

## WHAT

Add a gated integration test and a manual smoke script for the complete beta pipeline.

New independent falsable truth:

```text
Given explicit local secrets and LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1, Librefact can generate, sign, and submit a test invoice to SUNAT beta, then surface CDR or SUNAT error details without exposing secrets or allowing production by default.
```

## SCOPE

- Add a minimal `.env` loader for local scripts/tests.
- Add a PHPUnit integration test that is skipped unless `LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1`.
- The integration test must refuse any non-beta environment or endpoint.
- The integration test must validate required secrets before sending.
- The integration test must verify the PEM certificate exists and can sign XML.
- The integration test must build a minimal invoice payload using env RUC, series, correlativo, and current date.
- The integration test must run the pipeline:

```text
.env -> payload -> EmitDocumentRequestMapper -> EmitDocumentXmlGenerator -> EmitDocumentXmlSigner -> SunatInvoiceSender -> SUNAT beta -> CDR/error
```

- Add a manual script with the same safety checks for direct execution.
- The script may print non-secret facts: env, endpoint, masked RUC, filename, CDR code, CDR description, CDR notes, error code/message.

## OUT OF SCOPE

- No production sends.
- No automatic CI send.
- No secret printing.
- No certificate or `.env` commits.
- No persistence of CDR zip/XML.
- No database state changes.
- No endpoint/API changes.
- No automatic correlativo increment.
- No production readiness claim.

## CONTRACT

Preconditions for real send:

```text
PHP extension ext-soap installed/enabled
LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1
LIBREFACT_SUNAT_ENV=beta
LIBREFACT_SUNAT_ENDPOINT contains e-beta.sunat.gob.pe
LIBREFACT_SUNAT_RUC is set
LIBREFACT_SUNAT_SOL_USER is set
LIBREFACT_SUNAT_SOL_PASSWORD is set
LIBREFACT_SUNAT_CERTIFICATE_PEM_PATH points to a readable PEM
LIBREFACT_SUNAT_DOCUMENT_SERIE is set
LIBREFACT_SUNAT_DOCUMENT_CORRELATIVE is set and unique for beta
```

Postconditions:

- Without the allow flag, the integration test is skipped and does not call SUNAT.
- With the allow flag and valid beta secrets, the test calls only `e-beta.sunat.gob.pe`.
- The signed XML contains a `ds:Signature`.
- The sender returns either:
  - a successful result with CDR code/description, or
  - a SUNAT/transport error with code/message.
- The result is asserted to be technically meaningful, not silently empty.

## INVARIANTS

```yaml
invariants:
  - id: production-refused
    statement: Real integration code refuses non-beta env or non-beta endpoint.
    proof: test helper validates `LIBREFACT_SUNAT_ENV=beta` and endpoint host contains `e-beta.sunat.gob.pe`.
  - id: gated-real-send
    statement: Real SUNAT beta send is skipped unless `LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1`.
    proof: PHPUnit test calls `markTestSkipped()` before constructing the sender when flag is absent.
  - id: no-secret-output
    statement: Script masks RUC and never prints SOL password or certificate password.
    proof: manual inspection of `bin/send-sunat-beta.php` output fields.
  - id: normal-tests-no-network
    statement: Default `composer test` does not call SUNAT.
    proof: integration test skips by default.
```

## VERIFICATION

Default non-network verification:

```bash
composer test
composer validate --strict
```

Real beta verification, only after confirming `.env` values and unique correlativo:

```bash
set -a
source .env
set +a
LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1 \
  services/greenter-adapter/vendor/bin/phpunit \
  services/greenter-adapter/tests/SunatBetaRealSubmissionTest.php
```

Manual script:

```bash
LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1 \
  php services/greenter-adapter/bin/send-sunat-beta.php
```

## ROLLBACK

```bash
rm -f A-SPECS/0009-validate-sunat-beta-real-pipeline.md
rm -f services/greenter-adapter/bin/send-sunat-beta.php
rm -f services/greenter-adapter/src/Support/EnvFileLoader.php
rm -f services/greenter-adapter/tests/SunatBetaRealSubmissionTest.php
```

No database rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0009-validate-sunat-beta-real-pipeline.md
    - A-SPECS/TODO.md
    - services/greenter-adapter/bin/send-sunat-beta.php
    - services/greenter-adapter/src/Support/EnvFileLoader.php
    - services/greenter-adapter/tests/SunatBetaRealSubmissionTest.php
    - .env
  prohibited:
    - services/greenter-adapter/src/Domain/**
    - services/greenter-adapter/src/Mapping/**
    - services/greenter-adapter/src/Xml/**
    - services/greenter-adapter/src/Sunat/**
    - services/greenter-adapter/tests/fixtures/**
    - database schema or migrations
    - production endpoint defaults
```

## Traceability

- Requirement: Execute a real SUNAT beta validation test-first using local secrets, without accidental production or CI sends.
- owner: Lucas
- approver: Lucas

## Definition of Done

- [x] Spec created
- [x] Gated real integration test added
- [x] Manual smoke script added
- [x] Default tests pass without network
- [ ] Real beta test either returns accepted CDR or actionable SUNAT error
- [ ] No secrets printed or committed

Current blocker:

```text
PHP CLI is missing ext-soap, required by Greenter\Ws\Services\SoapClient.
Observed with `LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1 ./vendor/bin/phpunit tests/SunatBetaRealSubmissionTest.php`:
PHP extension ext-soap must be installed/enabled to call SUNAT beta via Greenter SoapClient.
```
