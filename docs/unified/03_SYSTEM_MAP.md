# System Map

## Top-Level Shape

The repo is organized around several overlapping families:

- `lib/*`: runtime logic, formulas, pipeline, decision, simkit, graph, context, ToM
- `components/*`: UI panels and legacy/new GoalLab shells
- `pages/*`: route entry points
- `tests/*`: invariants and behavioral coverage
- `docs/*`: several generations of documentation
- `kanonar_control_plane/*`: new high-level audit notes, currently not yet integrated

## Runtime Core

### Pipeline

Primary entry:

- `lib/goal-lab/pipeline/runPipelineV1.ts`

Key supporting areas:

- `lib/context/pipeline/stage0.ts`
- `lib/context/axes/deriveAxes.ts`
- `lib/context/lens/characterLens.ts`
- `lib/emotion/*`
- `lib/tom/*`
- `lib/drivers/deriveDrivers.ts`
- `lib/goals/*`
- `lib/decision/*`

### Config

Primary numeric registry:

- `lib/config/formulaConfig.ts`

Simulation-specific extension:

- `lib/config/formulaConfigSim.ts`

### Canonical Atom Extraction

- `lib/goal-lab/atoms/canonical.ts`

This file explicitly says truth is `pipelineV1.stages[*].atoms`, with `snapshot.atoms` only as fallback.

## UI Surfaces

### Global App Routing

Main shell:

- `index.tsx`
- `App.tsx`

Observed route families:

- live GoalLab: `/goal-lab-v2`, `/goal-lab-console-v2`
- legacy GoalLab: `/goal-lab`, `/goal-lab-console`
- legacy console shell: `/console`
- simulation: `/simulator`
- many domain labs and editors under `pages/*`

### GoalLab v2

Primary active path:

`App.tsx` -> `pages/GoalLabPageV2.tsx` -> `contexts/GoalLabContext.tsx` -> `hooks/useGoalLabEngine.ts`

Main rendering family:

- `components/goal-lab-v2/*`
- `components/goal-lab/*` for many deep debug and analysis panels still in use

### Legacy GoalLab / GoalSandbox

Still mounted and reachable:

- `pages/GoalLabPage.tsx`
- `pages/GoalLabConsolePage.tsx`
- `pages/ConsolePage.tsx`
- `components/GoalSandbox/*`

This is still live code, but should not be treated as the canonical model contract.

## Simulation / Orchestration

Main family:

- `lib/simkit/*`

Key bridge files:

- `lib/simkit/plugins/goalLabDeciderPlugin.ts`
- `lib/simkit/plugins/orchestratorPlugin.ts`
- `lib/simkit/core/decisionGate.ts`

What matters:

- SimKit is not separate from GoalLab; it can feed and consume pipeline-derived state.
- simulator mode adds decision gating, variability controls, and replay-sensitive seeded behavior.

## Tests As Living Contract

Most important suites for safe changes:

- `tests/pipeline/*`
- `tests/decision/*`
- `tests/simkit/*`
- `tests/goals/*`
- `tests/lens/*`

Notable confirmed behaviors from tests:

- stage namespace isolation is enforced
- `ctx:final:*` must appear at `S3`
- actions must not read `goal:*` directly
- lookahead can be deterministic under fixed seed
- SimKit decision mode switches between deliberative, degraded, and reactive

## Documentation Families

### Current high-signal docs

- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `docs/ARCHITECTURE.md`

### Agent onboarding docs

- `docs/agent/*`

Useful, but partially stale in path assumptions. Example: it tells agents to search `src`, while live logic is mostly under `lib`, `components`, `pages`, `hooks`.

### Deep model docs

- `docs/agents/*`

Useful for conceptual background, but do not treat them as fresher than pipeline docs without checking code.

## Known Architectural Tensions

- `HomePage` promotes `/goal-lab-v2`, but `Header` still foregrounds legacy GoalLab routes.
- `useGoalLabEngine.ts` is a mixed orchestration layer, not a clean read-only projector over one canonical contract.
- `useGoalLabWorld.ts` introduces UI-time seed generation via `Date.now()`, which weakens reproducibility at the surface layer.
- several docs families make overlapping claims about “canon”, so trust order must be explicit.
