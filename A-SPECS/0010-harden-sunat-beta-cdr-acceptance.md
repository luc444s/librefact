# A.SPEC 0010 — Harden SUNAT beta CDR acceptance

> `risk: high` — Adjusts real SUNAT beta invoice semantics and XML details used by the Greenter adapter. The change is still beta-gated for network sends, but it touches tax-document mapping and therefore requires explicit human approval.

## WHY

A.SPEC 0009 proved the real SUNAT beta pipeline could execute, but the initial end-to-end send exposed sequential SUNAT rejections and CDR notes:

- `3030` — missing `cac:RegistrationAddress/cbc:AddressTypeCode`.
- `3278` — `LegalMonetaryTotal/cbc:LineExtensionAmount` was `0.00`.
- `3305` — missing total sale price (`TaxInclusiveAmount`).
- `3244` — missing transaction/payment information.
- CDR notes `4093`, `4094`, `4096`, `4097`, `4098` — empty issuer fiscal address fields.

The backend milestone is only credible if the adapter can produce a SUNAT beta accepted invoice with CDR code `0` and no address CDR notes when complete issuer address data is supplied.

## WHAT

Harden the minimal Greenter invoice mapping and beta smoke payload so a real SUNAT beta submission can be accepted cleanly.

New independent falsable truth:

```text
Given explicit beta secrets, a valid PEM, and complete issuer address environment variables, Librefact can generate, sign, and submit a minimal invoice to SUNAT beta that returns SUCCESS=yes and CDR_CODE=0 without issuer-address CDR notes.
```

## SCOPE

- Add an internal `Address` DTO for issuer fiscal address fields.
- Extend `Issuer` and `EmitDocumentRequestMapper` to accept `issuer.address`.
- Map issuer address to `Greenter\Model\Company\Address` for the invoice company.
- Set `FormaPagoContado` on the Greenter invoice.
- Set `valorVenta` and `subTotal` from existing totals.
- Normalize SUNAT UBL operation metadata by adding `CustomizationID schemeAgencyName="PE:SUNAT"` and `ProfileID` catalog 51 while preserving `InvoiceTypeCode listID="0101"`.
- Extend the real beta test and smoke script payloads to accept complete issuer address fields via `LIBREFACT_SUNAT_ISSUER_*` environment variables.
- Add local assertions for address code, payment terms, totals, and XML operation metadata.
- Record the real RUC lookup and beta-clean address used for the smoke test.
- Update `A-SPECS/TODO.md` and A.SPEC 0009 status to reflect the backend milestone result.

## OUT OF SCOPE

- No production SUNAT sends.
- No automatic CI network send.
- No committed secrets, certificates, `.env`, CDR zip, or signed XML artifacts.
- No database persistence.
- No automatic RUC lookup implementation.
- No endpoint/API contract changes for the main product.
- No automatic correlativo increment.
- No credit/cuotas support; this milestone uses cash payment (`Contado`).

## CONTRACT

Preconditions for clean real beta verification:

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
LIBREFACT_SUNAT_DOCUMENT_CORRELATIVE is set and valid for beta
LIBREFACT_SUNAT_ISSUER_COD_LOCAL is set or defaults to 0000
Complete issuer address env vars are supplied when a CDR without address notes is required
```

Postconditions:

- Default `composer test` does not call SUNAT and still passes.
- The generated XML contains `AddressTypeCode`, `FormaPago/Contado`, non-zero monetary totals, `ProfileID=0101`, and preserves `InvoiceTypeCode listID="0101"`.
- The beta smoke script still refuses non-beta sends and still masks RUC.
- With complete issuer address data, the real SUNAT beta smoke returns `SUCCESS: yes` and `CDR_CODE: 0`.

## INVARIANTS

```yaml
invariants:
  - id: beta-only-real-send
    statement: Real network sends remain gated and beta-only.
    proof: send-sunat-beta.php still requires LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1, LIBREFACT_SUNAT_ENV=beta, and an endpoint containing e-beta.sunat.gob.pe.
  - id: default-tests-no-network
    statement: Default adapter tests do not call SUNAT.
    proof: SunatBetaRealSubmissionTest skips without LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1; composer test passes with one skipped test.
  - id: no-secret-output
    statement: Smoke output does not print SOL password or certificate material.
    proof: send-sunat-beta.php prints env, endpoint, masked RUC, document name, CDR/error fields only.
  - id: greenter-boundary-contained
    statement: SUNAT/Greenter mapping remains inside services/greenter-adapter and does not enter Librefact core.
    proof: changed source files are under services/greenter-adapter plus A-SPECS/docs.
```

## VERIFICATION

Default non-network verification:

```bash
composer test
```

Observed result from `services/greenter-adapter`:

```text
OK, but incomplete, skipped, or risky tests!
Tests: 21, Assertions: 197, Skipped: 1.
```

Real beta smoke verification executed with complete issuer address env vars:

```bash
LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1 \
LIBREFACT_SUNAT_ISSUER_LEGAL_NAME="ARMAS QUEZADA TITO MILTON" \
LIBREFACT_SUNAT_ISSUER_COD_LOCAL=0000 \
LIBREFACT_SUNAT_ISSUER_UBIGEO=130100 \
LIBREFACT_SUNAT_ISSUER_DEPARTAMENTO="LA LIBERTAD" \
LIBREFACT_SUNAT_ISSUER_PROVINCIA="TRUJILLO" \
LIBREFACT_SUNAT_ISSUER_DISTRITO="TRUJILLO" \
LIBREFACT_SUNAT_ISSUER_DIRECCION="TRUJILLO" \
php bin/send-sunat-beta.php
```

Observed result:

```text
SUCCESS: yes
CDR_CODE: 0
CDR_DESCRIPTION: La Factura numero F001-1, ha sido aceptada
```

## ROLLBACK

Revert the integration commit for this A.SPEC.

Compensation if beta data was sent with wrong issuer address:

- Do not reuse the beta correlativo for further evidence.
- Correct local issuer address env vars or payload source.
- Re-run beta smoke with a new correlativo if uniqueness is required by SUNAT beta behavior.

No database rollback is required because this change does not persist CDR/XML state.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0010-harden-sunat-beta-cdr-acceptance.md
    - A-SPECS/0009-validate-sunat-beta-real-pipeline.md
    - A-SPECS/TODO.md
    - docs/sunat-ruc-10180103126.md
    - services/greenter-adapter/bin/send-sunat-beta.php
    - services/greenter-adapter/src/Domain/Address.php
    - services/greenter-adapter/src/Domain/Issuer.php
    - services/greenter-adapter/src/Mapping/EmitDocumentRequestMapper.php
    - services/greenter-adapter/src/Mapping/EmitDocumentGreenterMapper.php
    - services/greenter-adapter/src/Xml/EmitDocumentXmlGenerator.php
    - services/greenter-adapter/tests/EmitDocumentRequestMapperTest.php
    - services/greenter-adapter/tests/EmitDocumentGreenterMapperTest.php
    - services/greenter-adapter/tests/EmitDocumentXmlGeneratorTest.php
    - services/greenter-adapter/tests/SunatBetaRealSubmissionTest.php
    - services/greenter-adapter/tests/fixtures/emit_invoice_minimal.json
  prohibited:
    - .env
    - .env.*
    - secrets/**
    - services/greenter-adapter/src/Sunat/SunatInvoiceSender.php
    - services/greenter-adapter/src/Sunat/SunatSubmissionCredentials.php
    - database schema or migrations
    - production endpoint defaults
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - Greenter adapter invoice mapping
    - local XML generation
    - gated SUNAT beta smoke payload
  indirect:
    - future emit endpoint behavior when issuer.address is supplied
  must_not_affect:
    - production sends
    - secret handling
    - default test behavior
    - core Librefact domain outside services/greenter-adapter
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A.SPEC 0004
    - A.SPEC 0005
    - A.SPEC 0006
    - A.SPEC 0007
    - A.SPEC 0008
    - A.SPEC 0009
  must_compose_with:
    - Internal payload mapping
    - Greenter invoice mapping
    - local XML generation
    - XML signing
    - beta sender boundary
  systemic_invariants:
    - beta-only-real-send
    - no-secret-output
    - default-tests-no-network
  composition_checks:
    - composer test
    - gated beta smoke returns CDR_CODE 0 with complete issuer address
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
    - services/greenter-adapter/src/Xml
```

## Traceability

- Requirement: Complete the backend SUNAT beta test milestone with an accepted clean CDR.
- owner: Lucas
- approver: Lucas
- Commit: 18307c615a4b1d77e9eed62be3b69e74c455b0ad
- Deployment: local SUNAT beta smoke only

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
