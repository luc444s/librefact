# A.SPEC 0023 — POS bodega mobile sales module

> `risk: high` — nuevo plugin con migración propia, manejo de dinero (pagos y
> cierre de caja) y orquestación transaccional de ventas, stock y catálogo.

## WHY

El mock `docs/pos-bodega-mobile.html` define la interfaz objetivo de caja para
bodegas: venta rápida, agregar items, producto rápido y cierre de caja. El repo
ya tiene las piezas de negocio (`ventas` con órdenes y series, `stock` con
sale-out, `productos` con catálogo, precios y barcode), pero no existe ningún
módulo que las orqueste como un POS ni que registre cobros o sesiones de caja.

Sin ese módulo, una venta de bodega exige navegar varios módulos, no hay captura
de medio de pago, no hay arqueo/cierre de turno y no hay un flujo de "crear
producto sin salir de caja". El POS cubre ese hueco reutilizando el dominio
existente, sin duplicar lógica de ventas ni de stock.

## WHAT

Crear un plugin nuevo `pos` que expone un flujo móvil de caja y persiste caja y
pagos:

- Sesiones de caja (`pos_cash_sessions`): apertura con monto inicial, una sesión
  `OPEN` por tenant/almacén, cierre con monto contado y diferencia.
- Pagos (`pos_payments`): medio de pago (`EFECTIVO`, `YAPE_PLIN`, `TARJETA`),
  monto, recibido y vuelto, ligados a una sesión y a una orden de venta.
- Checkout POS (`POST /checkout`): en una sola transacción crea la orden de venta
  `BOLETA`, la confirma (asigna serie/correlativo), la despacha (sale-out de
  stock en el almacén de la sesión) y registra el pago.
- Producto rápido (`POST /products/quick`): crea producto, precio `UNITARIO`,
  stock inicial opcional y barcode, y lo devuelve para el carrito.
- Resumen de cierre (`GET /sessions/{id}/summary`): totales por medio de pago,
  efectivo esperado, diferencia y últimas ventas.
- Búsqueda POS con precio y peso (`GET /products/search`): lista id, sku, nombre,
  precio vigente (o `null`) y peso en kg (o `null`) en una sola consulta, sin N+1
  por item, y permite mostrar precio o badge "Sin precio" en la pantalla Agregar.
- Precio rápido en caja (`POST /products/{id}/price`): si un producto no tiene
  precio vigente, la cajera fija el precio `UNITARIO` desde el POS y queda
  persistido antes de agregarlo al carrito.
- Frontend móvil-first en la ruta `pos` con una sola entrada de menú, cuatro
  pantallas (Venta, Agregar, Producto, Cierre) y el modal de cobro del mock
  (efectivo/tarjeta con confirmación Sí/No; Yape/Plin con QR mock).
- Modo inmersivo en `/app/pos`: el header global (tenant/branch/usuario) se
  oculta y el sidebar se abre con un botón hamburguesa flotante en un drawer
  superpuesto; el resto de rutas mantiene el layout actual.

Decisiones fijadas: precios sin IGV (totales = suma de importes de línea, sin
desglose de impuestos) y sin emisión SUNAT/Greenter en esta fase.

## SCOPE

- `plugins/pos/plugin.json`
- `plugins/pos/README.md`
- `plugins/pos/__init__.py`
- `plugins/pos/backend/__init__.py`
- `plugins/pos/backend/plugin.py`
- `plugins/pos/backend/router.py`
- `plugins/pos/backend/models.py`
- `plugins/pos/backend/common.py`
- `plugins/pos/backend/schemas.py`
- `plugins/pos/backend/services/__init__.py`
- `plugins/pos/backend/services/sessions.py`
- `plugins/pos/backend/services/checkout.py`
- `plugins/pos/backend/services/quick_products.py`
- `plugins/pos/backend/services/catalog.py`
- `plugins/pos/backend/routers/__init__.py`
- `plugins/pos/backend/routers/sessions.py`
- `plugins/pos/backend/routers/checkout.py`
- `plugins/pos/backend/routers/products.py`
- `plugins/pos/migrations/0001_create_pos_tables.py`
- `plugins/pos/frontend/register.tsx`
- `plugins/pos/frontend/api.ts`
- `plugins/pos/frontend/types.ts`
- `plugins/pos/frontend/pages/PosPage.tsx`
- `plugins/pos/frontend/components/CartPanel.tsx`
- `plugins/pos/frontend/components/ItemSearchPanel.tsx`
- `plugins/pos/frontend/components/QuickProductForm.tsx`
- `plugins/pos/frontend/components/PaymentModal.tsx`
- `plugins/pos/frontend/components/CashClosePanel.tsx`
- `apps/web/src/shared/layout/AppLayout.tsx`
- `A-SPECS/0023-pos-bodega-module.md`
- `A-SPECS/TODO.md`

## OUT OF SCOPE

- Emisión electrónica SUNAT/Greenter, XML, CDR, firma o envío.
- IGV/impuestos: no se calcula ni desglosa impuesto; los precios son finales.
- Factura con RUC desde el POS (la primera versión emite `BOLETA` anónima).
- Cliente, descuentos, promociones, notas de crédito/débito.
- Multi-caja simultánea por usuario y arqueo por denominación.
- Impresión térmica, PDF o representación impresa.
- Modo offline, sincronización diferida o venta sin caja abierta.
- Cambios a `plugins/ventas`, `plugins/productos`, `plugins/stock`,
  `plugins/configuracion` o `plugins/crm` (solo se reutilizan sus servicios).
- Cambios a `vendor/systutor-core`, `services/greenter-adapter`, `apps/**`.
- Editar o borrar `docs/pos-bodega-mobile.html` (queda como referencia).
- Secretos o `.env`.

## CONTRACT

Precondiciones:

- Existe al menos una sucursal/almacén accesible por el usuario (`branches.id`
  es el `warehouse_id` de stock, A.SPEC 0013).
- Existe una serie default activa para `BOLETA` en `cfg_document_series`
  (A.SPEC 0016/0017).
- El plugin `productos` puede crear producto, precio `UNITARIO` y barcode.
- El plugin `stock` puede registrar `sale_out` en el almacén de la sesión.
- Hay una sesión `OPEN` para el tenant/almacén antes de cobrar.

Postcondiciones:

- `pos_cash_sessions` y `pos_payments` existen con su migración aplicada.
- Activación del plugin: `pos` es un plugin nuevo y
  `scripts/systutor-plugins-migrate.sh` solo migra/habilita una lista hardcodeada
  (`selected_plugins`). Por decisión explícita, el script no se modifica: la
  migración `0001` y la habilitación se ejecutan vía la API de plugins del core
  (`upgrade_plugin` + `enable_plugin`) y se otorgan los permisos `pos.*` al rol
  correspondiente.
- `POST /sessions/open` crea a lo sumo una sesión `OPEN` por tenant/almacén y
  rechaza abrir una segunda.
- `POST /checkout` con caja cerrada falla con error de negocio (no crea orden ni
  movimiento de stock).
- Un checkout exitoso deja, en la misma transacción:
  - una orden `ventas_orders` en estado `DISPATCHED` con `document_type=BOLETA`
    y `document_full_number` asignado;
  - un `sale_out` por item con su `dispatched_qty` avanzado;
  - un `pos_payments` con el medio elegido y el total de la venta.
- Si cualquier paso falla, no queda orden, pago ni movimiento de stock parcial.
- `POST /products/quick` crea producto + precio vigente + barcode y, si se pide
  stock inicial, un movimiento de stock; devuelve el producto para el carrito.
- `GET /products/search` devuelve, por producto activo, su precio `UNITARIO`
  vigente (o `null`) y su peso en kg (`weight_kg`, con fallback
  `default_weight_kg`, o `null`); no falla si el producto carece de precio o peso.
- `POST /products/{id}/price` con un monto crea un precio `UNITARIO` vigente para
  un producto existente del tenant y lo deja disponible para el checkout.
- Un producto sin precio puede agregarse al carrito solo después de fijarle el
  precio desde el POS; el checkout sigue rechazando items sin precio vigente.
- En rutas `/app/pos*` el shell no renderiza el header global y el sidebar solo
  es accesible mediante un botón hamburguesa flotante que abre un drawer; al
  navegar el drawer se cierra.
- En rutas distintas de `/app/pos*` el layout del shell permanece idéntico
  (header visible y sidebar fijo).
- `POST /sessions/{id}/close` marca la sesión `CLOSED` y calcula
  `expected_cash_amount`, `counted_amount` y `difference`.
- `GET /sessions/{id}/summary` devuelve totales por medio de pago, efectivo
  esperado, diferencia y últimas ventas de la sesión.
- Los totales del POS son la suma de importes de línea, sin IGV.

## INVARIANTS

```yaml
invariants:
  - no se modifica el comportamiento de endpoints existentes de ventas, stock, productos o configuracion
  - warehouse_id sigue siendo un branch ID (A.SPEC 0013)
  - stock es la fuente de verdad de saldos; el POS no escribe saldos directamente
  - el despacho del POS reutiliza sale_out_stock con idempotencia por item de orden
  - confirmar reutiliza la asignación de serie default existente y su incremento atomico
  - los precios del POS son finales y sin IGV; no se agrega calculo de impuestos
  - no hay dependencias ni llamadas a SUNAT/Greenter en el POS
  - la primera version del POS emite BOLETA anonima; no exige RUC
  - crear producto no crea stock; el stock inicial exige movimiento explicito
  - la busqueda POS devuelve precio nullable y no falla por productos sin precio
  - la busqueda POS devuelve peso nullable (weight_kg con fallback default_weight_kg) y no falla por productos sin peso
  - fijar precio desde el POS crea precio UNITARIO persistido, no un precio efimero de linea
  - el checkout sigue exigiendo precio vigente por producto
  - solo /app/pos* usa modo inmersivo (header oculto + sidebar drawer); el resto del shell no cambia
  - el sidebar del POS sigue accesible (hamburguesa) con logout y navegacion
  - un checkout jamás deja orden, pago o stock a medias
  - pos_payments y pos_cash_sessions solo viven en el plugin pos
  - no se tocan secrets ni .env
```

## VERIFICATION

Nota: por decisión del usuario esta A.SPEC **no es test-first**. La verdad se
demuestra con compilación, migración, typecheck y smoke HTTP/DB real. Comandos:

- Compilación de backend:

```bash
PYTHONPATH="$PWD:$PWD/vendor/systutor-core/src" .venv/bin/python -m py_compile \
  plugins/pos/backend/plugin.py \
  plugins/pos/backend/models.py \
  plugins/pos/backend/schemas.py \
  plugins/pos/backend/services/sessions.py \
  plugins/pos/backend/services/checkout.py \
  plugins/pos/backend/services/quick_products.py \
  plugins/pos/backend/services/catalog.py \
  plugins/pos/backend/routers/sessions.py \
  plugins/pos/backend/routers/checkout.py \
  plugins/pos/backend/routers/products.py \
  plugins/pos/migrations/0001_create_pos_tables.py
```

- Activación/migración del plugin `pos` vía API del core (`upgrade_plugin` +
  `enable_plugin`), otorgando los permisos `pos.*` al rol admin. No se usa
  `npm run plugins:migrate` para `pos` porque su `selected_plugins` está
  hardcodeado y `scripts/**` queda fuera de esta superficie:

```bash
# referencia: npm run plugins:migrate no incluye pos
# la migración se ejecutó vía la API de plugins del core y el plugin quedó enabled
```

- Verificación de estructura/estado del plugin:

```sql
select plugin_id, state, is_enabled, migration_version
from plugin_registry
where plugin_id = 'pos';
```

- Typecheck de frontend:

```bash
npm run typecheck
```

- Check de columnas:

```sql
select table_name, column_name
from information_schema.columns
where table_name in ('pos_cash_sessions', 'pos_payments')
order by table_name, column_name;
```

- Smoke HTTP autenticado (backend corriendo con `npm run services`):
  1. `POST /api/v1/plugins/pos/sessions/open` con `opening_amount`.
  2. `GET /api/v1/plugins/pos/products/search?q=...` y verificar `price` (o `null`).
  3. `POST /api/v1/plugins/pos/products/{id}/price` con `{amount}` y reverificar `price`.
  4. `POST /api/v1/plugins/pos/checkout` con dos items y `EFECTIVO`.
  5. Verificar respuesta con orden `DISPATCHED`, `document_full_number` y pago.
  6. `GET /api/v1/plugins/pos/sessions/current` y `/summary`.
  7. `POST /api/v1/plugins/pos/sessions/{id}/close` con `counted_amount`.

- Smoke DB posterior al checkout:
  - `ventas_orders` tiene la orden `BOLETA` `DISPATCHED`;
  - `stk_ledger` tiene `sale_out` por cada item;
  - `pos_payments` tiene el pago esperado.

## ROLLBACK

- Código: revertir el commit del plugin `pos`.
- Migración: `downgrade` de `0001_create_pos_tables.py` elimina las tablas
  `pos_payments` y `pos_cash_sessions` (primero la que tiene FKs).
- Alcance del rollback: se pierden sesiones y pagos POS locales. No se compensa
  dinero ni stock porque las órdenes de venta y los movimientos de stock viven
  en `ventas`/`stock` y no se deshacen con este rollback; si se requiere, se
  compensan con movimientos inversos explícitos.
- El downgrade debe ejecutarse y demostrarse en VERIFICATION antes de marcar
  DoD.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/pos/**
    - apps/web/src/shared/layout/AppLayout.tsx
    - A-SPECS/0023-pos-bodega-module.md
    - A-SPECS/TODO.md
  prohibited:
    - vendor/systutor-core/src/systutor/**
    - services/greenter-adapter/**
    - apps/** except apps/web/src/shared/layout/AppLayout.tsx
    - plugins/ventas/** except runtime import/use of public services
    - plugins/productos/** except runtime import/use of public services
    - plugins/stock/** except runtime import/use of public services
    - plugins/configuracion/**
    - plugins/crm/**
    - plugins/commerce/**
    - docs/pos-bodega-mobile.html
    - secrets
    - .env
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - nuevas tablas pos_cash_sessions y pos_payments
    - nuevos endpoints del plugin pos
    - ordenes de venta BOLETA creadas por el POS
    - movimientos sale_out de stock originados por el POS
    - nuevo frontend mobile en la ruta pos
    - layout inmersivo del shell solo en /app/pos
  indirect:
    - acceso al sidebar/logout desde POS via drawer
    - reportes/ventas que listan ordenes BOLETA creadas por POS
    - saldos de stock reducidos por ventas POS
    - next_number de la serie default BOLETA consumido por POS
  must_not_affect:
    - emision SUNAT/Greenter
    - catalogo y precios de productos existentes
    - semantica de movimientos de stock
    - endpoints y transiciones de estados de ventas
    - series y CRUD de configuracion
    - esquema y servicios de CRM
    - compras/commerce
    - vendor/systutor-core
    - layout del shell en rutas distintas de /app/pos
```

## Composition

```yaml
composition:
  requires_aspecs:
    - A-SPECS/0013-use-branches-as-stock-warehouses.md
    - A-SPECS/0016-configuration-document-series.md
    - A-SPECS/0017-use-document-series-in-sales.md
    - A-SPECS/0020-sales-dispatch-decrements-stock.md
  must_compose_with:
    - ventas services create_order/confirm_order/dispatch_order
    - stock service sale_out_stock y stock.purchase_in o adjust
    - productos services create_product, create_price, create_barcode
    - configuracion series default BOLETA
  systemic_invariants:
    - boleta anonima no requiere RUC
    - warehouse_id es branch id
    - stock y ventas cambian en la misma transaccion
    - precios sin IGV
  composition_checks:
    - plugins:migrate aplica 0001 de pos sobre una BD con ventas/stock/productos migrados
    - typecheck cubre rutas, payloads y respuestas del frontend pos
    - smoke HTTP completa open -> checkout -> summary -> close
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - plugins/pos/backend/services/sessions.py
    - plugins/pos/backend/services/checkout.py
    - plugins/pos/backend/services/quick_products.py
    - plugins/pos/frontend/pages/PosPage.tsx
```

## Traceability

- Requirement: Implementar el mock `docs/pos-bodega-mobile.html` como módulo POS
  nuevo reutilizando ventas, stock, productos y configuracion; precios sin IGV y
  sin emisión SUNAT; no test-first.
- owner: agent
- approver: lucas
- Commit: Pending.
- Deployment: Pending.

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
