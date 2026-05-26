# One Tick Walkthrough

Этот walkthrough показывает один минимальный тик через canonical GoalLab pipeline. Он намеренно использует простой сценарий, близкий к `tests/pipeline/fixtures.ts`, чтобы демонстрировать реальные stage outputs и trace surfaces без выдуманных игровых условий.

## Source of truth

- pipeline runtime: `lib/goal-lab/pipeline/runPipelineV1.ts`
- stage contract: `docs/PIPELINE.md`
- invariants: `docs/INVARIANTS.md`
- test fixture shape: `tests/pipeline/fixtures.ts`
- decision trace surface: `tests/pipeline/decision_snapshot_trace_surface.test.ts`

## Initial state

Минимальный агент:

```text
entityId = A
locationId = loc:demo
pos = (5, 5)
memory.beliefAtoms = []
body.acute.pain = 0
body.acute.fatigue = 0
body.acute.stress = 0
body.reserves.energy = 1
body.regulation.arousal = 0.5
```

Минимальный мир:

```text
tick = 0
location = loc:demo
sceneSnapshot.presetId = scene:demo
eventLog.events = []
participants = [A]
```

Этот shape соответствует минимальному сценарию из `tests/pipeline/fixtures.ts`, который используется в `tests/pipeline/canonical_contract.test.ts`.

## Step invocation

Минимальный вызов выглядит так:

```text
runGoalLabPipelineV1({
  world,
  agentId: "A",
  participantIds: ["A"],
  sceneControl: { enablePredict: true },
  observeLiteParams: { seed: 123 }
})
```

Пайплайн возвращает `GoalLabPipelineV1` с:

- `schemaVersion`
- `systemVersion`
- `step`
- `stages[]`
- `beliefPersist`

## S0 — Canonicalization

Stage title в runtime:

```text
S0 Canonicalization (world/obs/mem/override)
```

Что появляется:

```text
world:*
obs:*
mem:*
rel:*
life:*
```

Что важно по контракту:

- `ctx:*` здесь запрещены;
- placement validation должен быть явно отражён в artifacts;
- belief atoms для feedback loop могут быть подмешаны до downstream stages.

Где смотреть:

- runtime: `lib/goal-lab/pipeline/runPipelineV1.ts`
- contract: `docs/PIPELINE.md`
- invariant: `docs/INVARIANTS.md`
- test anchor: `tests/pipeline/canonical_contract.test.ts`

## S2 — Context axes

Stage title в runtime:

```text
S2 Context axes (base ctx:*)
```

Что появляется:

```text
ctx:<axis>:A
```

Типичные оси:

```text
ctx:danger:A
ctx:uncertainty:A
ctx:control:A
ctx:publicness:A
ctx:normPressure:A
```

Контракт:

- разрешены `ctx:*`;
- `ctx:final:*` ещё не должны появляться;
- trace derived-атомов должен ссылаться на `world:*` и `obs:*`, а не на будущие стадии.

Где смотреть:

- contract: `docs/PIPELINE.md`
- detailed stage spec: `docs/agents/07_PIPELINE_SPEC.md`

## S3 — Character lens

Stage title в runtime:

```text
S3 Lens (subjective ctx/tom overrides)
```

Преобразование:

```text
ctx:<axis>:A -> ctx:final:<axis>:A
```

Смысл:

- `ctx:*` — base context;
- `ctx:final:*` — subjective context after traits/body modulation.

Контракт:

- `ctx:*` не перетирается;
- добавляется override-layer `ctx:final:*`;
- downstream scoring после S3 должен предпочитать `ctx:final:*`.

Trace expectation:

- `trace.usedAtomIds` у `ctx:final:*` должен включать исходные `ctx:*` и связанные `feat:char:*` сигналы, если они участвовали в линзе.

Где смотреть:

- runtime: `lib/context/lens/characterLens.ts`
- docs: `docs/agents/03_CHARACTER_LENS.md`
- tests: `tests/lens/character_lens.test.ts`, `tests/simkit/subjective_context_priority.test.ts`

## S6 — Drivers / priorities

Stage title в runtime:

```text
S6 Drivers (drv:*) / ContextMind / Priorities
```

Что появляется:

```text
drv:safetyNeed:A
drv:controlNeed:A
drv:statusNeed:A
drv:affiliationNeed:A
drv:resolveNeed:A
drv:restNeed:A
drv:curiosityNeed:A
```

Физика стадии:

```text
raw linear -> curve shaping -> cross-inhibition -> temporal accumulation -> surprise feedback -> clamp
```

Что видно в trace.parts driver-атомов:

```text
rawLinear
shaped
inhibition
postInhibition
accumulation
surpriseBoost
```

На минимальном сценарии из тестов можно увидеть, что эти слои реально пишутся в trace, даже если world почти пустой. Это зафиксировано в `tests/pipeline/drivers_physics.test.ts`.

Где смотреть:

- runtime: `lib/drivers/deriveDrivers.ts`
- coefficients: `lib/config/formulaConfig.ts`
- tests: `tests/pipeline/drivers_physics.test.ts`

## S7 — Goals / planning / util projection

Stage title в runtime:

```text
S7 Goals (ecology + planning)
```

Что появляется:

```text
goal:domain:<domain>:A
goal:active:<domain>:A
goal:mode:A
goal:state:<domain>:A
util:*
```

Смысл:

- `goal:*` строятся из `ctx:final:*`, `drv:*` и связанных сигналов;
- `util:*` — единственный canonical bridge от goal-layer к action-layer.

Контракт:

- S7 использует `ctx:final:*`, а не raw `ctx:*`;
- `action:*` дальше не должны читать `goal:*` напрямую;
- util projection обязана быть explainable.

Где смотреть:

- runtime: `lib/goals/goalAtoms.ts`
- docs: `docs/agents/05_GOAL_LAB_MATH.md`
- tests: `tests/goals/derive_goal_atoms.test.ts`, `tests/pipeline/s6_s7_bridge.test.ts`, `tests/decision/goal_isolation.test.ts`

## S8 — Decision / actions

Stage title в runtime:

```text
S8 Decision / actions
```

Что появляется:

```text
action:*
```

И что дополнительно возвращается в artifacts:

- `decisionSnapshot`
- ranked action list
- best action payload
- explainability fields such as `usedAtomIds`, `notes`, `modifiers`, `why`

Контракт:

- decision layer читает `util:*`, access/prior atoms и decision modifiers;
- `goal:*` не должен быть прямым входом для `action:*`;
- action explainability должна оставаться inspectable без чтения UI-кода.

Где смотреть:

- runtime: `lib/decision/*`, `lib/goal-lab/pipeline/runPipelineV1.ts`
- tests: `tests/pipeline/decision_snapshot_trace_surface.test.ts`, `tests/decision/decision_trace_breakdown.test.ts`, `tests/decision/goal_isolation.test.ts`

## Resulting state and persistence

Важно: текущий canonical S8 не делает world update сам по себе. Он возвращает action artifacts и decision payload. Дополнительный S9 lookahead/predict и persistence surfaces существуют отдельно и зависят от режима запуска.

Что фиксируется после тика:

- `pipeline.stages[*].atoms`
- `pipeline.step`
- `pipeline.beliefPersist`
- decision artifacts в финальных stage artifacts

## What to inspect after the run

Если нужно ответить на вопрос «почему выбрано именно это действие», минимальный inspection path такой:

1. Найти stage `S8` в `pipeline.stages`.
2. Открыть `artifacts.decisionSnapshot.best`.
3. Посмотреть `usedAtomIds`, `notes`, `modifiers`, `why`.
4. Если лучший action ссылается на `util:*`, пройти к соответствующим `util:*` атомам.
5. Оттуда пройти к `goal:*` и `ctx:final:*`.
6. Для `ctx:final:*` посмотреть отличие от base `ctx:*`.

## Known limitation of this walkthrough

Этот walkthrough описывает canonical decision tick, но не претендует на покрытие всех mixed surfaces репозитория. SimKit, dilemma runtime, UI projections и legacy layers могут добавлять собственные artifacts вокруг canonical pipeline, однако источником истины для staged decision chain остаётся `lib/goal-lab/pipeline/runPipelineV1.ts`.
