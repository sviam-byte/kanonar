# CONFLICT-GAP-0 — аудит существующего Conflict kernel

Статус: DONE. Дата: 2026-07-11. Режим: read-only audit; domain runtime и
существующие tests не изменялись.

## Scope and source map

Проверены:

- canonical types/engine: `lib/dilemma/dynamics/types.ts`, `engine.ts`,
  `trustExchange.ts`, `state.ts`;
- live compatibility runner and attachment:
  `lib/dilemma/runner.ts`, `lib/dilemma/dynamics/bridge.ts`;
- legacy GoalLab-style dilemma projection: `lib/dilemma/bridge.ts`;
- GoalLab decision seam: `lib/goal-lab/pipeline/runPipelineV1.ts`,
  `lib/possibilities/*`, `lib/decision/*`;
- contracts and tests: `docs/CONFLICT_LAB_CONTRACT.md`,
  `docs/CONFLICT_LAB_MATH_SPEC.md`, `tests/dilemma/conflictDynamics.test.ts`,
  `canonicalBridge.test.ts`, `dynamicsCore.test.ts`,
  `mechanicProtocols.test.ts`.

## Existing canonical kernel contract

### State

`ConflictState` is a deterministic two-player state with tick, directed agent
and relation state, environment, history, strategy profiles, directed learning
memory, regimes and trajectory trace. `CanonicalConflictState` makes memory,
regimes and trace mandatory (`lib/dilemma/dynamics/types.ts`). Scalars are
normalized by `normalizeConflictState`.

Current limitations:

- players are a fixed tuple of two IDs;
- role is only `participant`;
- protocol is only `trust_exchange`;
- phases are fixed to `simultaneous_choice | resolution`;
- no `schemaVersion` is present on state or run report.

### Actions and legal-action boundary

The typed kernel vocabulary is exactly:

```text
trust | withhold | betray
```

`createTrustExchangeProtocol` owns action order and phase list.
`getAvailableActions` returns the protocol action order, while
`validateJointAction` rejects missing, duplicate or invalid player/action
combinations (`lib/dilemma/dynamics/engine.ts`).

### Observation

`getObservationForPlayer` produces an observer-specific object containing self,
directed relation/memory/regime to the other participant, environment, history
length and legal action IDs. It does not expose the opponent's current action.
The hidden-action invariant is tested in
`tests/dilemma/conflictDynamics.test.ts`.

Missing relative to the target boundary:

- no scene-resolution provenance;
- no evidence envelope or belief `before -> evidence -> after` trace;
- relation/memory are read as current kernel state, not a versioned
  `OpponentBelief` input;
- visibility is an environment scalar, not a field-level observation policy.

### Utility and choice

`evaluateTrustExchangeUtilities` computes kernel-local action utility from
agent, relation, memory and environment state using
`CONFLICT_LAB_DYNAMICS_FORMULA`. `updateStrategyProfileReplicator` updates the
probability profile; `selectDominantAction` chooses deterministic argmax with
the protocol order as tie-break (`lib/dilemma/dynamics/engine.ts`).

This is not the GoalLab S8 contract. The live compatibility runner separately
uses `scoreActions` plus seeded Gumbel selection (`resolveAction`) in
`lib/dilemma/runner.ts`. CONFLICT-CHOICE-ADR-0 must choose how these policies
relate; this audit does not choose one.

### Payoff and transition

`resolveTrustExchangeOutcome` owns the complete 3×3 joint-action semantics and
returns payoffs, agent/relation/environment deltas, outcome tag and event tags.
Coefficients come from `CONFLICT_LAB_DYNAMICS_FORMULA`.
`applyConflictTransition` applies bounded state updates, memory/regime changes,
history and trace. `resolveProtocolStep` validates, observes, scores, chooses,
resolves and applies the transition as one pure Result-returning step.

### Trace

`ConflictStepResult` preserves observations, action utility breakdowns,
strategy profiles, selected actions, outcome and optional intervention.
`ConflictTrajectoryFrame` additionally records directed before/delta/after
relations, memory, reward, prediction and regime changes.

Missing relative to GoalLab integration:

- no GoalLab `usedAtomIds`/parts provenance on utilities or choice;
- no shared action-candidate ID linking a Conflict action to S8;
- no shared runtime/schema version on state, observation, result or trace;
- no scene/belief adapter provenance in frames.

## Current live inputs and choices

### Traits and relations

Both `runDilemmaV2` and `buildCanonicalInitialState` compile mutable
`AgentState` through `compileAgent` / `compileDyad`. The runner initializes
directed relations from `initTomForCharacters`, with `computePairTrust` fallback,
then writes the result into cloned agent relationship/ToM fields. The canonical
bridge compiles those agents again into `ConflictAgentState` and
`ConflictRelationState` (`lib/dilemma/runner.ts:467+`,
`lib/dilemma/dynamics/bridge.ts`).

Consequences:

- the kernel is typed after adaptation, but input ownership remains the
  compatibility runner/compiler;
- fallback relation construction has no shared observation/belief provenance;
- GoalLab S5 artifacts are not the canonical input to this bridge.

### Choices

`runDilemmaV2` executes its own per-round action filtering, scoring, seeded
Gumbel choice, outcome and learning trace. In parallel it attaches one
`conflictCore` report generated by `runCanonicalConflictLab`. The report does
not currently drive the legacy round choices or state updates. Therefore the
attachment is comparison/evidence, not runtime integration.

## Action vocabulary gap

| layer | current vocabulary | status |
| --- | --- | --- |
| canonical kernel | `trust`, `withhold`, `betray` | typed mechanic actions |
| canonical report labels | `trust / cooperate`, `withhold / hedge / silent`, `betray / defect` | display labels only; not typed aliases |
| legacy `trust_exchange` scenarios | commonly `cooperate`, `defect`, `hedge`, sometimes `manipulate` | scenario-specific action templates |
| old `lib/dilemma/bridge.ts` | arbitrary `DilemmaSpec.actions` projected through `scoringMap` | v1 compatibility projection, not the live canonical bridge |
| GoalLab possibilities | general social keys such as `help`, `share`, `wait`, `threaten`, `confront`, `negotiate` | no total mechanic-aware mapping |

The mapping is not one-to-one:

- `trust` may mean cooperate, share, disclose, help or accept mechanic-specific
  risk;
- `withhold` may mean hedge, wait, remain silent or refuse disclosure;
- `betray` may mean defect, manipulate, seize or reveal information.

Therefore no adapter may rename these actions by string heuristic. The stop
condition from the plan is reached: a typed projection contract is required
before GoalLab can choose canonical Conflict actions.

## Gap matrix

| boundary | current owner/path | target owner | semantic mismatch | required adapter/test | decision needed |
| --- | --- | --- | --- | --- | --- |
| resolved scene -> kernel state | runner/compiler + canonical bridge | shared scene resolver -> Conflict adapter | direct `WorldState` compilation; no scene provenance | `CONFLICT-SCENE-ADAPTER-0`; identity/determinism/provenance tests | exact scene contract after SCENE-INVENTORY-0 |
| observation -> belief | `ConflictObservation` reads kernel relation/memory | observation resolver + directed OpponentBelief | no evidence envelope or belief-update trace | observation projection test; hidden-field non-interference oracle | OpponentBelief shape in TOM-SPEC-0 |
| traits/relations -> utility | `compileAgent`/`compileDyad`, runner ToM fallback | GoalLab cognition/utility seam | duplicate derived psychology and fallback provenance | adapter fixture comparing explicit inputs; no fallback-to-truth test | which GoalLab artifacts are admitted |
| legal Conflict actions -> GoalLab candidates | kernel action order vs general possibilities | ConflictDefinition then GoalLab adapter | no total typed vocabulary mapping | typed projection with bijection/round-trip and illegal-action tests | **projection contract required** |
| choice | replicator + argmax; runner seeded Gumbel | explicit versioned policy | two active policies and distinct traces | dual-run semantic comparison | CONFLICT-CHOICE-ADR-0 |
| payoff/transition | pure kernel for `trust_exchange`; runner for scenario actions | ConflictDefinition/kernel | canonical report does not drive live legacy rounds | parity oracle over fixed joint actions and transitions | migration policy after parity |
| trace/provenance | rich kernel frames; GoalLab atom provenance separate | joined trace with stable IDs | no action/utility/atom correlation ID | trace join contract test | ID/version shape |
| persistence/versioning | reports/state lack `schemaVersion` | versioned shared runtime | decoder compatibility undefined | encode/decode/replay fixture | version introduction point |
| unsupported mechanics | protocol cards + legacy runner | typed per-mechanic kernels | descriptive cards can look more complete than executable core | keep `unsupported_kernel` projection test | future kernel order |

## Required gaps

1. Typed Conflict-action projection contract. It must carry protocol ID, phase,
   role, kernel action ID, actor/target, provenance and schema version; it must
   not infer semantics from labels.
2. Scene and observation adapters with hidden-field non-interference and
   provenance tests.
3. Explicit GoalLab utility/choice seam selected by
   CONFLICT-CHOICE-ADR-0.
4. Joined trace IDs connecting observation/belief, S8 candidate, kernel action,
   outcome and transition.
5. Versioned state/report payloads and replay compatibility fixtures.

## Compatibility gaps

- preserve `runDilemmaV2` traces and scenario actions until parity evidence;
- preserve `unsupported_kernel` for non-`trust_exchange` mechanics;
- treat `lib/dilemma/bridge.ts` as v1 compatibility, not a reusable canonical
  mapping;
- do not remove compiler/ToM fallbacks until explicit adapters cover old cards.

## Future gaps

- N-participant state and directed observations;
- asymmetric roles and multi-phase protocols;
- field-level hidden information and signaling beliefs;
- typed kernels for authority, ultimatum, volunteer and signaling mechanics;
- coalition/cooperation mechanics after the multi-agent foundation.

## Proposed next contract

Before CONFLICT-INTEGRATION-0, issue a narrow projection specification with this
minimum row:

```text
protocolId | phaseId | role | kernelActionId | actorId | targetIds |
legalSource | utilityCandidateId | provenance | schemaVersion
```

Required tests:

- every legal kernel action projects exactly once;
- round-trip preserves `trust | withhold | betray` IDs;
- an illegal/unknown GoalLab candidate cannot enter the joint action;
- labels/localization do not affect projection;
- same scene, belief, policy and seed produce the same projected joint action.

The projection semantics themselves remain `decision needed`; this audit does
not authorize an implementation or string mapping.

## Acceptance

- State/action/observation/payoff/transition/trace ownership is listed with
  concrete paths.
- Vocabulary mismatch is explicit and no action was renamed.
- Every required gap has a proposed adapter/test or named decision.
- Runtime, formulas, golden expectations and existing tests were not changed.

