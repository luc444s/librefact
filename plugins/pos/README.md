# POS Bodega

Plugin de caja móvil para bodegas. Orquesta las piezas existentes de
`ventas`, `stock`, `productos` y `configuracion` en un flujo de venta rápida.

Incluye:

- Sesiones de caja (`pos_cash_sessions`): apertura, una sesión `OPEN` por
  tenant/almacén, cierre con monto contado y diferencia.
- Pagos (`pos_payments`): `EFECTIVO`, `YAPE_PLIN`, `TARJETA`.
- Checkout transaccional: crea y confirma la orden `BOLETA`, despacha stock
  (`sale_out`) y registra el pago en una sola transacción.
- Producto rápido: crea producto, precio `UNITARIO`, barcode y stock inicial
  opcional sin salir de la caja.
- Frontend móvil con cuatro pantallas (Venta, Agregar, Producto, Cierre) y el
  modal de cobro.

Decisiones:

- Precios finales sin IGV; no se calcula ni desglosa impuesto.
- Sin emisión SUNAT/Greenter en esta fase; la primera versión emite `BOLETA`
  anónima.
- `stock` es la fuente de verdad de saldos; el POS nunca escribe saldos
  directamente.

Dependencias: `ventas`, `productos`, `stock`, `configuracion`.

Licencia: MIT.
