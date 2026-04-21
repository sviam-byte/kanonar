# Session Plan — 2026-04-21

## Scope

Current cleanup track:

1. consolidate data types and the code that consumes them
2. consolidate versions under one system-level rule
3. preserve runtime behavior while reducing compat chaos

This is a working session plan for the current patch series.
It is intentionally operational, not archival.

## Current status

Completed in the first patch:

- introduced one canonical GoalLab system version source:
  - `lib/goal-lab/versioning.ts`
- introduced one consolidated GoalLab-facing type entrypoint:
  - `lib/goal-lab/types.ts`
- threaded `systemVersion` through main GoalLab control-plane contracts:
  - pipeline output
  - pipeline run contract
  - snapshot v1
  - scene dump
  - explain payload
- replaced local scene dump schema checks with one shared guard
- documented the new versioning invariant in:
  - `docs/INVARIANTS.md`
  - `docs/PIPELINE.md`
- integrated useful control-plane notes into `docs/unified/*`
  - `07_TYPE_AND_CONTRACT_HOTSPOTS.md`
  - `08_VARIABILITY_MAP.md`
  - separate `kanonar_control_plane/` layer removed after integration

## Session objective

Bring the repo to a stricter discipline where:

- canonical data contracts are easy to locate
- GoalLab-facing types do not sprawl across multiple competing files
- one system version is explicit and shared
- payload schema versions remain local only where compatibility requires them
- compat layers remain usable but lose authority

## Work plan

### Wave 1 — GoalLab type surface cleanup

Goal:
- make `lib/goal-lab/types.ts` the obvious repo entrypoint for GoalLab-facing contracts

Tasks:
- find hot imports that should prefer `lib/goal-lab/types.ts` over deep scattered imports
- migrate low-risk consumers first:
  - UI panels
  - debug helpers
  - scene/export helpers
  - tests
- avoid wide mechanical churn in core math/pipeline modules unless it improves clarity immediately

Done when:
- new code no longer introduces fresh deep imports for GoalLab-facing snapshot/pipeline contract types
- at least the most visible UI/debug surfaces import from the consolidated entrypoint

Progress note:
- started
- migrated first low-risk surfaces:
  - `hooks/useGoalLabEngine.ts`
  - GoalLab v2 shell/panels
  - GoalLab console/pipeline panels
  - several core GoalLab debug panels

### Wave 2 — Version discipline rollout

Goal:
- remove local version literals from GoalLab control-plane contract code where they are not needed

Tasks:
- migrate nearby GoalLab payload builders to version constants/helpers
- audit import/export paths for:
  - scene dumps
  - debug dumps
  - snapshot adapters
  - coverage/explain payloads
- standardize wording:
  - `schemaVersion` = payload shape
  - `systemVersion` = system semantics

Done when:
- contract builders do not invent independent system version sources
- new version checks use shared helpers where possible

Progress note:
- started
- migrated version metadata into shared GoalLab version registry for:
  - pipeline output
  - pipeline run
  - snapshot
  - scene dump
  - explain payload
  - coverage payload
  - relation graph payload
- removed a misleading loose compat definition in `lib/goal-lab/pipeline/pipelineTypes.ts`
  and made it a thin facade over the real canonical pipeline type

### Wave 3 — Compat boundary tightening

Goal:
- reduce ambiguity between canonical GoalLab contracts and legacy/compat data shapes

Tasks:
- audit:
  - `hooks/useGoalLabEngine.ts`
  - `lib/goal-lab/snapshotAdapter.ts`
  - `lib/goals/goalLabContext.ts`
  - legacy GoalSandbox import/export paths
- explicitly label canonical vs compat payloads in code comments and types
- add tiny guard helpers where boundary mistakes are easy to make

Done when:
- a reader can tell which layer is canonical and which is bridge code without reconstructing repo history

### Wave 4 — Validation hardening

Goal:
- convert the new discipline into repeatable checks

Tasks:
- extend focused tests around contract/version consistency
- if environment allows, run:
  - `npm test`
  - `npm run build`
- if environment still lacks Node/npm, keep adding focused static guards and note the limitation explicitly

Done when:
- contract changes are protected by tests instead of memory

## Rules for this session

- no behavior-changing refactors unless required to preserve consistency
- no formatting-only drive-bys
- no expansion of compat authority
- every type/version cleanup should either:
  - remove ambiguity
  - centralize a rule
  - prevent a real future mistake

## Likely hotspots

- `hooks/useGoalLabEngine.ts`
- `components/GoalSandbox/GoalSandbox.tsx`
- `lib/goal-lab/snapshotAdapter.ts`
- `lib/goal-lab/sceneDump.ts`
- `lib/goal-lab/explain.ts`
- tests around canonical contract export/import

## Risks

- silent widening of contract types can hide boundary bugs
- broad import rewrites can create noisy churn without real value
- legacy GoalSandbox flows may rely on implicit payload assumptions
- without runnable Node tooling in the environment, validation remains partial

## Validation checklist

For each wave:

- inspect diff for contract clarity
- ensure canonical/compat naming became clearer, not blurrier
- run focused tests when possible
- run full test/build when Node tooling becomes available

## Exit criteria for this session

- the next patch after the versioning foundation should reduce real import/type sprawl
- the repo should have a visible written plan for the current cleanup track
- every follow-up patch should map back to one wave in this document
