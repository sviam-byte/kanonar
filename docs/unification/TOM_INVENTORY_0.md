# TOM-INVENTORY-0 — карта ToM contracts

Статус: DONE. Дата: 2026-07-11. Режим: read-only audit; runtime, types и tests
не изменялись.

## Scope

Полностью обойдён `lib/tom/**` (40 файлов), затем проверены живые входы из
GoalLab, context v4, SimKit/Conflict, planning/dialogue и UI. Отдельного
`tests/tom/` нет; test evidence находится в pipeline/decision/dilemma suites.

Главный вывод: в репозитории нет одного готового object-level ToM contract.
Живой GoalLab pipeline сходится на target-specific `tom:*` atoms в S0/S5, но
эти atoms проецируются из нескольких object shapes и fallback-источников.

## Live data flow into S5

```text
initTomForCharacters -> world.tom[observer][target]: TomEntry       (legacy store)
                               |
context/v4 build -> V3 TomDyadReport -> sync back to world.tom      (transitional)
                               |
stage0/extractTomDyadAtoms -> tom:dyad:observer:target:metric atoms (adapter)
                               |
S5 relation priors -> physical/social factors -> non-context dyads
   -> belief bias -> tom:effective:* / policy atoms                  (pipeline canon candidate)
```

`runGoalLabPipelineV1` does not consume `TomEntry` directly in S5. S0 extracts
dyad atoms from `world.tom`/`agent.tom`; S5 then operates on atoms and preserves
target/provenance through IDs and traces.

## Inventory

| type/function | runtime owner | observer/target IDs | axes/ranges | visibility/input | persistence | trace/provenance | consumers | self vs other | status | decision | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| root `TomState` / `TomEntry` | `types.ts`, `lib/tom/state.ts` | nested string keys `observer -> target` | traits/goals/uncertainty, mostly `[0,1]` by convention | initialized from full character/world data, history, faction and dyad config | `world.tom`; sometimes copied to `agent.tom` | ticks, but no source evidence IDs or schema version | context v4, S0 adapter, Conflict compiler, UI/helpers | other-model; optional `secondOrderSelf` embedded | active legacy storage | adapt behind typed input; do not extend | `init.ts`, `useGoalLabWorld.ts`, `types.ts:663+` |
| `initTomForCharacters` | GoalLab world initialization and several tools | explicit character pair loops | `TomBeliefTraits` | reads target identity/competence, observer history, factions and config; includes defaults | replaces/rebuilds `world.tom` | no per-field provenance; `lastUpdatedTick=0` | GoalLab world, world initializer, dilemma runner, diagnostics/planning | other-model | active compatibility builder | keep until adapter parity; source provenance required | `lib/tom/init.ts`; `hooks/useGoalLabWorld.ts` |
| V3 `TomDyadReport` / `buildDyadReport` | context v4 frame builder | `selfId`, `otherId` | 8 state axes, confidence, decomposition, affect, prediction; `[0,1]` | receives explicit domains, norms, affect, evidence and prior | report stored in frame; state also synced into legacy `world.tom` | contributor/decomposition arrays and emitted atoms | `lib/context/v4/build.ts`, frame atomizer, UI | other-model | active transitional report | adapt; candidate evidence envelope, not final wire type | `lib/tom/v3/*`, `context/v4/build.ts:397+` |
| `syncWorldTomFromDyadReport` | context v4 build side effect | `selfId -> otherId` | lossy V3 state -> legacy traits | full resolved frame builder | mutates `world.tom` during context construction | loses V3 contributor detail in legacy fields | later S0/S5 runs | other-model | transitional risk | replace with explicit persistence adapter | `lib/context/v4/build.ts:16,422` |
| `extractTomDyadAtoms` | context stage S0 | `selfId`, list of `otherAgentIds` | trust, threat, intimacy, alignment, respect, dominance, uncertainty, support | accepts several `world.tom`/`agent.tom` shapes through `any`; adds acquaintance-derived adjustments | derived per pipeline call | atom subject/target and synthetic `tom_state:*` dependency; raw source field path not retained | S5, emotions, decisions, UI | other-model | active compatibility adapter | keep boundary, tighten input union/provenance | `lib/context/sources/tomDyadAtoms.ts`, `stage0.ts:302+` |
| S5 atom pipeline | `runGoalLabPipelineV1` | encoded in IDs and atom subject/target | relation priors, physical/social threat, base/context/effective dyads, policy | only atom pool; no direct target object access | derived in pipeline result/trace | `usedAtomIds`, parts, overridden IDs, counts | S6 emotions/drivers, S7 goals, S8 priors/choice | target-specific other-model | **canonical owner candidate for cognition consumption** | keep; TOM-SPEC-0 should define admitted atom contract | `runPipelineV1.ts:800–860`; stage-isolation tests |
| relation-prior/non-context/belief-bias/policy functions | S5 sublayers | ID-parsed `self -> target` | `[0,1]` atom magnitudes/probabilities | reads `rel:*`, context and existing `tom:*` atoms; neutral fallbacks | derived | mostly explicit atom trace | S5 downstream | other-model | active pipeline implementation | keep; catalogue fallbacks and ID grammar | `lib/tom/base/*`, `ctx/beliefBias.ts`, `policy/tomPolicy.ts` |
| `ContextualMindState/Report` / `computeContextualMind` | optional GoalLab UI calculation | `observerId`, `targetId` | contextual dyad state, beta memory, affect, axes | reads frame, atoms, world, goals and full agent; targets fall back relations -> nearby -> world.tom keys | mutates `agent.contextualMind`; returns `nextState` | signal atom paths, axes and report debug; no shared S5 trace ID | contextual panels/results; not S5 | self affect plus other-model | active parallel/transitional contour | do not merge mechanically; define adapter or view-only status | `lib/tom/contextual/*`, `hooks/useGoalLabEngine.ts:363+` |
| `computeTomGoalsForAgent` | pre-pipeline UI GoalLab computation | string `agentId -> otherId` | threat/trust/align goal deltas | reads `world.tom` with direct/legacy fallback plus target location/map | derived only | human-readable source strings, not atom provenance | GoalLab UI result payload | other-model | active parallel compatibility scoring | replace with canonical S5/S7 projection or prove distinct UI purpose | `lib/context/v2/tomGoals.ts`, `useGoalLabEngine.ts:361` |
| `noncontextTom` general model | ToM inspector/tooling | dossier IDs | broad truth/belief vectors, Bayesian-like state, error profiles | dossier and observation objects | local caller state | rich evidence structures | `TomGeneralInspector`, internal mapper/profile helpers | self and other diagnostics | active tooling, not pipeline | keep as diagnostic compatibility; no promotion to canon | `lib/tom/noncontextTom.ts`, inspector imports |
| `engine-v4` reaction predictor | planning/dialogue | agent/other IDs | reaction probabilities/goals | receives full agents/world/action | derived per call | limited result explanation | `planner-v4`, dialogue engine | other reaction model | active specialist compatibility | keep separate; adapter only if TOM-SPEC requires it | `lib/tom/engine-v4.ts` importers |
| second-order chain | inspector/noncontext model | reverse dyad concepts | perceived trust/alignment/dominance/uncertainty | comments acknowledge proxy/fallback values | derived | no S5 provenance | noncontext inspector | Self-ToM/second order | tooling/partial | do not call canonical Self-ToM | `lib/tom/second_order.ts` |
| Conflict runner ToM estimate | `runDilemmaV2`/compiler | cloned agent `observer -> target` | legacy traits plus action-response probabilities | initializes from full characters; falls back to pair trust; reads own utility model | cloned runner state/trace | learning trace, not GoalLab atom provenance | Conflict scoring/gating | other-model | live compatibility semantic gap | adapter after TOM-SPEC and choice ADR | `lib/dilemma/runner.ts`, `compiler.ts`, CONFLICT-GAP-0 |
| `beliefPersist` | GoalLab S8/S9 feedback | primarily `selfId`; optional chosen target metadata | predictions, chosen action, feasibility, surprise, driver pressure | pipeline artifacts and previous belief atoms | caller writes `agent.memory.beliefAtoms` | atom traces, though some roots have empty `usedAtomIds` | next tick S0/S6/S7 | self/world belief, **not opponent ToM** | active separate belief loop | keep separate from OpponentBelief | `lib/goal-lab/pipeline/beliefPersist.ts` |
| legacy update/decay/event/view modules | old engine/tool contours | legacy nested strings | legacy `TomEntry` fields | mutable world/agent/event inputs | mutates legacy state | inconsistent | several are unreachable from active routes | mixed | legacy/delete candidates | audit before deletion; no runtime changes here | unused scan + `lib/tom/{update,decay,eventsIntegration,view,...}` |

## Full `lib/tom/**` classification

### Active pipeline or active adapter

- `base/applyRelationPriors.ts`, `base/deriveNonContextDyads.ts`;
- `ctx/beliefBias.ts`, `policy/tomPolicy.ts`, `layers.ts`;
- `init.ts`, `dyad-metrics.ts`, `state.ts`;
- `v3/types.ts`, `v3/buildDyadReport.ts`, `v3/emitAtoms.ts`,
  `v3/adapterLegacy.ts`;
- `api.ts` through context v4;
- `contextual/types.ts`, `contextual/engine.ts`, `contextual/axes.ts`,
  `contextual/math.ts`.

### Active specialist/UI tooling

- `noncontextTom.ts`, `mapper.ts`, `profileSummary.ts`, `second_order.ts`;
- `engine-v4.ts` through planning/dialogue;
- `core.ts` through dashboard metrics;
- `rel.ts` and remaining imported helpers where reached by current callers.

### Legacy/unreachable candidates from the repository unused scan

`affect.ts`, `decay.ts`, `dyad-defaults.ts`, `engine-v4.ts`, `errors.ts`,
`eventsIntegration.ts`, `memory/update.ts`, `norms.ts`, `policy.ts`,
`shame_guilt.ts`, `tomContextBridge.ts`, `update.ts`, `view.ts` were reported
unreachable by `npm run unused`. `engine-v4.ts` nevertheless has direct imports
from planning/dialogue files that are themselves outside active route reach;
therefore the correct status is specialist compatibility/unreachable-from-routes,
not unused implementation. Deletion requires a separate package and caller
decision.

`compat.ts` has no importer outside `lib/tom`, but is used by `api.ts`, which is
live through context v4. It is therefore an internal compatibility dependency,
not a standalone safe-delete conclusion.

## ID direction and Self-ToM

Current dominant direction is:

```text
world.tom[observerId][targetId]
tom:dyad:<observerId>:<targetId>:<metric>
tom:effective:dyad:<observerId>:<targetId>:<metric>
```

However some consumers support legacy wrappers or alternate ID grammars, and
`actionCandidateUtils.ts` searches both metric-first and self-first variants.
TOM-SPEC-0 must freeze one grammar and provide explicit compatibility parsing.

No canonical Self-ToM payload reaches S5. Current self-related mechanisms are:

- observer's real affect/traits used while interpreting targets;
- optional `TomEntry.secondOrderSelf`;
- proxy second-order reports in `second_order.ts`;
- UI reverse-view queries (`target -> observer`) presented as “their beliefs
  about you”.

These must remain distinct from `observer -> target` OpponentBelief.

## Visibility and target-state leakage

The current live initialization and compatibility consumers can read full target
character fields:

- `initTomForCharacters` reads target clearance/competence and shared world
  faction data;
- context v4 constructs evidence from resolved frame/world and then mutates the
  legacy store;
- `computeTomGoalsForAgent` reads target location/map state in addition to ToM;
- Conflict compiler/runner receives full cloned agents.

This does not satisfy the target hidden-field non-interference invariant. The
current paths are compatibility inputs, not evidence that a target field is
observable. TOM-SPEC-0 must accept an observation/evidence envelope, not a full
target `WorldState`.

## Persistence and versioning

Persisted/mutated today:

- `world.tom` legacy nested state;
- optional per-agent `tom` copies in compatibility runners;
- `agent.contextualMind` written by `computeContextualMind`;
- `agent.memory.beliefAtoms` written by pipeline callers (separate belief loop).

Derived today:

- V3 dyad reports/frame atoms;
- S5 base/context/effective/policy atoms;
- UI `computeTomGoalsForAgent` scores;
- Conflict opponent-choice estimate.

None of the ToM object payloads above carries a shared `schemaVersion`.
Introducing a canonical persisted belief shape therefore requires decoder or
explicit incompatibility handling for legacy `world.tom`, agent copies and
contextual mind state.

## `any` / unknown hotspots

- root `TomState` explicitly permits `| any`;
- `ContextualMindInputs.world` and `.agent` are `any`;
- `extractTomDyadAtoms` parses raw multi-shape data through `any`;
- GoalLab hook exposes `tom: any` and casts contextual inputs;
- context v4 mutates `(world.tom as any)` and adapts V3 back to legacy;
- Conflict compiler/runner probes multiple ToM shapes through `any`;
- `TomEntry.biases` differs between dedicated state (`any`) and root duplicate
  (`Record<string, number>`).

These are adapter/type-debt locations, not authorization for a broad `any`
cleanup during TOM-SPEC-0.

## Canonical owner candidate and required adapters

Canonical consumption owner candidate:

```text
GoalLab S5 target-specific atom contract
```

Reason: it is on the live pipeline, preserves observer/target identity and atom
provenance, and feeds downstream cognition without exposing a full target
object. This selects an ownership boundary, not a finalized OpponentBelief type
or update formula.

Required adapters for the next stages:

1. observation/evidence envelope -> versioned directed belief update;
2. legacy `world.tom` -> canonical directed belief input (read compatibility);
3. V3 report -> canonical belief/atoms without hidden write-back;
4. canonical belief -> S5 atom projection with one ID grammar;
5. Conflict observation/belief -> the same directed contract;
6. contextual mind -> explicit derived view or separately versioned memory;
7. legacy snapshot decoder/migration report.

## Test evidence and missing coverage

Existing indirect evidence:

- `tests/pipeline/stage_isolation.test.ts`: S5 enable/disable and namespace
  behavior;
- `tests/pipeline/determinism_oracle.test.ts`: fixed-input pipeline
  determinism with ToM enabled;
- `tests/decision/target_differentiation.test.ts`: target-specific dyad atoms
  change action differentiation;
- `tests/decision/action_hint_compat.test.ts`: legacy dyad IDs influence hints;
- dilemma tests cover Conflict-local observation/learning, not GoalLab ToM
  contract parity.

Not found:

- dedicated `tests/tom/`;
- hidden target-field non-interference test;
- legacy `world.tom` -> S5 projection contract test;
- V3 write-back/persistence migration test;
- contextual-mind vs S5 semantic parity or explicit independence test;
- schema encode/decode/replay fixture;
- canonical Self-ToM separation test.

## Decisions required for TOM-SPEC-0

- freeze one observer/target ID grammar and branded/string ID policy;
- define persisted fields versus derived/contextual projections;
- define evidence visibility and update provenance;
- decide whether Contextual Mind is a derived view or separate persisted model;
- decide how legacy `world.tom` is decoded and when V3 write-back ends;
- specify the Conflict adapter without reading target truth;
- keep Self-ToM/reverse-belief separate from directed opponent belief.

## Acceptance

- All active ToM representations, S5 links and persistence paths are present.
- Missing runtime/test evidence is marked `not found`.
- No `OpponentBelief` type, update formula, mechanical type merge or deletion was
  introduced.

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

