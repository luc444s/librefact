# ASPEC-2026-09-21-PAGINACION-VENTAS

## Objetivo

Unificar la paginación en **órdenes de venta, órdenes de compra, cotizaciones y emisiones SUNAT** usando el componente `PaginatedDataTable` del core, eliminando la lógica manual de paginación dispersa.

---

## Alcance

### Módulos Afectados

| Módulo | Ruta | Componente |
|--------|------|------------|
| Órdenes de Venta | `plugins/ventas/frontend/pages/sales/OrdersPanel.tsx` | `OrdersPanel` |
| Órdenes de Compra | `plugins/commerce/purchase/frontend/pages/purchase/OrdersPanel.tsx` | `OrdersPanel` |
| Cotizaciones | `plugins/ventas/frontend/pages/CotizacionesPage.tsx` | `CotizacionesPage` |
| Emisiones SUNAT | `plugins/ventas/facturacion/frontend/pages/EmisionesPage.tsx` | `EmisionesPage` |

---

## Especificaciones Técnicas

### 1. Backend - Cotizaciones (Nuevo)

**Archivo:** `plugins/ventas/cotizacion/frontend/types.ts`

```typescript
export type QuoteDraftPage = {
  items: QuoteDraftListItem[];
  total: number;
  limit: number;
  offset: number;
};
```

**Archivo:** `plugins/ventas/cotizacion/frontend/api.ts`

```typescript
import type { QuoteDraftPage, QuoteDraftListItem, QuoteItemPayload, QuoteCreatePayload } from "./types";

export function listCotizaciones(params: Record<string, unknown> = {}) {
  return apiRequest<QuoteDraftPage>(`${BASE}/cotizaciones${buildQuery(params)}`);
}
```

**Cambios requeridos en backend** (Python/FastAPI):
- Endpoint: `GET /api/v1/plugins/ventas/cotizaciones`
- Query params: `limit` (default: 20), `offset` (default: 0), `status` (filter)
- Response: `QuoteDraftPage` con paginación

---

### 2. Frontend - Unificación de Paginación

**Patrón común para todos los módulos:**

#### Antes (Manual - Eliminar)

```typescript
const [page, setPage] = useState(1);
const ordersQuery = useQuery({
  queryKey: ["ventas", "orders", { status, page }],
  queryFn: () => listOrders({ status, limit: 20, offset: (page - 1) * 20 }),
});

// ... lógica manual de paginación ...
const totalPages = Math.ceil(total / 20);

{totalPages > 1 ? (
  <div className="flex justify-center gap-2">
    <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
      Anterior
    </Button>
    <span className="px-3 py-2 text-sm">{page} / {totalPages}</span>
    <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
      Siguiente
    </Button>
  </div>
) : null}
```

#### Después (Unificado - Reemplazar)

```typescript
import { PaginatedDataTable } from "@systutor/shell/ui/paginated-data-table";

const ordersQuery = useQuery({
  queryKey: ["ventas", "orders", { status }], // sin page
  queryFn: () => listOrders({ status, limit: 20, offset: 0 }), // offset manejado por componente
});

// Reemplazar DataTable manual por:
<PaginatedDataTable
  columns={columns}
  rows={ordersQuery.data?.items ?? []}
  rowKey={(row) => row.id}
  emptyMessage="No hay registros."
  pageSize={20}
  onRowClick={onOrderClick}
/>
```

---

### 3. Componentes a Modificar

#### **Órdenes de Venta** (`plugins/ventas/frontend/pages/sales/OrdersPanel.tsx`)

**Cambios:**
- Importar `PaginatedDataTable`
- Eliminar `useState(page)`, `totalPages`, código de paginación manual
- Actualizar `queryKey` para no incluir `page`
- Reemplazar `DataTable` + paginación manual con `PaginatedDataTable`

**Líneas a eliminar:** 47-50, 81-83, 143-145, 310-321

**Líneas a reemplazar:** 292-307 (DataTable) + 310-321 (paginación)

#### **Órdenes de Compra** (`plugins/commerce/purchase/frontend/pages/purchase/OrdersPanel.tsx`)

**Cambios:**
- Importar `PaginatedDataTable`
- Eliminar `useState(page)`, `totalPages`, código de paginación manual
- Actualizar `queryKey` para no incluir `page`
- Reemplazar `DataTable` + paginación manual con `PaginatedDataTable`

**Líneas a eliminar:** 49-50, 67-70, 143-145, 191-197

**Líneas a reemplazar:** 180-188 (DataTable) + 191-197 (paginación)

#### **Emisiones SUNAT** (`plugins/ventas/facturacion/frontend/pages/EmisionesPage.tsx`)

**Cambios:**
- Importar `PaginatedDataTable`
- Eliminar `useState(page)`, `totalPages`, código de paginación manual
- Actualizar `queryKey` para no incluir `page`
- Reemplazar `DataTable` + paginación manual con `PaginatedDataTable`

**Líneas a eliminar:** 31-32, 34-47, 58-74, 101-111

**Líneas a reemplazar:** 76-99 (DataTable) + 101-111 (paginación)

#### **Cotizaciones** (`plugins/ventas/frontend/pages/CotizacionesPage.tsx`)

**Cambios:**
- Importar `PaginatedDataTable`
- Actualizar tipo de respuesta de `listCotizaciones`
- Eliminar `quotesQuery.data?.items ?? []` y usar directamente
- Reemplazar `DataTable` con `PaginatedDataTable`

**Líneas a modificar:** 35-38 (query), 86 (data), 173-178 (DataTable)

---

### 4. Componente `PaginatedDataTable` (Core)

**Ubicación:** `vendor/systutor-shell/src/ui/paginated-data-table.tsx`

**Props:**
```typescript
type PaginatedDataTableProps<Row> = {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyMessage: string;
  pageSize?: number;      // default: 10
  dense?: boolean;
  onRowClick?: (row: Row) => void;
  label?: string;          // default: "registros"
};
```

**Comportamiento:**
- Paginación automática con `pageSize` configurable
- Componente `Pagination` integrado
- Cálculo de `totalPages` interno
- Manejo de límites de página (no permitir ir más allá)

---

## Decisiones de Diseño

### 1. **Backend vs Frontend Pagination**

**Decisión:** Backend pagination (offset-based)

**Razones:**
- Evita cargar datos innecesarios
- Consistente con APIs existentes (`SalesOrderPage`, `PurchaseOrderPage`)
- Mejor rendimiento para datasets grandes
- Compatible con filtros (status, docType, etc.)

### 2. **PageSize Fijo vs Dinámico**

**Decisión:** `pageSize={20}` fijo

**Razones:**
- Consistencia entre módulos
- Balance entre rendimiento y UX
- Fácil de mantener
- Puede ser configurable en el futuro vía props

### 3. **Query Key Optimization**

**Decisión:** Eliminar `page` del query key

**Razones:**
- React Query cachea por query key
- Evita recargar al cambiar de página
- `page` manejado por componente, no por backend query

### 4. **Component Selection**

**Decisión:** Usar `PaginatedDataTable` en lugar de `DataTable` + `Pagination`

**Razones:**
- Single source of truth
- Código DRY (no repetir lógica de paginación)
- Mantenimiento centralizado
- Consistencia visual

---

## Migration Plan

### Fase 1: Backend (Cotizaciones)
- [ ] Crear tipo `QuoteDraftPage` en `types.ts`
- [ ] Actualizar `listCotizaciones()` para retornar `QuoteDraftPage`
- [ ] Modificar backend endpoint para soportar `limit`/`offset`
- [ ] Testear API con curl/Postman

### Fase 2: Frontend (Cotizaciones)
- [ ] Importar `PaginatedDataTable`
- [ ] Actualizar query para no incluir `page`
- [ ] Reemplazar `DataTable` con `PaginatedDataTable`
- [ ] Eliminar código de paginación manual
- [ ] Testear en navegador

### Fase 3: Frontend (Órdenes de Venta)
- [ ] Importar `PaginatedDataTable`
- [ ] Eliminar `useState(page)`, `totalPages`
- [ ] Actualizar query key
- [ ] Reemplazar `DataTable` + paginación manual
- [ ] Testear en navegador

### Fase 4: Frontend (Órdenes de Compra)
- [ ] Mismo patrón que Órdenes de Venta
- [ ] Testear en navegador

### Fase 5: Frontend (Emisiones SUNAT)
- [ ] Mismo patrón que Órdenes de Venta
- [ ] Testear en navegador

### Fase 6: Validación
- [ ] Verificar paginación en todos los módulos
- [ ] Testear filtros combinados con paginación
- [ ] Validar UX (navegación, empty state, etc.)
- [ ] Lint/TypeCheck

---

## Risks & Mitigations

| Risk | Impacto | Mitigación |
|------|---------|------------|
| Backend endpoint sin paginación | Alto | Crear endpoint separado o modificar existente |
| Query key conflicts | Medio | Validar query keys antes de modificar |
| Datos truncados en filtros | Bajo | Asegurar backend retorna `total` correcto |
| Breaking changes | Medio | Versionar API (`/api/v1/`) |

---

## Testing Checklist

- [ ] Paginación básica (primera, última, anterior, siguiente)
- [ ] Paginación con filtros (status, docType)
- [ ] Empty state (sin registros)
- [ ] Single page (≤ pageSize registros)
- [ ] Multi-page (> pageSize registros)
- [ ] Navegación entre páginas mantiene filtros
- [ ] Cambio de filtro resetea a página 1
- [ ] React Query cache funciona correctamente
- [ ] Invalidation después de mutations

---

## Rollback Plan

Si algo falla, revertir cambios:

1. **Frontend:** Restaurar `useState(page)`, paginación manual
2. **Backend:** Restaurar respuesta sin paginación (`QuoteDraftListItem[]`)
3. **Git:** `git revert <commit>` o branches de feature

---

## Dependencies

- ✅ `@systutor/shell/ui/paginated-data-table.tsx` (core)
- ✅ `@systutor/shell/ui/pagination.tsx` (core)
- ⏳ Backend endpoints con paginación (Cotizaciones)

---

## Metrics

**Éxito cuando:**
- 100% de módulos usan `PaginatedDataTable`
- Cero código de paginación manual en frontend
- Backend retorna paginación consistente
- UX consistente entre módulos
- Tiempo de carga reducido (solo datos visibles)

---

## Notas

- El componente `PaginatedDataTable` ya existe en core y funciona
- Solo falta unificar la implementación en los 4 módulos
- El backend de cotizaciones necesita ser modificado
- Los otros 3 módulos solo requieren cambios frontend
