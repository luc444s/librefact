# A.SPEC 0008 - Define SUNAT beta send boundary

> `risk: normal` - Adds the adapter boundary that can submit a signed invoice XML through Greenter's SUNAT bill sender. It must not hardcode SOL credentials, commit certificate material, mutate persistence, or claim a real beta transaction without external credentials.

## WHY

A.SPEC 0007 proved Librefact can produce signed invoice XML locally. The next independently testable step is a SUNAT submission boundary that accepts that signed XML plus explicit company credentials and maps Greenter's CDR/error result into a Librefact technical result.

The private Systutor repo uses SFS/Clave SOL flat-file export and local status marking, not an in-app SOAP send. Librefact should keep the direct Greenter/SUNAT path explicit and separated from that legacy flow.

## WHAT

Create a SUNAT invoice sender boundary that can use `Greenter\Ws\Services\BillSender` for real beta sends while remaining unit-testable with an injected `Greenter\Services\SenderInterface`.

New independent falsable truth:

```text
The Greenter adapter can submit a signed invoice XML through a SUNAT sender boundary, using explicit RUC/SOL credentials and mapping the CDR technical response, without hardcoded credentials, committed certificates, persistence, or endpoint behavior changes.
```

## SCOPE

- Add `Librefact\GreenterAdapter\Sunat\SunatSubmissionCredentials`.
- Add `Librefact\GreenterAdapter\Sunat\SunatInvoiceSender`.
- Add `Librefact\GreenterAdapter\Sunat\SunatInvoiceSubmissionResult`.
- Default the service endpoint to `Greenter\Ws\Services\SunatEndpoints::FE_BETA`.
- Compose the SOAP username as `{ruc}{solUser}`.
- Use `SoapClient::setCredentials()` and `SoapClient::setService()` only inside the real sender path.
- Use `BillSender::send($filename, $signedXml)` for real submission.
- Map `BillResult` success, CDR code, CDR description, CDR notes, CDR zip, and error details.
- Test with a fake `SenderInterface` so CI does not need network, SOL credentials, or certificate files.

## OUT OF SCOPE

- No real SUNAT beta execution in automated tests.
- No real certificate files committed.
- No SOL credentials committed.
- No endpoint contract change.
- No database persistence or migrations.
- No CDR storage policy.
- No retry, ticket polling, voiding, summaries, boletas, credit notes, or debit notes.
- No SFS flat-file export implementation.

## CONTRACT

Preconditions:

- A.SPEC 0007 has produced signed invoice XML in memory.
- Composer autoload can load Greenter WS classes.

Postconditions:

- `SunatSubmissionCredentials('20000000001', 'MODDATOS', 'moddatos')->soapUser()` returns `20000000001MODDATOS`.
- `SunatSubmissionCredentials` defaults to `SunatEndpoints::FE_BETA`.
- `SunatInvoiceSender::sendSignedInvoice($filename, $signedXml, $credentials)` passes filename and signed XML to the configured sender.
- A successful `BillResult` with CDR maps to a `SunatInvoiceSubmissionResult` with:

```text
success = true
cdrCode = 0
cdrDescription = SUNAT CDR description
cdrNotes = SUNAT CDR notes
cdrZip = raw CDR zip content
errorCode = null
errorMessage = null
```

## INVARIANTS

```yaml
invariants:
  - id: no-hardcoded-sol-secrets
    statement: Production code must not hardcode SOL credentials or certificate material.
    proof: inspect `services/greenter-adapter/src/Sunat` for credential literals beyond method names and constants.
  - id: no-network-in-tests
    statement: Automated tests must not call SUNAT beta.
    proof: `SunatInvoiceSenderTest` injects `SenderInterface` fake.
  - id: previous-adapter-contracts-preserved
    statement: Existing Greenter adapter tests continue passing.
    proof: `composer test` in `services/greenter-adapter`.
```

## VERIFICATION

```bash
composer test
```

Expected result after implementation:

```text
OK
```

## ROLLBACK

This change is reversible.

Rollback steps:

```bash
rm -rf services/greenter-adapter/src/Sunat
rm -f services/greenter-adapter/tests/SunatInvoiceSenderTest.php
rm -f A-SPECS/0008-send-invoice-to-sunat-beta.md
```

No database rollback is required.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0008-send-invoice-to-sunat-beta.md
    - A-SPECS/TODO.md
    - services/greenter-adapter/src/Sunat/**
    - services/greenter-adapter/tests/SunatInvoiceSenderTest.php
  prohibited:
    - vendor/systutor-core/**
    - apps/web/**
    - services/greenter-adapter/src/Http/**
    - services/greenter-adapter/src/Validation/**
    - services/greenter-adapter/src/Domain/**
    - services/greenter-adapter/src/Mapping/**
    - services/greenter-adapter/src/Xml/**
    - database schema or migrations
```

## Traceability

- Requirement: Librefact needs a real Greenter/SUNAT submission boundary after XML signing, but without committing credentials or depending on SUNAT in CI.
- owner: Lucas
- approver: Lucas

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Tests pass
- [x] No SUNAT beta network call in automated tests
- [x] No credentials or certificate material committed
