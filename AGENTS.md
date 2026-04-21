# Agent Entry Point (read first)

This repo is an agent-simulation / decision system (Goal Lab / SimKit style).
Your job as an agent is to make changes safely: preserve invariants, keep outputs interpretable, and keep tests green.

## 1) Read order (15-25 minutes total)
1. `docs/unified/README.md`
2. `docs/unified/01_CONTROL_PLANE.md`
3. `docs/unified/02_AGENT_QUICKSTART.md`
4. `docs/unified/03_SYSTEM_MAP.md`
5. `docs/unified/04_CONTROL_PLANE_VALIDATION.md`
6. `docs/agent/00_INDEX.md`
7. `docs/agent/10_ARCHITECTURE.md`
8. `docs/agent/20_MATH_MODEL.md`
9. `docs/agent/30_WORKFLOWS.md`
10. `docs/agent/40_TESTING.md`
11. `docs/agent/50_CONTRIBUTING_AGENT.md`

## 2) Non-negotiable invariants (do not break)
These are conceptual invariants; map them to code with ripgrep (`rg`) as needed.

### Determinism
- If the system exposes seeding/temperature/noise: runs must be reproducible under the same seed and config.
- Any randomness must flow through a single RNG utility. No `Math.random()` in core logic.

### Traceability
- Every derived decision/goal hypothesis should be explainable.
- Carry a trace / provenance (`usedAtomIds`, `parts`, `notes`) or equivalent.
- Never silently drop metadata when transforming.

### Energy / scoring semantics
- "Energy" is a unitless internal scoring mass used for comparisons.
- Propagation must conserve mass up to explicit decay/cost terms.
- Gating (MoE / modes) must be explicit and logged/traceable.

### Safety checks
- Never crash UI/graph views on undefined arrays. Guard every `map` / `forEach` on optional data.
- Validate inputs at boundaries (API -> model; model -> view).

## 3) Fast orientation commands (copy/paste)
Use these to find the truth in the codebase:

### Find core concepts
- `rg -n "Energy|spreadEnergy|propagat|channel" lib components pages tests`
- `rg -n "Mixture|MoE|expert|mode|gate" lib components pages tests`
- `rg -n "hyster|inertia|threshold" lib components pages tests`
- `rg -n "trace|usedAtomIds|proven" lib components pages tests`
- `rg -n "seed|RNG|random|temperature" lib components pages tests`

### Find UI graph views
- `rg -n "DecisionGraph|ForceGraph|react-force-graph|AFRAME" components lib`

## 4) When you submit a change
You must provide:
1) A short intent summary ("what + why")
2) The patch (`git diff`)
3) The validation you ran (tests / typecheck / build)
4) Any changes to `docs/agent/*` or `docs/unified/*` if you introduced new invariants or knobs

# Agent Playbook (Kanonar / Goal Lab)

Этот файл предназначен для агента, чтобы быстро и одинаково работать с репо.

## Canonical docs

The detailed formula-level documentation for the agent model lives in `docs/agents/00_README.md`.
The repo-level control-plane layer now lives in `docs/unified/*`.

## Commands (copy-paste)

Install:
```bash
npm i
```

Dev:
```bash
npm run dev
```

Tests:
```bash
npm test
```

Watch:
```bash
npm run test:watch
```

Build:
```bash
npm run build
```

Preview:
```bash
npm run preview
```

Optional maintenance:
```bash
npm run unused
npm run prune:stubs
```

## Rules (hard)

1) Any change to pipeline stage behavior (S0...S9) requires:
- update `docs/PIPELINE.md`
- add or update tests in `tests/pipeline/*` when needed

2) Any new law / invariant requires:
- update `docs/INVARIANTS.md`
- add a test or runtime-check in the pipeline

3) Goal / Action isolation:
- `action:*` does not read `goal:*` directly; only `util:*`

4) Namespace discipline:
- after S3, consumers should read `ctx:final:*`
- reading plain `ctx:*` after S3 is considered a bug except for documented fallbacks

5) Patches:
- send only `git diff`
- do not do formatting-only drive-bys

6) FormulaConfig:
- all numeric coefficients in pipeline logic (S0...S9) belong in `lib/config/formulaConfig.ts`
- local constants like `const RISK_COEFF = 0.4` are not allowed
- when adding a new coefficient: add it to `FC` and consume it through `FC.section.param`

## Debug routine (standard)

When reasoning looks wrong:
1) Find the stage where the strange atom first appears through Pipeline panels or stage snapshots.
2) Open `trace.usedAtomIds` on the problematic atom and verify:
- whether the stage is reading allowed namespaces
3) If the issue is in DecisionGraph:
- check `components/goal-lab/DecisionGraphView.tsx`
- check edge assembly in `lib/graph/GraphAdapter.ts`
4) If the issue is in the personality lens:
- check `lib/context/lens/characterLens.ts`
- tests: `tests/lens/*`

## Where is the truth

- Pipeline: `lib/goal-lab/pipeline/*`
- Atom types: `lib/context/v2/types.ts`
- Goal catalog: `lib/goals/*`
- Graph building: `lib/graph/*`
- GoalLab UI: `components/goal-lab/*`
- Unified agent docs: `docs/unified/*`
