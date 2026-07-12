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

## Appendix: reproducible Legacy vs Phase I run

Один тик недостаточен для всей коммуникационной цепочки: речь применяется в
тик `t`, принимается trust gate и попадает в GoalLab адресата в `t+1`. Поэтому
smoke-проверка профиля использует два тика, а memory trajectory — семь и более.

### Initial state

```text
seed = 3
agents = A, B
location = private MVP-0 room
object token holder = B
tick 0 event = threaten(A -> B, magnitude=0.7, confidence=0.9)
```

Одинаковые мир/seed/event запускаются дважды. Единственное различие:

```text
legacy: world.facts['sim:runtimeProfile'] = 'legacy'
phase1: world.facts['sim:runtimeProfile'] = 'phase1'
```

### Expected mechanism readouts

| readout | Legacy | Phase I |
|---|---:|---:|
| active profile mechanisms | 0 | 7 |
| S5 OpponentBelief dual-emit | off | on |
| location properties reach GoalLab | no | yes |
| B resourceAccess source (holds token) | absent | 0.9 |
| A scarcity axis from rival-held token | legacy floor | 0.75 in clean object example |
| accepted threat source at B, t+1 | absent | `0.7*0.9=0.63` |
| clean-floor danger contribution | 0 | `0.25*0.45*0.63=0.070875` |
| decaying threat memory | absent | `c0*0.97^age` |
| PAM v2 + prior Q carrier | off | on, subject to possibility gates |
| C(t) | not projected | finite raw read-only vector |

The full-profile comparison is a visibility smoke test, not causal attribution
to one mechanism. Causal claims still require one-mechanism twins/ablations.

### What to inspect in UI

1. `/simulator`: select `Phase I`, a fixed seed, two characters, and a location.
2. Runtime header: profile and seed.
3. Agent inspector: active mechanisms, context axes, threat memory, actual
   chosen action and raw C(t) channels.
4. Timeline label `World tension (SimKit)` is a different coarse scalar; it is
   not held contradiction C(t).

### Reproduction test

```bash
npm test -- tests/simkit/runtime_mechanics_profile.test.ts
```

The test pins profile isolation, location passthrough, object/communication
source atoms, memory persistence, finite C(t), and absence of global FC
mutation. For the full causal evidence, also run:

```bash
npm test -- tests/simkit/comm_threat_v1.test.ts tests/simkit/object_context_v1.test.ts tests/simkit/location_props_v1.test.ts tests/simkit/memory_threat_v1.test.ts tests/goals/tension_contract.test.ts tests/goals/pam_v2.test.ts
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
