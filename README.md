# Kanonar

Kanonar — исследовательская лаборатория детерминированной агентной симуляции и explainable decision pipelines. Проект описывает staged runtime: от входных сущностей и контекстных атомов до драйверов, целей, утилит, действий, trace и сравнений симуляционных сценариев.

Kanonar не является психологической, клинической, диагностической или поведенчески предсказательной моделью реальных людей. Метрики вроде `trust`, `fear`, `stress`, `dominance`, `affiliationNeed`, `controlNeed` — внутренние simulation scalars.

## Что моделирует проект

- `GoalLab` pipeline: `world/obs/mem/rel/life -> ctx:* -> ctx:final:* -> drv:* -> goal:* -> util:* -> action:*`.
- `SimKit` runtime: запуск и сравнение детерминированных сценариев.
- `Dilemma/conflict` surfaces: экспериментальные игровые и конфликтные протоколы.
- Explainability: `trace.usedAtomIds`, stage snapshots, decision artifacts, graph attribution.
- Metric system: входные параметры, features, context axes, ToM, latents, v4.2, derived metrics, drivers/goals/utilities.

## Читать как книгу

Главный вход в документацию:

1. `docs/MATH_INDEX.md` — единый корешок книги: идея, runtime, модельные слои, статусы canonical/reference/legacy.
2. `docs/ENTITY_AND_METRIC_INDEX.md` — энциклопедия сущностей и метрик: смысл, диапазоны, source paths, формулы или статус raw/input.
3. `docs/WALKTHROUGH_ONE_TICK.md` — один минимальный тик через pipeline.
4. `docs/DOCUMENTATION_STANDARD.md` — правила, как поддерживать документацию дальше.
5. `docs/docs_conceptual/KANONAR_PHASE_I_IMPL_PLAN.md` — реализованные Phase-I
   механики, их формулы, runtime-профиль и результаты проверок.

Глубокие главы книги живут в `docs/agents/*`. Repo/control-plane reference живёт в `docs/unified/*`. UI/visualization reference живёт в `docs/VISUALIZATION.md`. Experimental external-data layer: `docs/BEHAVIOR_LAB.md`.

## Canonical runtime

- Pipeline: `lib/goal-lab/pipeline/runPipelineV1.ts`
- Atom/trace types: `lib/context/v2/types.ts`
- Formula config: `lib/config/formulaConfig.ts`
- SimKit config: `lib/config/formulaConfigSim.ts`
- Metric inventory: `docs/ENTITY_AND_METRIC_INDEX.md`
- Pipeline contract: `docs/PIPELINE.md`
- Invariants: `docs/INVARIANTS.md`
- Axis validation registry: `docs/axis_validation_registry.yaml`
- External data validation summary: `docs/EXTERNAL_DATA_VALIDATION_SUMMARY.md`

## Quick start

```bash
npm i
npm run dev
npm run typecheck
npm test
npm run build
```

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Variables such as trust, fear,
stress, resentment, affiliation need, or control need are internal simulation
scalars. They are not clinical, psychometric, or experimentally calibrated
measurements.

The system is useful for deterministic simulation, explainable decision
pipelines, sensitivity analysis, comparing rule systems, and prototyping agent
dynamics.

The system must not be presented as a validated psychological, diagnostic, or
real-world behavioral prediction model without external validation.
