# A.SPEC [0035] — Paginación Reporte de Ventas (Frontend-Only, Máx 3 Páginas)

## WHY

El **Reporte de Ventas** (`SalesReportDialog.tsx`) no tiene paginación nativa en su tabla de órdenes. Actualmente muestra todos los pedidos en una sola tabla, lo que:

1. **Sobrecarga la UI** con grandes volúmenes de datos
2. **Dificulta la navegación** cuando hay muchas órdenes
3. **No es consistente** con otros módulos que usan paginación

**Solución:** Agregar paginación frontend-only con límite de 3 páginas visibles y 10 items por página.

---

## WHAT

### Comportamiento Observable

El reporte de ventas paginado muestra:
- **Máximo 3 páginas** simultáneamente (configurable)
- **10 items por página** (fijo)
- **Controles de navegación:** Anterior / Siguiente
- **Info de página:** "Mostrando X-Y de Z pedidos"
- **Empty state** cuando no hay pedidos en el rango

**Transición:** Tabla sin paginación → Tabla con paginación frontend-only

---

## SCOPE

### Entradas (In Scope)

- ✅ `SalesReportDialog.tsx` — Implementar paginación en la tabla de órdenes
- ✅ Componente `DataTable` — Usar como base para paginación lógica
- ✅ State management — Agregar `currentPage` y `pageSize`
- ✅ Navegación — Botones Anterior/Siguiente
- ✅ Info de página — Mostrar rango actual

### Fuera de Alcance (Out of Scope)

- ❌ Cambios en el backend (`getSalesOrdersReport`)
- ❌ Modificación de la API de reportes
- ❌ Cambios en el query de ventas
- ❌ Paginación en la tabla de productos (solo órdenes)
- ❌ Backend pagination (offset/limit en API)

---

## CONTRACT

### Precondiciones

- ✅ Reporte de ventas ya funciona correctamente
- ✅ `DataTable` del core está disponible
- ✅ Datos del reporte ya se cargan correctamente

### Postcondiciones

- ✅ Tabla de órdenes muestra solo 10 items por página
- ✅ Máximo 3 páginas visibles
- ✅ Navegación funciona correctamente
- ✅ Empty state muestra mensaje con info de página
- ✅ Controles de navegación deshabilitados en límites

---

## INVARIANTS

```yaml
invariants:
  - "El reporte siempre carga todos los pedidos del rango de fechas"
  - "La paginación es frontend-only (no afecta backend)"
  - "Los controles de navegación respetan límites (página 1 y N)"
  - "El empty message incluye info de página total"
  - "El reporte completo sigue siendo accesible (no se filtra por paginación)"
  - "Máximo 3 páginas visibles en todo momento"
  - "10 items por página (fijo, no configurable por usuario)"
```

---

## VERIFICATION

### Comandos de Verificación

```bash
# 1. Build y lint
cd plugins/ventas/frontend
npm run build
npm run lint

# 2. Type check
npx tsc --noEmit

# 3. Test visual (manual)
npm run dev
# - Abrir Reporte de Ventas
# - Verificar que muestra max 3 páginas
# - Verificar que muestra 10 items por página
# - Probar navegación Anterior/Siguiente
# - Verificar empty state con mensaje de página
```

### Checks de Composición

- ✅ No afecta a otros reportes
- ✅ No afecta a la API de ventas
- ✅ No afecta a otros módulos de ventas
- ✅ Paginación aislada en `SalesReportDialog.tsx`

---

## ROLLBACK

Si algo falla, revertir:

```bash
# Opción 1: Git revert (si hay commit)
git revert HEAD

# Opción 2: Restaurar archivo desde backup
git checkout HEAD~1 -- plugins/ventas/frontend/pages/sales/SalesReportDialog.tsx

# Opción 3: Restablecer state (manual)
# Eliminar: currentPage, pageSize, paginatedOrders
# Restaurar: rows={report.orders} directamente
```

---

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/ventas/frontend/pages/sales/SalesReportDialog.tsx
  prohibited:
    - plugins/ventas/backend/*
    - plugins/ventas/frontend/api/*
    - plugins/ventas/frontend/types/*
    - plugins/ventas/frontend/pages/sales/OrdersPanel.tsx
    - plugins/commerce/*
    - plugins/ventas/facturacion/*
```

---

## Blast Radius

```yaml
blast_radius:
  direct:
    - SalesReportDialog.tsx (componente modificado)
  indirect:
    - Reportes de ventas históricos (no afectados)
    - API de reportes (no modificada)
  must_not_affect:
    - Backend de ventas
    - API de reportes
    - Otros reportes (compras, productos)
    - Funcionalidad de generación de reporte
    - Datos del reporte (no se filtran)
```

---

## Composition

```yaml
composition:
  requires_aspecs: []
  must_compose_with: []
  systemic_invariants:
    - "Los reportes no deben modificar el backend"
    - "La paginación frontend-only es preferible para reportes"
  composition_checks:
    - "Reporte sigue cargando todos los datos"
    - "Navegación no afecta datos subyacentes"
```

---

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility (paginación frontend)
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - plugins/ventas/frontend/pages/sales/SalesReportDialog.tsx
```

---

## Traceability

- **Requirement:** Reporte de ventas necesita paginación para manejar grandes volúmenes de datos
- **owner:** system (automated)
- **approver:** developer
- **Commit:** [pendiente]
- **Deployment:** [pendiente]

---

## Definition of Done

- [x] Objective satisfied (paginación implementada)
- [x] Scope respected (solo frontend, solo tabla de órdenes)
- [x] Contract satisfied (10 items, max 3 páginas)
- [x] Independent falsable truth exists (código en repo)
- [x] Invariants preserved (no afecta backend)
- [x] Verification passed (task tool ejecutado)
- [x] Rollback / compensation es honest (git revert disponible)
- [x] Composition checks passed (no afecta otros módulos)
- [ ] No unrelated changes (verificar diff)
- [ ] Structural constraints respected (código limpio)
- [ ] Traceability established (esta A.SPEC)

---

## Notas

- Paginación es **frontend-only** (sin cambios en backend)
- **Máximo 3 páginas** visibles (configurado en `maxVisiblePages`)
- **10 items por página** (fijo en `pageSize`)
- Usado `slice()` para paginación lógica en React
- Componente `DataTable` no tiene paginación nativa, implementada manualmente
