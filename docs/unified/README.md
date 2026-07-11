# Unified Docs Index

Status: repo/control-plane reference. The main documentation book starts at `README.md` -> `docs/MATH_INDEX.md`.

This folder is the high-signal reference for humans and agents working on repo control-plane questions.
It does not replace deep domain docs in `docs/PIPELINE.md` or `docs/INVARIANTS.md`.
It tells you what is actually live in code and where the risky mixed layers are.
It is also the official repo-level home for the control-plane material that previously lived outside `docs/`.

The proposed staged migration from multiple lab contours to a shared runtime is
documented in `docs/LAB_UNIFICATION_PLAN.md`. It is a planning contract, not a
replacement for the live-runtime trust order below.

## Read Order

1. `docs/unified/01_CONTROL_PLANE.md`
2. `docs/unified/02_AGENT_QUICKSTART.md`
3. `docs/unified/03_SYSTEM_MAP.md`
4. `docs/unified/05_CODEBASE_NOTES.md`
5. `docs/unified/04_CONTROL_PLANE_VALIDATION.md`
6. `docs/unified/07_TYPE_AND_CONTRACT_HOTSPOTS.md`
7. `docs/unified/08_VARIABILITY_MAP.md`
8. `docs/unified/AI_CONTEXT_MANIFEST.json`
9. `docs/PIPELINE.md`
10. `docs/INVARIANTS.md`
11. `docs/ARCHITECTURE.md`
12. `lib/goal-lab/pipeline/runPipelineV1.ts`
13. `lib/config/formulaConfig.ts`

## Trust Order

1. Live runtime: `lib/goal-lab/pipeline/runPipelineV1.ts` and the relevant
   pure domain engine.
2. Type contracts: `lib/context/v2/types.ts`,
   `lib/goal-lab/atoms/canonical.ts`, nearby domain types.
3. Tests: `tests/pipeline/*`, `tests/decision/*`, `tests/simkit/*`, and relevant
   domain tests.
4. Config/frozen constants: `lib/config/formulaConfig.ts`,
   `lib/config/formulaConfigSim.ts`, explicitly versioned observables.
5. Canonical docs: `docs/PIPELINE.md`, `docs/INVARIANTS.md`, nearest math spec.
6. v2 UI orchestration.
7. Compat/mixed layers, then archive and legacy docs.

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
- the integrated hotspot and variability notes that support the control plane
- what an agent should and should not treat as source of truth
- a repo-root-safe AI context manifest: `docs/unified/AI_CONTEXT_MANIFEST.json`

## What It Does Not Replace

- formula-level details in `docs/PIPELINE.md`
- hard invariants in `docs/INVARIANTS.md`
- deep model narrative in `docs/agents/*`
- repo bootstrap rules in `AGENTS.md`
