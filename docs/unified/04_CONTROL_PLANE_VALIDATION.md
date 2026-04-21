# Control Plane Validation

## Scope

This report validates the new folder:

- `kanonar_control_plane/*`

against the current checked-out codebase.

## Overall Verdict

The folder is useful.
Its strongest claims about the staged pipeline, mixed UI layers, and reproducibility risks are broadly correct.
But it is not yet ready to be used as a drop-in canonical control plane without fixes.

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

## Problems Found

### Manifest path errors

`kanonar_control_plane/AI_CONTEXT_MANIFEST.json` contains root-level `key_docs` and `first_files_to_read` entries that do not resolve from the repo root:

- `SYSTEM_OVERVIEW_FOR_AI.md`
- `TYPE_AND_CONTRACT_HOTSPOTS.md`
- `VARIABILITY_MAP.md`

These files exist only under:

- `kanonar_control_plane/SYSTEM_OVERVIEW_FOR_AI.md`
- `kanonar_control_plane/TYPE_AND_CONTRACT_HOTSPOTS.md`
- `kanonar_control_plane/VARIABILITY_MAP.md`

So the manifest currently overstates its own portability.

### Governance conflict

There is a real instruction conflict:

- repo root `AGENTS.md` says to read `docs/agent/*` first
- `kanonar_control_plane` says agents should not start there

The folder is directionally right that `docs/agent/*` is not fully current, but it is still in conflict with the active repo-level instruction layer.

### Not yet integrated

- `git status` shows `kanonar_control_plane/` as untracked
- none of its files are referenced from the main `docs/` tree or root onboarding docs

That means it is currently an external advisory layer, not part of the established repo doc contract.

## Recommended Status

Treat `kanonar_control_plane` as:

- `useful audit notes`
- `high-value orientation material`
- `not yet canonical`

## Recommended Next Steps

1. Fix manifest paths so they work from repo root.
2. Add one stable entrypoint under `docs/` that links to the validated parts.
3. Reconcile repo-level `AGENTS.md` with the newer trust order.
4. Keep the folder as an audit/control-plane input until those governance conflicts are resolved.
