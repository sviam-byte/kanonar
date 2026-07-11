# SCENE-OWNERSHIP-ADR-0 — ownership scene state, seed и relation layers

Статус: ACCEPTED. Дата: 2026-07-11. Решение архитектурное; runtime и types не
изменялись.

## Context

`SCENE-INVENTORY-0` обнаружил двух активных владельцев phase/metrics
(`SceneInstance` и `WorldState.scene: ScenarioState`), несовместимые seed types
и отсутствие единого владельца relation-layer resolution. Выбирать владельца
в inventory было запрещено.

## Decision

### Configuration and runtime state

- `ResolvedSceneInputV1` из `OBSERVATION-CONTRACT-0` — canonical immutable input
  конкретного запуска. Он владеет нормализованными ID, version, seed, cast,
  POV, placement, events, relation layers, knowledge и visibility rules.
- Runtime host (`WorldState` в GoalLab или `SimWorld` в SimKit) владеет текущим
  mutable truth state на tick. Он не становится wire-format владельцем.
- Persisted semantic scene state восстанавливается из accepted resolved input и
  упорядоченного runtime-update log. Wall-clock/export metadata в replay не
  участвует.
- `ScenePreset` остаётся compatibility source фазовых injections/norms.
  `SceneInstance` и `ScenarioState` становятся adapter projections; ни один из
  них не является canonical persisted cross-runtime contract.
- Пока adapters не реализованы, существующие runtime writers сохраняются без
  изменения. ADR запрещает новый cross-runtime consumer поверх этих shapes.

Таким образом конфликт ownership разрешён разделением immutable run input и
runtime truth, а не назначением одного legacy object победителем.

### Phase and metrics

Phase change — versioned semantic runtime event. Current phase и scene metrics
являются fold результата над ordered event/update log. Adapter обязан сохранить
source event IDs, tick и rule/adapter version. Snapshot может кэшировать fold,
но при decode он проверяется повторным fold либо digest-сверкой.

ADR не утверждает transition formula: до typed adapter legacy scene engines
продолжают владеть своими переходами локально.

### Seed

- Единственный semantic run seed после source adaptation — required finite
  integer `ResolvedSceneInputV1.seed`.
- Source adapter владеет нормализацией legacy `number|string`; resolver лишь
  валидирует нормализованный результат.
- Named RNG channels выводятся из `(run seed, channel ID, adapter/version)` и
  фиксируются в provenance/trace.
- Пустой seed, wall-clock fallback и незафиксированный runtime-generated seed
  делают input non-replayable и являются validation error.
- Алгоритм string-to-integer normalization должен быть отдельным versioned
  решением и golden-tested до миграции legacy string seeds.

### Relation layers

Владельцы слоёв:

| layer | owner | mutation rule |
| --- | --- | --- |
| `persistent` | canonical character/relation persistence store | scene adapters read only |
| `branch` | branch/run snapshot | cannot write persistent store |
| `scene_override` | immutable resolved scene input | never mutates identity or persistence |
| `runtime_update` | runtime event/update log | applies only at/after its tick |

Resolver folds them in fixed order:

```text
persistent -> branch -> scene_override -> runtime_update
```

Later layers replace only explicitly present keys. Output records every
contributor and `winningSourceByKey`; no layer may silently materialize a
default.

### Version ownership

- Wire contracts own `schemaVersion`.
- Repository build owns `systemVersion` via `lib/goal-lab/versioning.ts`.
- Each adapter/resolver owns an explicit adapter/rule version in provenance.
- Runtime host versions do not replace wire schema versions.
- Unknown future versions fail closed; legacy decoding is named and traced.

## Consequences

- GoalLab, Conflict and SimKit require separate adapters into the same resolved
  input/observation boundary.
- Existing `SceneInstance` and `ScenarioState` may coexist during migration,
  but no new feature may treat either as shared canonical persistence.
- A typed observation module and resolver are prerequisites for a compliant
  OpponentBelief builder. Building from full target truth or legacy `any` is
  rejected by this ADR and the hidden-field oracle.
- Scene adapter migration needs semantic replay, relation-source and phase-fold
  golden fixtures.

## Rejected alternatives

- **Make `SceneInstance` canonical:** lacks roles, POV, relations, knowledge,
  visibility and stable persistence.
- **Make `ScenarioState` canonical:** GoalLab-specific shape and metrics do not
  cover SimKit/Conflict observation boundaries.
- **Make `SimWorld` canonical:** runtime truth/facts are untyped and would leak
  host semantics into the wire contract.
- **Last-writer-wins across legacy objects:** destroys provenance and makes
  replay dependent on call order.
- **Normalize absent fields to defaults:** hides migration errors.

## Required validation

Before runtime adapters are accepted:

1. same resolved input + ordered updates + versions => same semantic state;
2. changed wall-clock metadata => same semantic state;
3. relation fold reports contributor chain and winner per key;
4. phase snapshot equals deterministic fold of its event log;
5. legacy string seed mapping is versioned and golden-tested;
6. hidden target-field perturbation cannot change observer output.

## Follow-up order

```text
OBSERVATION-TYPES-0 -> OBSERVATION-RESOLVER-0
  -> TOM-BUILDER-0 -> TOM-UPDATE-0
  -> GOALLAB-SCENE-ADAPTER-0
  -> CONFLICT-SCENE-ADAPTER-0
  -> SIMKIT-SCENE-ADAPTER-0
```

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Scene, relation and belief
values are internal simulation contracts, not validated real-world measures.

