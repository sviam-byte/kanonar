# TRUST MAP

This map defines what can be trusted as behavioral truth during analysis and patching.

## Trust order

1. Live runtime implementation and pure domain engine.
2. Type contracts.
3. Tests exercising the live path.
4. FormulaConfig/SimKit config and explicitly frozen observable constants.
5. Canonical contracts and math docs.
6. Active UI projections.
7. Compat, legacy, and archive.

## Medium trust (requires cross-check)

- `lib/goals/*` (canonical domain logic, but verify against pipeline + tests)
- `lib/drivers/*` (important derivation layer; check namespace/stage constraints)
- `hooks/useGoalLabEngine.ts`
- `hooks/useGoalLabWorld.ts`

## Low trust (integration-heavy / mixed layers)

- `components/*` for core behavior semantics
- `pages/*` for canonical domain contracts
- root `types.ts` as sole source of truth
- removed GoalSandbox paths as canonical model definitions

## Do-not-trust-as-truth (reference only)

- `archive/*`

## Conflict resolution protocol

If docs/tests/code disagree:
1. Determine what the live runtime actually does.
2. Check its types and tests, then config/frozen constants.
3. Compare that evidence with the intended canonical contract.
4. Mark unresolved mismatch as **contract drift**; do not hide it with silent
   compatibility fallback.
