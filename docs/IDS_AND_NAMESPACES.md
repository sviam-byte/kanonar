# IDs & Namespaces grammar — v69

This file formalizes atom id conventions so invariants and tooling can be strict.

Sources of truth:
- atom type: `lib/context/v2/types.ts`
- ctx access helper: `lib/context/layers.ts` (`getCtx` depends on id patterns)
- pipeline outputs: `docs/PIPELINE.md`

---

## 1) General rules

### 1.1 ID is a stable key (per tick)

Within a single pipeline run (tick), atom ids should be unique:
- `∀ a≠b: a.id ≠ b.id`

If you intentionally allow duplicates, you must document merge semantics explicitly (currently not assumed).

### 1.2 Namespace derivation

Convention:
- `ns` corresponds to the leading segment of `id` (before first `:`) for most atoms.
Examples:
- `id="ctx:final:danger:A"` ⇒ `ns="ctx"`
- `id="goal:domain:safety:A"` ⇒ `ns="goal"`

If any atom violates this, document it and ensure filters/UI handle it.

---

## 2) Grammar (BNF-like)

### 2.1 Context axes (ctx)

Base:
- `ctx:<axis>:<agentId>`

Final:
- `ctx:final:<axis>:<agentId>`

Where:
- `<axis>` is a non-empty token without `:`
- `<agentId>` is a non-empty token without `:`

Optional global axes (only if used):
- `ctx:<axis>` (no agent)

**Resolution order** is defined by `getCtx`:
1) `ctx:final:<axis>:<agentId>`
2) `ctx:<axis>:<agentId>`
3) `ctx:<axis>`
4) fallback

### 2.2 Character features (feat)

Traits:
- `feat:char:<agentId>:trait.<name>`

Body state:
- `feat:char:<agentId>:body.<name>`

Where:
- `<name>` is a dotted token (no `:`)

### 2.3 Drivers (drv)

Recommended:
- `drv:<driverName>:<agentId>`

If implementation uses different pattern, fix this file to match.

### 2.4 Goals (goal)

Recommended domain goals:
- `goal:domain:<domainName>:<agentId>`

Planning tags (if present):
- `goal:planTag:<tagName>:<agentId>`

### 2.5 Utilities (util)

Projection outputs (the only legal bridge Goal→Action):
- `util:<utilName>:<agentId>`

### 2.6 Actions (action)

Action candidates/decision artifacts:
- `action:<actionName>:<agentId>`

If actions are global (no agentId), document and test separately.

---

## 3) Regex library (for tests/tooling)

Use these patterns in tests and UI filters.

Context base:
- `^ctx:[^:]+:[^:]+$`

Context final:
- `^ctx:final:[^:]+:[^:]+$`

Context global (if allowed):
- `^ctx:[^:]+$`

Trait:
- `^feat:char:[^:]+:trait\.[^:]+$`

Body:
- `^feat:char:[^:]+:body\.[^:]+$`

Goal (domain):
- `^goal:domain:[^:]+:[^:]+$`

Util:
- `^util:[^:]+:[^:]+$`

Action:
- `^action:[^:]+:[^:]+$`

---

## 4) Update policy

Any time you add:
- a new namespace prefix,
- a new required segment in ids,
- a new “global” (agent-less) convention,

you must:
1) update this file,
2) update docs/PIPELINE.md and docs/INVARIANTS.md if stage contracts change,
3) add tests for the new grammar if tooling depends on it.
