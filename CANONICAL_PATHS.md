# CANONICAL_PATHS.md

Concrete paths that define behavior. If a UI projection or old doc disagrees
with these paths, prefer these paths unless a newer canonical doc says otherwise.

## Context And Pipeline

- Context types: `lib/context/v2/types.ts`
- Context normalization: `lib/context/v2/infer.ts`
- Pipeline orchestration: `lib/goal-lab/pipeline/runPipelineV1.ts`
- Pipeline helpers: `lib/goal-lab/pipeline/*`
- Canonical atom extraction: `lib/goal-lab/atoms/canonical.ts`
- Pipeline docs: `docs/PIPELINE.md`, `docs/INVARIANTS.md`

## Decision Path

- Candidate assembly: `lib/decision/actionCandidateUtils.ts`
- Projection: `lib/decision/actionProjection.ts`
- Cost model: `lib/decision/costModel.ts`
- Final choice: `lib/decision/decide.ts`
- Goal sources: `lib/goals/*`
- Goal/action bridge rule: actions consume projected utility/action candidates,
  not raw `goal:*` atoms directly.

## Formula And Coefficients

- GoalLab pipeline coefficients: `lib/config/formulaConfig.ts`
- SimKit coefficients: `lib/config/formulaConfigSim.ts`
- Policy: no hidden scoring constants in pipeline stages or runtime gates.

## Simulation Runtime

- Simulator core: `lib/simkit/core/simulator.ts`
- World and snapshots: `lib/simkit/core/world.ts`
- RNG: `lib/simkit/core/rng.ts`
- Sim actions/rules: `lib/simkit/core/rules.ts`, `lib/simkit/actions/*`
- GoalLab decider bridge: `lib/simkit/plugins/goalLabDeciderPlugin.ts`
- GoalLab world adapter: `lib/simkit/plugins/goalLabWorldState.ts`
- Compare runner/labs: `lib/simkit/compare/*`

## Explainability And Provenance

- Atom trace contract: `lib/context/v2/types.ts`
- Pipeline stage artifacts: `lib/goal-lab/pipeline/pipelineTypes.ts`
- Decision trace assembly: `lib/decision/*`
- SimKit per-agent trace: `world.facts['sim:trace:<agentId>']`
- SimKit pipeline summary: `world.facts['sim:pipeline:<agentId>']`

## UI Surfaces

- Active route: `pages/GoalLabPageV2.tsx`
- Active context: `contexts/GoalLabContext.tsx`
- Active v2 components: `components/goal-lab-v2/*`
- Deep debug/lab panels: `components/goal-lab/*`
- Legacy routes: `pages/GoalLabPage.tsx`, `pages/GoalLabConsolePage.tsx`

## Tests By Surface

- Pipeline: `tests/pipeline/*`
- Decision: `tests/decision/*`
- SimKit: `tests/simkit/*`
- Lens/context: `tests/lens/*`
- Goals: `tests/goals/*`

## Known Compare-Lab Contract

- `RunResult.records` contains semantic tick records, but snapshots do not store
  live `world.facts`.
- `RunResult.pipelineHistory` is the compact per-tick source for mode, driver,
  and goal-score comparison.
- Deterministic pair runs should compare semantic data, not snapshot timestamp
  strings.
