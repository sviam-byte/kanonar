# Kanonar Book Index

Этот файл — единый корешок документации Kanonar. Читать проект следует как книгу:

```text
идея и ограничения
-> runtime spine
-> сущности и метрики
-> feature/context/lens
-> ToM и отношения
-> drivers/goals/util/action
-> SimKit/dilemma/conflict
-> explainability/tests
-> reference/legacy layers
```

Если этот файл и другой документ расходятся, порядок доверия такой:

1. live runtime implementation
2. type contracts
3. tests
4. config coefficients
5. canonical docs
6. UI projections
7. reference/legacy docs

Главные anchors:

- pipeline runtime: `lib/goal-lab/pipeline/runPipelineV1.ts`
- atom/trace types: `lib/context/v2/types.ts`
- formula config: `lib/config/formulaConfig.ts`
- SimKit config: `lib/config/formulaConfigSim.ts`
- metric encyclopedia: `docs/ENTITY_AND_METRIC_INDEX.md`
- axis validation registry: `docs/axis_validation_registry.yaml`
- docs standard: `docs/DOCUMENTATION_STANDARD.md`
- experimental external-data layer: `docs/BEHAVIOR_LAB.md`
- external data validation summary:
  `docs/EXTERNAL_DATA_VALIDATION_SUMMARY.md`
- validation ladder, Layer 1 (frozen d_eff estimator + synthetic calibration):
  `docs/DYNAMICS_LAYER1_CALIBRATION.md` (code: `kanonar_behavior_lab/src/dynamics/`)
- static-basis sign-audit harness (Step 0: probe / scenes / sign table):
  `docs/GOAL_LAB_PROBE_HARNESS.md` (code: `lib/goal-lab/probe/`)
- session worklog (Layer-1 estimator + basis sign-audit + real-roster + archetype):
  `docs/WORKLOG_2026-06-18_BASIS_AND_DYNAMICS.md`
- real-roster basis sweep (all ~52 axes × 24 chars): `lib/goal-lab/probe/realAgents.ts`
  + `rosterSweep.ts` → `kanonar_behavior_lab/src/basis/roster_triage.py`
- archetype / μ basis audit (effect vectors + λ blend + behavior):
  `lib/goal-lab/probe/archetypeProbe.ts` + `archetypeSignTable.ts`

## 0. Как читать книгу

Рекомендуемый порядок:

1. `README.md` — внешний вход и ограничения.
2. `docs/MATH_INDEX.md` — текущий файл, карта всей книги.
3. `docs/WALKTHROUGH_ONE_TICK.md` — один тик от входа до decision artifacts.
4. `docs/ENTITY_AND_METRIC_INDEX.md` — все сущности и metric families.
5. `docs/PIPELINE.md` — контракт стадий `S0...S9`.
6. `docs/INVARIANTS.md` — правила, которые нельзя ломать.
7. `docs/agents/00_README.md` — глубокие главы агентной модели.
8. `docs/BEHAVIOR_LAB.md` — внешний CaSiNo/ConvoKit слой для проверяемых экспериментов.
9. `docs/EXTERNAL_DATA_VALIDATION_SUMMARY.md` — сводка всех внешних датасетов,
   локальных артефактов, схем, результатов и ограничений текущей validation wave.

`docs/unified/*`, `docs/agent/*`, `docs/VISUALIZATION.md` и v69-style reference docs читать после canonical path, когда нужен control-plane, contributor, UI или legacy/reference контекст.

## 1. Глобальная идея и ограничения

Kanonar моделирует deterministic internal simulation variables для agent decision dynamics. Это не психометрика и не диагностика реальных людей.

Документировать любую модельную величину можно только как внутренний simulation scalar, если нет внешней валидации. Психологически звучащие имена (`trust`, `fear`, `stress`, `shame`, `dominance`, `loyalty`) не должны подаваться как измерения реальных состояний.

Основные публичные ограничения:

- `README.md`
- `docs/DOCUMENTATION_STANDARD.md`
- `docs/ENTITY_AND_METRIC_INDEX.md`

## 2. Runtime spine: `S0...S9`

Канонический поток:

```text
world / obs / mem / rel / life
-> S0 canonicalization
-> S1 normalization / helper derivations
-> S2 base context axes (ctx:*)
-> S3 subjective lens (ctx:final:*)
-> S4 appraisal / emotions
-> S5 ToM / dyadic policy
-> S6 drivers / priorities
-> S7 goals / planning / util projection
-> S8 decision / action artifacts
-> S9 predict / belief persistence when enabled
```

Source of truth:

- runtime: `lib/goal-lab/pipeline/runPipelineV1.ts`
- stage contract: `docs/PIPELINE.md`
- detailed chapter: `docs/agents/07_PIPELINE_SPEC.md`
- invariants: `docs/INVARIANTS.md`
- tests: `tests/pipeline/*`

## 3. Сущности и входные данные

Эта глава отвечает на вопрос: какие объекты входят в модель до формул.

- encyclopedia: `docs/ENTITY_AND_METRIC_INDEX.md`
- deep chapter: `docs/agents/01_CHARACTER_ENTITY.md`
- schema: `data/character-schema.ts`
- top-level types: `types.ts`
- feature registry: `lib/features/registry.ts`

Правило: для raw/input параметров формулы нет; документация должна писать, что это входной параметр, и указывать downstream formula family, где он начинает использоваться.

## 4. Feature / context / lens

Эта глава описывает переход:

```text
CharacterEntity / LocationEntity / sceneSnapshot
-> feat:char:* / feat:loc:* / feat:scene:*
-> ctx:*
-> ctx:final:*
```

Canonical docs:

- metrics: `docs/ENTITY_AND_METRIC_INDEX.md`
- lens chapter: `docs/agents/03_CHARACTER_LENS.md`
- axis chapter: `docs/agents/02_AXIS_SPACE.md`

Runtime:

- `lib/features/extractCharacter.ts`
- `lib/features/extractLocation.ts`
- `lib/features/extractScene.ts`
- `lib/context/axes/deriveAxes.ts`
- `lib/context/lens/characterLens.ts`

Tests:

- `tests/lens/character_lens.test.ts`
- `tests/decision/final_ctx_preferred.test.ts`
- `tests/simkit/subjective_context_priority.test.ts`

## 5. ToM и отношения

Эта глава описывает dyadic model: static ToM, relation priors, event-updated belief traits and ToM dashboards.

Canonical docs:

- static dyad chapter: `docs/agents/04_TOM_DYAD_MODEL.md`
- metric encyclopedia: `docs/ENTITY_AND_METRIC_INDEX.md`

Runtime:

- `lib/tom/dyad-metrics.ts`
- `lib/tom/base/applyRelationPriors.ts`
- `lib/tom/update.traits.ts`
- `lib/tom-metrics.ts`
- `lib/tom/core.ts`

Status: static dyad formulas are deeply documented; relation-prior and event-updated ToM are covered in the metric encyclopedia and should be promoted to full chapters if they become public claims.

## 6. Drivers / goals / utilities / actions

Эта глава описывает переход:

```text
ctx:final:* + drv:* -> goal:* -> util:* -> action:*
```

Canonical docs:

- math chapter: `docs/agents/05_GOAL_LAB_MATH.md`
- pipeline contract: `docs/PIPELINE.md`
- decision reference: `docs/DECISION_AND_HYSTERESIS.md`
- goal reference: `docs/GOALS.md`

Runtime:

- drivers: `lib/drivers/deriveDrivers.ts`
- goals: `lib/goals/goalAtoms.ts`, `lib/goals/selectActive.ts`, `lib/goals/goalState.ts`
- decision: `lib/decision/*`
- coefficients: `lib/config/formulaConfig.ts`

Tests:

- `tests/pipeline/drivers_physics.test.ts`
- `tests/pipeline/s6_s7_bridge.test.ts`
- `tests/goals/derive_goal_atoms.test.ts`
- `tests/decision/goal_isolation.test.ts`

## 7. SimKit / dilemma / conflict runtime

SimKit and dilemma/conflict layers are runtime surfaces around the canonical model. They are in scope for model/runtime documentation, but they are not the source of truth for GoalLab stage semantics.

Runtime:

- SimKit: `lib/simkit/*`
- SimKit compare: `lib/simkit/compare/batchRunner.ts`
- conflict resolver: `lib/simkit/resolution/conflictDetector.ts`
- dilemma: `lib/dilemma/*`
- Mafia protocol: `lib/mafia/*`

Related docs:

- `docs/unified/02_AGENT_QUICKSTART.md`
- `docs/unified/03_SYSTEM_MAP.md`
- `docs/unified/04_CONTROL_PLANE_VALIDATION.md`

Tests:

- `tests/simkit/*`
- `tests/dilemma/*`

Status: there is no separate canonical `CONFLICT_LAB_*` or `PROCONFLICT_*` doc in this wave. The current book maps the live surfaces and keeps formulas/status in `docs/ENTITY_AND_METRIC_INDEX.md`.

## 8. Explainability, trace, tests

Explainability is not an optional UI feature; it is part of the model contract.

Canonical docs:

- `docs/EXPLAINABILITY.md`
- `docs/ORACLES.md`
- `docs/agents/06_ENERGY_PROPAGATION.md`
- `docs/REPRO.md`

Runtime:

- atom graph: `lib/graph/atomGraph.ts`
- energy propagation: `lib/graph/atomEnergy.ts`
- ctx selector semantics: `lib/context/layers.ts`
- decision snapshots: `lib/goal-lab/pipeline/runPipelineV1.ts`

Tests:

- `tests/pipeline/decision_snapshot_trace_surface.test.ts`
- `tests/decision/decision_trace_breakdown.test.ts`
- `tests/decision/final_ctx_preferred.test.ts`

## 9. Canonical / reference / legacy status

Canonical book path:

- `README.md`
- `docs/MATH_INDEX.md`
- `docs/ENTITY_AND_METRIC_INDEX.md`
- `docs/WALKTHROUGH_ONE_TICK.md`
- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `docs/agents/*`

Reference:

- `docs/unified/*` — repo/control-plane reference.
- `docs/VISUALIZATION.md` — UI/graph reference.
- `docs/GOALS.md`, `docs/AXES_AND_CHANNELS.md`, `docs/DECISION_AND_HYSTERESIS.md`, `docs/MODELS.md`, `docs/ORACLES.md`, `docs/REPRO.md` — supporting references that must not override runtime.

Legacy / to merge gradually:

- `docs/agent/*` — contributor/agent patch reference; keep until merged into canonical contributor docs.
- `docs/026-math-update.md` — historical update note; not a canonical formula source.

## 10. Coverage matrix

| Area | Coverage | Canonical place | Remaining work |
| --- | --- | --- | --- |
| Global idea and limits | full | `README.md`, this file | Keep wording non-diagnostic |
| Runtime spine | full | `docs/PIPELINE.md`, `docs/agents/07_PIPELINE_SPEC.md` | Keep S9/persistence in sync |
| Entities/raw inputs | full inventory | `docs/ENTITY_AND_METRIC_INDEX.md` | Raw params need no formula, only range/source |
| Feature extraction | full family formulas | `docs/ENTITY_AND_METRIC_INDEX.md`, `docs/agents/03_CHARACTER_LENS.md` | Add tests where missing |
| Context/lens | full for core path | `docs/agents/03_CHARACTER_LENS.md` | Keep `ctx:final:*` rule tested |
| Static ToM | full | `docs/agents/04_TOM_DYAD_MODEL.md` | None for current scope |
| Relation/event ToM | partial/full family formulas | `docs/ENTITY_AND_METRIC_INDEX.md` | Promote to chapter if public |
| Latents/quick states | full family formulas | `docs/ENTITY_AND_METRIC_INDEX.md` | Confirm formula registry drift |
| V4.2 metrics | full family formulas | `docs/ENTITY_AND_METRIC_INDEX.md` | Direct unit tests if public claim |
| Derived metrics | full family formulas | `docs/ENTITY_AND_METRIC_INDEX.md` | Resolve placeholder `latents.U` note |
| Drivers/goals/util/action | full core chain | `docs/agents/05_GOAL_LAB_MATH.md` | Keep config docs synced |
| SimKit/dilemma/conflict | mapped/reference | this file, `docs/ENTITY_AND_METRIC_INDEX.md` | No separate broad docs in this wave |
| UI/visualization | reference only | `docs/VISUALIZATION.md` | Not part of model book core |

## Rule of thumb

Если механизм нельзя провести по цепочке

```text
formula -> meaning -> variables -> ranges -> code -> coefficients -> invariants -> tests -> trace -> example
```

то он ещё не считается полноценно документированным. Если значение является raw input, вместо формулы нужно явно написать: "формула отсутствует: это входной параметр; downstream formula starts at ...".
