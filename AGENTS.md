# Agent Entry Point (read first)

This repo is an agent-simulation / decision system (Goal Lab / SimKit style).
Your job as an agent is to make changes safely: preserve invariants, keep outputs interpretable, and keep tests green.

## 1) Read order (15–25 minutes total)
1. docs/agent/00_INDEX.md
2. docs/agent/10_ARCHITECTURE.md
3. docs/agent/20_MATH_MODEL.md  (formulas & invariants)
4. docs/agent/30_WORKFLOWS.md   (how to add features)
5. docs/agent/40_TESTING.md     (how to validate)
6. docs/agent/50_CONTRIBUTING_AGENT.md (patch rules)

## 2) Non-negotiable invariants (do not break)
These are conceptual invariants; map them to code with ripgrep (rg) as needed.

### Determinism
- If the system exposes seeding/temperature/noise: runs must be reproducible under the same seed and config.
- Any randomness must flow through a single RNG utility (no Math.random() in core logic).

### Traceability
- Every derived decision/goal hypothesis should be explainable:
  - carry a trace / provenance (usedAtomIds, parts, notes) or equivalent.
  - never silently drop metadata when transforming.

### Energy / scoring semantics
- “Energy” is a unitless internal scoring mass used for comparisons.
- Propagation must conserve mass up to explicit decay/cost terms.
- Gating (MoE / modes) must be explicit and logged/traceable.

### Safety checks
- Never crash UI/graph views on undefined arrays (guard every map/forEach on optional data).
- Validate inputs at boundaries (API -> model; model -> view).

## 3) Fast orientation commands (copy/paste)
Use these to find the “truth” in the codebase:

### Find core concepts
- rg -n "Energy|spreadEnergy|propagat|channel" src
- rg -n "Mixture|MoE|expert|mode|gate" src
- rg -n "hyster|inertia|threshold" src
- rg -n "trace|usedAtomIds|proven" src
- rg -n "seed|RNG|random|temperature" src

### Find UI graph views
- rg -n "DecisionGraph|ForceGraph|react-force-graph|AFRAME" src

## 4) When you submit a change
You must provide:
1) A short intent summary (“what + why”)
2) The patch (git diff)
3) The validation you ran (tests / typecheck / build)
4) Any changes to docs/agent/* if you introduced new invariants or knobs

# Agent Playbook (Kanonar / Goal Lab)

Этот файл предназначен для “агента” (в т.ч. для меня), чтобы быстро и одинаково работать с репо.

## Canonical docs

The detailed, formula-level documentation for the agent model lives in `docs/agents/00_README.md` (Character → Lens → ToM → Goal Lab → Pipeline).

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

1) Любое изменение поведения стадии пайплайна (S0…S8) требует:
   - обновить `docs/PIPELINE.md`
   - при необходимости добавить/поправить тесты в `tests/pipeline/*`

2) Любой новый “закон”/инвариант требует:
   - записать в `docs/INVARIANTS.md`
   - добавить тест или runtime-check (в pipeline)

3) Goal/Action изоляция:
   - `action:*` НЕ читает `goal:*` напрямую (только `util:*`)

4) Namespace discipline:
   - после S3 потребители должны читать `ctx:final:*`
   - чтение `ctx:*` без `:final:` после S3 рассматривается как баг (кроме явно документированных fallback)

5) Патчи:
   - присылать **только git diff**
   - не делать форматирование “заодно”

## Debug routine (standard)

Когда “непонятно почему так решило”:
1) Найти стадию, где впервые появился странный атом (через Pipeline panel / stage snapshots).
2) Открыть trace.usedAtomIds на проблемном атоме и проверить:
   - используются ли допустимые ns для этой стадии (см. `docs/PIPELINE.md`)
3) Если проблема в DecisionGraph:
   - проверять `components/goal-lab/DecisionGraphView.tsx`
   - проверять сборку рёбер в `lib/graph/GraphAdapter.ts`
4) Если проблема в personality lens:
   - `lib/context/lens/characterLens.ts`
   - тесты: `tests/lens/*`

## Where is the truth

- Pipeline: `lib/goal-lab/pipeline/*`
- Atom types: `lib/context/v2/types.ts`
- Goal catalog: `lib/goals/*`
- Graph building: `lib/graph/*`
- GoalLab UI: `components/goal-lab/*`
