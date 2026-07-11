# OBSERVATION-CONTRACT-0 — resolved scene and observation boundary

Статус: IMPLEMENTED CORE. Дата спецификации: 2026-07-11. TypeScript types,
validation и deterministic resolver реализованы 2026-07-11; persistence и
runtime adapters ещё не реализованы.

Implementation:

- types: `lib/scene/observation/types.ts`;
- validation/resolver: `lib/scene/observation/resolver.ts`;
- tests: `tests/scene/observation_resolver.test.ts`.

## Contract role

Контракт отделяет truth-level scene input от того, что вправе видеть конкретный
observer:

```text
source scene contours -> resolved scene input
  -> observation resolver -> observationsByCharacterId
  -> belief builder / GoalLab S0 / Conflict observation adapter
```

UI, ToM и mechanic kernels не могут читать hidden target fields в обход resolver.

## Approved ID and version rules

- All IDs are non-empty opaque strings. Semantics must not be parsed from a
  localized label.
- New payloads use `schemaVersion: 1` and the repository `systemVersion` from
  `lib/goal-lab/versioning.ts`.
- `seed` is a required finite integer normalized before resolution.
- `tick` is a required non-negative integer for emitted observations.
- Unknown future schema versions return an incompatibility result; they do not
  fall back to current defaults.

## ResolvedSceneInputV1

The approved conceptual wire shape is:

```ts
type ResolvedSceneInputV1 = {
  schemaVersion: 1;
  systemVersion: string;
  sceneId: string;
  sourceRefs: Array<{ kind: string; id: string; schemaVersion?: number }>;
  seed: number;
  tick: number;
  cast: Array<{
    agentId: string;
    roleIds: string[];
    roleVisibility: VisibilityRuleV1;
  }>;
  povAgentIds: string[];
  placements: Array<{
    agentId: string;
    locationId: string;
    nodeId?: string | null;
    x?: number;
    y?: number;
    provenance: ObservationProvenanceV1;
  }>;
  events: SceneEventInputV1[];
  relationLayers: RelationLayerInputV1[];
  knowledge: KnowledgeAssignmentV1[];
  visibilityRules: VisibilityRuleV1[];
  tags: string[];
};
```

This is the minimum boundary. Scene metrics/norms/phase are supplied as
versioned scene facts/events by the selected source adapter until the separate
SceneInstance/ScenarioState ownership ADR chooses a persisted owner.

### Cast and POV

- Every POV ID must occur exactly once in cast.
- Cast is the only legal agent-reference domain for scene events, placements,
  relation overrides and knowledge assignments.
- An empty POV list is invalid for interactive GoalLab/Conflict runs. Batch
  truth-only simulations may use an explicit system observer ID rather than an
  implicit empty POV.

### Placement

- Every required cast member has exactly one resolved placement.
- GoalLab/SimKit placement validation remains the readiness oracle until a
  shared validator exists.
- Missing coordinates are allowed only when `nodeId` resolves in the referenced
  location map. Missing both node and coordinates is invalid.

## VisibilityRuleV1

```ts
type VisibilityRuleV1 = {
  ruleId: string;
  mode: 'public' | 'participants' | 'observer_list' | 'private';
  observerIds?: string[];
  subjectIds?: string[];
  kindFilter?: ObservationKindV1[];
  fieldAllowlist?: string[];
  reliabilityMultiplier?: number; // [0,1]
  provenance: ObservationProvenanceV1;
};
```

Rules are evaluated in declared order with the most restrictive matching rule
winning. Absence of an allow rule means hidden, not public. `private` permits
only the subject/explicit observer. `participants` permits any cast member; it
differs from `public` only for future non-cast observers (system/debug POV).
Payload fields not present in the allowlist must be removed before belief code
receives the envelope.

Rule binding has two modes with different matching semantics (2026-07-11 fix):

- **Explicit binding** (`visibilityRuleIds` on an event/relation, `roleVisibility`
  on a cast member): the rule was deliberately attached; an absent `kindFilter`
  matches the bound item's kind.
- **Ambient participation** (placements, which carry no rule IDs): only rules
  whose `kindFilter` explicitly names `spatial_presence` participate. A rule
  without `kindFilter` never governs kinds it was not bound to — otherwise a
  restrictive rule attached for one event would silently hijack spatial
  visibility for the whole scene.

## SceneEventInputV1

```ts
type SceneEventInputV1 = {
  eventId: string;
  kind: ObservationKindV1;
  tick: number;
  actorId?: string;
  targetIds: string[];
  payload: Record<string, unknown>;
  visibilityRuleIds: string[];
  baseReliability: number; // [0,1]
  provenance: ObservationProvenanceV1;
};
```

Payload schemas are owned by the event kind registry. Unknown kinds remain
invalid until registered; they are not silently converted to `neutral`.

## RelationLayerInputV1

```ts
type RelationLayerInputV1 = {
  layer: 'persistent' | 'branch' | 'scene_override' | 'runtime_update';
  fromId: string;
  toId: string;
  values: Record<string, number>;
  visibilityRuleIds: string[];
  provenance: ObservationProvenanceV1;
};
```

Resolution order is fixed:

```text
persistent -> branch -> scene_override -> runtime_update
```

Later layers override only explicitly present keys. The resolver trace records
all contributing layers and the winning source per key. A scene override never
mutates canonical character identity or the persistent relation store.

## KnowledgeAssignmentV1

```ts
type KnowledgeAssignmentV1 = {
  assignmentId: string;
  observerId: string;
  subjectId?: string;
  targetId?: string;
  factKind: string;
  payload: Record<string, unknown>;
  reliability: number; // [0,1]
  validFromTick: number;
  validUntilTick?: number;
  provenance: ObservationProvenanceV1;
};
```

Knowledge is observer-specific evidence, not truth copied into every agent.
Assignments outside their validity interval emit no observation.

## ObservationEnvelopeV1

```ts
type ObservationKindV1 =
  | 'direct_event'
  | 'spatial_presence'
  | 'speech'
  | 'scene_fact'
  | 'relation_signal'
  | 'role_signal'
  | 'knowledge_assignment';

type ObservationEnvelopeV1 = {
  schemaVersion: 1;
  systemVersion: string;
  observationId: string;
  sceneId: string;
  observerId: string;
  subjectId?: string;
  targetId?: string;
  kind: ObservationKindV1;
  payload: Record<string, unknown>;
  visibility: {
    ruleIds: string[];
    mode: VisibilityRuleV1['mode'];
    allowedFields: string[];
  };
  reliability: number; // [0,1]
  source: {
    sourceKind: string;
    sourceId: string;
  };
  tick: number;
  provenance: ObservationProvenanceV1;
};
```

`subjectId` is the entity described by the payload; `targetId` is the directed
counterparty when the event/statement has one. Neither defaults to observer.

## ObservationProvenanceV1

```ts
type ObservationProvenanceV1 = {
  sourceIds: string[];
  adapterSteps: Array<{
    adapterId: string;
    adapterVersion: number;
    inputIds: string[];
    note?: string;
  }>;
};
```

`sourceIds` and adapter steps are required. Empty provenance is invalid for
persisted evidence. UI labels and wall-clock timestamps are not source IDs.

## Resolver output

```ts
type ObservationResolutionV1 = {
  schemaVersion: 1;
  systemVersion: string;
  sceneId: string;
  tick: number;
  observationsByCharacterId: Record<string, ObservationEnvelopeV1[]>;
  relationResolution: Array<{
    fromId: string;
    toId: string;
    values: Record<string, number>;
    winningSourceByKey: Record<string, string>;
    provenance: ObservationProvenanceV1;
  }>;
  validation: ObservationValidationReportV1;
};
```

Each observer list is sorted deterministically by `observationId` (code-unit
order, not locale collation). Map/object key insertion order is not a semantic
contract. `observationId` is unique within a resolution: event/knowledge IDs
are validated unique, and relation-signal IDs embed
`<layer>:<input index>:<source>` so that layers sharing a provenance source do
not collide; `source.sourceId` stays the raw provenance source.

## Validation contract

Validation is Result-like and accumulates all errors:

```text
invalid_schema_version
invalid_system_version
invalid_seed
duplicate_cast_id
duplicate_event_id
duplicate_assignment_id
unknown_pov
unknown_agent_reference
missing_placement
invalid_placement
unknown_location
invalid_role_reference
invalid_visibility_rule
unknown_visibility_reference
invalid_reliability
invalid_tick
invalid_knowledge_assignment
invalid_relation_layer
unknown_event_kind
missing_provenance
```

Errors include code, JSON-like field path, offending reference/value and source
ID. Invalid input produces no partial executable scene.

## Hidden-field non-interference oracle

For fixed resolver version, scene, observer, seed and tick:

```text
same visible allowlisted inputs
+ changed hidden target field
=> semantically equal ObservationEnvelopeV1[] for observer
=> semantically equal directed belief semantic fields
=> same candidate set, Q decomposition and selected action under fixed policy
```

The oracle must perturb target truth fields that are absent from the observer's
allowlist. A test that merely removes the field from serialized output is
insufficient; downstream belief and decision traces must remain equal.

## Visible sensitivity oracle

```text
same observer prior
+ two targets with different allowed role/status/faction/observed behavior
=> different observation envelopes
=> different directed beliefs
=> difference reaches utility/decision trace
```

Hidden invariance and visible sensitivity are a required test pair.

## Semantic replay equality

Replay compares:

- scene/observer/subject/target IDs;
- kind and allowlisted payload;
- reliability, tick and source/provenance IDs;
- relation resolved values and winning sources.

Replay ignores export creation time, UI order, labels and other wall-clock
metadata. Same input + resolver version + seed must reproduce semantic output.

## Current adapters and compatibility

- legacy `WorldState.observations[observerId]` -> envelope adapter;
- `observeLite` -> `spatial_presence` envelopes;
- S0 `obs:*` atoms -> derived projection, not the primary persisted envelope;
- ScenePreset injections -> scene facts/events with explicit visibility rule;
- Sim events/speech -> registered event-kind adapters;
- Conflict observation -> mechanic-filtered envelope projection.

Adapters may preserve legacy IDs in provenance but must emit the approved ID
direction and versions. Missing reliability is not silently assumed for
persisted evidence; compatibility adapters must record their declared fallback
in provenance and migration reports.

## Implemented boundary

- Isolated V1 types without extending root `types.ts`.
- Accumulating validation with fail-closed `ObservationResolutionResultV1`.
- Closed-by-default visibility, top-level field allowlists and reliability
  multipliers.
- Deterministically sorted per-character envelopes.
- Relation fold with fixed layer precedence and winning source per key.
- Directed multi-target events emit one envelope per target.

## Runtime adapter projections

Implemented 2026-07-11 as pure, versioned projections:

- GoalLab: `lib/scene/adapters/goalLab.ts` projects legacy `Observation[]`,
  provenance-carrying S0 observation atoms, seed/tick and scene snapshot data.
- Conflict: `lib/scene/adapters/conflict.ts` accepts exactly two cast members and
  exposes only resolved directed envelopes. It does not own actions, utility,
  payoff or transitions.
- SimKit: `lib/scene/adapters/simKit.ts` applies seed/tick/placement and
  observer-indexed scene facts to a cloned `SimWorld`; it preserves the existing
  event queue and rejects unknown character/location references.

Tests: `tests/scene/scene_adapters_v1.test.ts`. These adapters are not yet wired
as default legacy callers; live-call migration remains explicit follow-up work.

## Explicitly deferred

- SceneInstance/ScenarioState persisted ownership;
- default-caller migration for GoalLab, Conflict and SimKit projections;
- event-kind payload registry implementation;
- belief update formula;
- scene adapters and persistence migration.

## Acceptance

- Scene input, observation envelope, resolver output, validation, relation
  priority, hidden-field oracle and semantic replay equality are decision
  complete.
- Runtime and existing payloads were not changed.

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Observation reliability and
visibility are internal simulation contracts, not calibrated perception models.
