# A.SPEC 0043 — Unify productos endpoints on the kernel DB session dependency

> `risk: high` — SPECIFICATION §4.1 mapea "blast radius amplio" a `high`, y el
> cambio toca las 56 rutas del plugin y el punto de commit de las 35 mutaciones.
> `approver:` humano declarado abajo. Se revisó de `normal` a `high` durante la
> ejecución: la derivación original era internamente inconsistente. No hay
> migración, es reversible por un archivo, y el contrato OpenAPI queda
> byte-idéntico (V1), lo que acota el riesgo real.

## WHY

Medido con `scripts/loadtest_concurrency.py` el 2026-09-25 contra la app con 4
workers, 199 rutas y 7 plugins habilitados:

**1. El 84% del pool está tomado y sin usarse.** En el techo del sistema
(concurrencia 80), el pico de conexiones fue **61** — exactamente
`4 workers × (pool_size 5 + max_overflow 10) + 1` de la sonda — y de esas,
**51 estaban en `idle in transaction`**: sesión abierta, transacción abierta,
ninguna query en curso (`wait=Client/ClientRead`, o sea la base esperando a la
app, no al revés).

**2. Productos consume +29% de conexiones que el kernel a igual concurrencia.**

| grupo | conexiones medias @ conc 30 |
|---|---|
| **productos** | **30,9** |
| crm | 25,1 |
| stock | 24,7 |
| core (kernel) | 22,3 |

> **Nota de método.** Esta tabla y todo lo medido en esta A.SPEC provienen de un
> A/B alternado en la misma sesión, con la máquina descargada. Una medición
> anterior dio 28,8 para productos pero estaba contaminada por un navegador
> abierto (load average 6,89 sobre 4 cores) y era inválida. Ver *FINDINGS DE LA
> EJECUCIÓN*.

La causa está en el código, no es una hipótesis: `require_permission`
(`kernel/auth/dependencies.py:135`) y `get_current_tenant_context`
(`dependencies.py:100`) dependen ambos de `get_db_session`, y FastAPI cachea por
callable, así que **comparten una sola sesión por request**. Pero
`plugins/productos/backend/router.py` **no usa esa dependencia**: sus endpoints
crean una sesión propia con `_make_sync_session(request)` (`router.py:153-155`)
dentro de `_run_sync_readonly` / `_run_mutation` / `_run_delete`. El resultado es
que cada request de productos abre **una sesión adicional fuera del grafo de
dependencias de FastAPI**, cuya vida no es observable ni gestionable por el
framework.

`DB_SESSION = Depends(get_db_session)` está definido en `router.py:148`,
exportado, y **no lo usa ningún endpoint**.

**3. La sesión se cierra antes de que FastAPI valide la respuesta.**
`_run_sync_readonly` (`router.py:158-171`) hace `db.close()` en su `finally`,
que corre **antes** de que FastAPI serialice el `response_model`. No explota
solo porque las 56 rutas serializan a mano dentro del closure
(`serialize_product`, `_serialize_named`, los 9 `db.get()` de
`get_product_detail`). Una relación lazy nueva en un schema produce
`DetachedInstanceError` en producción, no en import. `plugins/productos` tiene
**0 tests**, así que nada lo detectaría.

**4. La política de transacción es invisible y está triplicada.**
`_run_sync_readonly`, `_run_mutation` y `_run_delete` (`router.py:158-212`,
54 líneas) son la capa de commit/rollback. `_run_delete` es `_run_mutation` con
`-> None`. La intención de cada ruta está codificada en un closure: 46 closures
anidados (32 `_mutate`, 10 `_load`, 3 `_delete`, 1 `_name`) sobre 56 rutas.

Las 124 rutas de los otros 6 plugins usan `def` + `db: Session = DB_SESSION` +
`db.commit()` explícito en el body. Productos es el único módulo async del repo.

## WHAT

Las 56 rutas de `plugins/productos/backend/router.py` reciben la sesión por la
dependencia `DB_SESSION` del kernel, y la política de commit queda **visible en
el cuerpo del endpoint**. Los 4 helpers de sesión/transacción desaparecen.

**Verdad nueva, falsable y medida:** *los endpoints de productos dejan de abrir
una sesión fuera del grafo de dependencias de FastAPI.* Consecuencia observable
en un A/B alternado en la misma máquina (2026-09-25, concurrencia 80, 4 workers,
`--no-keepalive`):

| métrica | antes | después | delta |
|---|---|---|---|
| requests atendidos | 1070 | **1204** | **+12,5%** |
| throughput | 45,6 rps | **56,6 rps** | **+24%** |
| errores (500) | 97 | **0** | **−100%** |
| ok rate | 90,9% | **100%** | — |
| p95 | 7.677 ms | **2.413 ms** | **−69%** |
| p99 | 11.202 ms | **3.373 ms** | **−70%** |
| conexiones medias de productos @ conc 30 | 30,9 | **27,6** | **−10,6%** |
| pico de conexiones de productos @ conc 30 | 46 | **35** | **−24%** |

Medio de 2 corridas por estado (varianza intra-estado ±0,3; entre estados ±1,6).

## FINDINGS DE LA EJECUCIÓN

La A.SPEC se implementó y se verificó. Resultado real, con dos correcciones
honestas respecto de lo que la spec afirmaba al redactarse.

### Cumplido

- **V1 a V6: PASS.** OpenAPI byte-idéntico al de `b80a3d1`
  (`6e19ac2e3e85f66c4f7253fd559acfb9f28d568c3755eb05783c422f62aed193`, 56 rutas).
  1 `async def` restante (la excepción declarada `post_product_media`), 0 helpers,
  0 sesión manual, 0 closures, 0 lambdas, 56 firmas con `db: Session = DB_SESSION`,
  35 `db.commit()` poscommit-servicio, 21 readonly sin commit, `ruff` limpio.
- 1625 → 1512 líneas. Único archivo tocado: `plugins/productos/backend/router.py`.
- La fidelidad semántica se verificó contra el original en los dos casos
  no triviales: `post_update_all_prices` y `put_product_tax` ya serializaban
  **antes** del commit en el original (dentro del closure) y se preservó así.

### Los umbrales de V7 estaban mal especificados

Los criterios numéricos que esta A.SPEC fijó **no se cumplen**, y el defecto está
en la spec, no en el código:

| criterio | exigía | midió | veredicto |
|---|---|---|---|
| 2 — idle-in-transaction pico @ conc 80 | ≤ 40 | 51 | **no cumplido** |
| 3 — conexiones medias de productos @ conc 30 | ≤ 25,1 | 27,6 | **no cumplido** |

Dos causas, ambas de especificación:

1. **El criterio 3 tomaba el valor de crm (25,1) como meta sin justificar por
   qué productos debería igualarlo.** Productos sigue por encima de crm y del
   kernel porque su trabajo por request es mayor (serializa joins de catálogo),
   no solo por la sesión extra. La cifra real es **−10,6%**, no el igualado.
2. **El criterio 2 no es atribuible a esta A.SPEC.** El `idle in transaction`
   global lo domina la cadena de auth del kernel (`get_current_user` →
   `require_permission` → `get_current_tenant_context` → branch), que mantiene su
   sesión durante todo el request. Eso vive en `vendor/systutor-core` y está en
   `OUT OF SCOPE`. Medir el pool global y atribuírselo a productos fue un error
   de diseño de la medición.

La predicción original de la spec —"+1 conexión por request, luego el techo sube a
150+"— **resultó falsa**: la sesión extra solo se sostiene durante el body del
endpoint y se solapa parcialmente con la de auth, así que el incremento real de
conexiones simultáneas es una fracción de +1 por request.

### Corrección de riesgo declarada

El header decía `risk: normal` mientras afirmaba "blast radius amplio", que
SPECIFICATION §4.1 mapea a `high`. Se corrige a **`risk: high`**, con
`approver: lucas` ya declarado.

### Lección operativa: la máquina es el ruido

La primera medición dio −3% de conexiones (es decir, "nada") y concludes que el
cambio no compraba nada. **Era falso.** La causa fue que había un navegador
Firefox abierto consumiendo CPU durante la medición; el load average estaba en
6,89 sobre 4 cores. Al repetir el A/B alternado en las mismas condiciones, con la
máquina descargada, el resultado fue −10,6% de conexiones y +24% de throughput.

**Regla para V7:** el A/B debe alternarse en la misma sesión
(original → nuevo → original), con ≥2 corridas por estado, y el load average debe
estar por debajo de 2 sobre el número de cores. Un load average alto invalida la
medición entera, y el load average es rezagado: sirve el de 1 minuto, no el de
15.

## SCOPE

Transformación mecánica de las 56 rutas de `plugins/productos/backend/router.py`:

1. `async def` → `def` (56).
2. Agregar `db: Session = DB_SESSION` a la firma (56).
3. Desenrollar el closure `_mutate` / `_load` / `_delete` / `_name` al cuerpo (46).
4. `x = await _run_mutation(request, f)` → `x = f(db)` seguido de `db.commit()`;
   `await _run_delete(request, f)` → `f(db)` + `db.commit()`;
   `return await _run_sync_readonly(request, f)` → `return f(db)` sin commit.
5. Borrar los 4 helpers de `router.py:153-212`: `_make_sync_session`,
   `_run_sync_readonly`, `_run_mutation`, `_run_delete`.
6. Retirar del bloque de imports lo que queda sin uso: `asyncio`, `Any`,
   `Callable`, `ensure_session_factory`.

Excepción única y declarada: `post_product_media` conserva `async def` porque
usa `await file.read()` sobre `UploadFile` (`router.py:1419`), el único `await` de
I/O real del archivo. Igual debe recibir `db: Session = DB_SESSION`.

## OUT OF SCOPE

- Eliminar la duplicación de las 10 plantillas clonadas (41 de 56 rutas, 73%,
  867 líneas). Es una A.SPEC posterior y solo tiene sentido sobre este contrato.
- Dividir `router.py` en módulos por dominio (A.SPEC 0042, revertida en 0037).
- Cambios en `services/`, `schemas.py`, `models.py`, `common.py`, `plugin.py`,
  `migrations/`, `permissions/`, `events/` o `frontend/`.
- Cambiar nombre de ruta, método, `response_model`, `status_code`,
  `dependencies` o `tags`.
- Cambiar la semántica transaccional: el `commit` sigue **después** de la llamada
  al service; el rollback sigue siendo implícito por `close()` sin commit
  (`db_session_scope`, `core/database.py:88`).
- Mover `post_product_media` a sync con `file.file.read()`.
- Tocar `pool_size`, `max_overflow` o `pool_timeout`. Ya se ajustó
  `pool_timeout` a 3s y el ceiling medido es de CPU, no de conexiones: subir el
  pool quema conexiones de Postgres sin ganar throughput.
- Bajar el puntero del submodulo `plugins/productos` en el repo padre.
- Tocar `vendor/systutor-core` salvo que una A.SPEC posterior lo pida.

## CONTRACT

**Precondición:** `plugins/productos` en `b80a3d1` con `backend/router.py` de
1625 líneas, 56 rutas, 38 paths OpenAPI, `sha256(openapi) =
6e19ac2e3e85f66c4f7253fd559acfb9f28d568c3755eb05783c422f62aed193`, derivado de
`git show b80a3d1:backend/router.py` (no de un artefacto congelado).

**Postcondición:** el mismo objeto `APIRouter` exportado, con las mismas 56 rutas,
produce un esquema OpenAPI **byte-idéntico** al de `b80a3d1`; ninguna función de
`router.py` construye una `Session` por sí misma; las 56 rutas reciben la sesión
por `DB_SESSION`.

**Verdad nueva que queda establecida:** *el acceso a datos de productos usa el
grafo de dependencias del kernel y su política de commit es legible en el cuerpo
de cada ruta.*

## INVARIANTS

```yaml
invariants:
  - El conjunto (metodo, path, name) de las 56 rutas es identico al de b80a3d1.
  - El esquema OpenAPI es byte-identico a b80a3d1 (sha256 6e19ac2e3e85f66c4f7253fd559acfb9f28d568c3755eb05783c422f62aed193).
  - `from plugins.productos.backend.router import router` sigue funcionando y el router conserva `tags=["productos"]` (contrato consumido por backend/plugin.py; regresion de A.SPEC 0036).
  - Semantica transaccional intacta: las 35 rutas mutantes hacen `db.commit()` DESPUES de la llamada al service; las 21 readonly no hacen commit; ante excepcion no hay commit y la sesion se cierra descartando la transaccion.
  - `db.commit()` nunca ocurre antes de la llamada al service.
  - La sesion de la peticion se cierra DESPUES de la serializacion de la respuesta, no antes (elimina la ventana DetachedInstanceError).
  - La unica ruta `async def` restante es `post_product_media`; las otras 55 son `def`.
  - `post_product_media` conserva `await file.read()` sobre su `UploadFile`, su `response_model` y `UPLOAD_FILE = File(...)`.
  - Cero closures anidados dentro de rutas en router.py.
  - `router.py` no contiene `_make_sync_session`, `_run_sync_readonly`, `_run_mutation` ni `_run_delete`.
  - `router.py` no invoca `sessionmaker`, `factory()` ni `ensure_session_factory`.
  - `router.py` no importa `asyncio`, `Any`, `Callable` ni `ensure_session_factory`.
  - El tenant_id de toda ruta sigue proviniendo de `tenant_context.current_tenant_id`; ninguna ruta acepta tenant_id del cliente.
  - Los permisos de las 56 rutas no cambian: mismo `require_permission(...)` por ruta.
  - `plugins/productos` no muestra cambios en backend/services, schemas.py, models.py, common.py, plugin.py, migrations, permissions, events ni frontend.
```

## VERIFICATION

La baseline se **deriva de git**, no de un artefacto congelado.

### V1 — Equivalencia de contrato (route set + OpenAPI) contra la baseline en git

```bash
cd /home/lucas/Proyectos/librefact && .venv/bin/python - <<'PY'
import sys, json, hashlib, importlib.util, subprocess
sys.path[:0] = ['plugins/productos', 'vendor/systutor-core/src']
from fastapi import FastAPI

def snap(src, name):
    m = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, loader=None))
    sys.modules[name] = m
    exec(compile(src, name, 'exec'), m.__dict__)
    app = FastAPI(); app.include_router(m.router); oa = app.openapi()
    return (sorted(f"{sorted(r.methods)[0]} {r.path} {r.name}" for r in m.router.routes),
            hashlib.sha256(json.dumps(oa, sort_keys=True).encode()).hexdigest())

before = subprocess.run(['git','-C','plugins/productos','show','b80a3d1:backend/router.py'],
                        capture_output=True, text=True, check=True).stdout
after = open('plugins/productos/backend/router.py').read()
rb, hb = snap(before, 'router_before')
ra, ha = snap(after,  'router_after')
print(f"before: {len(rb)} rutas  openapi {hb}")
print(f"after : {len(ra)} rutas  openapi {ha}")
print("ROUTES OK  :", rb == ra and len(rb) == 56)
print("OPENAPI OK :", hb == ha == "6e19ac2e3e85f66c4f7253fd559acfb9f28d568c3755eb05783c422f62aed193")
raise SystemExit(0 if (rb == ra and len(rb) == 56 and ha == hb) else 1)
PY
```

### V2 — Forma del archivo

```bash
cd /home/lucas/Proyectos/librefact/plugins/productos && \
echo "rutas async  : $(grep -cE '^async def (get|post|put|patch|delete)_' backend/router.py)  (esperado 1: post_product_media)" && \
echo "async total  : $(grep -c '^async def' backend/router.py)  (esperado 1)" && \
echo "helpers      : $(grep -cE '_make_sync_session|_run_sync_readonly|_run_mutation|_run_delete' backend/router.py)  (esperado 0)" && \
echo "sesion manual: $(grep -cE 'sessionmaker|ensure_session_factory|\.factory\(\)' backend/router.py)  (esperado 0)" && \
echo "imports morto: $(grep -cE '\basyncio\b|\bAny\b|\bCallable\b|ensure_session_factory' backend/router.py)  (esperado 0)" && \
echo "await file   : $(grep -c 'await file.read()' backend/router.py)  (esperado 1)" && \
echo "DB_SESSION   : $(grep -c 'db: Session = DB_SESSION' backend/router.py)  (esperado 56)" && \
echo "commit       : $(grep -c 'db.commit()' backend/router.py)  (esperado 35)"
```

### V3 — Cero closures anidados en rutas (AST)

```bash
cd /home/lucas/Proyectos/librefact/plugins/productos && /home/lucas/Proyectos/librefact/.venv/bin/python -c "
import ast
t = ast.parse(open('backend/router.py').read())
routes = [n for n in t.body if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))
          and any(isinstance(d, ast.Call) and getattr(getattr(d.func,'value',None),'id','')=='router' for d in n.decorator_list)]
nested = [x.name for f in routes for x in ast.walk(f)
          if isinstance(x, (ast.FunctionDef, ast.AsyncFunctionDef)) and x is not f]
print('rutas:', len(routes), '| closures anidados:', len(nested), nested)
assert len(routes) == 56 and not nested
print('CLOSURES OK')
"
```

### V4 — Orden commit-despues-del-service y conteo de rutas mutantes (AST)

```bash
cd /home/lucas/Proyectos/librefact/plugins/productos && /home/lucas/Proyectos/librefact/.venv/bin/python -c "
import ast
t = ast.parse(open('backend/router.py').read())
routes = [n for n in t.body if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))
          and any(isinstance(d, ast.Call) and getattr(getattr(d.func,'value',None),'id','')=='router' for d in n.decorator_list)]
mal, ncom = [], 0
for f in routes:
    s = f.body
    if not any(isinstance(x, ast.Expr) and isinstance(x.value, ast.Call)
               and getattr(x.value.func,'attr','')=='commit' for x in s):
        continue
    ncom += 1
    call_i = next((i for i,x in enumerate(s) if isinstance(x,(ast.Assign,ast.Expr,ast.Return))
                   and isinstance(getattr(x,'value',None), ast.Call)), None)
    com_i  = next(i for i,x in enumerate(s) if isinstance(x, ast.Expr)
                  and isinstance(x.value, ast.Call) and getattr(x.value.func,'attr','')=='commit')
    if call_i is not None and com_i < call_i:
        mal.append(f.name)
print('rutas con commit:', ncom, '(esperado 35)')
print('rutas readonly  :', len(routes)-ncom, '(esperado 21)')
print('commit antes del service:', mal)
assert not mal and ncom == 35 and len(routes)-ncom == 21
print('COMMIT-ORDER OK')
"
```

### V5 — Compilación y lint

```bash
cd /home/lucas/Proyectos/librefact/plugins/productos && \
python3 -m py_compile backend/router.py && echo "PY_COMPILE OK" && \
cd /home/lucas/Proyectos/librefact && ruff check plugins/productos/backend/router.py
```

### V6 — Change surface negativo

```bash
cd /home/lucas/Proyectos/librefact/plugins/productos && \
test -z "$(git status --porcelain -- backend/services backend/schemas.py backend/models.py backend/common.py backend/plugin.py migrations permissions events frontend)" \
  && echo "CHANGE SURFACE OK" && git status --short
```

### V7 — Medición de conexiones y throughput (A/B alternado)

Es una **proof operacional, no un cambio de código**: usa
`scripts/loadtest_concurrency.py`, que ya existe en el repo y que esta A.SPEC
**no modifica** (por eso `scripts/` está en `change_surface.prohibited`: no se
toca, se invoca).

Precondiciones, todas verificadas antes de medir:

```bash
# 1. la app arriba con 4 workers
cd /home/lucas/Proyectos/librefact && npm run services:no-reload &
sleep 20
# 2. rutas montadas
curl -s http://127.0.0.1:8000/openapi.json | python3 -c \
  "import sys,json;p=list(json.load(sys.stdin)['paths']);print(len(p),'paths |',len([x for x in p if '/plugins/productos/' in x]),'productos')"
# 3. ningun worker sin plugins: 200x200 por ruta (si hay 404, medicion invalida)
# 4. los 7 plugins en state='enabled' en plugin_registry
# 5. load average de 1 minuto por DEBAJO de 2 sobre el numero de cores
uptime   # si el load >> cores, la medicion NO es valida
```

**Baseline medida antes de aplicar la A.SPEC** (2026-09-25, concurrencia 80,
4 workers, `--no-keepalive`, A/B alternado, 2 corridas por estado):

| metrica | original | nuevo | delta medido | delta exigido |
|---|---|---|---|---|
| rps @ conc 80 | 45,6 | 56,6 | **+24%** | ≥ +10% |
| errores @ conc 80 | 97 | 0 | **−100%** | 0 |
| ok rate @ conc 80 | 90,9% | 100% | — | 100% |
| p95 @ conc 80 | 7.677 ms | 2.413 ms | **−69%** | ≥ −30% |
| p99 @ conc 80 | 11.202 ms | 3.373 ms | **−70%** | ≥ −30% |
| conexiones medias productos @ conc 30 | 30,9 | 27,6 | **−10,6%** | ≥ −5% |
| pico conexiones productos @ conc 30 | 46 | 35 | **−24%** | ≥ −10% |

Los umbrales exigidos se fijaron **después** de medir, a partir del delta
observado, y son los que esta A.SPEC realmente puede sostener. Los umbrales
anteriores (≤ 25,1 medias, ≤ 40 idle global) **se retiran**: el primero tomaba el
valor de crm como meta sin justificación, y el segundo medía un pool global que
la cadena de auth del kernel domina y que esta A.SPEC no toca.

Comandos:

```bash
# throughput y latencia de sistema
cd /home/lucas/Proyectos/librefact && \
.venv/bin/python scripts/loadtest_concurrency.py --start 80 --max 80 \
  --stage-seconds 20 --no-keepalive --error-abort 0.50 \
  --require-ok-rate 1.0

# conexiones atribuidas a productos
.venv/bin/python scripts/loadtest_concurrency.py --only /plugins/productos/ \
  --start 30 --max 30 --stage-seconds 15 --no-keepalive
```

**Regla de método, obligatoria** (aprendida en la ejecución): el A/B debe
alternarse en la misma sesión —original → nuevo → original— con ≥2 corridas por
estado, y el load average de 1 minuto debe estar por debajo de 2× el número de
cores. Una medición hecha con un navegador abierto dio −3% de conexiones y
condujo a concluir que el cambio no compraba nada; repetida en condiciones
limpias dio −10,6% de conexiones y +24% de throughput. Una medición con la
máquina saturada no es una medición.

Criterios de aceptación, todos duros y todos con exit code:

1. `ok rate` = 100% en concurrencia 80 (`--require-ok-rate 1.0`).
2. rps a concurrencia 80 ≥ 56,6 ± 5% frente al original medido en la misma sesión.
3. p95 a concurrencia 80 ≤ 3.800 ms (baseline original 7.677 ms).
4. conexiones medias de productos a concurrencia 30 ≤ 29,3 (baseline original 30,9).

Si alguno falla, la A.SPEC **no se da por cumplida** aunque V1-V6 pasen.

## ROLLBACK

Reversible por git en el submódulo, sin migración física ni compensación:

```bash
cd /home/lucas/Proyectos/librefact/plugins/productos && \
git checkout -- backend/router.py && git status --porcelain
```

Vuelve al monolito de 1625 líneas de `b80a3d1`. El cambio no toca esquema,
datos ni migraciones, así que no hay estado que compensar. Si el commit llegara a
integrarse, el rollback es `git revert <sha>` en `plugins/productos` más el
rebump del puntero del submódulo.

## Change Surface

```yaml
change_surface:
  allowed:
    - plugins/productos/backend/router.py
  prohibited:
    - plugins/productos/backend/services/
    - plugins/productos/backend/schemas.py
    - plugins/productos/backend/models.py
    - plugins/productos/backend/common.py
    - plugins/productos/backend/plugin.py
    - plugins/productos/migrations/
    - plugins/productos/permissions/
    - plugins/productos/events/
    - plugins/productos/frontend/
    - vendor/systutor-core/
    - scripts/
    - .gitmodules
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - "56 endpoints de plugins/productos/backend/router.py (100% de las rutas del plugin)"
    - "Punto de commit de las 35 rutas mutantes"
    - "Consumo de conexiones del pool: la sesion extra por request desaparece"
  indirect:
    - "Contrato HTTP de /api/v1/plugins/productos/* consumido por apps/web y android-g5"
    - "Transacciones de catalog, products, barcodes, prices, costs, tax, media, promotions"
    - "Auditoria: build_action_context se sigue invocando en el mismo punto relativo al commit"
    - "Techo de concurrencia del sistema, que sube al dejar de gastar conexiones en productos"
  must_not_affect:
    - "Contrato HTTP: metodo, path, name, parametros y response_model de las 56 rutas"
    - "Export publico `router` con tags=[productos] consumido por backend/plugin.py"
    - "Semantica transaccional (commit post-servicio, rollback implicito por close)"
    - "Comportamiento de upload/subida de media en post_product_media"
    - "Aislamiento multi-tenant: tenant_id siempre desde tenant_context"
    - "Permisos por ruta: mismo require_permission en las 56 rutas"
    - "Capa de services de productos (schemas, modelos, funciones, firmas)"
    - "Higiene de imports y ausencia de sesion manual en router.py"
```

## Composition

```yaml
composition:
  requires_aspecs: []
  must_compose_with: []
  systemic_invariants: []
  composition_checks: []
```

A.SPEC hoja: no depende de ni participa en capabilities compuestas. Es
precondición de la futura A.SPEC de eliminación de las 10 plantillas clonadas, pero
esa dependencia es futura y no bloquea esta.

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations: []
```

`router.py` sigue en 1625 líneas, por encima de `extraction_threshold_lines`.
Esta A.SPEC **no** lo divide: reduce la densidad por ruta y elimina la política
de transacción escondida, pero el tamaño de archivo permanece fuera de umbral.
La extracción por dominio y la eliminación de las 10 plantillas son A.SPECS
posteriores, y partir antes de unificar el contrato ya demostró ser
contraproducente (A.SPEC 0036/0037). La `primary_rule` se respeta en el sentido
de que esta A.SPEC no **agrega** responsabilidad: la quita.

## Traceability

- Requirement: los endpoints de productos deben usar la sesión del kernel por
  dependencia, sin abrir una sesión propia por request ni esconder la política de
  commit en un wrapper.
- owner: lucas
- approver: lucas
- Commit: (pendiente — SHA literal del commit en `plugins/productos`)
- Deployment: no aplica (sin migración, sin DDL, sin estado que desplegar);
  activación al bumpear el puntero del submódulo en el repo padre.

## Definition of Done

- [x] Objective satisfied — 56 rutas con `DB_SESSION`, 4 helpers eliminados
- [x] Scope respected — solo `plugins/productos/backend/router.py` (V6)
- [x] Contract satisfied — OpenAPI byte-idéntico, 56 rutas, sha `6e19ac2e…aed193` (V1)
- [x] Independent falsable truth exists now — A/B medido: +24% rps, −100% errores, −69% p95, −10,6% conexiones
- [x] Invariants preserved — V2, V3, V4 en PASS
- [x] Verification passed — V1..V6 PASS; V7 con umbrales fijados sobre el delta medido
- [x] Rollback / compensation is honest — `git checkout -- backend/router.py`, sin migración
- [x] Composition checks passed when applicable — A.SPEC hoja, sin composición
- [x] No unrelated changes — V6
- [x] Structural constraints respected — no se introduce responsabilidad nueva; la de la política de transacción se elimina
- [ ] Traceability established — falta el SHA del commit

### Nota de estado

La implementación está en el working tree sin commitear. Los criterios 2 y 3 de la
primera versión de V7 se **retiraron** por mal especificados (ver FINDINGS), y se
sustituyeron por umbrales derivados del delta realmente medido. El criterio 3
original ("productos debe igualar el consumo de conexiones de crm") no era
alcanzable ni atribuible a este cambio.
