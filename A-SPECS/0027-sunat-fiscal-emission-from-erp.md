# A.SPEC 0027 — SUNAT fiscal emission from ERP

> `risk: high` — bridges confirmed sales orders to real SUNAT emission via
> `greenter-adapter`, persisting XML/CDR and managing retries.

## WHY

The adapter already proves factura and boleta XML generation, signing, and
SUNAT beta acceptance (A.SPEC 0008, 0009, 0010, 0022). Sales orders already
support `FACTURA`, `BOLETA`, and `NOTA_VENTA` with series/correlatives
(A.SPEC 0026). But there is no bridge between a confirmed ERP order and the
adapter's SUNAT pipeline. Users must manually craft payloads or run CLI scripts.

This A.SPEC connects them: a confirmed sale with `FACTURA` or `BOLETA` can be
sent to SUNAT from the UI, the result is persisted, and retries are safe.

## WHAT

Add fiscal emission support inside `plugins/ventas/facturacion/`:

- A `fiscal_emissions` table that records every emission attempt.
- A mapper that converts `SalesOrder` data into the adapter's emit payload.
- An HTTP call from Python to the adapter's `/documents/emit` endpoint.
- The adapter endpoint is extended to run the full pipeline (generate XML,
  sign, send to SUNAT, return result) instead of only validating.
- A backend endpoint `POST /orders/{id}/emit-sunat` that triggers emission.
- A frontend status badge and emit/retry buttons on the order detail.

`NOTA_VENTA` is excluded from SUNAT emission — it is commercial-only.

## SCOPE

### Backend — ERP side (`plugins/ventas/facturacion/`)

- `models.py` — `FiscalEmission` model (see schema below).
- `schemas.py` — Pydantic schemas for emission read/retry.
- `services/emissions.py` — `emit_order()`, `retry_emission()`, `get_emission()`.
- `services/sales_mapper.py` — `SalesOrder -> adapter payload` mapping.
- `services/adapter_client.py` — HTTP client to adapter `/documents/emit`.
- `routers/emissions.py` — `POST /orders/{id}/emit-sunat`, `GET /orders/{id}/emissions`.
- `migrations/0001_create_fiscal_emissions.py`.

### Backend — adapter side (`services/greenter-adapter/`)

- `src/Http/EmitDocumentEndpoint.php` — extend to run full pipeline when
  `auto_execute = true` in payload (generate XML, sign, send, return result).
- Keep backward compatibility: existing `auto_execute` absent or false still
  returns 202 `received`.

### Frontend (`plugins/ventas/facturacion/`)

- `pages/EmisionesPage.tsx` — list of emissions with status filters.
- `components/FiscalStatusBadge.tsx` — colored badge per status.
- `components/EmitSunatButton.tsx` — emit/retry button on order detail.
- Order detail page updated to show emission status and history.

## DATA MODEL

```sql
CREATE TABLE fiscal_emissions (
    id                VARCHAR(36) PRIMARY KEY,
    tenant_id         VARCHAR(36) NOT NULL REFERENCES tenants(id),
    order_id          VARCHAR(36) NOT NULL REFERENCES ventas_orders(id),
    document_type     VARCHAR(20) NOT NULL,  -- FACTURA | BOLETA
    document_series   VARCHAR(4)  NOT NULL,
    document_number   INT         NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- PENDING | SENDING | ACCEPTED | REJECTED | ERROR | UNKNOWN

    -- SUNAT response
    sunat_code        VARCHAR(10),
    sunat_description TEXT,
    sunat_notes       TEXT,
    sunat_error_code  VARCHAR(10),
    sunat_error_message TEXT,

    -- Evidence
    xml_filename      VARCHAR(255),
    xml_signed_hash   VARCHAR(64),  -- SHA-256 of signed XML
    cdr_zip_base64    TEXT,         -- raw CDR response

    -- Meta
    request_payload   TEXT,         -- JSON of adapter payload sent
    attempt_count     INT           NOT NULL DEFAULT 0,
    last_attempt_at   TIMESTAMP WITH TIME ZONE,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, document_series, document_number)
);
```

## MAPPER LOGIC

`SalesOrder -> adapter payload` mapping:

```text
tax_authority:
  country: PE
  code: SUNAT
  provider: greenter

document:
  type: order.document_type == 'FACTURA' ? 'invoice' : 'boleta'
  serie: order.document_series
  number: order.document_number
  currency: PEN  (hardcoded for MVP; configurable later)
  issue_date: order.order_date

issuer:
  ruc: from tenant/company config (env or DB)
  legal_name: from tenant/company config
  address: from tenant/company config

customer:
  document_type: order.customer_document_type (6 for FACTURA, 1 for BOLETA)
  document_number: order.customer_document_number
  legal_name: order.customer_name

items:
  for each order item:
    description: product name (from product catalog)
    quantity: item.quantity
    unit_value: item.unit_price / 1.18
    igv: item.unit_price - (item.unit_price / 1.18)
    total: item.line_total

totals:
  taxable: sum of unit_values
  igv: sum of igvs
  total: sum of line_totals
```

## ADAPTER ENDPOINT EXTENSION

Current `POST /documents/emit`:
- validates payload → returns 202 `received`

New behavior with `auto_execute: true`:
- validates payload
- maps to `EmitDocumentRequest`
- generates XML (`EmitDocumentXmlGenerator`)
- signs XML (`EmitDocumentXmlSigner`)
- sends to SUNAT (`SunatInvoiceSender`)
- returns full result:

```json
{
  "success": true,
  "status": "accepted",
  "provider": "PE_SUNAT_GREENTER",
  "document": { "type": "invoice", "serie": "F001", "number": 15 },
  "xml_filename": "20123456789-01-F001-15",
  "xml_signed_hash": "abc123...",
  "cdr_code": 0,
  "cdr_description": "La Factura numero F001-15, ha sido aceptada",
  "cdr_notes": null,
  "sunat_code": null,
  "sunat_description": null,
  "errors": []
}
```

On rejection:

```json
{
  "success": false,
  "status": "rejected",
  "provider": "PE_SUNAT_GREENTER",
  "document": { "type": "invoice", "serie": "F001", "number": 15 },
  "xml_filename": "20123456789-01-F001-15",
  "xml_signed_hash": "abc123...",
  "cdr_code": null,
  "cdr_description": null,
  "sunat_code": "2010",
  "sunat_description": "La Factura numero F001-15, ha sido rechazada",
  "errors": [{ "code": "2010", "message": "El numero de RUC del emisor es invalido" }]
}
```

## API CONTRACT

### `POST /ventas/orders/{id}/emit-sunat`

Preconditions:
- Order exists, belongs to tenant.
- Order status is `CONFIRMED`, `PARTIAL`, or `DISPATCHED`.
- Order `document_type` is `FACTURA` or `BOLETA`.
- No existing emission with status `SENDING` or `ACCEPTED` for this order.
- Tenant/company config provides RUC, legal name, address.

Postconditions:
- `fiscal_emission` record created with status `SENDING`.
- Adapter `/documents/emit` is called with `auto_execute: true`.
- Emission record updated with adapter response.
- Returns emission record with status.

Response `200`:

```json
{
  "id": "...",
  "order_id": "...",
  "document_type": "FACTURA",
  "document_series": "F001",
  "document_number": 15,
  "status": "ACCEPTED",
  "sunat_code": null,
  "sunat_description": "La Factura numero F001-15, ha sido aceptada",
  "attempt_count": 1,
  "last_attempt_at": "2026-09-20T..."
}
```

### `GET /ventas/orders/{id}/emissions`

Returns list of emissions for this order, ordered by `created_at DESC`.

### `POST /ventas/emissions/{emission_id}/retry`

Preconditions:
- Emission status is `ERROR` or `UNKNOWN`.
- No other emission for same order in `SENDING` or `ACCEPTED`.

Postconditions:
- `attempt_count` incremented.
- Adapter called again with same payload.
- Record updated.

## UI

### Order detail
- If `document_type` is `FACTURA` or `BOLETA`: show `EmitSunatButton`.
- If emission `ACCEPTED`: show green badge, hide button.
- If emission `REJECTED`: show red badge with error, hide button.
- If emission `ERROR`: show yellow badge + `Reintentar` button.
- If `NOTA_VENTA`: no button, no badge.

### Emisiones page (`/ventas/emisiones`)
- Table: document, status, attempts, last attempt, actions.
- Filters: status, document type.
- Click row → see full detail (XML hash, CDR, errors).

## OUT OF SCOPE

- Auto-emission on order confirmation (manual first).
- Auto-emission on POS checkout.
- PDF/representación impresa.
- Resumen diario de boletas.
- Anulación/baja de documentos.
- Notas de crédito/débito.
- CDR zip download/viewer.
- Ticket polling for UNKNOWN status.
- Production environment (beta only for this A.SPEC).
- Currency conversion (hardcoded PEN).
- Multi-RUC / multi-issuer (single company config).

## INVARIANTS

```yaml
invariants:
  - id: no-sunat-for-nota-venta
    statement: NOTA_VENTA orders cannot trigger SUNAT emission.
    proof: emit endpoint rejects document_type NOTA_VENTA.
  - id: idempotent-emission
    statement: Same order cannot have two ACCEPTED emissions.
    proof: unique constraint on (tenant_id, document_series, document_number) + service check.
  - id: no-duplicate-send
    statement: Cannot emit while a SENDING emission exists for the same order.
    proof: service checks no SENDING emission before creating new one.
  - id: beta-only
    statement: Adapter endpoint refuses non-beta environment.
    proof: adapter validates LIBREFACT_SUNAT_ENV=beta.
  - no-secrets-committed
    statement: SOL credentials and certificates are not persisted in ERP tables.
    proof: adapter reads from env, ERP stores only adapter URL.
```

## VERIFICATION

### Backend
```bash
py_compile plugins/ventas/facturacion/backend/models.py
py_compile plugins/ventas/facturacion/backend/services/emissions.py
py_compile plugins/ventas/facturacion/backend/routers/emissions.py
npm run plugins:migrate
```

### Adapter
```bash
composer test  # existing adapter tests still pass
```

### Manual smoke (beta)
```text
1. Create a FACTURA order with items, confirm it.
2. Click "Enviar SUNAT" in order detail.
3. Verify emission record created with status ACCEPTED.
4. Verify CDR code 0 and description stored.
5. Verify XML signed hash stored.
6. Try emitting same order again → blocked.
7. Create a BOLETA order, emit → ACCEPTED.
8. Create a NOTA_VENTA order → no emit button.
```

## ROLLBACK

- Revert adapter endpoint changes (back to validate-only 202).
- Drop `fiscal_emissions` table.
- Remove `plugins/ventas/facturacion/`.
- No impact on existing sales or POS flows.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/ventas/facturacion/          # new module
    - plugins/ventas/backend/routers/orders.py  # add emission status to order detail
    - plugins/ventas/frontend/              # emit button on order detail
    - services/greenter-adapter/src/Http/EmitDocumentEndpoint.php
    - A-SPECS/0027-sunat-fiscal-emission-from-erp.md
    - A-SPECS/TODO.md
  prohibited:
    - plugins/pos/**
    - plugins/stock/**
    - plugins/configuracion/**
    - services/greenter-adapter/src/Domain/**
    - services/greenter-adapter/src/Mapping/**
    - services/greenter-adapter/src/Xml/**
    - services/greenter-adapter/src/Sunat/**
    - secrets or .env
```

## Traceability

- Requirement: User requested real SUNAT integration for facturas and boletas,
  with retry handling for SUNAT failures, placed inside `plugins/ventas/facturacion/`.
- owner: Lucas
- approver: Lucas
- Commit: `f2c35f4` (root: adapter `auto_execute` pipeline), `ff716d4` (plugins/ventas: `facturacion/` module + migrations 0008/0009/0010).
- TRACE: `composer test` PASS in `services/greenter-adapter` (26 tests, 2
  skipped); `npm run plugins:migrate` reaches `ventas=0010`; `npm run typecheck`
  PASS; `py_compile` PASS for the `facturacion` backend. Real SUNAT beta smoke:
  FACTURA `F001-3`, `F001-4` accepted (with issuer-address observations) and
  `F001-5` accepted with clean CDR (`cdr_notes: []`). BOLETA through the ERP
  module not exercised in this session; `NOTA_VENTA` blocked by
  `EMITABLE_DOC_TYPES`. No failed checks.
- Deployment: Pending.

## Definition of Done

- [x] Spec created
- [x] `fiscal_emissions` table created via migration
- [x] `FiscalEmission` model added
- [x] Mapper `SalesOrder -> adapter payload` implemented
- [x] Adapter client (HTTP) implemented
- [x] `POST /orders/{id}/emit-sunat` endpoint working
- [x] Adapter `/documents/emit` extended with `auto_execute`
- [x] Emission retry endpoint working
- [x] UI badge + emit button on order detail
- [x] Emission list page functional
- [x] Smoke test: FACTURA emitted and accepted in beta
- [ ] Smoke test: BOLETA emitted and accepted in beta
- [x] NOTA_VENTA correctly blocked from emission
- [x] Existing adapter tests still pass
- [x] No secrets committed
