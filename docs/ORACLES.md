# Test oracles (numeric criteria) — v69

This file defines **hard numerical criteria** used for unit tests and sanity checks.
Without these, tests degrade into “looks plausible”.

Notation:
- All magnitudes are assumed to be in [0, 1] unless otherwise noted.
- `P(z) = min(1, max(0, z))` is clamp/projection to [0,1].

Source of truth for models:
- lens: `lib/context/lens/characterLens.ts` → `modulate`
- energy propagation: `lib/graph/atomEnergy.ts` → `propagateAtomEnergy`
- ctx selection: `lib/context/layers.ts` → `getCtx`

---

## 1) Lens oracles (S3)

### 1.1 Neutrality (identity) oracle

If all relevant traits/body features are neutral (0.5), lens must be identity:

For each axis `<axis>` where both base and final exist:
- `| final(axis) - base(axis) | ≤ ε_neutral`

Recommended:
- `ε_neutral = 0.05`

Test fixture:
- `ctx:<axis>:A = x`
- all `feat:char:A:trait.* = 0.5`
- all `feat:char:A:body.* = 0.5`
Expect:
- `ctx:final:<axis>:A ≈ x`

### 1.2 Trait separation oracle (variance must exist)

Given the same base axis value `x` and two agents A/B with strongly different traits,
final perceptions must diverge:

- `| finalA(axis) - finalB(axis) | ≥ δ_trait` for at least one key axis (danger, uncertainty)

Recommended:
- `δ_trait = 0.20` for “strongly different” profiles

Suggested profiles:
- A: paranoia=0.9, experience=0.2, stress=0.6
- B: paranoia=0.1, experience=0.8, stress=0.2

### 1.3 Bias effect oracle at midrange

For axis where bias is meant to be positive (e.g., paranoia → danger):
With base `x = 0.50`:
- if bias>0 and sensitivity>=1 then `final(x) ≥ 0.50 + δ_bias_mid`

Recommended:
- `δ_bias_mid = 0.10` (tunable)

Rationale:
If `x=0.5` always maps to 0.5, personality has no baseline shift (the old amplify bug).

---

## 2) Context-layer usage oracles (post-S3)

### 2.1 Final-first dependency oracle for goal atoms

For each goal atom produced in S7:
- if any `ctx:final:*` exists for the agent, then the goal atom must depend on at least one
  `ctx:final:*` (directly or via a derived atom that itself depends on ctx:final).

Trace-level implementation:
- look at `goalAtom.trace.usedAtomIds`
- enforce:
  - `∃ id ∈ usedAtomIds : id.includes("ctx:final:")` OR
  - `∃ id ∈ usedAtomIds : (id is derived && its trace references ctx:final)`

Recommended approach in tests:
- strict direct check first (fast)
- allow derived-indirect only if the pipeline already wraps ctx into intermediate atoms

### 2.2 “No base ctx after S3” oracle (strict mode)

If `ctx:final:*` exists for an axis, then consumers should not cite the base
`ctx:<axis>:<id>` for that axis.

Operational check:
- In S7 goal atoms:
  - forbid any `usedAtomIds` entry that matches `^ctx:(?!final:)` *for the same axis* when `ctx:final` exists.

This oracle can be implemented as:
- build set `FinalAxes = { axis | ctx:final:axis:selfId exists }`
- for each used id `ctx:axis:selfId`:
  - require `axis ∉ FinalAxes`

---

## 3) Goal ↔ Action isolation oracles (hard)

### 3.1 Action atoms must not use goal atoms

For each action atom in S8:
- `usedAtomIds(action) ∩ { ids starting with "goal:" } = ∅`

Equivalent:
- `∀ action: not usedAtomIds(action).some(id => id.startsWith("goal:"))`

### 3.2 Action atoms must use util atoms (when non-empty trace)

For each action atom in S8 with any trace dependencies:
- `usedAtomIds(action)` must contain at least one `util:*`

Recommended:
- allow exceptions for primitive action atoms (explicitly documented)

---

## 4) Energy propagation oracles (graph overlay)

Energy propagation in v69 is a **linear damped push** along outgoing trace edges,
with uniform split, plus retention on the current node.

### 4.1 Non-negativity oracle

For each channel and each node at each step:
- `E_t(node) ≥ 0`

### 4.2 Mass conservation oracle (no sinks case)

Let the graph have no sinks (all nodes with energy have out-degree > 0).
With retention coefficient `d ∈ [0,1]`, the update is:

For each node u:
- retain: `R = d * E_t(u)`
- spread: `S = (1-d) * E_t(u)`
- each out-neighbor gets `S/deg(u)`

Then total mass is conserved:
- `Σ_u E_{t+1}(u) = Σ_u E_t(u)`

Test recipe:
1) build small graph (2-3 nodes) with out-degree > 0 for all nodes
2) seed energy at one node
3) run 1 step
4) compare total sums within tolerance

Tolerance:
- `ε_mass = 1e-9` (floating arithmetic)

### 4.3 Mass conservation oracle (with sinks)

If a node u is a sink (`deg(u)=0`), code keeps all its spread mass at u.
So mass still conserves globally:
- `Σ_u E_{t+1}(u) = Σ_u E_t(u)`

Same tolerance `ε_mass`.

### 4.4 No-source stability oracle

If initial energies are all zero, they remain zero:
- if `E_0 ≡ 0` then `E_t ≡ 0` for all steps.

### 4.5 Attribution completeness oracle (topK)

If a node v receives non-zero energy at the final step (for a channel),
its attribution map should contain at least one source (unless explicitly disabled):
- `E_T(v) > 0 ⇒ |Contrib(v)| ≥ 1`

And the sum of attributions should be proportional to energy:
- `0 < Σ_s Contrib(v,s) ≤ E_T(v) + ε_attr`

Recommended:
- `ε_attr = 1e-6`

---

## 5) Monotonicity oracles (goal semantics)

These are “semantic sanity” checks. They do not prove correctness but catch sign bugs.

Define a controlled fixture where everything is held constant except one axis.
Compute goal score `G(x)` for a target goal domain while varying one axis x.

### 5.1 Safety vs danger

Expected (domain-level):
- increasing `ctx:final:danger` should not decrease safety-related goal score.

Finite difference oracle:
- choose `x0=0.3`, `x1=0.7`
- require:
  - `G_danger(x1) - G_danger(x0) ≥ -ε_mono`

Recommended:
- `ε_mono = 0.02` (allows small numerical/interaction noise)

### 5.2 Exploration vs danger (expected inhibition)

Expected (often):
- increasing danger should not increase exploration goal score.

Oracle:
- `G_explore(x1) - G_explore(x0) ≤ ε_mono`

Same `ε_mono = 0.02`.

---

## 6) Stage isolation oracles (structural)

Re-state the most important ones as executable checks:

### 6.1 S0 has no ctx
- `Atoms(S0).filter(id startsWith "ctx:").length == 0`

### 6.2 S2 has base ctx but no final
- `count(ctx base) > 0`
- `count(ctx final) == 0`

### 6.3 S3 creates final
- `count(ctx final) > 0`
- each `ctx:final:axis:selfId` cites `ctx:axis:selfId` in trace
