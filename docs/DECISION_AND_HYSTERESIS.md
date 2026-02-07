# Decision, modes, hysteresis — v69

This file pins down the *decision model* as it exists in code, plus the stability criteria.

Sources of truth:
- decision: `lib/decision/decide.ts`
- priors/access: `lib/decision/actionPriors.ts`, `lib/access/deriveAccess.ts`
- util projection: `lib/goals/goalAtoms.ts` (S7 end)

Even if details evolve, the invariants here must remain stable unless explicitly revised.

---

## 1) Formal separation: goals vs actions

Hard architectural rule:
- Actions read `util:*`, not `goal:*`.

Formally:
- `Decision` is a function of `(Util, Access, Priors, Possibilities, Noise?)`.
- `Decision` is NOT a direct function of `Goal`.

`Goal → Util` is a projection step:
- `Π: GoalSpace → UtilSpace`

Only `UtilSpace` is visible to the action selector.

---

## 2) Utility aggregation model (conceptual contract)

The code produces a set of utilities:
- `u_i ∈ [0,1]` for each util feature i (e.g., util:safety, util:affiliation, …)

Action a has a util vector weight/profile:
- `w_a ∈ R^m` (m utilities) + bias `b_a`

A standard linear score is:

`s(a) = b_a + Σ_i w_{a,i} · u_i`

Then selection can be:
1) Argmax deterministic:
   - `a* = argmax_a s(a)`
2) Softmax stochastic with temperature T:
   - `P(a) = exp(s(a)/T) / Σ_j exp(s(j)/T)`
3) Gumbel-Max (equivalent to softmax):
   - `a* = argmax_a ( s(a) + g_a )`, where `g_a ~ Gumbel(0, T)`

**Contract**:
Even if implementation differs, it must be expressible as:
- a monotone transformation of a scalar action score,
- computed from util/access/priors, not from goal atoms directly.

---

## 3) Access + priors (gating)

Let:
- `A(a) ∈ {0,1}` be access (allowed action)
- `p(a)` be prior (could be a bias term or multiplicative factor)

Two equivalent formulations:

### 3.1 Additive (logit) formulation

`s'(a) = s(a) + log p(a) + mask(a)`

where:
- `mask(a) = -∞` if `A(a)=0`, else 0.

### 3.2 Multiplicative probability formulation

`P(a) ∝ A(a) · p(a) · exp(s(a)/T)`

---

## 4) Hysteresis / stability (goal or mode persistence)

Even if action selection is per-tick, *intentional stability* is required to avoid flicker.
If the code currently applies hysteresis to active goal/mode selection, the contract is:

### 4.1 Margin hysteresis (mode switching)

Let:
- `m_t` be current mode at tick t
- `Score(mode)` be a scalar mode score
- `Δ = Score(best) - Score(m_t)`

Switch only if:
- `Δ ≥ τ_switch`

Otherwise keep:
- `m_{t+1} = m_t`

This is the simplest stable policy.

### 4.2 Inertia / exponential smoothing (utilities)

Maintain smoothed util:
- `ū_{t+1} = (1-α)·ū_t + α·u_t`

with `α ∈ (0,1]`.

Stability criterion:
- smaller α → more inertia, less flicker.

### 4.3 Goal-set hysteresis (active goal selection)

If there is a discrete set of “active goals”:
- keep current active goal g unless another goal exceeds it by margin τ.

Formally:
- choose `g* = argmax g score(g)`
- if `score(g*) - score(g_current) ≥ τ` then switch, else keep current.

---

## 5) Decision quality criteria (testable)

### 5.1 Determinism under fixed seed (if noise is used)

If the system uses any stochasticity, then:
- with fixed seed, outputs are deterministic.

### 5.2 Non-trivial variation under different utilities

If util vector changes significantly (L1 distance ≥ δ_util),
selected action distribution should change.

Example:
- `||u - u'||_1 ≥ 0.5` should produce either:
  - different argmax action, or
  - materially different softmax probabilities.

### 5.3 Access dominates

If `A(a)=0`, then action `a` must never be selected.

---

## 6) How this file must be kept in sync

If you change:
- how `util:*` is computed or normalized,
- how access/prior gating works,
- whether selection uses argmax vs softmax vs gumbel,
- any hysteresis thresholds,

then you must update:
- this file,
- docs/ORACLES.md (thresholds),
- and tests covering determinism/stability.
