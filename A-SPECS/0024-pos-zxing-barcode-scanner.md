# A.SPEC 0024 — POS ZXing barcode scanner

## Estado

Propuesta / pendiente.

## Objetivo

Agregar lectura de codigos de barras desde la camara del celular al modulo POS bodega, usando ZXing en frontend, para buscar/agregar productos sin escribir manualmente el SKU o barcode.

## Contexto

El POS ya tiene busqueda por nombre/SKU/codigo y manejo de productos sin precio. El siguiente incremento debe permitir escanear codigos desde celular.

La camara del navegador requiere contexto seguro en celular: HTTPS o `localhost`. En red local tipo `http://192.168.x.x:5173/app/pos`, muchos navegadores no daran permiso de camara.

## Decision

- Usar `@zxing/browser` en el frontend POS.
- Mantener el cambio dentro de `plugins/pos/frontend` salvo dependencia frontend necesaria.
- No agregar backend nuevo para escaneo: el resultado del scanner sera un texto/codigo que reutiliza `GET /api/v1/plugins/pos/products/search?q=...`.
- No usar `BarcodeDetector API` como dependencia principal por soporte inconsistente entre navegadores.
- Requerir HTTPS para pruebas reales en celular.

## Change Surface

### Allowed

- `plugins/pos/frontend/**`
- `apps/web/package.json` y lockfile correspondiente si se agrega dependencia ahi
- `apps/web/vite.config.ts` para resolver bare dependencies importadas desde plugins frontend
- Documentacion operativa minima para ejecutar en celular con HTTPS/tunel

### Forbidden

- Cambiar checkout backend
- Cambiar modelos/migraciones POS
- Agregar busqueda duplicada fuera del endpoint actual
- Persistir imagen/camara/video en backend
- Introducir credenciales, servicios externos obligatorios o SDKs de pago

## UX requerida

### Entrada y modos

- El scanner debe reutilizar un componente comun, pero operar en tres modos segun la pantalla que lo abre:
  - `sale-add`: desde pantalla `Venta`, escanea continuamente y agrega directamente al carrito.
  - `search-fill`: desde pantalla `Agregar items`, rellena el buscador y ejecuta busqueda.
  - `barcode-fill`: desde `Producto rapido`, rellena el campo barcode del formulario.
- En `Venta` debe existir un boton visible de camara/scan.
- En `Agregar items`, el buscador debe tener un boton de codigo de barras.
- En `Producto rapido`, el campo barcode debe tener un boton de codigo de barras.
- Al tocar cualquier accion de escaneo, abre una vista/modal fullscreen con camara completa.
- La camara debe activarse automaticamente al abrir la vista/modal.
- Puede existir boton de reintento si el inicio de camara falla o se cancela.
- Si el navegador no soporta camara o no hay HTTPS, mostrar mensaje accionable.

### Lectura

- Usar camara trasera cuando este disponible (`environment`).
- Detectar codigos EAN/UPC comunes de productos de bodega.
- Al detectar un codigo valido:
  - detener stream de camara;
  - cerrar modal;
  - entregar el codigo detectado al modo que abrio el scanner.

### Resultados por modo

#### `sale-add`

- Buscar producto por barcode detectado.
- Si existe y tiene precio: agregar al carrito con cantidad `+1`.
- Si ya existe en el carrito: incrementar cantidad, no crear linea duplicada.
- Mantener la camara abierta despues de agregar productos con precio para permitir registrar varios productos en una sola sesion de escaneo.
- Mientras la camara sigue abierta, mostrar una previsualizacion rapida del carrito con cantidad de items, total y ultimas lineas agregadas.
- Si existe pero no tiene precio: cerrar scanner y abrir flujo actual para fijar precio antes de agregar.
- Si no existe: mostrar estado "No encontrado" y ofrecer ir a `Producto rapido` con barcode precargado.
- Evitar duplicados accidentales del mismo codigo por rebote de lectura inmediata.

#### `search-fill`

- Rellenar el input de busqueda con el barcode detectado.
- Ejecutar busqueda usando el endpoint actual.
- No agregar automaticamente al carrito; la pantalla ya ofrece `+` o `$` segun resultado.
- Si no hay resultados: mostrar estado "Sin resultados" y ofrecer crear producto rapido con barcode precargado.

#### `barcode-fill`

- Rellenar el campo `Barcode` del formulario de producto rapido.
- No crear producto automaticamente.
- El usuario completa nombre/precio/stock y confirma guardado manualmente.

### Control

- Debe existir boton para cerrar/cancelar escaneo.
- Al cerrar/cancelar, el stream de camara debe detenerse siempre.
- No deben quedar camaras activas al cambiar de pantalla o cerrar modal.

## Ejecucion en celular

La implementacion debe documentar una de estas rutas:

1. HTTPS local para Vite y acceso desde la LAN.
2. Tunel HTTPS temporal (`cloudflared`, `ngrok` o equivalente).
3. Deployment real con dominio HTTPS.

La spec acepta que HTTP LAN no soporte camara y debe mostrar mensaje claro.

## Test Plan

### Unit / component

- Mockear ZXing reader para simular deteccion de barcode.
- Verificar que al detectar codigo se llama al callback con el valor.
- Verificar que cerrar modal detiene scanner/stream.
- Verificar fallback cuando no hay soporte/permisos.

### Typecheck

- `npm run typecheck` debe pasar.

### Manual smoke

- En desktop HTTPS o localhost:
  - abrir `/app/pos`;
  - desde `Venta`, abrir scanner fullscreen;
  - conceder permisos;
  - simular/escanear codigo;
  - verificar agregado al carrito o flujo sin precio/no encontrado.
- En `Agregar items`:
  - abrir scanner desde el boton de barcode del buscador;
  - detectar codigo;
  - verificar que el buscador se rellena y ejecuta busqueda.
- En `Producto rapido`:
  - abrir scanner desde el campo barcode;
  - detectar codigo;
  - verificar que el campo barcode queda rellenado sin guardar automaticamente.
- En celular HTTPS:
  - abrir URL segura;
  - confirmar uso de camara trasera;
  - escanear un codigo EAN real;
  - verificar producto encontrado o flujo de no encontrado.

## Acceptance Criteria

- POS incluye accion de scanner con ZXing.
- El scanner abre una vista/modal fullscreen de camara y detecta codigos de barras en contexto seguro.
- La camara se activa automaticamente al abrir la vista fullscreen.
- El codigo detectado reutiliza la busqueda existente del POS.
- Desde `Venta`, un producto con precio se agrega al carrito con cantidad `+1`; si ya existia, incrementa cantidad.
- Desde `Venta`, el scanner permanece abierto tras cada producto con precio para escanear multiples productos sin reabrir la camara.
- Desde `Venta`, el scanner muestra una previsualizacion compacta del carrito actualizado.
- Desde `Agregar items`, el barcode rellena el buscador y ejecuta busqueda sin agregar automaticamente.
- Desde `Producto rapido`, el barcode rellena el campo barcode sin crear producto automaticamente.
- El flujo respeta productos con precio, sin precio y no encontrados.
- El stream de camara se apaga al detectar, cancelar, cerrar o desmontar.
- En HTTP/no soporte/permisos denegados, se muestra mensaje claro y no se rompe el POS.
- No se agregan migraciones ni cambios backend.
- `npm run typecheck` PASS.

## Open Questions

- Confirmar mecanismo preferido de HTTPS para pruebas en celular: Vite HTTPS local, Cloudflare Tunnel, ngrok o deployment real.

## Implementation Trace

- Estado: implementado; SHA pendiente.
- Verificacion local: `npm run typecheck` PASS; `npm --prefix apps/web run build` PASS.
