# SCENE-INVENTORY-0 — карта scene contracts

Статус: DONE. Дата: 2026-07-11. Режим: read-only audit; runtime и types не
изменялись.

## Current live contours

| contract | owner / writers | consumers | persistence | visibility/provenance | validation | status / decision | migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ScenePreset` | `lib/scene/types.ts`; static `SCENE_PRESETS` | GoalLab context scene engine | module config | global metrics/norms/injections; atom trace names phase but not preset revision | unknown preset throws; phase/reference validation not found | keep as phase/injection compatibility contract; adapt into future resolved scene | medium |
| `SceneInstance` | transiently rebuilt by `buildGoalLabContext`; optional `world.sceneSnapshot` fallback | `applySceneAtoms`, `stepSceneInstance` | normally not persisted by GoalLab call | participants/location are global; no per-observer visibility/knowledge | preset existence only; invalid phase silently produces no transition | adapt; not sufficient as shared scene | high |
| `WorldState.scene: ScenarioState` | world/scenario initializers and scenario engine | context v4, goals, role/phase systems | part of `WorldState` | global scenario metrics/phase; no field-level provenance | scenario-specific functions | active separate owner; ownership ADR required before merge with `SceneInstance` | high |
| `WorldState` cast/location/relation fields | world initializer, GoalLab world hook, runtime updates | context builder, pipeline, UI | live world/snapshots depending caller | full truth object; `observations[observer]` separate | partial structural/runtime checks | keep as runtime truth input, never expose directly as observation | high |
| `sceneControl: any` | GoalLab Context/UI | `buildGoalLabContext`, pipeline modes/lookahead | React session state only | mixes scene preset/phase/metrics with cognition/runtime policy | none | split later into scene draft settings and run-policy settings | high |
| SimKit `ScenarioDraft` | setup/adapters | `worldFromScenarioDraft` | input object/export caller | cast, locations, placements, hazards; no observations/knowledge/relations/version | placement application with permissive `any[]` | adapt; useful setup draft, not shared wire contract | high |
| `SimWorld` | `worldFromScenarioDraft`, simulator/actions/plugins | SimKit runtime and GoalLab adapters | `SimExport` records snapshots/traces; facts reconstructed | truth state plus untyped facts; no individual observation map | action/placement validators | keep as runtime host; resolved scene adapter required | high |
| `SimSnapshotV1` | `buildSnapshot` each tick | plugins/export/UI | exported with wall-clock `time` | characters/locations/events only; facts absent | schema literal only | keep runtime snapshot; semantic replay excludes wall-clock | medium |
| placement contracts | SimKit placement types/validator; GoalLab adapters | pipeline gate, UI, decider | positions in respective worlds | positions are truth; no visibility provenance | completeness/validity/readiness | keep canonical placement validator candidate | low/medium |
| legacy `data/presets/scenes.ts` | empty `TEST_SCENES`, UI loader/control imports | legacy controls/loader | none | no runtime evidence | none | compatibility/empty catalog; do not treat as scene canon | low |

## Field migration matrix

| target field | current representations | current owner conflict | target disposition | required adapter/decision |
| --- | --- | --- | --- | --- |
| `id` | presetId, sceneId, scenario ID/draft ID | naming differs but not semantic conflict | resolved run gets stable scene ID plus source draft/preset ID | normalization adapter |
| `schemaVersion` | ScenePreset/Instance numeric; Sim snapshot/export schema literals; GoalLab version stamps | no shared version | required on every new wire payload | version registry/decoder policy |
| `systemVersion` | GoalLab contracts only | missing elsewhere | required on resolved scene/observation/belief exports | use `lib/goal-lab/versioning.ts` source |
| seed | `WorldState.rngSeed: number|string`, `SceneInstance.seed?: number`, `SimWorld.seed:number`, UI observe seed | multiple writers/types | one normalized integer run seed; derived channel seeds remain explicit | **seed ownership ADR/contract decision** |
| cast | SceneInstance participants, WorldState agents, ScenarioDraft characters, SimWorld characters | different shapes | resolved cast references stable agent IDs and roles | per-runtime cast adapters |
| POV | selected GoalLab perspective/self ID; no scene field | absent from drafts | explicit one-or-more POV IDs in resolved input | observation contract validation |
| roles | agent effectiveRole, ScenarioDef role slots/defaults, placement roleTags, Conflict roles | multiple semantics | role assignments with source and observer visibility | role projection decision |
| location/placement | scene locationId, agent location/position, draft placements, Sim locId/pos | two active spatial shapes | normalized placement record; SimKit validator remains readiness oracle | GoalLab/SimKit adapters |
| events | world eventLog/override events, SimWorld events, scene injections | different event schemas | versioned referenced events with provenance | event adapter matrix |
| relations | WorldState initialRelations, agent relationships, ToM, Sim facts | ownership and priority not implemented uniformly | target priority: persistent → branch → scene override → runtime update | **relation ownership ADR required** |
| knowledge | observation/ToM/epistemic fragments; no scene field | missing canonical owner | explicit per-observer knowledge assignment | observation contract |
| visibility | location properties, observation numeric visibility/channels, scene norms, speech volume | related but non-equivalent | explicit rules plus resolved observation visibility result | observation resolver contract |
| metrics/norms | SceneInstance and ScenarioState both active | **two active owners** | inventory does not choose winner | dedicated scene-state ownership ADR before runtime adapter |
| tags | entities, locations, scenarios, injections | unversioned free strings | keep namespaced tags as optional metadata | validator/catalog later |
| provenance | atom traces, event IDs, Sim trace deltas | no shared chain | source IDs + adapter steps + tick/version | common provenance shape |

## ScenePreset and SceneInstance disposition

- `ScenePreset` remains a valid compatibility source for GoalLab phase-based
  metrics/norms/injections.
- `SceneInstance` is not the future shared scene: it lacks cast roles, POV,
  relations, knowledge, visibility rules, events and system version.
- GoalLab currently rebuilds it at the current tick on each context calculation,
  so phase persistence is not guaranteed unless supplied through the undocumented
  `world.sceneSnapshot` fallback.
- `ScenarioState` separately owns scenario metrics/phase in `WorldState`.
  Because both contours are active, this inventory does not merge them or name
  a winner.

## Seed ownership

Current seed sources are not equivalent. The target contract uses one required
integer `seed` for semantic run identity. Runtime-specific RNG channels derive
from it with named channel IDs. String `WorldState.rngSeed`, UI overrides and
wall-clock auto-placement seeds must be normalized or explicitly marked
non-reproducible before entering the resolved scene.

The exact owner of seed normalization is unresolved and must be fixed in the
scene-state ownership/version ADR; inventory does not change existing behavior.

## Relation priority

Target order is accepted as a contract requirement:

```text
persistent -> branch -> scene override -> runtime update
```

No single live function proves this complete order. `initialRelations`, mutable
agent relationships, ToM projections and Sim facts coexist. The future resolver
must emit both the winning value and the source chain. Until that exists, scene
overrides must not be written directly into canonical character identity.

## Individual observations and knowledge

`WorldState.observations[observerId]` is the closest existing directed store;
`observeLite` separately derives a deterministic visible-agent snapshot from
location/radius. ScenePreset injections and ScenarioState metrics are global.
There is no common `observationsByCharacterId` resolver or explicit knowledge
assignment. This is the input gap for OBSERVATION-CONTRACT-0.

## Conversion boundaries

- GoalLab: resolved scene must project to S0 world/observation/event/relation
  atoms and keep source IDs in trace.
- SimKit: resolved scene must project to `ScenarioDraft/SimWorld` cast,
  locations, placements, facts and events without copying wall-clock metadata
  into semantic comparison.
- Conflict: resolved scene must supply roles/phase/observation inputs, while the
  mechanic kernel remains owner of legal actions/payoff/transition.

## Unresolved decisions for OBSERVATION-CONTRACT-0 and later ADRs

1. SceneInstance versus ScenarioState ownership of phase/metrics.
2. Seed normalization owner and legacy string-seed migration.
3. Persistent relation store and exact branch representation.
4. Role assignment visibility and whether hidden roles are knowledge records.
5. Event payload union/versioning.
6. Visibility rule vocabulary and reliability semantics.
7. Snapshot decoder behavior for payloads without system/schema versions.

## Test evidence

- placement: GoalLab adapters and SimKit validator tests/live gates;
- SimKit scenario: `tests/simkit/scenario_engine.test.ts`;
- scene/object bridge: `tests/simkit/mvp0_scene_object.test.ts`;
- subjective observation/lookahead: pipeline observation tests;
- Conflict hidden action: `tests/dilemma/conflictDynamics.test.ts`.

Not found: shared scene validator, POV/knowledge validation, relation-priority
test, SceneInstance persistence test, shared scene encode/decode fixture.

## Acceptance

- Active contracts and fields have owners, writers/consumers, persistence,
  visibility, provenance, validation, status and migration risk.
- Conflicting persisted ownership is left to explicit ADRs.
- No `LabSceneDraft`, defaults or runtime changes were introduced.

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Its scene and psychological
fields are internal simulation variables, not validated real-world measurements.

