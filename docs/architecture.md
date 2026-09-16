# Arquitectura de Librefact

Librefact nace como una plataforma libre, gratuita y open source para facturacion electronica en Peru. El objetivo es que cualquier negocio pueda emitir comprobantes electronicos de forma simple, practica y sin depender de software cerrado.

La primera version debe priorizar una meta concreta: conectar Librefact con Greenter y validar el flujo completo de emision electronica. Despues se construira el sistema minimo de inventario y caja. Finalmente, la facturacion electronica quedara integrada por completo al flujo de ventas, stock y cierre diario.

## Principios

- Simple primero: cada fase debe entregar algo usable.
- Open source real: el proyecto debe poder instalarse, auditarse y modificarse.
- Separacion de responsabilidades: negocio en Librefact, SUNAT en Greenter.
- Trazabilidad: cada comprobante debe conservar XML, CDR, estado, errores y auditoria.
- Peru primero: RUC, SUNAT, comprobantes, series, IGV, moneda, certificados y CDR son parte del dominio principal.
- Autoridades tributarias por adaptador: el core no debe depender directamente de SUNAT, Greenter ni una Hacienda especifica.
- Crecimiento modular: facturacion, inventario y caja deben poder evolucionar sin bloquearse entre si.

## Stack Inicial

- Frontend: dashboard web en `apps/web`.
- Backend principal: Systutor/FastAPI en Python.
- Base de datos: PostgreSQL, base `librefact`.
- Facturacion electronica: Greenter como servicio PHP interno.
- Comunicacion interna: HTTP local entre backend principal y adaptador Greenter.

## Vista General

```text
Usuario
  |
  v
Dashboard Librefact
  |
  v
Backend Librefact / Systutor
  |
  +--> PostgreSQL librefact
  |
  +--> Greenter Adapter PHP
          |
          +--> XML UBL
          +--> Firma digital
          +--> SUNAT / OSE
          +--> CDR
```

## Componentes

### Dashboard

El dashboard es la interfaz principal para operar Librefact. Debe cubrir primero la administracion minima y luego crecer hacia facturacion, ventas, compras, productos, stock y caja.

Responsabilidades:

- Login y navegacion.
- Configuracion de empresa.
- Gestion de clientes, productos y series.
- Emision y seguimiento de comprobantes.
- Operacion de ventas, compras, stock y caja en fases posteriores.

### Backend Librefact

El backend principal es el duenio del dominio de negocio. Greenter no debe decidir reglas comerciales de Librefact; solo debe ejecutar el proceso tecnico tributario.

Responsabilidades:

- Empresas emisoras.
- Sucursales y usuarios.
- Clientes.
- Productos.
- Series y correlativos.
- Ventas y compras.
- Comprobantes electronicos.
- Estados SUNAT.
- Auditoria.
- Integracion con el adaptador Greenter.

### Base de Datos

La base principal del proyecto es PostgreSQL `librefact`.

Responsabilidades:

- Persistir la configuracion del negocio.
- Persistir comprobantes y sus estados.
- Guardar rutas o contenido de XML y CDR.
- Registrar errores de envio y reintentos.
- Mantener movimientos de stock y caja cuando esos modulos existan.

### Greenter Adapter

Greenter es una libreria PHP, por lo que Librefact la integrara mediante un servicio interno separado. Esto mantiene limpio el backend Python y deja una frontera clara entre negocio y emision SUNAT.

Responsabilidades:

- Recibir una solicitud normalizada de comprobante.
- Construir el documento compatible con Greenter.
- Generar XML UBL.
- Firmar con certificado digital.
- Enviar a SUNAT u OSE.
- Procesar CDR.
- Devolver resultado tecnico al backend principal.

No debe encargarse de:

- Gestionar ventas.
- Gestionar stock.
- Decidir precios.
- Decidir correlativos.
- Crear clientes o productos.
- Aplicar reglas de caja.

## Modulos del Dominio

### librefact-core

Modulo base del proyecto.

- Empresa emisora.
- Certificados.
- Credenciales SUNAT.
- Sucursales.
- Usuarios y permisos.
- Series y correlativos.
- Configuracion tributaria.

### librefact-billing

Modulo de facturacion electronica.

- Facturas.
- Boletas.
- Notas de credito.
- Notas de debito.
- Lineas de comprobante.
- Impuestos.
- XML.
- CDR.
- Estado SUNAT.
- Errores y reintentos.

### librefact-inventory

Modulo de inventario minimo.

- Productos.
- Compras.
- Ventas.
- Stock.
- Movimientos.
- Kardex basico.

### librefact-cash

Modulo de caja.

- Apertura de caja.
- Ventas del dia.
- Pagos.
- Cierre de caja.
- Diferencias.
- Reporte diario.

## Autoridades Tributarias

Librefact sera Peru-first, pero no debe quedar SUNAT-hardcoded. El core debe modelar el negocio comun y delegar la emision tributaria a adaptadores de autoridad tributaria.

```text
Librefact Core / Billing
  |
  v
Tax Authority Port
  |
  +--> PE SUNAT Adapter
  |      |
  |      +--> Greenter Adapter PHP
  |
  +--> Hacienda Adapter futuro
  |
  +--> Otro pais / autoridad futura
```

### Core Comun

El core puede conocer conceptos comunes del negocio:

- Empresa.
- Cliente.
- Producto o servicio.
- Venta.
- Comprobante.
- Items.
- Impuestos y totales normalizados.
- Estado de emision.
- Archivos generados.
- Eventos y auditoria.

El core no debe tener dependencias directas a:

- Greenter.
- SUNAT como implementacion tecnica.
- Clases PHP de Greenter.
- Webservices especificos de SUNAT.
- Reglas particulares de una Hacienda extranjera.

### Puerto Tributario

El backend debe depender de un contrato estable, no de un proveedor especifico.

Contrato conceptual:

```text
emit(document, authority_config) -> emission_result
void(document, authority_config) -> void_result
get_status(document, authority_config) -> status_result
```

Para Peru, la implementacion inicial sera:

```text
authority = PE_SUNAT
provider = greenter-adapter
```

Si en el futuro se soporta otra Hacienda, se agregara otro adaptador que implemente el mismo puerto. Esa expansion no debe requerir cambiar el core de facturacion, solo agregar configuracion, mapeos y el nuevo proveedor.

Regla arquitectonica:

```text
Tax authority adapters, no tax authority in core.
```

## Flujo Inicial de Facturacion

El primer flujo debe ser deliberadamente pequeno.

```text
Usuario crea comprobante demo
  |
Backend valida datos minimos
  |
Backend reserva serie y correlativo
  |
Backend guarda comprobante como pendiente
  |
Backend llama a Greenter Adapter
  |
Greenter genera XML, firma y envia
  |
Greenter devuelve resultado y CDR
  |
Backend actualiza estado
  |
Dashboard muestra resultado
```

Estados iniciales sugeridos:

- `draft`: borrador.
- `pending`: listo para enviar.
- `sent`: enviado.
- `accepted`: aceptado por SUNAT.
- `rejected`: rechazado por SUNAT.
- `error`: error tecnico o de comunicacion.
- `voided`: anulado o dado de baja.

## Frontera Backend-Greenter

El backend debe llamar al adaptador con un contrato simple y estable.

Endpoint inicial sugerido:

```text
POST /api/greenter/documents/emit
```

Entrada conceptual:

```json
{
  "document_type": "invoice",
  "serie": "F001",
  "number": 1,
  "issuer": {},
  "customer": {},
  "items": [],
  "totals": {},
  "certificate": {},
  "sunat": {}
}
```

Salida conceptual:

```json
{
  "success": true,
  "status": "accepted",
  "xml": "...",
  "cdr": "...",
  "sunat_code": "0",
  "sunat_description": "Aceptado",
  "errors": []
}
```

## Roadmap Tecnico

### Fase 0: Base del proyecto

Estado actual esperado:

- Installer funcionando.
- Base PostgreSQL `librefact` creada y migrada.
- Frontend arrancando con `npm run frontend`.
- Backend arrancando con `npm run services`.
- Documento de arquitectura inicial.

### Fase 1: Conexion Greenter

Objetivo: emitir un comprobante demo usando Greenter.

Entregables:

- Crear `services/greenter-adapter`.
- Instalar Greenter con Composer.
- Crear endpoint interno de emision.
- Crear modelo minimo de comprobante en backend.
- Generar XML.
- Firmar XML.
- Enviar a ambiente beta de SUNAT.
- Guardar XML, CDR, estado y errores.

### Fase 2: Facturacion MVP

Objetivo: emitir comprobantes manualmente desde el dashboard.

Entregables:

- Configuracion de empresa emisora.
- Configuracion de certificado.
- Configuracion SUNAT.
- Clientes.
- Series.
- Pantalla de factura/boleta.
- Historial de comprobantes.
- Descarga de XML y CDR.

### Fase 3: Inventario Minimo

Objetivo: operar productos, compras, ventas y stock.

Entregables:

- Productos.
- Compras.
- Ventas.
- Movimientos de stock.
- Kardex basico.
- Cierre de caja simple.

### Fase 4: Integracion Total

Objetivo: que una venta genere automaticamente el comprobante electronico.

Entregables:

- Venta desde caja.
- Descuento de stock.
- Registro de pago.
- Emision automatica de boleta o factura.
- Reintentos si SUNAT falla.
- Notas de credito y debito.
- Comunicacion de baja cuando aplique.
- Reportes operativos y tributarios basicos.

## Decisiones Iniciales

- Librefact usara Greenter como motor de facturacion electronica para Peru.
- Greenter vivira en un adaptador PHP separado.
- SUNAT/Greenter seran una implementacion del puerto tributario, no una dependencia directa del core.
- El backend principal seguira siendo Python/Systutor.
- PostgreSQL `librefact` sera la base principal.
- Primero se validara el flujo SUNAT minimo antes de construir inventario.
- Inventario y caja se construiran despues como modulos del dominio Librefact.

## Pendientes Abiertos

- Definir licencia open source del proyecto.
- Definir si XML/CDR se guardan como texto en DB, archivos en disco, o ambos.
- Definir estrategia de certificados y secretos.
- Definir ambiente beta/produccion SUNAT.
- Definir estructura final de plugins o modulos dentro del backend.
- Definir formato exacto del contrato entre backend y Greenter Adapter.
- Definir el contrato exacto del puerto tributario para soportar SUNAT primero y otras Haciendas despues.
