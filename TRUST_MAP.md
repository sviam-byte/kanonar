# TRUST MAP

This map defines what can be trusted as behavioral truth during analysis and patching.

## High trust (primary truth)

- Canonical docs:
  - `docs/PIPELINE.md`
  - `docs/INVARIANTS.md`
  - `docs/IDS_AND_NAMESPACES.md`
  - `docs/EXPLAINABILITY.md`
  - `docs/REPRO.md`
- Canonical contracts/code:
  - `lib/context/v2/*`
  - `lib/goal-lab/pipeline/*`
  - `lib/decision/*`
  - `lib/core/noise.ts`
  - `lib/config/formulaConfig.ts`
- Tests expressing canonical behavior:
  - `tests/pipeline/*`
  - `tests/decision/*`
  - `tests/simkit/*`

## Medium trust (requires cross-check)

- `lib/goals/*` (canonical domain logic, but verify against pipeline + tests)
- `lib/drivers/*` (important derivation layer; check namespace/stage constraints)
- `hooks/useGoalLabEngine.ts`
- `hooks/useGoalLabWorld.ts`

## Low trust (integration-heavy / mixed layers)

- `components/*` for core behavior semantics
- `pages/*` for canonical domain contracts
- root `types.ts` as sole source of truth
- `components/GoalSandbox/GoalSandbox.tsx` as canonical model definition

## Do-not-trust-as-truth (reference only)

- `archive/*`

## Conflict resolution protocol

If docs/tests/code disagree:
1. Prefer canonical docs + formula config + context contracts.
2. Validate against canonical tests.
3. Mark unresolved mismatch as **contract drift**.
4. Do not hide mismatch with silent compat patching.
