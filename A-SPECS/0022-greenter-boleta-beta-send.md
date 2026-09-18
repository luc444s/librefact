# A.SPEC 0022 — Greenter boleta beta send

> `risk: medium` — expands the tax adapter boundary from factura-only to
> factura/boleta while intentionally freezing ERP core integration.

## WHY

Librefact already validates the factura SUNAT beta pipeline through
`greenter-adapter`. Sales can distinguish `FACTURA` and `BOLETA`, but the tax
adapter only accepted and emitted `invoice`/`tipoDoc = 01`.

Before wiring boletas into the ERP flow, the adapter needs a frozen, validated
contract that proves a boleta XML can be generated, signed, sent to SUNAT beta,
and accepted with CDR.

## WHAT

Freeze ERP core and implement boleta support only inside `services/greenter-adapter`:

- Accept `document.type = boleta` in the emit payload validator.
- Keep `document.type = invoice` for facturas.
- Validate series by document type:
  - `invoice` -> `F###`
  - `boleta` -> `B###`
- Validate customer by document type:
  - `invoice` -> RUC (`customer.document_type = 6`, 11 digits)
  - `boleta` -> DNI (`customer.document_type = 1`, 8 digits)
- Map Greenter `Invoice` `tipoDoc` by document type:
  - `invoice` -> `01`
  - `boleta` -> `03`
- Add local unit/contract tests for boleta payload, Greenter mapping, and XML.
- Add a gated real SUNAT beta boleta send test based on the existing factura
  real beta send test.

## SCOPE

- `services/greenter-adapter/src/Validation/EmitDocumentPayloadValidator.php`
- `services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php`
- `services/greenter-adapter/tests/EmitDocumentPayloadValidationTest.php`
- `services/greenter-adapter/tests/EmitDocumentGreenterMapperTest.php`
- `services/greenter-adapter/tests/EmitDocumentXmlGeneratorTest.php`
- `services/greenter-adapter/tests/SunatBetaRealSubmissionTest.php`
- `A-SPECS/0022-greenter-boleta-beta-send.md`
- `A-SPECS/TODO.md`

## OUT OF SCOPE

- ERP core changes.
- Sales/order integration with Greenter.
- Persisting XML/CDR/hash in ERP tables.
- Boleta anónima / cliente varios.
- Resumen diario de boletas.
- Notas de crédito/débito de boleta.
- Anulación/baja.
- PDF/representación impresa.
- Secrets or `.env` edits.

## CONTRACT

Preconditions:

- Greenter adapter receives an emit payload at its boundary.
- Factura payloads continue using `document.type = invoice`.
- Boleta payloads use `document.type = boleta`, `B###` series, and an identified
  DNI customer.
- Real SUNAT beta test is gated by environment variables.

Postconditions:

- Factura mapping remains `tipoDoc = 01`.
- Boleta mapping emits a Greenter `Invoice` with `tipoDoc = 03`.
- Boleta XML remains UBL `<Invoice>` and contains `InvoiceTypeCode 03`.
- The real beta test can send a signed boleta using:
  - `LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1`
  - `LIBREFACT_SUNAT_BOLETA_SERIE` (default `B001`)
  - `LIBREFACT_SUNAT_BOLETA_CORRELATIVE`
  - optional boleta customer env vars.

## INVARIANTS

```yaml
invariants:
  - ERP core remains frozen for this A.SPEC
  - tax authority logic stays inside services/greenter-adapter
  - boleta uses Greenter Model Sale Invoice, same as factura, with tipoDoc 03
  - existing factura tests continue passing
  - real SUNAT beta tests remain gated and never run by default
  - no secrets are committed
```

## VERIFICATION

- `composer test`: PASS.
  - Result: `Tests: 25, Assertions: 210, Skipped: 2`.
- Gated real boleta beta test:

```bash
LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1 \
LIBREFACT_SUNAT_BOLETA_SERIE=B001 \
LIBREFACT_SUNAT_BOLETA_CORRELATIVE=$(date +%H%M%S) \
./vendor/bin/phpunit --verbose \
  --filter testRealSunatBetaBoletaSubmissionReturnsMeaningfulCdrOrError \
  tests/SunatBetaRealSubmissionTest.php
```

Result: PASS.

- Direct beta smoke result:

```text
BOLETA B001-75854
SUCCESS: yes
CDR_CODE: 0
CDR_DESC: La Boleta numero B001-75854, ha sido aceptada
```

## ROLLBACK

- Revert this adapter commit.
- Factura-only behavior returns by restoring validator `document.type = invoice`
  and mapper `tipoDoc = 01`.
- No ERP data rollback is required because this A.SPEC does not mutate ERP core.

## Change Surface

```yaml
change_surface:
  allowed:
    - services/greenter-adapter/src/Validation/EmitDocumentPayloadValidator.php
    - services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php
    - services/greenter-adapter/tests/EmitDocumentPayloadValidationTest.php
    - services/greenter-adapter/tests/EmitDocumentGreenterMapperTest.php
    - services/greenter-adapter/tests/EmitDocumentXmlGeneratorTest.php
    - services/greenter-adapter/tests/SunatBetaRealSubmissionTest.php
    - A-SPECS/0022-greenter-boleta-beta-send.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - plugins/**
    - apps/**
    - secrets
    - .env
```

## Traceability

- Requirement: User requested freezing ERP core and implementing real boleta
  SUNAT send in Greenter adapter based on the existing factura send.
- owner: agent
- approver: lucas
- Commit: `f151cd3bda4194c5780e9171696d8ccebfd440dd`.

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Independent falsable truth exists now
- [x] Invariants preserved
- [x] Verification passed
- [x] Rollback / compensation is honest
- [x] No unrelated changes staged
