# Unified Docs Index

This folder is the current high-signal entrypoint for humans and agents working in this repo.
It does not replace deep domain docs in `docs/PIPELINE.md` or `docs/INVARIANTS.md`.
It tells you what to read first, what is actually live in code, and where the risky mixed layers are.
It is also the official replacement for using `kanonar_control_plane/*` as a standalone entrypoint.
That folder remains useful as source material, but `docs/unified/*` is the integrated repo-facing version.

## Read Order

1. `docs/unified/01_CONTROL_PLANE.md`
2. `docs/unified/02_AGENT_QUICKSTART.md`
3. `docs/unified/03_SYSTEM_MAP.md`
4. `docs/unified/05_CODEBASE_NOTES.md`
5. `docs/unified/04_CONTROL_PLANE_VALIDATION.md`
6. `docs/unified/AI_CONTEXT_MANIFEST.json`
7. `docs/PIPELINE.md`
8. `docs/INVARIANTS.md`
9. `docs/ARCHITECTURE.md`
10. `lib/goal-lab/pipeline/runPipelineV1.ts`
11. `lib/config/formulaConfig.ts`

## Trust Order

1. `lib/goal-lab/pipeline/runPipelineV1.ts`
2. `docs/PIPELINE.md`
3. `docs/INVARIANTS.md`
4. `lib/context/v2/types.ts`
5. `lib/goal-lab/atoms/canonical.ts`
6. `lib/config/formulaConfig.ts`
7. `tests/pipeline/*`, `tests/decision/*`, `tests/simkit/*`
8. v2 UI orchestration: `pages/GoalLabPageV2.tsx`, `contexts/GoalLabContext.tsx`, `hooks/useGoalLabEngine.ts`
9. compat / mixed layers: `lib/goals/goalLabContext.ts`, snapshot adapters, legacy GoalLab routes
10. archive and legacy docs

## Control Plane

The repo-level control plane is now fixed as:

- staged pipeline is the canonical truth layer
- v2 UI is the active surface, but not the absolute truth layer
- compat adapters are transitional
- legacy and archive are below the trust line

In practical terms:

- Canon: `lib/goal-lab/pipeline/runPipelineV1.ts`
- Canonical extraction: `lib/goal-lab/atoms/canonical.ts`
- Active surface: `pages/GoalLabPageV2.tsx`, `components/goal-lab-v2/*`
- Transitional boundary: `hooks/useGoalLabEngine.ts`, `lib/goals/goalLabContext.ts`, snapshot adapters
- Legacy / archive: old GoalLab routes, GoalSandbox, `archive/*`

## What This Folder Covers

- where the real pipeline spine lives
- how UI, pipeline, SimKit, and legacy surfaces relate
- what in `kanonar_control_plane` is valid, useful, or currently wrong
- what an agent should and should not treat as source of truth
- a repo-root-safe AI context manifest: `docs/unified/AI_CONTEXT_MANIFEST.json`

## What It Does Not Replace

- formula-level details in `docs/PIPELINE.md`
- hard invariants in `docs/INVARIANTS.md`
- deep model narrative in `docs/agents/*`
- repo bootstrap rules in `AGENTS.md`
