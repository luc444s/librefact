# A.SPEC 0034 — Compact AGENTS orchestrator

> `risk: low`

## WHY

`AGENTS.md` estaba duplicando contenido operativo de ADD y se volvio demasiado grande para su rol de entrada.

## WHAT

`AGENTS.md` queda como orquestador minimo: apunta a las rutas canonicas de ADD y enruta trabajo a A.SPEC/task tools sin repetir la norma.

## SCOPE

- Reducir `AGENTS.md` raiz a un orquestador corto.
- Mantener referencias a norma, resumen, plantilla, task tools y A.SPEC activas.
- Mantener la regla de lanzar task tools con contexto fresco.

## OUT OF SCOPE

- Cambiar la norma ADD.
- Cambiar prompts de task tools.
- Cambiar codigo de aplicacion.

## CONTRACT

- `AGENTS.md` debe tener menos de 30 lineas.
- `AGENTS.md` debe referenciar `ADD/SPECIFICATION.md`, `ADD/README.md`, `ADD/ASPEC-TEMPLATE.md`, `ADD/task-tools/README.md` y `A-SPECS/`.
- `AGENTS.md` debe declarar que los task tools se lanzan via `Task(subagent_type=general)` con el contenido del archivo correspondiente mas input concreto.

## INVARIANTS

```yaml
invariants:
  - La disciplina ADD sigue siendo obligatoria para cambios del repo.
  - La documentacion canonica sigue viviendo bajo ADD/.
  - No se modifica codigo de runtime.
```

## VERIFICATION

- `wc -l AGENTS.md` debe reportar menos de 30 lineas.
- Revision de `AGENTS.md` confirma las rutas canonicas y la regla de subagentes.

## ROLLBACK

Restaurar la version previa de `AGENTS.md` o ampliar el orquestador si una ruta ADD necesaria queda sin referencia.

## Change Surface

```yaml
change_surface:
  allowed:
    - AGENTS.md
    - A-SPECS/0034-compact-agents-orchestrator.md
  prohibited:
    - ADD/**
    - apps/**
    - plugins/**
    - services/**
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - Agent onboarding instructions
  indirect:
    - ADD workflow routing
  must_not_affect:
    - Runtime behavior
    - ADD canonical docs
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
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations: []
```

## Traceability

- Requirement: "necesito hacer que mi angents.md sea simplemente orquestador, esta muy grande"
- owner: Lucas
- approver: Lucas
- Commit:
- Deployment: local repo docs only

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
- [x] Traceability established
