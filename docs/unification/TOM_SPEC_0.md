# TOM-SPEC-0 — directed OpponentBelief contract

Статус: IMPLEMENTED CORE. Дата спецификации: 2026-07-11. Isolated TypeScript
types, builder, update law, validation/serialization и S5 projection реализованы
2026-07-11. Flag-gated S5/SimKit scene-evidence path подключён; default GoalLab
caller migration и versioned belief persistence остаются deferred.

Implementation:

- types: `lib/tom/opponentBelief/types.ts`;
- builder/S5 projection: `lib/tom/opponentBelief/builder.ts`;
- update: `lib/tom/opponentBelief/update.ts`;
- validation/serialization: `lib/tom/opponentBelief/serialization.ts`;
- coefficients: `FC.opponentBeliefV1` in `lib/config/formulaConfig.ts`;
- tests: `tests/tom/opponent_belief_v1.test.ts`.

Update 2026-07-11c (audit repair): evidence attribution follows the observation
contract: payload describes `subjectId`; the only V1 exception is a visible
relation `observer -> counterparty`, which is evidence for the counterparty.
Persisted observer maps and envelope arrays pass through a fail-closed decoder
before S5, with errors exposed as `wireErrors`. The S5 artifact retains complete beliefs and
evidence provenance, and S8 target modulation reads canonical
`tom:belief:final:<observer>:<target>:<key>` before compatibility dyads. The
visible-sensitivity oracle now proves a changed scene signal reaches target Q
and its `usedAtomIds`, not only the emitted S5 magnitude.

Update 2026-07-11b (TOM-BUILDER live wiring): S5 dual-emit слой теперь строит
belief как `legacy-decoder prior (если есть world.tom энтри) + directed
evidence из envelope-наблюдений resolved-сцены` через единый update-law;
envelopes приходят как `world.resolvedObservations` (GoalLab adapter отдаёт
`observationEnvelopes`; SimKit — fact `scene:observations:v1` через
`buildWorldStateFromSim`). Диада только с envelope-evidence (без legacy)
теперь тоже получает belief. Тесты:
`tests/pipeline/opponent_belief_scene_evidence.test.ts`,
`tests/simkit/scene_projection_integration.test.ts` (end-to-end через
SimKitSimulator).

Update 2026-07-11 (после core): реализованы legacy decoder
(`lib/tom/opponentBelief/legacyDecoder.ts`, adapterId `legacy-tom-decoder` v1;
маппинг trust / align→alignment / respect / dominance, остальное — только
`payload.migration.unmappedFields`, тесты `tests/tom/legacy_decoder_v1.test.ts`)
и flag-gated S5 dual-emit seam (`s5DualEmitLayer.ts` +
`runtimeMechanics.opponentBeliefS5V1`; с 2026-07-12 default ON у `phase1`, OFF у
`legacy` и no-profile/config, object-form override поддерживает opt-in/rollback).
Approved-расширение evidence-ID
грамматики: decoder-evidence без сцены использует псевдо-сегмент `legacy-tom`
— `belief:evidence:legacy-tom:<observerId>:<targetId>`. Декодирование
`world.tom.views`/V3-report остаётся deferred (`unsupported_legacy_shape`).

## Evidence-weighted update V1

### Purpose

Update only approved directed axes from resolver-approved evidence without
reading full target truth.

### Formula

```text
w = evidence.reliability
value' = (confidence * value + w * signal) / (confidence + w)
confidence' = 1 - (1 - confidence) * (1 - confidenceGain * w)
uncertainty' = clamp01(
  uncertainty * (1 - uncertaintyDecay * w)
  + abs(signal - value) * disagreementWeight * w
)
```

When the denominator is zero, `value' = signal`. Evidence is processed in
deterministic `(tick, evidenceId)` order. Previously persisted evidence IDs are
not applied twice.

### Variables

- `value`, `signal`, `confidence`, `uncertainty`, `w` — finite `[0,1]` scalars.
- `confidenceGain = 0.65`, `uncertaintyDecay = 0.5`,
  `disagreementWeight = 0.5` — config-owned V1 coefficients.
- neutral explicit prior: value `0.5`, confidence `0`, uncertainty `1`.

### Source of truth

- implementation: `lib/tom/opponentBelief/update.ts`;
- types: `lib/tom/opponentBelief/types.ts`;
- config: `lib/config/formulaConfig.ts`;
- tests: `tests/tom/opponent_belief_v1.test.ts`;
- trace: `BeliefUpdateTraceV1` and projected S5 atom traces.

### Invariants

- only directed evidence for the exact observer/target pair contributes;
- only approved payload keys update estimates;
- same prior/evidence/tick/version yields identical belief and trace;
- confidence and uncertainty remain distinct bounded values;
- evidence overflow is compacted with source IDs and adapter provenance.

### Minimal example

Input: neutral trust prior and one reliability `0.8` trust signal `0.9`.

Output: trust value `0.9`, confidence `0.52`, uncertainty `0.76`; the evidence
ID appears in the estimate and update trace.

### Failure modes

- self-target direction is rejected;
- invalid wire ranges fail validation rather than clamp;
- unknown/non-numeric payload keys remain evidence but do not change axes;
- legacy target truth is never consulted as a fallback.

## Ownership

- Observation resolver owns what an observer may know.
- OpponentBelief builder/update owns the directed estimate state.
- GoalLab S5 owns the atom projection consumed by cognition.
- UI is a projection; Conflict and SimKit consume adapters.
- Full target `WorldState` is never an OpponentBelief input.

## IDs and direction

All IDs are opaque non-empty strings. The direction is always:

```text
observerId -> targetId
```

For `OpponentBeliefV1`, `observerId === targetId` is invalid. Self-ToM uses the
separate validated `SelfBeliefV1` contract and cannot be stored under an
opponent-belief ID.

Approved IDs:

```text
belief:opponent:<observerId>:<targetId>
belief:self:<participantId>
belief:evidence:<sceneId>:<observationId>
tom:belief:final:<observerId>:<targetId>:<beliefKey>
tom:belief:confidence:<observerId>:<targetId>:<beliefKey>
tom:belief:uncertainty:<observerId>:<targetId>:<beliefKey>
```

No alternate metric-first grammar is canonical. Existing `tom:dyad:*` and
`tom:effective:dyad:*` IDs remain compatibility projections until consumers
migrate.

## Approved belief keys

```ts
type ApprovedBeliefKeyV1 =
  | 'trust'
  | 'threat'
  | 'support'
  | 'attachment'
  | 'respect'
  | 'dominance'
  | 'predictability'
  | 'alignment';
```

All values are bounded internal simulation scalars in `[0,1]`:

- trust: expected reliability/non-exploitation by target;
- threat: expected capacity/likelihood of harm in current known context;
- support: expected willingness/capacity to assist observer;
- attachment: inferred directed closeness/bond relevance;
- respect: inferred recognition/legitimacy granted by target;
- dominance: inferred relative control asserted by target;
- predictability: expected stability of target response distribution;
- alignment: inferred compatibility of current goals/interests.

`intimacy`, `bond`, `fear`, `conflict` and `uncertainty` are not additional V1
estimate keys. Legacy adapters map or retain them in compatibility metadata;
TOM-BUILDER-0 must implement the approved mapping with tests rather than aliasing
labels in UI code.

## EstimateV1

```ts
type EstimateV1 = {
  value: number;          // [0,1]
  confidence: number;     // [0,1], support strength/quality
  uncertainty: number;    // [0,1], unresolved epistemic spread
  evidenceIds: string[];
  updatedAtTick: number;
};
```

Confidence and uncertainty are distinct; they are not required to sum to one.
High confidence with residual uncertainty is allowed when evidence is reliable
but outcomes remain variable. Non-finite/out-of-range fields are validation
errors, not silently clamped at the wire boundary.

## Evidence kinds

```ts
type BeliefEvidenceKindV1 =
  | 'observation'
  | 'relation_snapshot'
  | 'role_status'
  | 'faction_signal'
  | 'behavior_event'
  | 'speech'
  | 'scene_fact'
  | 'compatibility_prior';

type BeliefEvidenceV1 = {
  schemaVersion: 1;
  evidenceId: string;
  kind: BeliefEvidenceKindV1;
  observerId: string;
  targetId: string;
  observationId?: string;
  payload: Record<string, unknown>;
  reliability: number; // [0,1]
  tick: number;
  provenance: ObservationProvenanceV1;
};
```

Except `compatibility_prior`, evidence must reference an allowed observation or
its resolver provenance. Compatibility priors record decoder/adapter ID and may
not claim direct observation.

## Inferred goals and predicted policy

```ts
type GoalBeliefV1 = {
  goalId: string;
  probability: number; // [0,1]
  confidence: number;  // [0,1]
  evidenceIds: string[];
};

type PolicyBeliefV1 = {
  actionCategory: string;
  probability: number; // normalized distribution
  confidence: number;
  evidenceIds: string[];
};
```

Goal probabilities need not sum to one because goals may coexist. Policy
probabilities must be finite, non-negative and sum to one within `1e-6` after
deterministic ordering by action category.

## BeliefUpdateTraceV1

```ts
type BeliefUpdateTraceV1 = {
  traceId: string;
  tick: number;
  observerId: string;
  targetId: string;
  beforeDigest: string;
  evidenceIds: string[];
  axisChanges: Array<{
    key: ApprovedBeliefKeyV1;
    before: EstimateV1;
    after: EstimateV1;
    ruleId: string;
    contributorIds: string[];
  }>;
  afterDigest: string;
  adapterSteps: ObservationProvenanceV1['adapterSteps'];
};
```

The trace records rule IDs but TOM-SPEC-0 does not approve their math. Rule
definitions and update equations belong to TOM-UPDATE-0.

## OpponentBeliefV1

```ts
type OpponentBeliefV1 = {
  schemaVersion: 1;
  systemVersion: string;
  beliefId: string;
  observerId: string;
  targetId: string;
  estimates: Record<ApprovedBeliefKeyV1, EstimateV1>;
  inferredGoals: GoalBeliefV1[];
  predictedPolicy: PolicyBeliefV1[];
  evidence: BeliefEvidenceV1[];
  summary: {
    confidence: number;
    uncertainty: number;
  };
  lastUpdateTrace?: BeliefUpdateTraceV1;
  updatedAtTick: number;
};
```

Summary confidence and uncertainty are arithmetic means across the eight axis
estimates in declared key order. They are derived on encode and verified on
decode; consumers must not edit them independently.

## Persisted versus derived fields

Persisted:

- version/identity/direction;
- eight axis estimates;
- evidence ledger;
- updated tick and last update trace.

Derived on load/build and not authoritative persistence:

- summary confidence/uncertainty (verified cache);
- inferred goals;
- predicted policy;
- S5 atom projections;
- contextual affect and UI labels.

The wire shape may serialize derived goal/policy fields for export/debug, but a
loader recomputes or marks them stale when their producer version differs.

## Evidence retention

- Evidence is ordered by `(tick, evidenceId)`.
- V1 persists at most 256 evidence items per directed belief.
- On overflow, the oldest evidence is compacted into a
  `compatibility_prior`-like summary record with source IDs and compaction
  adapter version; evidence is never dropped silently.
- Estimates may reference compacted evidence IDs.

## S0 load contract

S0 receives a versioned map:

```text
Record<observerId, Record<targetId, OpponentBeliefV1>>
```

It validates version, direction, keys, ranges, evidence references and summary.
Invalid beliefs are reported and excluded; neutral replacement is forbidden.
Legacy payloads pass through a named decoder before S0.

## S5 atom projection

For each axis, S5 emits exactly three canonical atoms:

```text
tom:belief:final:observer:target:key       magnitude = estimate.value
tom:belief:confidence:observer:target:key  magnitude = estimate.confidence
tom:belief:uncertainty:observer:target:key magnitude = estimate.uncertainty
```

Each atom carries:

- `subject = observerId`, `target = targetId`;
- origin `belief`, namespace `tom`;
- `usedAtomIds` pointing to evidence projections and prior belief ID;
- parts containing belief ID, key, tick and update trace ID.

The corresponding belief/evidence objects are retained under
`S5.artifacts.opponentBeliefDualEmit.beliefs`, so every referenced belief and
evidence ID resolves to its source IDs and adapter steps in pipeline output.

Existing `tom:dyad:*`/`tom:effective:*` output is compatibility-only and may be
dual-emitted by a versioned adapter. Downstream new code reads only the approved
grammar.

## Persistence and replay

- Runtime persistence key: `belief:opponent:<observer>:<target>` in the owning
  agent/belief store selected by TOM-BUILDER-0; not global target truth.
- Serialization sorts observer IDs, target IDs, belief keys, evidence and
  policy categories before hashing/export.
- Semantic replay compares IDs, estimates, evidence semantic fields, derived
  summaries and update trace rule/contributor IDs.
- Replay ignores export timestamps, UI labels and object insertion order.
- Same prior + observation envelopes + tick + builder/update versions + seed
  yields the same semantic belief and S5 projection.

## Legacy decoder policy

Supported V1 migration inputs:

1. root `world.tom[observer][target]: TomEntry`;
2. legacy `world.tom.views[observer][target]: TomView`;
3. V3 `TomDyadReport`;
4. Contextual Mind dyad report as derived evidence/view only;
5. Conflict relation/observation adapter as compatibility evidence.

Decoder rules:

- decoder ID/version is recorded in every `compatibility_prior` provenance;
- missing approved axes remain absent at decoder intermediate validation and
  must be initialized by TOM-BUILDER-0 with an explicit prior rule;
- unknown fields are retained in migration diagnostics, not copied into the
  approved estimates map;
- decoder never reads additional target truth to fill missing values;
- unknown schema versions return incompatibility, not best-effort parsing.

## Self-ToM and self-belief separation

- OpponentBelief requires `observerId !== targetId`.
- Self-ToM/second-order belief uses a separate future `belief:self-model:*`
  contract and cannot be projected as an opponent axis.
- `agent.memory.beliefAtoms` from `beliefPersist` stores predicted features,
  chosen action, feasibility, surprise and driver pressure. It remains the
  self/world feedback loop and is not decoded as OpponentBelief evidence unless
  a registered observation explicitly references another target.
- Reverse view `target -> observer` is another OpponentBelief owned by target,
  not observer's Self-ToM.

## Validation errors

```text
invalid_schema_version
invalid_system_version
invalid_belief_id
self_target_forbidden
missing_axis
unknown_axis
invalid_estimate
invalid_confidence
invalid_uncertainty
invalid_tick
invalid_evidence_kind
invalid_evidence_reference
missing_provenance
invalid_policy_distribution
summary_mismatch
unsupported_legacy_shape
```

Validation accumulates errors with field paths. Invalid payloads are not
partially persisted or projected to S5.

## Required semantic oracles

Hidden-field non-interference:

```text
same prior + same visible ObservationEnvelopeV1[] + changed hidden target truth
=> same semantic OpponentBeliefV1
=> same S5 projection and fixed-policy decision trace
```

Visible sensitivity:

```text
same observer prior + different allowed role/status/faction/behavior evidence
=> different evidence ledger and at least one approved estimate
=> difference reaches utility/decision trace
```

Reload/replay:

```text
encode -> decode -> rebuild derived fields
=> semantically equal belief and S5 atoms
```

## Explicitly deferred

- mapping equations from legacy bond/intimacy/fear/conflict;
- legacy persistence writer and decoder adapters;
- scene and Conflict adapters;
- Self-ToM schema;
- deletion of legacy ToM contracts.

## Acceptance

- IDs, axes, estimates, evidence, trace, serialization, S0/S5, persistence,
  replay, decoder and Self-ToM boundary are decision complete.
- No update formula, builder or runtime type was implemented.

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Belief axes are bounded
internal simulation estimates, not validated psychological measurements or
real-world predictions.
