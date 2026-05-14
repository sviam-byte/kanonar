# AGENTS.md

This repo is an agent-simulation and decision-system codebase. Treat it as a
GoalLab + SimKit runtime, not as a plain React app. Make changes cautiously:
preserve determinism, provenance, scoring semantics, and UI resilience.

## Conflict Lab Non-Negotiable Rule

Conflict Lab is a deterministic nonlinear conflict dynamics lab, not a UI card
catalog. Do not add mechanics as cosmetic presets or renamed action pools.

Every new Conflict Lab mechanic must be represented as typed domain logic with
explicit roles, phases, available actions, observation model, payoff rule,
state transition, validation, and unit tests independent of React. Character
psychology may score actions, but it must not replace mechanic rules.

The deterministic core must preserve:

```text
same state + same params + same active mechanic => same next state
```

No hidden `Math.random()`, broad `try/catch`, silent fallback, type weakening,
implicit `any`, or UI-only enforcement of domain rules is acceptable in
mechanic or transition logic. If stochastic behavior is required, it must be an
explicit seeded mode with traceable RNG wiring.

Conflict Lab work is incomplete unless `npm run typecheck`, lint if configured,
and relevant tests pass. If any validation cannot run or cannot pass, stop and
report the blocker rather than treating the task as done. The canonical contract
for this area is `docs/CONFLICT_LAB_CONTRACT.md`.

### Conflict Lab Work Order

When a task touches Conflict Lab, classify it before editing:

1. contract/docs only;
2. mechanic kernel;
3. agent utility or memory;
4. system dynamics or trajectory analysis;
5. UI visualization.

For mechanic, dynamics, or trajectory work, execute in this order:

```text
mathematical model -> domain types -> pure engine -> tests -> UI
```

Do not start from `components/conflict/*`, scenario labels, or preset card data.
If the current architecture cannot represent the mechanic as roles/phases/
observation/payoff/transition/validation, refactor the domain/engine layer
first. If that refactor is out of scope, stop and report the architectural
blocker.

## Read First

Use this order when you need broad context:

1. `docs/unified/README.md`
2. `docs/unified/01_CONTROL_PLANE.md`
3. `docs/unified/02_AGENT_QUICKSTART.md`
4. `docs/unified/03_SYSTEM_MAP.md`
5. `docs/unified/04_CONTROL_PLANE_VALIDATION.md`
6. `docs/PIPELINE.md`
7. `docs/INVARIANTS.md`
8. `docs/agent/00_INDEX.md`
9. `docs/agents/00_README.md`

For a narrow fix, read only the relevant canonical docs plus nearby code.

## Trust Order

1. Pipeline truth: `lib/goal-lab/pipeline/runPipelineV1.ts`
2. Pipeline contracts: `docs/PIPELINE.md`, `docs/INVARIANTS.md`
3. Atom contracts: `lib/context/v2/types.ts`, `lib/goal-lab/atoms/canonical.ts`
4. Coefficients: `lib/config/formulaConfig.ts`, `lib/config/formulaConfigSim.ts`
5. Active UI: `pages/GoalLabPageV2.tsx`, `contexts/GoalLabContext.tsx`, `components/goal-lab-v2/*`
6. Deep GoalLab panels still used by v2: `components/goal-lab/*`
7. Transitional adapters: `hooks/useGoalLabEngine.ts`, `lib/goals/goalLabContext.ts`, snapshot adapters
8. Legacy/archive code: useful for reference only, never canonical

If docs and code disagree, prefer the canonical runtime and tests, then update
docs if the change introduces a new invariant or knob.

## Hard Invariants

### Determinism

- Seeded runs must be reproducible under the same config.
- Do not use `Math.random()` in core logic.
- Any stochastic behavior must go through the repo RNG/noise utilities.
- Wall-clock timestamps are acceptable for UI/export metadata, but do not use
  them for decision logic or deterministic comparisons.

### Traceability

- Every derived decision, goal, atom, or hypothesis must remain explainable.
- Preserve provenance fields such as `usedAtomIds`, `parts`, `notes`, `trace`,
  and equivalent local structures.
- Never silently drop metadata when adapting between GoalLab, SimKit, or UI
  contracts.

### Energy And Scoring

- Energy is unitless internal scoring mass used for ranking/comparison.
- Propagation should conserve mass except for explicit decay, cost, or gating.
- MoE/mode/decision gates must be explicit and inspectable.
- Numeric coefficients for pipeline behavior belong in
  `lib/config/formulaConfig.ts`; SimKit-specific coefficients belong in
  `lib/config/formulaConfigSim.ts`.

### Namespaces

- After S3, consumers should prefer `ctx:final:*`.
- Reading plain `ctx:*` after S3 is a bug unless a documented fallback says so.
- `action:*` must not read `goal:*` directly; action selection consumes `util:*`
  or explicit projected action candidates.

### UI Safety

- Guard optional arrays before `map`, `forEach`, and table rendering.
- Validate model-to-view boundaries.
- Debug/lab panels must degrade gracefully when data is partial.

## Current Code Map

- Pipeline: `lib/goal-lab/pipeline/*`
- Context atoms and lens: `lib/context/*`
- Drivers: `lib/drivers/*`
- Goals and goal atoms: `lib/goals/*`
- Decision scoring: `lib/decision/*`
- SimKit runtime: `lib/simkit/*`
- SimKit comparison labs: `lib/simkit/compare/*`
- GoalLab UI panels: `components/goal-lab/*`
- GoalLab v2 shell: `components/goal-lab-v2/*`, `pages/GoalLabPageV2.tsx`
- Tests: `tests/pipeline/*`, `tests/decision/*`, `tests/simkit/*`, `tests/lens/*`

## ProConflict / SimKit Notes

- `SimSnapshot` does not carry `world.facts`; do not read live facts from
  `snapshot.facts`.
- For per-tick compare metrics, use explicit record data such as
  `RunResult.pipelineHistory`, `trace.actionsApplied`, `stressHistory`, and
  `tensionHistory`.
- `sim:pipeline:<id>` and `sim:trace:<id>` are world facts during a tick and can
  be reconstructed from `trace.deltas.facts`.
- Full record byte equality is not a valid determinism check while snapshots
  include wall-clock `time`; compare semantic fields instead.

## Commands

Install:

```bash
npm i
```

Run:

```bash
npm run dev
npm test
npm run typecheck
npm run build
```

Optional:

```bash
npm run test:watch
npm run unused
npm run prune:stubs
```

This Windows environment may not always expose `node`/`npm`/`rg` in PATH. If
`rg` is unavailable, use `Get-ChildItem -Recurse -File | Select-String ...`.
If `npm` is unavailable, report that validation could not run.

## Search Recipes

Prefer `rg` when available:

```bash
rg -n "Energy|spreadEnergy|propagat|channel" lib components pages tests
rg -n "Mixture|MoE|expert|mode|gate" lib components pages tests
rg -n "hyster|inertia|threshold" lib components pages tests
rg -n "trace|usedAtomIds|proven" lib components pages tests
rg -n "seed|RNG|random|temperature" lib components pages tests
rg -n "DecisionGraph|ForceGraph|react-force-graph|AFRAME" components lib
```

PowerShell fallback:

```powershell
Get-ChildItem -Path lib,components,pages,tests -Recurse -File |
  Select-String -Pattern "trace|usedAtomIds|proven"
```

## Change Policy

- Keep patches scoped. Do not do formatting-only drive-bys.
- Do not revert unrelated dirty-worktree changes.
- Pipeline stage behavior changes require `docs/PIPELINE.md` updates and
  targeted tests under `tests/pipeline/*` when behavior changes.
- New laws/invariants require `docs/INVARIANTS.md` updates and either tests or
  runtime checks.
- New coefficients require config entries, not local magic constants.
- When finishing, provide intent, validation, and any docs touched. Include the
  useful diff summary; full `git diff` is preferred when the user asks for a
  patch.
