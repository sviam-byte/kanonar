# Control Plane

## Formal Status

This repo uses the following trust hierarchy.

### Canonical

The staged GoalLab pipeline is the canonical truth layer.

Primary files:

- `lib/goal-lab/pipeline/runPipelineV1.ts`
- `lib/goal-lab/pipeline/buildCanonicalContract.ts`
- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `lib/goal-lab/atoms/canonical.ts`
- `lib/config/formulaConfig.ts`

What this means:

- stage outputs define the authoritative decision-state shape
- canonical atoms come from `pipelineV1.stages[*].atoms`
- pipeline contracts outrank UI projections and compat builders

### Active Surface

GoalLab v2 is the active user-facing surface, but not the absolute truth layer.

Primary files:

- `pages/GoalLabPageV2.tsx`
- `contexts/GoalLabContext.tsx`
- `components/goal-lab-v2/*`
- `components/goal-lab/*`

What this means:

- v2 is where current users and agents interact
- v2 should consume canonical contract data
- v2 should not define the core model by itself

### Transitional

Compat adapters and mixed builders are transitional.

Primary files:

- `hooks/useGoalLabEngine.ts`
- `lib/goals/goalLabContext.ts`
- `lib/goal-lab/snapshotAdapter.ts`
- `lib/goal-lab/pipeline/adaptV1ToContract.ts`

What this means:

- these files may still be necessary for migration or compatibility
- they should not be treated as the single source of truth
- new work should reduce their authority, not expand it

### Low Trust

Legacy and archive are below the trust line.

Primary files:

- `pages/GoalLabPage.tsx`
- `pages/GoalLabConsolePage.tsx`
- `pages/ConsolePage.tsx`
- `components/GoalSandbox/*`
- `archive/*`

What this means:

- these layers can still be useful for compatibility or reference
- they should not be used to overrule the staged pipeline
- if they disagree with pipeline contracts, the pipeline wins

## Technical Consequence

The preferred migration direction is:

1. run canonical pipeline
2. expose one explicit contract layer
3. let v2 read that contract
4. keep transitional sidecars isolated and clearly marked
