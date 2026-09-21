# A.SPEC 0037 — Revert productos before router split

> `risk: low` — Reversion limitada al puntero del submodulo `plugins/productos`.

## WHY

El split de `plugins/productos/backend/router.py` introdujo una regresion operacional. Se requiere volver al estado inmediatamente anterior a la division.

## WHAT

`plugins/productos` debe apuntar al commit anterior al split del router, preservando cambios locales no relacionados para recuperacion posterior.
Las migraciones `0011` y `0012` deben permanecer presentes como compatibilidad operacional si la base ya registra version `0012`.

## SCOPE

- Reposicionar el submodulo `plugins/productos` en `9e765b3`.
- Preservar cambios locales existentes en el submodulo antes de mover el puntero.
- Restaurar solo los archivos de migracion `011` y `012` para que el loader encuentre la version actual registrada.

## OUT OF SCOPE

- Reescribir el historial del submodulo.
- Tocar otros submodulos o plugins.
- Resolver cambios funcionales posteriores como SKU/barcode o codigos tributarios.

## CONTRACT

Precondicion: `plugins/productos` contiene el commit `9e765b3` anterior al split y el commit `5a3f199` del split.

Postcondicion: el working tree del repo padre muestra `plugins/productos` apuntando a `9e765b3`, los cambios locales previos quedan preservados en stash del submodulo, y las migraciones hasta `0012` existen en disco.

## INVARIANTS

```yaml
invariants:
  - No modificar archivos de otros plugins.
  - No perder cambios locales no commiteados en plugins/productos.
  - No cambiar la rama activa del repo padre.
```

## VERIFICATION

- `git -C plugins/productos rev-parse --short HEAD` debe devolver `9e765b3`.
- `git diff --submodule=log -- plugins/productos` debe mostrar la transicion desde `5a3f199` hacia `9e765b3` o contenido modificado del submodulo.
- `git -C plugins/productos stash list` debe mostrar el stash de preservacion si habia cambios locales.
- `python3 -m py_compile migrations/011_tax_product_and_unit_codes.py migrations/012_separate_sku_and_barcode.py` debe pasar.

Resultados:

- `git -C plugins/productos rev-parse --short HEAD` -> `9e765b3`.
- `git -C plugins/productos stash list` -> `stash@{0}: On main: preserve productos local changes before reverting router split`.
- `plugins/productos/backend/router.py` vuelve a existir como router monolitico previo al split.
- `plugins/productos/backend/endpoints/*.py` no existe en el commit revertido.
- `migrations/011_tax_product_and_unit_codes.py` y `migrations/012_separate_sku_and_barcode.py` fueron restaurados desde el stash para evitar `current plugin migration version not found: 0012`.
- `python3 -m py_compile migrations/011_tax_product_and_unit_codes.py migrations/012_separate_sku_and_barcode.py` paso sin salida.

## ROLLBACK

Volver el submodulo al commit del split con `git -C plugins/productos checkout 5a3f199` y restaurar el stash si corresponde con `git -C plugins/productos stash apply`.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0037-revert-productos-before-router-split.md
    - plugins/productos
    - plugins/productos/migrations/011_tax_product_and_unit_codes.py
    - plugins/productos/migrations/012_separate_sku_and_barcode.py
  prohibited:
    - apps/web
    - plugins/commerce
    - plugins/crm
    - plugins/stock
    - plugins/ventas
    - systutor-installer
    - vendor
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - plugins/productos
  indirect:
    - producto endpoints cargados por el host
  must_not_affect:
    - otros submodulos
    - estado de rama del repo padre
```

## Composition

```yaml
composition:
  requires_aspecs: []
  must_compose_with: []
  systemic_invariants: []
  composition_checks: []
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: rollback puntual de submodulo
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations: []
```

## Traceability

- Requirement: Usuario pidio regresar productos al momento antes de la division.
- owner: lucas
- approver: lucas
- Commit:
- Deployment:

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Independent falsable truth exists now
- [x] Invariants preserved
- [x] Verification passed
- [x] Rollback / compensation is honest
- [x] Composition checks passed when applicable
- [x] No unrelated changes
- [x] Structural constraints respected
- [ ] Traceability established
