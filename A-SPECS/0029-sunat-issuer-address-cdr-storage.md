# A.SPEC 0029 - SUNAT issuer address, CDR parsing, and local ZIP storage

> `risk: high` - touches real SUNAT emission metadata, CDR persistence, and the
> acceptance/observation model used by invoicing.

## WHY

LibreFact can already emit a factura to SUNAT beta and receive an accepted CDR.
For `F001-3`, SUNAT returned:

```xml
<cbc:ResponseCode>0</cbc:ResponseCode>
<cbc:Description>La Factura numero F001-3, ha sido aceptada</cbc:Description>
```

That means the invoice is accepted. However, SUNAT also returned CDR notes about
the issuer fiscal address:

- `4093` - invalid/missing `RegistrationAddress/cbc:ID` ubigeo.
- `4096` - empty/malformed `CityName` provincia.
- `4097` - empty/malformed `CountrySubentity` departamento.
- `4098` - empty/malformed `District` distrito.

These notes are observations, not rejection. LibreFact must represent that
correctly and improve XML quality by sending a complete issuer fiscal address.

The CDR ZIP must also be preserved locally. The current CLI path originally
discarded `cdr_zip_base64`, which prevented persisting the official CDR artifact.

## WHAT

Implement a complete issuer fiscal address contract for SUNAT emission and store
the CDR ZIP locally inside the project.

Required behavior:

- The issuer address is represented with separated SUNAT fields:
  - `ubigeo` - 6-digit ubigeo, e.g. `130101`.
  - `cod_local` - SUNAT establishment code, default `0000`.
  - `direccion` - fiscal street/address text.
  - `departamento` - e.g. `La Libertad`.
  - `provincia` - e.g. `Trujillo`.
  - `distrito` - e.g. `Trujillo`.
  - `pais` / `codigo_pais` - `PE`.
- `ubigeo` must not be confused with department code (`13`) or `cod_local`.
- The SUNAT mapper sends the complete issuer fiscal address to the adapter.
- The adapter returns CDR ZIP as valid base64.
- The ERP stores the CDR ZIP as a local file under `storage/sunat/cdr/`.
- The ERP stores CDR metadata in DB: local path, hash, size, response code,
  description, and observations.
- The CDR parser distinguishes acceptance from observations:
  - `ResponseCode = 0` means accepted.
  - `cbc:Note` entries are observations.
  - Observations must not change the emission status to rejected/error.

## SCOPE

### Configuration / issuer source

- `.env` variables for issuer address:

```env
LIBREFACT_SUNAT_ISSUER_LEGAL_NAME=ARMAS QUEZADA TITO MILTON
LIBREFACT_SUNAT_ISSUER_COMMERCIAL_NAME=TUTORA BUSINESS
LIBREFACT_SUNAT_ISSUER_UBIGEO=130101
LIBREFACT_SUNAT_ISSUER_COD_LOCAL=0000
LIBREFACT_SUNAT_ISSUER_DIRECCION=...
LIBREFACT_SUNAT_ISSUER_DEPARTAMENTO=La Libertad
LIBREFACT_SUNAT_ISSUER_PROVINCIA=Trujillo
LIBREFACT_SUNAT_ISSUER_DISTRITO=Trujillo
LIBREFACT_SUNAT_ISSUER_PAIS=PE
```

### ERP backend

- `plugins/ventas/facturacion/backend/services/sales_mapper.py`
  - Build `issuer.address` from the separated env vars.
  - Keep `cod_local=0000` fallback.
  - Do not use `"Sin direccion"` when structured vars exist.
- `plugins/ventas/facturacion/backend/services/emissions.py`
  - Decode `cdr_zip_base64`.
  - Store ZIP under local storage.
  - Persist local path and metadata.
  - Parse CDR XML and persist response/observations.
- `plugins/ventas/facturacion/backend/models.py`
  - Add local artifact/parsed CDR metadata fields.
- `plugins/ventas/migrations/*.py`
  - Add CDR local path/hash/size/response fields.

### Adapter

- `services/greenter-adapter/src/Http/EmitDocumentEndpoint.php`
  - Return `cdr_zip_base64` as actual base64 string.
- `services/greenter-adapter/bin/emit-inline.php`
  - Preserve `cdr_zip_base64` in CLI JSON output.
- Adapter mapping keeps issuer address fields compatible with Greenter.

### Tests

- Mapper test for issuer address payload.
- CDR parser unit test with `ResponseCode=0` and `cbc:Note` observations.
- Python integration test from `adapter_client.emit_document()` to SUNAT beta
  that asserts `cdr_zip_base64` is received.
- Storage test that writes ZIP to `storage/sunat/cdr/...` and validates the ZIP
  contains `R-*.xml`.

## OUT OF SCOPE

- Full UI for issuer/company fiscal settings.
- Automatic SUNAT RUC lookup.
- Automatic ubigeo inference from free-text addresses.
- Production SUNAT endpoint enablement.
- Replacing CRM address model.

## DATA MODEL

Add nullable fields to `fiscal_emissions`:

```sql
cdr_zip_path          TEXT,
cdr_zip_hash          VARCHAR(64),
cdr_zip_size          INTEGER,
cdr_response_code     VARCHAR(10),
cdr_description       TEXT,
cdr_observations_json TEXT,
cdr_saved_at          TIMESTAMP WITH TIME ZONE
```

`cdr_zip_base64` may remain during the transition, but local ZIP path is the
canonical storage for the CDR artifact.

## STORAGE CONTRACT

CDR ZIP path:

```text
storage/sunat/cdr/{issuer_ruc}/{sunat_doc_type}/{serie}-{number}/{issuer_ruc}-{sunat_doc_type}-{serie}-{number}.zip
```

Example:

```text
storage/sunat/cdr/10180103126/01/F001-3/10180103126-01-F001-3.zip
```

The path persisted in DB must be relative to project root.

## CDR PARSING CONTRACT

Given CDR XML:

```xml
<cbc:ResponseCode>0</cbc:ResponseCode>
<cbc:Description>La Factura numero F001-3, ha sido aceptada</cbc:Description>
<cbc:Note>4093 - ...</cbc:Note>
```

Persist parsed structure equivalent to:

```json
{
  "accepted": true,
  "response_code": "0",
  "description": "La Factura numero F001-3, ha sido aceptada",
  "reference_id": "F001-3",
  "observations": [
    {
      "code": "4093",
      "message": "El codigo de ubigeo del domicilio fiscal del emisor no es valido",
      "field": "RegistrationAddress/ID"
    }
  ]
}
```

Emission status rules:

- `response_code = 0` -> `ACCEPTED`.
- `observations.length > 0` -> accepted with observations, not rejected.
- Transport/adapter errors -> `ERROR`.
- SUNAT rejection response -> `REJECTED`.

## INVARIANTS

```yaml
invariants:
  - ResponseCode 0 is accepted even when cbc:Note observations exist
  - ubigeo is 6 digits and separate from cod_local
  - cod_local defaults to 0000 when missing
  - CDR ZIP file path is relative to project root
  - local storage is under storage/sunat/cdr, not services/greenter-adapter
  - NOTA_VENTA remains excluded from SUNAT emission
```

## VERIFICATION

Commands:

```bash
php -l services/greenter-adapter/src/Http/EmitDocumentEndpoint.php
php -l services/greenter-adapter/bin/emit-inline.php
PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile \
  plugins/ventas/facturacion/backend/services/sales_mapper.py \
  plugins/ventas/facturacion/backend/services/emissions.py
npm run typecheck
```

Real beta integration, explicitly gated:

```bash
LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1 \
PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" \
.venv/bin/python -m unittest -v \
plugins.ventas.facturacion.tests.test_adapter_client_sunat_beta.AdapterClientSunatBetaTest.test_python_adapter_client_sends_invoice_with_env_issuer_address_to_sunat_beta
```

Final acceptance check:

- SUNAT beta response has `status=accepted`.
- `cdr_zip_base64` is present.
- ZIP is written under `storage/sunat/cdr/...`.
- ZIP contains `R-*.xml`.
- Parsed `response_code=0`.
- Observations are persisted separately.
- After issuer address is complete, observations 4093/4096/4097/4098 are gone.

## ROLLBACK

- Revert code changes.
- Keep already-downloaded CDR ZIP files as immutable artifacts.
- Downgrade migration removes metadata columns only if no consumer depends on
  them.
- Existing accepted emissions remain valid even if local CDR metadata is absent.

## Traceability

- Requirement: user requested implementing issuer fiscal address, CDR parsing,
  and local CDR ZIP storage for SUNAT emission.
- owner: agent
- approver: lucas
- Commit: `ff716d4` (plugins/ventas module), root adapter tests in a follow-up commit.
- TRACE: `py_compile` PASS for mapper, emissions, models, schemas, and migration
  `0010`; `composer test` PASS in `services/greenter-adapter` (26 tests, 2
  skipped); `npm run typecheck` PASS; `npm run plugins:migrate` PASS with
  `ventas=0010`; unit tests for issuer env mapping and CDR parse/storage PASS.
  Real SUNAT beta send PASS for `F001-4` (accepted with observations, no
  address) and `F001-5` (accepted, `cdr_notes: []`, clean CDR with env issuer
  address). No failed checks.
- Deployment: Pending.

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Independent falsable truth exists now
- [x] Invariants preserved
- [x] Verification passed
- [x] Rollback / compensation is honest
- [x] Composition checks passed when applicable
- [ ] No unrelated changes
- [x] Structural constraints respected
- [x] Traceability established
