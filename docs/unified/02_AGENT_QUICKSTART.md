# Agent Quickstart

## Purpose

Use this file when you need to make changes safely without reconstructing the whole repo from scratch.

## What This Repo Is

This is not one clean app.
It is a mixed TypeScript/React repository with:

- a staged GoalLab decision pipeline
- several UI surfaces over that pipeline
- a SimKit runtime that can call into GoalLab logic
- legacy GoalSandbox and console surfaces still mounted in routes

## Canonical Runtime Spine

The strongest current truth source is:

`lib/goal-lab/pipeline/runPipelineV1.ts`

That spine is backed by:

- `lib/goal-lab/pipeline/buildCanonicalContract.ts`
- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `lib/context/v2/types.ts`
- `lib/goal-lab/types.ts`
- `lib/goal-lab/atoms/canonical.ts`
- `lib/config/formulaConfig.ts`
- `tests/pipeline/*`

## Stage Summary

- `S0`: canonical world/obs/memory/relation atoms, no `ctx:*`
- `S1`: normalization / helper derivations
- `S2`: base context axes, `ctx:*`
- `S3`: character lens, `ctx:final:*`
- `S4`: emotion/appraisal layer
- `S5`: ToM / dyadic policy layer
- `S6`: drivers and context priorities
- `S7`: goals, planning, util projection
- `S8`: possibilities, access, priors, decision, actions
- `S9`: optional lookahead / belief persistence

## Hard Rules To Keep In Mind

- After `S3`, consumers should prefer `ctx:final:*`.
- Action selection must not consume `goal:*` directly; use `util:*`.
- Canonical UI/export atoms come from `pipelineV1.stages[*].atoms`.
- Numeric coefficients for pipeline behavior belong in `lib/config/formulaConfig.ts`.
- UI must tolerate partial data and guard optional arrays.

## Important Mixed Layers

These files are live, but they are not pure truth layers:

- `hooks/useGoalLabEngine.ts`
- `hooks/useGoalLabWorld.ts`
- `lib/goals/goalLabContext.ts`
- `lib/goal-lab/snapshotAdapter.ts`

Why they matter:

- `useGoalLabEngine.ts` mixes `buildGoalLabContext`, snapshot adaptation, `runGoalLabPipelineV1`, and contract adaptation in one UI-oriented flow.
- `useGoalLabWorld.ts` introduces wall-clock seeds with `Date.now()` for live UI sessions.
- `goalLabContext.ts` is useful, but it is a bridge layer across old and new contracts.

## Where To Start By Task

If the task is about pipeline behavior:

1. `docs/PIPELINE.md`
2. `docs/INVARIANTS.md`
3. `lib/goal-lab/pipeline/runPipelineV1.ts`
4. the relevant module under `lib/context`, `lib/drivers`, `lib/goals`, `lib/decision`, or `lib/tom`
5. the matching tests

If the task is about GoalLab v2 UI:

1. `App.tsx`
2. `pages/GoalLabPageV2.tsx`
3. `contexts/GoalLabContext.tsx`
4. `hooks/useGoalLabEngine.ts`
5. `components/goal-lab-v2/*`

If the task is about simulation behavior:

1. `lib/simkit/*`
2. `lib/config/formulaConfigSim.ts`
3. `lib/simkit/plugins/goalLabDeciderPlugin.ts`
4. `lib/simkit/plugins/orchestratorPlugin.ts`
5. `tests/simkit/*`

## Validation Defaults

Use the fastest repo-native checks available:

- `npm test`
- `npm run build`

There is no dedicated `typecheck` script in `package.json` right now.
