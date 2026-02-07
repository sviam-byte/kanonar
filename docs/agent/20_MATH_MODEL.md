# Math model & criteria (hard formulas)

This file defines the intended mathematical semantics. Map each item to code via rg.

## 1) Notation
- Channels: c ∈ C, where C = {threat, uncertainty, norm, attachment, resource, status, curiosity, base}
- Agent internal state at time t: x_t
- Candidate goal/action i: g_i
- Channel vector for candidate i: Δe_i ∈ R^{|C|} (predicted channel deltas)
- Cost scalar: k_i ≥ 0
- Feasibility mask: m_i ∈ {0,1}
- Total energy (score): S_i

## 1.1) Canonical scales (to prevent unit drift)
All channel values should be comparable and bounded. Use one of the following:

### Option A: squashed channels (preferred)
Let raw channel signal be r_c ∈ R. Store channel value as:
e_c = tanh(r_c / s_c)   ∈ (-1, 1)
where s_c > 0 is a scale parameter.

### Option B: clipped linear channels
e_c = clip(r_c, -B_c, B_c)

Stability requirement:
- Any scoring/propagation operating on e must not rely on unbounded r.
- If r is used internally, expose s_c / B_c in config and document.

## 2) Base scoring (per candidate)
We score each goal hypothesis by a weighted channel dot product minus costs:

S_i(t) = m_i · ( w(t) · Δe_i(t) ) - k_i(t) + b_i(t)

where:
- w(t) ∈ R^{|C|} are agent weights (may depend on personality curves),
- b_i(t) is optional bias / prior preference,
- m_i = 0 hard-blocks the candidate.

### Interpretability requirement
Store a decomposition:
- per-channel contributions: contrib_{i,c} = w_c · Δe_{i,c}
- total score: S_i
- trace: which atoms/rules produced Δe_i and k_i.

## 2.1) Atom → channel projection (explicit model)
Let atoms be a_k with:
- magnitude μ_k, confidence q_k, and a channel embedding vector φ(a_k) ∈ R^{|C|}.
Define the current channel state:

e(t) = Σ_k ( q_k · μ_k · φ(a_k) )

If using squashing:
e_c(t) = tanh( (Σ_k q_k μ_k φ_c(a_k)) / s_c )

Criteria:
- φ(a_k) must be deterministic and versioned (changing it changes semantics).
- Trace should allow reconstructing which atoms contributed to each e_c.

## 2.2) Candidate effect model (action → Δe)
Each candidate g_i predicts an effect on channels via a forward model:

Δe_i(t) = F(g_i, x_t)

Common practical forms:

### Linear local model
Δe_i = A_i · f(x_t) + d_i

### Rule-based additive model
Δe_i = Σ_{rule r fires} δ_{i,r}

### Learned surrogate (allowed only if explainable)
Δe_i = NN_i(f(x_t))
If learned: store the top contributing features / rule-activations as trace.

## 2.3) Costs and constraints as explicit terms
Split cost into interpretable components:
k_i = k_i^{time} + k_i^{risk} + k_i^{resource} + k_i^{social} + ...

Hard constraints:
m_i = 1[preconditions_i(x_t)=true]

Soft constraints:
Add penalties p_i ≥ 0:
S_i = ... - p_i

## 3) Personality curves / modulation
Let each channel weight be modulated by an S-shaped curve of some internal variable z:

w_c(t) = w_c^0 · σ( a_c ( z_c(t) - θ_c ) )
σ(u) = 1 / (1 + exp(-u))

Alternative allowed: piecewise linear or Gumbel-softmax style, but must remain deterministic under seed.

## 3.1) Homeostasis / set-point dynamics (optional but formal)
If the agent maintains set-points e*_c and reacts to deviations:

z_c(t) = e_c(t) - e*_c
w_c(t) = w_c^0 · σ(a_c(z_c - θ_c))

Or direct drive:
drive_c(t) = |e_c(t) - e*_c|^p  (p ∈ [1,2])

## 4) Hysteresis / inertia (goal-state persistence)
To avoid flapping between goals, apply hysteresis:

Let g*_{t-1} be the previously selected goal with score S*_{t-1}.
Define an inertia term I ≥ 0 and a switch threshold H ≥ 0.

Select new goal g_i at time t only if:
S_i(t) ≥ S*(t) + H
Otherwise keep g*_{t-1}.

Equivalent form (additive bonus to current goal):
S'_i(t) = S_i(t) + I · 1[i = g*_{t-1}]
Pick argmax_i S'_i(t).

## 4.1) Switching cost as a smooth regularizer
Alternative to hard hysteresis:

S'_i(t) = S_i(t) - κ · d(g_i, g*_{t-1})

where d(·,·) is a goal-distance (0 for same, 1 for different, or graph distance),
κ ≥ 0 controls stickiness.

## 5) Stochastic choice (temperature + Gumbel-Max)
If the system uses probabilistic choice:

P(g_i) = softmax( S_i / T )
softmax_j(u_j) = exp(u_j)/Σ_k exp(u_k)

or Gumbel-Max:
g = argmax_i ( S_i + G_i )
G_i ~ Gumbel(0, β) with β controlling noise scale.

Determinism requirement:
- All randomness uses a single seeded RNG.
- Noise draws must be traceable to a seed + call site.

## 5.1) Risk / uncertainty-aware scoring (explicit)
If each candidate has uncertain outcomes, model S_i as random variable:
S_i ~ distribution with mean μ_i and variance σ_i^2.

Risk-averse utility (one standard form):
U_i = μ_i - ρ σ_i
ρ ≥ 0 risk aversion.

Or CVaR at level α:
U_i = CVaR_α(S_i)

Trace must report (μ_i, σ_i) or CVaR components.

## 6) Mixture-of-Experts (modes) routing
Let experts e ∈ E provide expert-specific scores S_i^{(e)}.
Let routing weights π_e(x_t) sum to 1.

Mixture score:
S_i = Σ_e π_e(x_t) · S_i^{(e)}

Hard routing (allowed if needed):
e* = argmax_e π_e(x_t)
S_i = S_i^{(e*)}

Traceability requirement:
- Store π_e values and the chosen e* (if hard).

## 6.1) Expert gating model (explicit)
Define gating logits:
ℓ_e = G_e(x_t)
π_e = softmax(ℓ_e / T_gate)

Hard-gate with Gumbel:
e* = argmax_e (ℓ_e + Gumbel_e)

Determinism: same seed ⇒ same e*.

## 7) Graph energy propagation (diffusion on directed/undirected graph)
Let graph nodes be goals/decisions v ∈ V.
Let base node energy be E_v^0 (from scoring).
Let adjacency weights be W_{u→v} ≥ 0.
Let decay λ ∈ [0,1] and node cost C_v ≥ 0.

One-step propagation:
E_v^{t+1} = (1-λ) E_v^t + Σ_u E_u^t · W_{u→v} - C_v

Matrix form:
E^{t+1} = (1-λ)E^t + (W^T E^t) - C

Conservation criterion (up to decay/cost):
Σ_v E_v^{t+1} ≤ (1-λ) Σ_v E_v^t + Σ_u E_u^t Σ_v W_{u→v}
To avoid energy explosion, enforce:
Σ_v W_{u→v} ≤ 1  for all u   (row-stochastic outgoing weights),
or apply normalization.

### Stability criterion
If W is row-stochastic and λ>0, repeated propagation converges.
If not, cap iterations and/or renormalize.

## 7.1) Closed-form fixed point (useful for debugging)
If λ>0 and spectral radius ρ(W^T) < 1, fixed point exists:
E* = (I - (1-λ)I - W^T)^{-1} ( -C )
In practice compute iteratively:
E^{t+1} = (1-λ)E^t + W^T E^t - C
Stop when ||E^{t+1}-E^t||_1 ≤ ε or t reaches maxIter.

## 7.2) Channel-wise propagation (if visualized per channel)
Let E_{v,c} be energy of node v in channel c.
Propagate per channel:
E_{v,c}^{t+1} = (1-λ_c)E_{v,c}^t + Σ_u E_{u,c}^t · W_{u→v} - C_{v,c}
Total node energy:
E_v = Σ_c α_c E_{v,c}
Trace should allow per-channel edge flow attribution when debugging.

## 8) Directed vs partial variants (if present)
Directed analysis means you must respect u→v orientation in W.
Partial variants mean controlling for a set Z by residualization:

Given variables X and Y and controls Z, define:
X~ = X - Proj_Z(X)
Y~ = Y - Proj_Z(Y)
Then compute association on (X~, Y~).

In the goal/energy context, “controls” can be:
- global context intensity,
- baseline arousal,
- resource ceiling, etc.
If you implement partial scoring/propagation, document what Z is.

## 8.1) Resource-constrained choice (formal)
If agent has budgets (time, resources) B_j and candidate i consumes r_{i,j}:

maximize_i  S_i
subject to  r_{i,j} ≤ B_j for all j

Soft version with Lagrange multipliers λ_j ≥ 0:
S'_i = S_i - Σ_j λ_j r_{i,j}

## 8.2) Multi-step planning (limited horizon)
If goals/actions have transitions x_{t+1} = T(x_t, g_i):
Define reward as S_i at each step and discount γ ∈ (0,1).

Horizon-H value:
V_H(x_t) = max_{g_0..g_{H-1}} Σ_{h=0..H-1} γ^h · R(x_{t+h}, g_h)

If you approximate with 1-step lookahead:
Q(x_t, g_i) = R(x_t, g_i) + γ · \hat V(x_{t+1})

Trace must show horizon used and what approximation was applied.

## 9) What to unit-test (math-level)
1) Determinism: same seed ⇒ same selected goal and same propagated energies.
2) No explosion: with normalized W and λ>0 energies remain bounded.
3) Hysteresis: small score deltas do not cause goal flapping.
4) Trace: derived objects retain references to their sources.

## 10) Interpretability criteria (formal-ish, testable)

### 10.1) Additivity sanity check
If score is linear in channel deltas:
S_i = Σ_c w_c Δe_{i,c} - k_i + b_i
Then the stored per-channel contributions must sum to the score:
| S_i - (Σ_c contrib_{i,c} - k_i + b_i) | ≤ ε

### 10.2) Local sensitivity (Lipschitz-ish)
Small changes in inputs should not cause unbounded score jumps.
If e is bounded in (-1,1), then:
|S_i(e) - S_i(e')| ≤ ||w||_1 · ||e-e'||_∞
Use as a regression test: random perturbations within δ should not change argmax too often unless near ties.

### 10.3) “Near-tie” awareness
Define margin:
M = S_best - S_second
If M < τ (tie band), the system must:
- either keep previous goal (hysteresis),
- or log “uncertain choice” in trace,
- or sample stochastically (but deterministically under seed).

## 11) Data validation / NaN guards (non-math but required)
For any computed scalar arrays:
- assert finite: not NaN, not ±Inf
- clamp extreme values before visualization

Recommended invariant:
∀v: E_v ∈ [E_min, E_max] after propagation, with explicit clamp and trace note if clamped.
