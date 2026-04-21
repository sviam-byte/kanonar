# Type And Contract Hotspots

## Purpose

This document records the highest-value type-discipline targets in the current repo.
It is not a list of every `any`.
It is a prioritized map of boundaries where soft contracts create the most architectural risk.

## Priority rule

Fix in this order:

1. canonical vs compat boundaries
2. canonical pipeline contract surfaces
3. high-authority bridge files used by UI/simkit
4. peripheral UI and decorative typing debt

## Hotspot 1

### `hooks/useGoalLabEngine.ts`

Why it matters:
- it mixes canonical pipeline output, snapshot adaptation, UI orchestration, and legacy bridge logic

Main risk:
- contract drift between canonical GoalLab data and UI-facing compat shapes

Discipline target:
- keep this file explicit about which values are canonical contracts and which are bridge payloads
- prefer consolidated GoalLab-facing imports from `lib/goal-lab/types.ts`

## Hotspot 2

### `lib/goals/goalLabContext.ts`

Why it matters:
- this is still a major compatibility hub across old and new context/GoalLab flows

Main risk:
- false truth layer: agents may treat the compat builder as the canonical model

Discipline target:
- do not expand its authority
- isolate bridge responsibilities and document them as compat

## Hotspot 3

### `lib/goal-lab/pipeline/runPipelineV1.ts`

Why it matters:
- this is the canonical reasoning spine

Main risk:
- if stage envelopes and artifact shapes become soft here, downstream layers drift quickly

Discipline target:
- keep stage outputs explicit
- keep canonical atoms separate from debug sidecars
- keep version/contract metadata centralized

## Hotspot 4

### `types.ts`

Why it matters:
- it is a giant cross-domain file that can blur boundaries between runtime, UI, and domain contracts

Main risk:
- boundary bleed and false confidence from one over-broad "global truth" file

Discipline target:
- prefer narrower domain entrypoints where they exist
- avoid routing new GoalLab contract work back into this monolith unless it is truly cross-domain

## Hotspot 5

### `components/GoalSandbox/GoalSandbox.tsx`

Why it matters:
- huge legacy surface, still mounted, still influential

Main risk:
- agents patch it as if it were the canonical GoalLab runtime

Discipline target:
- keep legacy status explicit
- use shared guards/contracts when import/export paths are touched

## Hotspot 6

### `lib/simkit/plugins/goalLabDeciderPlugin.ts`
### `lib/simkit/plugins/orchestratorPlugin.ts`

Why they matter:
- these files bridge canonical GoalLab reasoning into simulation/orchestration

Main risk:
- replay drift, stochastic contract drift, or hidden bridge semantics

Discipline target:
- keep seeded behavior explicit
- preserve mode/gate payload traceability
- avoid soft payload contracts at plugin boundaries

## Operational rule

When a patch touches one of these hotspots, it should answer:

- is this file canonical, compat, or legacy?
- what contract enters this file?
- what contract leaves this file?
- where is the type/version source of truth?
