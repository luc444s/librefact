# TODO de A.SPECS Librefact

Estado actual del plan test-first para integrar Greenter en Librefact.

## Hecha

- [x] A.SPEC 0001 — Make Greenter adapter live inside the repo
  - Greenter vive dentro del repo en `services/greenter-adapter`.
  - Composer tiene `greenter/greenter` bloqueado.
  - Existe test que prueba que `Greenter\See` es autoloadable.
  - Commit de implementacion: `54d8de93e764965aace6c35048ed3a877670af3c`.

- [x] A.SPEC 0002 — Define Greenter emit endpoint contract
  - Existe el endpoint minimo local `POST /documents/emit`.
  - Recibe payload minimo de factura.
  - Devuelve respuesta deterministicamente como `202 received`.
  - No llama SUNAT, no genera XML, no firma y no procesa CDR.
  - Commit de implementacion: `5ecca3d8a1040fced5ec2194e43c0314e60055af`.

- [x] A.SPEC 0003 — Validate Greenter emit payload
  - Valida estructura minima del payload.
  - Rechaza payloads invalidos con `400 invalid_request`.
  - Devuelve errores por campo.
  - Mantiene aceptacion del payload valido de 0002.
  - No llama SUNAT, no genera XML, no firma y no procesa CDR.
  - Commit de implementacion: `147544d4c3896da6dc19077734c4329466169d90`.

- [x] A.SPEC 0004 — Map valid emit payload to internal DTO
  - Crear objetos internos del adapter para dejar de trabajar con arrays crudos.
  - DTOs creados: `EmitDocumentRequest`, `TaxAuthority`, `DocumentIdentity`, `Issuer`, `Customer`, `DocumentItem`, `DocumentTotals`.
  - Mapper creado: `EmitDocumentRequestMapper`.
  - Test-first: payload valido produce un DTO completo y estable.
  - No usar Greenter todavia.
  - No generar XML.
  - No llamar SUNAT.
  - Commit de implementacion: `b62e8f658ab923800735a502c7a69c3e7d37b4ee`.

- [x] A.SPEC 0005 — Map internal DTO to Greenter objects
  - Mapper creado: `EmitDocumentGreenterMapper`.
  - Test-first contra `Greenter\Model\Sale\Invoice`, `Company`, `Client` y `SaleDetail`.
  - DTO interno convertido a objeto Greenter en memoria.
  - Defaults minimos definidos: `tipoDoc=01`, `tipoOperacion=0101`, `ublVersion=2.1`, `unidad=ZZ`, `codProducto=SERVICE`, `tipAfeIgv=10`, `porcentajeIgv=18`.
  - No llama SUNAT, no genera XML, no firma y no procesa CDR.
  - Commit de implementacion: `022842ed73ace70a87c2a40aa001c9e39bca10d3`.
  - TRACE: `GAP` informativo solo por deployment no exponible; sin checks fallidos.

- [x] A.SPEC 0006 — Generate local XML with Greenter
  - Generar XML UBL local desde una factura valida.
  - Generator creado: `EmitDocumentXmlGenerator`.
  - Retorna XML como string en memoria, sin escribir archivo temporal.
  - Usa `Greenter\Xml\Builder\InvoiceBuilder::build()` sobre el `Invoice` de A.SPEC 0005.
  - XML parseable con `DOMDocument`, con datos canonicos de factura `F001-1`.
  - Sin `Greenter\See`, sin certificado, sin firma criptografica, sin CDR y sin SUNAT.
  - Commit de implementacion: `906f709203b9b226692781eab3ba3b6d26ebb109`.
  - TRACE: `GAP` informativo solo por deployment no exponible; sin checks fallidos.

- [x] A.SPEC 0007 — Sign XML
  - Firmar XML con certificado de prueba.
  - Validar que la firma queda presente.
  - Signer creado: `EmitDocumentXmlSigner`.
  - Usa `Greenter\XMLSecLibs\Sunat\SignedXml` directo, sin `Greenter\See`.
  - Certificado de prueba generado en memoria dentro del test, sin fixtures de certificados.
  - XML firmado parseable y verificable con `SignedXml::verifyXml()`.
  - Sin envio SUNAT, sin credenciales SOL y sin CDR.
  - Commit de implementacion: `b5dee373c8d8f871d644b41aba4685581b401281`.
  - TRACE: `GAP` informativo solo por deployment no exponible; sin checks fallidos.

## Sigue

- [x] A.SPEC 0008 — Define SUNAT beta send boundary
  - Spec: `A-SPECS/0008-send-invoice-to-sunat-beta.md`.
  - Sender creado: `SunatInvoiceSender`.
  - Configuracion explicita creada: `SunatSubmissionCredentials`.
  - Resultado tecnico creado: `SunatInvoiceSubmissionResult`.
  - Usa `Greenter\Ws\Services\BillSender` y `SoapClient` para el sender real.
  - Test unitario inyecta `SenderInterface` fake para verificar contrato sin red ni credenciales.
  - No hardcodea credenciales SOL ni certificados.
  - La ejecucion real contra SUNAT beta sigue requiriendo credenciales/certificado/serie-correlativo externos.

## Pendiente

- [x] A.SPEC 0009 — Validate SUNAT beta real pipeline
  - Spec: `A-SPECS/0009-validate-sunat-beta-real-pipeline.md`.
  - Test de integracion real gated creado con `LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1`.
  - Script manual de smoke test beta creado.
  - Rechaza cualquier endpoint que no sea beta.
  - Envio real SUNAT beta ejecutado y aceptado: `SUCCESS: yes`, `CDR_CODE: 0`.
  - Milestone backend validada con XML generado, XML firmado, envio beta y CDR aceptado.
  - Requiere `cod_local`, `FormaPagoContado`, `valorVenta`, `subTotal` y direccion fiscal completa para CDR limpio.
  - Ultima prueba limpia uso `ubigueo=130100`, `departamento=LA LIBERTAD`, `provincia=TRUJILLO`, `distrito=TRUJILLO`, `direccion=TRUJILLO`, `cod_local=0000`.

- [ ] Definir operacion posterior a SUNAT beta
  - Decidir si se necesita persistencia, endpoint de consulta, manejo de errores SUNAT o trazabilidad de CDR en specs separadas.

- [x] A.SPEC 0011 — Import Systutor OSS Gas business plugins
  - Crear carpeta raiz `plugins/`.
  - Copiar desde `systutor-OSS-Gas` solo: `crm`, `productos`, `commerce`, `ventas`, `stock`.
  - No copiar `logistics`, `tms`, `notes` ni facturacion legacy.
  - No tocar `vendor/systutor-core/src/systutor/**`.
  - Migrar tablas de los 5 plugins.
  - Validar que core arranca y acepta los plugins.
  - Validar que el registry lista los modulos importados.
  - Validar que no se tocaron `services/greenter-adapter/**` ni secretos.
  - Desacoplado de `commerce`, `stock`, `ventas` de `logistics` (contrato 001).
  - Contratos 001/002 creados en `docs/contracts/`.
  - `npm run plugins:migrate` PASS: crm=0005, productos=0009, compras=0019, ventas=0002, stock=0009.

- [x] Ejecutar envio real SUNAT beta
  - Ejecutado con `LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1` y endpoint beta.
  - SUNAT beta acepto la factura con CDR 0.
  - La version con direccion completa no devolvio notas CDR.

## Reglas Del Camino

- Cada A.SPEC debe ser test-first.
- Primero se escribe y ejecuta el test esperado fallido.
- Si el fallo no prueba lo correcto, se corrige el test antes de implementar.
- Cada A.SPEC debe tocar solo su `change_surface.allowed`.
- Greenter/SUNAT no deben entrar al core de Librefact.
- Regla arquitectonica: `Tax authority adapters, no tax authority in core`.

## Estado Del Workspace

- `A-SPECS/0003-validate-greenter-emit-payload.md` fue marcada como hecha localmente con SHA y DoD, pero esa metadata puede requerir commit separado.
- `A-SPECS/0004-map-emit-payload-to-internal-dto.md` fue implementada y commiteada, pero puede requerir metadata de DoD/SHA en un cambio separado.
- `A-SPECS/0005-map-internal-dto-to-greenter-objects.md` fue implementada, commiteada y traceada; queda metadata local posterior al commit con SHA/TRACE/DoD.
- `A-SPECS/0006-generate-local-xml-with-greenter.md` fue implementada, commiteada y traceada; queda metadata local posterior al commit con SHA/TRACE/DoD.
- `A-SPECS/0007-sign-xml-with-test-certificate.md` fue implementada, commiteada y traceada; queda metadata local posterior al commit con SHA/TRACE/DoD.
- `A-SPECS/0001-greenter-adapter-in-repo.md` tiene cambios locales pendientes en DoD.
- Hay carpetas de instalacion/base todavia sin versionar que deben decidirse aparte: `ADD/`, `apps/`, `docs/`, `package.json`, `scripts/`, `systutor-installer/`, `vendor/`.
