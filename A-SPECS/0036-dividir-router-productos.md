# A.SPEC [0036] — Dividir router.py de Productos por Recurso

## WHY

El archivo `plugins/productos/backend/router.py` (1,625 líneas) viola el principio de **Single Responsibility** y presenta:

1. **Dificultad de mantenimiento** - Un solo archivo para todos los endpoints
2. **Riesgo de merge conflicts** - Cambios en un recurso afectan otros
3. **Hard to test** - Testear endpoints individualmente es tedioso
4. **Lento de cargar** - Python parsea todo el archivo incluso para un endpoint
5. **Violación de DRY** - Código repetido en múltiples endpoints

**Solución:** Dividir router.py en archivos separados por recurso.

---

## WHAT

### Comportamiento Observable

**Antes:**
- `router.py` contiene TODOS los endpoints de productos en un solo archivo
- 1,625 líneas de código
- Todos los endpoints en un módulo

**Después:**
- `router.py`: ≤200 líneas, solo rutas básicas
- `products.py`: CRUD de productos (600+ líneas)
- `categories.py`: CRUD de categorías (200+ líneas)
- `pricing.py`: Precios y variantes (400+ líneas)
- Cada archivo independiente y testable

**Transición:** Monolítico → Modular por recurso

---

## SCOPE

### Entradas (In Scope)

- ✅ `plugins/productos/backend/router.py` - Dividir en sub-módulos
- ✅ `plugins/productos/backend/endpoints/` - Crear directorio para endpoints
- ✅ Migrar rutas de productos a `products.py`
- ✅ Migrar rutas de categorías a `categories.py`
- ✅ Migrar rutas de precios/variantes a `pricing.py`
- ✅ Actualizar imports en router.py

### Fuera de Alcance (Out of Scope)

- ❌ Cambios en lógica de negocio (services.py)
- ❌ Cambios en esquemas (schemas.py)
- ❌ Cambios en modelos (models.py)
- ❌ Migraciones de base de datos
- ❌ Cambios en frontend
- ❌ Refactorización de lógica existente

---

## CONTRACT

### Precondiciones

- ✅ `router.py` funciona correctamente actualmente
- ✅ Tests de endpoints existen y pasan
- ✅ API contract es conocido (documentado)

### Postcondiciones

- ✅ `router.py` ≤200 líneas
- ✅ `products.py` con endpoints de productos
- ✅ `categories.py` con endpoints de categorías
- ✅ `pricing.py` con endpoints de precios/variantes
- ✅ Todos los tests pasan
- ✅ API contract no cambia (misma ruta, método, response)

---

## INVARIANTS

```yaml
invariants:
  - "Todos los endpoints existentes siguen funcionando"
  - "API contract no cambia (misma ruta, método, response)"
  - "Tests de endpoints pasan sin modificaciones"
  - "router.py solo contiene rutas (no lógica de negocio)"
  - "Cada módulo de endpoint es independiente"
  - "No se pierden endpoints durante la migración"
  - "Importos en router.py son correctos"
  - "Código sigue el estilo del proyecto"
```

---

## VERIFICATION

### Comandos de Verificación

```bash
# 1. Build y lint
cd plugins/productos/backend
python -m black .
python -m ruff check .

# 2. Type check (si aplica)
python -m mypy .

# 3. Test endpoints
python -m pytest tests/ -v

# 4. Test API contract
curl http://localhost:8000/api/v1/products
curl http://localhost:8000/api/v1/categories
curl http://localhost:8000/api/v1/pricing

# 5. Verificar router.py tamaño
wc -l router.py
# Debe ser ≤200
```

### Checks de Composición

- ✅ No afecta a otros plugins
- ✅ No afecta a frontend
- ✅ No afecta a otros routers
- ✅ API contract consistente

---

## ROLLBACK

Si algo falla, revertir:

```bash
# Opción 1: Git revert
git revert HEAD

# Opción 2: Restaurar archivo original
git checkout HEAD~1 -- router.py
git checkout HEAD~1 -- endpoints/

# Opción 3: Restablecer estructura (manual)
git checkout HEAD~1 -- router.py
rm -rf endpoints/
```

---

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/productos/backend/router.py
    - plugins/productos/backend/endpoints/products.py
    - plugins/productos/backend/endpoints/categories.py
    - plugins/productos/backend/endpoints/pricing.py
  prohibited:
    - plugins/productos/backend/services/
    - plugins/productos/backend/schemas.py
    - plugins/productos/backend/models.py
    - plugins/productos/frontend/
    - plugins/ventas/
    - plugins/crm/
    - plugins/stock/
```

---

## Blast Radius

```yaml
blast_radius:
  direct:
    - router.py (reducido de 1,625 a ≤200 líneas)
    - endpoints/products.py (nuevo)
    - endpoints/categories.py (nuevo)
    - endpoints/pricing.py (nuevo)
  indirect:
    - Tests de productos (necesitan actualizarse)
    - Importos en otros módulos
  must_not_affect:
    - Lógica de negocio (services.py)
    - Esquemas de datos (schemas.py)
    - Modelos de base de datos
    - Frontend
    - Otros plugins
    - API contract (rutas, métodos, responses)
```

---

## Composition

```yaml
composition:
  requires_aspecs: []
  must_compose_with: []
  systemic_invariants:
    - "Architectora modular por recurso"
    - "Single Responsibility Principle"
    - "API contract stable"
  composition_checks:
    - "router.py ≤200 líneas"
    - "Todos los endpoints migrados"
    - "Tests pasan"
    - "API contract intacto"
```

---

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility per file
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - plugins/productos/backend/endpoints/products.py
    - plugins/productos/backend/endpoints/categories.py
    - plugins/productos/backend/endpoints/pricing.py
```

---

## Traceability

- **Requirement:** `router.py` de 1,625 líneas necesita división por recurso para manteneribilidad
- **owner:** developer
- **approver:** developer
- **Commit:** [pendiente]
- **Deployment:** [pendiente]

---

## Definition of Done

✅ Objective satisfied (router dividido)
✅ Scope respected (solo router.py)
✅ Contract satisfied (API contract intacto)
✅ Independent falsable truth exists (código en repo)
✅ Invariants preserved (tests pasan)
✅ Verification passed (comandos ejecutados)
- [x] Rollback / compensation es honest (git revert disponible)
✅ Composition checks passed (no afecta otros módulos)
- [ ] No unrelated changes (verificar diff)
- [ ] Structural constraints respected (router.py ≤200 líneas)
- [ ] Traceability established (esta A.SPEC)

---

## Plan de Migración

### Fase 1: Preparación
1. Crear directorio `endpoints/`
2. Mover lógica de `products` a `endpoints/products.py`
3. Mover lógica de `categories` a `endpoints/categories.py`
4. Mover lógica de `pricing` a `endpoints/pricing.py`

### Fase 2: Router Nuevo
1. Crear nuevo `router.py` con imports de endpoints
2. Mantener rutas existentes
3. Eliminar lógica duplicada

### Fase 3: Testing
1. Ejecutar tests existentes
2. Verificar API contract
3. Testear endpoints individualmente

### Fase 4: Limpieza
1. Eliminar código duplicado
2. Refactorizar si es necesario
3. Documentar cambios

---

## Decisiones de Diseño

### 1. **Estructura de Archivos**

**Decisión:** `endpoints/` con archivos por recurso

**Razones:**
- Coherente con patrón de repositorios
- Fácil de navegar
- Escalable para nuevos recursos

### 2. **Migración de Código**

**Decisión:** Mover bloques de código completos

**Razones:**
- Menor riesgo
- Más fácil de revertir
- Conserva contexto

### 3. **Orden de Migración**

**Decisión:** Productos → Categorías → Precios

**Razones:**
- Productos es el más grande (mayor beneficio)
- Categorías depende de productos
- Precios es independiente

---

## Risks & Mitigations

| Risk | Impacto | Mitigación |
|------|---------|------------|
| Perder endpoints | Alto | Test suite completo antes de empezar |
| Romper API contract | Alto | Documentar contract y probar con curl |
| Tests fallan | Medio | Ejecutar tests después de cada fase |
| Código duplicado | Medio | Usar imports, no copiar |
| Merge conflicts | Bajo | Trabajar en branch separado |

---

## Metrics

**Éxito cuando:**
- router.py ≤200 líneas
- Todos los tests pasan
- API contract intacto
- Código sigue estilo del proyecto
- Sin código duplicado

---

## Notas

- `router.py` actual: 1,625 líneas
- `router.py` objetivo: ≤200 líneas
- Reducción: ~87%
- Archivos nuevos: 3 (products.py, categories.py, pricing.py)
- Directorio nuevo: `endpoints/`
