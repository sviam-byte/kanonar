# Kanonar Math Index

Этот файл — входная точка в математическую и контрактную документацию Kanonar. Он не дублирует код и не заменяет глубокие model docs; его задача — быстро связать формулы, runtime paths, config coefficients, trace surfaces и tests.

## Как читать этот слой

Используйте порядок доверия:

1. live runtime implementation
2. type contracts
3. tests
4. config coefficients
5. canonical docs
6. UI projections

Главные runtime anchors:

- `lib/goal-lab/pipeline/runPipelineV1.ts`
- `lib/context/v2/types.ts`
- `lib/config/formulaConfig.ts`
- `lib/config/formulaConfigSim.ts`

## 1. Math / model docs

### GoalLab pipeline and agent model

- `docs/agents/00_README.md` — навигация по глубоким model docs.
- `docs/ENTITY_AND_METRIC_INDEX.md` — полный реестр видов сущностей, metric spaces и именованных derived-слоёв.
- `docs/agents/01_CHARACTER_ENTITY.md` — персонаж и локация как входные сущности модели.
- `docs/agents/03_CHARACTER_LENS.md` — математический и contract слой субъективной линзы `ctx:* -> ctx:final:*`.
- `docs/agents/04_TOM_DYAD_MODEL.md` — dyad ToM: primitives, logits, bounded outputs.
- `docs/agents/05_GOAL_LAB_MATH.md` — drivers -> goals -> utilities -> modes -> hysteresis.
- `docs/agents/06_ENERGY_PROPAGATION.md` — explainability energy propagation.
- `docs/MODELS.md` — краткая модельная сводка по lens / goals / energy.
- `docs/DECISION_AND_HYSTERESIS.md` — decision scoring и util/hysteresis semantics.

### Runtime math/config anchors

- GoalLab coefficients: `lib/config/formulaConfig.ts`
- SimKit coefficients: `lib/config/formulaConfigSim.ts`
- Drivers runtime: `lib/drivers/deriveDrivers.ts`
- Goal derivation: `lib/goals/goalAtoms.ts`
- Active goal hysteresis: `lib/goals/selectActive.ts`, `lib/goals/goalState.ts`
- Decision scoring: `lib/decision/*`

### Tests

- drivers and S6/S7 bridge: `tests/pipeline/drivers_physics.test.ts`, `tests/pipeline/s6_s7_bridge.test.ts`
- goal derivation: `tests/goals/derive_goal_atoms.test.ts`, `tests/goals/goal_tuning.test.ts`
- subjective context preference: `tests/decision/final_ctx_preferred.test.ts`, `tests/simkit/subjective_context_priority.test.ts`
- goal isolation: `tests/decision/goal_isolation.test.ts`

## 2. Runtime contract docs

### Stage and namespace contracts

- `docs/PIPELINE.md` — what each stage may produce and consume.
- `docs/INVARIANTS.md` — what must not be broken.
- `docs/IDS_AND_NAMESPACES.md` — atom id and namespace conventions.
- `docs/ARCHITECTURE.md` — conceptual staged flow.
- `docs/REPRO.md` — reproducibility and inspection guidance.

### Runtime anchors

- pipeline spine: `lib/goal-lab/pipeline/runPipelineV1.ts`
- canonical atoms: `lib/goal-lab/atoms/canonical.ts`
- atom/trace types: `lib/context/v2/types.ts`
- belief persistence and lookahead: `lib/goal-lab/pipeline/beliefPersist.ts`, `lib/goal-lab/pipeline/lookahead.ts`

### Tests

- canonical contract: `tests/pipeline/canonical_contract.test.ts`
- stage isolation: `tests/pipeline/stage_isolation.test.ts`
- decision snapshot trace surface: `tests/pipeline/decision_snapshot_trace_surface.test.ts`
- canonical relations and simulation wiring: `tests/simkit/canonical_relations.test.ts`

## 3. Explainability and trace docs

### Canonical docs

- `docs/EXPLAINABILITY.md` — what UI/trace must expose.
- `docs/ORACLES.md` — correctness expectations for lens, goals, energy.
- `docs/agents/06_ENERGY_PROPAGATION.md` — energy-on-graph semantics.

### Runtime anchors

- atom graph: `lib/graph/atomGraph.ts`
- energy propagation: `lib/graph/atomEnergy.ts`
- ctx selector semantics: `lib/context/layers.ts`
- decision snapshots: `lib/goal-lab/pipeline/runPipelineV1.ts`

### Tests

- `tests/pipeline/decision_snapshot_trace_surface.test.ts`
- `tests/decision/decision_trace_breakdown.test.ts`
- `tests/decision/final_ctx_preferred.test.ts`

## 4. SimKit / dilemma / conflict-adjacent runtime

В текущем live repo нет подтверждённых canonical docs с именами `CONFLICT_LAB_CONTRACT.md`, `CONFLICT_LAB_MATH_SPEC.md` или `PROCONFLICT_MATH.md`. В этой волне их не создаём автоматически; вместо этого фиксируем текущие живые surfaces.

### Runtime anchors

- dilemma runtime: `lib/dilemma/*`
- SimKit runtime: `lib/simkit/*`
- orchestrator bridge: `lib/simkit/plugins/*`
- Mafia runtime: `lib/mafia/*`

### Existing related docs

- `docs/unified/02_AGENT_QUICKSTART.md` — как SimKit связан с GoalLab.
- `docs/unified/03_SYSTEM_MAP.md` — control-plane relation between UI, pipeline, SimKit, legacy.
- `docs/unified/04_CONTROL_PLANE_VALIDATION.md` — active validation surfaces.

### Tests

- dilemma: `tests/dilemma/*`
- sim runtime and gating: `tests/simkit/*`
- conflict resolution inside SimKit: `tests/simkit/conflict_detector.test.ts`

## 5. What is still missing

На текущем live дереве остаются пробелы, которые стоит закрывать следующими волнами:

- единый canonical math/contract doc для dilemma/conflict слоя, если он действительно стабилизирован в runtime;
- единый public-facing map для SimKit divergence/sensitivity tools, если этот слой будет выноситься во внешний портфолио-вход;
- синхронизация mixed Russian/English legacy docs после стабилизации внешнего entry layer.

## Rule of thumb

Если механизм нельзя провести по цепочке

```text
formula -> meaning -> variables -> ranges -> code -> coefficients -> invariants -> tests -> trace -> example
```

то он ещё не считается полноценно документированным.
