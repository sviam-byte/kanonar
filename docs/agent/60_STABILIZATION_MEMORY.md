# Stabilization Memory

## Purpose

This is the short operational memory for stabilization work. Keep it focused on what future agents need to preserve while moving the repo toward a demo-quality, explainable decision microscope.

## Trust hierarchy

Highest trust:
- `SYSTEM_OVERVIEW_FOR_CODEX.md`
- `CANONICAL_PATHS.md`
- `STATUS_MAP.md`
- `TRUST_MAP.md`
- `DOMAIN_MAP.md`
- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `docs/IDS_AND_NAMESPACES.md`
- `docs/EXPLAINABILITY.md`
- `docs/REPRO.md`

Runtime canon:
- `lib/goal-lab/pipeline/runPipelineV1.ts`
- `lib/context/v2/*`
- `lib/decision/*`
- `lib/goals/*`
- `lib/drivers/deriveDrivers.ts`
- `lib/config/formulaConfig.ts`
- `lib/core/noise.ts`

Active UI and adapters:
- `components/goal-lab-v2/*`
- `hooks/useGoalLabEngine.ts`
- `hooks/useGoalLabWorld.ts`
- `lib/simkit/*`
- `lib/tom/*`

Compat / legacy:
- `components/GoalSandbox/*`
- legacy GoalLab routes (`/goal-lab`, `/goal-lab-console`)
- `components/goal-lab/*` when used as mixed debug panels
- `pages/GoalLabPage.tsx`
- `pages/GoalLabConsolePage.tsx`
- `types.ts`
- `archive/*`

## Phase queue

Phase 1: stabilization
- package name and lockfile
- broken route fixes
- GoalLab v2 as primary navigation
- namespace source of truth
- first atom contract validator
- stage namespace tests

Phase 2: contract hardening
- migrate S0 profile priors from `goal:life:*` to `profile:lifeGoal:*`
- make stage namespace discipline stricter
- surface atom contract warnings in pipeline/UI
- turn missing trace on decision-critical atoms into test failures

Phase 3: canonical / compat split
- split `useGoalLabEngine.ts` into canonical run, adapters, scene dump, UI VM, and legacy compat responsibilities
- keep `lib/goals/goalLabContext.ts` documented as a compat bridge
- prevent legacy files from defining new canonical semantics

Phase 4: demo-quality surface
- make `/goal-lab-v2` the main decision microscope
- show world/observation, ctx base/final, drivers, goals, utilities, ranked actions, selected action explanation, and trace graph
- use one reproducible demo seed and make the active seed visible/exportable

## Current transitional contracts

- S0 currently emits `goal:life:*` and `goal:lifeDomain:*`.
- Treat these as profile-derived priors only, not active decision goals.
- S8 must not consume them directly; Goal to Action still goes through `util:*`.
- Planned migration target: `profile:lifeGoal:*` and `profile:lifeDomain:*`, converted into active `goal:*` only in S7.

## Patch discipline

- Prefer small patches that make the canon harder to misunderstand.
- Update docs when stage behavior, namespaces, invariants, or public contracts change.
- Keep legacy routes mounted until quarantine/removal is explicit.
- Do not add new GoalLab contracts to `types.ts` unless they are truly cross-domain.
