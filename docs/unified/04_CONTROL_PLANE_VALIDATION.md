# Control Plane Validation

## Scope

This report originally validated the standalone `kanonar_control_plane/*` folder
against the checked-out codebase.

Status update:

- the useful parts of that audit layer have now been integrated into `docs/unified/*`
- the separate `kanonar_control_plane/` directory has been removed

## Overall Verdict

The original audit was directionally correct:

- staged pipeline is the strongest truth layer
- mixed UI/compat boundaries are real
- UI-level reproducibility risks are real

The repo no longer needs the separate folder because the validated parts now live under `docs/unified/*`.

## Confirmed

- The staged runtime spine around `lib/goal-lab/pipeline/runPipelineV1.ts` is real and central.
- `docs/PIPELINE.md` and `docs/INVARIANTS.md` align with active pipeline/test contracts better than many older docs.
- `lib/goal-lab/atoms/canonical.ts` explicitly treats `pipelineV1.stages[*].atoms` as truth and `snapshot.atoms` as fallback only.
- `hooks/useGoalLabEngine.ts` is a mixed orchestration layer that combines old and new paths.
- `hooks/useGoalLabWorld.ts` uses `Date.now()` for live session seeds and auto-placement, so UI-level reproducibility is weaker than core seeded logic.
- `App.tsx` keeps both legacy GoalLab routes and v2 GoalLab routes mounted.
- `tests/pipeline/stage_isolation.test.ts` confirms core namespace and stage invariants.
- `tests/simkit/decision_gate.test.ts` confirms the live SimKit mode-gating family is active and tested.

## Confirmed With Adjustment

- The claim that `/goal-lab-v2` is the promoted GoalLab entry is correct through `pages/HomePage.tsx`.
- The claim that header navigation still points users toward legacy GoalLab is also correct through `components/Header.tsx`.
- The claim that `docs/agent/*` is partly stale is correct in at least one concrete way:
  `docs/agent/00_INDEX.md` still directs discovery toward `src`, while most live logic is under `lib`, `components`, `pages`, and `hooks`.

## Integration Result

The previous problems have been resolved by integration rather than by preserving the extra folder:

- unified docs are now the stable entrypoint
- hotspot notes now live in `docs/unified/07_TYPE_AND_CONTRACT_HOTSPOTS.md`
- variability notes now live in `docs/unified/08_VARIABILITY_MAP.md`
- the standalone advisory layer has been removed to avoid a parallel source of truth

## Recommended Status

Treat `docs/unified/*` as the only repo-level control-plane layer.
