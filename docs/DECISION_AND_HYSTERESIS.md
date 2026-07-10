# Decision, variability, and persistence

Status: canonical decision-math reference for the current S7→S8 path.

## 1. Purpose

The decision layer converts projected goal effects, costs, confidence, action
priors, access gates, and seeded variability into one applied action. It does
not read `goal:*` atoms directly.

```text
goal:* -> util:* / projected Δg(a) -> Q(a) -> seeded selection -> action:*
```

## 2. Score formula

### Purpose

Assign one inspectable canonical Q value to every allowed candidate.

### Formula

```text
G(a) = Σ_g E_g · Δg(a)
P(a) = I_prior · w_prior · priorMagnitude(a)
Q_raw(a) = G(a) + P(a) - cost(a)
riskPenalty(a) = k_risk · |Q_raw(a)| · (1 - confidence(a))
Q(a) = Q_raw(a) - riskPenalty(a)
```

### Variables

- `E_g` — current energy of goal domain `g`.
- `Δg(a)` — signed projected effect of action `a` on domain `g`.
- `priorMagnitude(a) ∈ [0,1]` — prior carried by the possibility/candidate.
- `I_prior ∈ {0,1}` — effective runtime prior-influence gate.
- `w_prior = 0.5` — `FC.actionScoring.priorInfluence.weight`.
- `cost(a) ∈ [0,1]` — inspectable action cost.
- `confidence(a) ∈ [0,1]`.
- `k_risk = 0.4` — `FC.actionScoring.riskCoeff`.

### Source of truth

- implementation: `lib/decision/scoreAction.ts`, `lib/decision/decide.ts`
- candidate construction: `lib/decision/actionCandidateUtils.ts`
- config: `lib/config/formulaConfig.ts`
- pipeline: `lib/goal-lab/pipeline/runPipelineV1.ts`
- tests: `tests/decision/score_action_risk_penalty.test.ts`,
  `tests/decision/decision_trace_breakdown.test.ts`
- trace: `action:score:*` and `S8.artifacts.decisionSnapshot`

### Invariants

- `action:*` provenance must not contain direct `goal:*` dependencies.
- Prior contribution is exactly zero when prior influence is disabled.
- Confidence is an additive risk penalty, not multiplication `Q*confidence`.
- Trace decomposition must reconstruct canonical Q within numeric tolerance.

### Minimal example

```text
G=0.40, priorMagnitude=0.60, I_prior=1, cost=0.10, confidence=0.75
P=0.5·0.60=0.30
Q_raw=0.40+0.30-0.10=0.60
riskPenalty=0.4·0.60·0.25=0.06
Q=0.54
```

### Failure modes

- trace omits the prior term while runtime uses it;
- documentation says confidence multiplies Q;
- local UI score is treated as canonical instead of S8 Q;
- forbidden action reaches the selection pool.

## 3. Candidate pool and seeded selection

### Purpose

Keep exact reproducibility for a fixed seed while allowing controlled
variability among competitive candidates.

### Formula

```text
K = 10                                  legacy/no prior profile
K = FC.actionScoring.priorInfluence.topK = 16  prior influence ON

topRanked = first K candidates sorted by descending Q
nearTie = first 3 candidates where Q_best - Q(a) <= 0.08

T_eff = 1.4T  if |nearTie| >= 2
T_eff = T     otherwise
T_eff >= 0.05

g_a = -ln(-ln(U_a)), U_a from seeded RNG
sampleScore(a) = Q_used(a)/T_eff + g_a
a* = argmax over the active sampling pool sampleScore(a)
```

If lookahead choice is enabled, `Q_used` may be an explicit lookahead override;
canonical reported `Q` remains unchanged.

### Variables

- `T` — decision temperature.
- `g_a` — seeded Gumbel noise; standard deviation is about `1.28`.
- `Q_used` — canonical Q or an explicit lookahead sampling override.
- near-tie constants come from `FC.actionScoring.exploration`.

### Source of truth

- implementation: `lib/decision/decide.ts`
- RNG: `lib/core/noise.ts`
- config: `FC.actionScoring.exploration`
- tests: `tests/decision/near_tie_sampling.test.ts`,
  `tests/decision/q_sampling_overrides.test.ts`,
  `tests/pipeline/determinism_oracle.test.ts`

### Invariants

- Same candidates + Q + seed + temperature + profile => same winner.
- `decisionSnapshot.best` is the actual Gumbel winner, not Q rank 1.
- `topByQ` and `chosen` are distinct readouts.
- The standing noise-rank-coupling debt remains: noise is currently drawn by
  ranked iteration order, not keyed by candidate identity.

### Minimal example

```text
Q = [0.54, 0.50], gap=0.04 <= 0.08 -> near-tie pool
T=0.2 -> T_eff=0.28
seeded g=[0.1, 0.5]
sampleScore=[2.029, 2.286] -> second candidate is applied
```

### Failure modes

- UI calls Q rank 1 the applied action;
- different profile changes top-K but export omits the profile;
- unseeded randomness enters the pool;
- candidate-order changes re-deal noise and are misread as preference change.

## 4. Access, priors, and PAM v2

Access is a hard pre-selection gate: blocked candidates do not enter scoring.
PAM v2 produces `challenge`/`defy` priors from autonomy-related traits. A prior
can affect Q only when both the PAM vocabulary and prior-influence carrier are
enabled. The complete PAM formulas and gates are in
`docs/docs_conceptual/KANONAR_PHASE_I_IMPL_PLAN.md` §I-0.2.

`defy` currently has no consuming possibility and therefore cannot be selected.
This is documented vocabulary debt.

## 5. Persistence and hysteresis actually present

There is no generic action-score hysteresis in `decideAction`. Stability comes
from separate mechanisms:

- S7 goal activation/hysteresis and `goalState` retention;
- SimKit intent lifecycle (`start/continue/abort`) and cooldown;
- repetition penalties and novelty relief;
- dual-process mode gate and degraded modifiers;
- optional belief/prediction feedback.

Do not document the conceptual margin rule `switch iff Δ>=τ` as implemented
unless a concrete runtime path and test are named. The planned continuous budget
gate involving C(t) is Phase II and is not wired; C(t) remains read-only.

## 6. Validation commands

```bash
npm run typecheck
npm test -- tests/decision tests/pipeline
```

Any score-law change requires updates to `docs/PIPELINE.md`, this document,
decision trace tests, determinism tests, and the relevant frozen experiment
status if the observable changed.

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Variables such as trust, fear,
stress, resentment, affiliation need, or control need are internal simulation
scalars. They are not clinical, psychometric, or experimentally calibrated
measurements.

The system is useful for deterministic simulation, explainable decision
pipelines, sensitivity analysis, comparing rule systems, and prototyping agent
dynamics.

The system must not be presented as a validated psychological, diagnostic, or
real-world behavioral prediction model without external validation.
