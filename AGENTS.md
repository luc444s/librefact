# AGENTS.md — librefact

Orquestador minimo para enviar todo trabajo al workflow ADD.

## Regla principal

Todo cambio del repo se ejecuta mediante ADD: una intencion -> una A.SPEC -> una implementacion verificada.

## Rutas canonicas

- Norma ADD: `ADD/SPECIFICATION.md`
- Resumen operativo: `ADD/README.md`
- Plantilla A.SPEC: `ADD/ASPEC-TEMPLATE.md`
- Task tools: `ADD/task-tools/README.md`
- A.SPEC activas: `A-SPECS/`

## Enrutamiento

1. Si el pedido cambia codigo, contrato, docs operativas o configuracion: crear/usar una A.SPEC en `A-SPECS/`.
2. Si la A.SPEC requiere revision: lanzar `ADD/task-tools/SPEC-REVIEWER.md`.
3. Para implementar una A.SPEC: lanzar `ADD/task-tools/GENERATOR.md` con contexto fresco.
4. Para verificar contrato e invariantes: lanzar `ADD/task-tools/VERIFIER.md`.
5. Para trazabilidad o integracion: usar `ADD/task-tools/TRACE.md` y las skills ADD correspondientes.
6. Si aparece contradiccion sistemica: usar `ADD/task-tools/JUDGE.md`.

## Regla de subagentes

Cada task tool se lanza con `Task(subagent_type=general)` y prompt igual al contenido del archivo correspondiente mas el input concreto. El hilo principal integra resultados; no reenvia historial conversacional.
