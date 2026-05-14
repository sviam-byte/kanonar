# ProConflict Math

This document specifies the math semantics for the ProConflict lab and the
`lib/simkit/compare/*` helpers. ProConflict is not a new decision policy. It is
a deterministic paired-run sensitivity probe over the existing SimKit +
GoalLab loop.

## Purpose

ProConflict asks one question:

```text
If two runs share the same seed and config, how does a small state
perturbation become a visible behavioral divergence?
```

The lab is useful only if the answer stays deterministic and inspectable.
Randomness must not be introduced by the perturbation itself. Any divergence
must come from the perturbed state passing through the same pipeline, gates,
thresholds, and seeded RNG stream as the baseline run.

## Core Objects

Let:

- `W0` be the initial `SimWorld` produced from selected characters, locations,
  placements, and seed.
- `s` be the shared seed.
- `C` be the run config other than the perturbation.
- `F_C` be the deterministic SimKit transition operator for one tick under
  config `C`.
- `T` be the number of ticks.
- `p` be a perturbation vector.

A baseline trajectory is:

```text
W_A(0) = W0
W_A(t + 1) = F_C(W_A(t), s, t)
```

A perturbed trajectory is:

```text
W_B(0) = P_p(W0)
W_B(t + 1) = F_C(W_B(t), s, t)
```

`P_p` must be pure:

```text
P_p(W0) returns a deep-cloned world
P_p(W0) does not mutate W0
P_p(W0) does not touch RNG state
```

In code this is `applyPerturbations` in
`lib/simkit/compare/perturbationVector.ts`.

## Perturbation Vector

A perturbation vector is:

```text
p = (agentId, target, delta, label?)
```

Current targets:

- `body`: `stress`, `energy`, `health`
- `tom`: relation fields such as `trust`, `threat`, `respect`, `fear`
- `fact`: numeric world fact
- `trait`: cognition trait on the character entity
- `belief`: belief atom field, currently `magnitude` or `confidence`

For bounded scalar targets the update is:

```text
x' = clamp01(x + delta)
```

For missing targets, the vector is skipped and recorded. Skipping is part of the
result, not an exception, because a lab run should remain explainable even when
an input vector is invalid for the selected scene.

## Observed Trajectory

The lab does not compare full raw snapshots for determinism. Full record byte
equality is not a valid criterion while snapshots may contain wall-clock `time`.
Instead it compares semantic observables from `RunResult`:

- `records[t].trace.actionsApplied`
- `tensionHistory[t]`
- `stressHistory[agentId][t]`
- `pipelineHistory[agentId][t]`

Important: `SimSnapshot` does not carry live `world.facts`. Per-tick pipeline
facts must be read from explicit record data, especially `trace.deltas.facts`
and the compact `pipelineHistory` reconstructed by `batchRunner.ts`.

## Divergence Components

For each tick `t`, ProConflict computes a nonnegative feature vector:

```text
z(t) = [
  tensionDelta(t),
  actionHamming(t),
  goalKL(t),
  stressL1(t)
]
```

### Tension Delta

```text
tensionDelta(t) = abs(tension_A(t) - tension_B(t))
```

This is a world-level scalar drift. It is unitless internal scoring mass and
should not be interpreted as a physical distance.

### Action Hamming

Let `a_A(i,t)` and `a_B(i,t)` be the applied action kind for agent `i` at tick
`t`, if any. Let `I(t)` be the union of agents that have an applied action in
either run at that tick.

```text
actionHamming(t) =
  count_i[a_A(i,t) != a_B(i,t)] / max(1, |I(t)|)
```

If no actions are applied in either run, this component is `0`.

### Goal-Domain Symmetric KL

For each run, build a per-tick distribution from compact pipeline history:

1. Prefer positive `goalScores` summed across agents.
2. If no score map exists for that tick, fall back to mode counts.

Let the resulting maps be `g_A(t)` and `g_B(t)`. They are converted to
distributions with an epsilon floor:

```text
P_k = (g_A[k] + eps) / (sum_j g_A[j] + eps * K)
Q_k = (g_B[k] + eps) / (sum_j g_B[j] + eps * K)
```

The symmetric KL is:

```text
SKL(P,Q) = sum_k P_k * log(P_k / Q_k) + Q_k * log(Q_k / P_k)
```

The stored component uses a soft cap:

```text
goalKL(t) = 1 - exp(-SKL(P,Q))
```

This keeps the plotted component in `[0,1)` while preserving ordering for small
and moderate divergences.

### Stress L1

For the agent ids present in `runA.stressHistory`:

```text
stressL1(t) =
  mean_i abs(stress_A(i,t) - stress_B(i,t))
```

This is intentionally simple. It should be broadened only when the runner stores
comparable per-agent histories for more body variables.

## Composite Divergence

The current composite divergence is a weighted sum:

```text
D(t) =
  w_tension * tensionDelta(t) +
  w_action  * actionHamming(t) +
  w_goal    * goalKL(t) +
  w_stress  * stressL1(t)
```

Default weights:

```text
w_tension = 0.25
w_action  = 0.25
w_goal    = 0.25
w_stress  = 0.25
```

`D(t)` is a diagnostic pseudo-distance, not a conserved energy and not a
probability. It exists to rank and visualize semantic drift between two runs.

Recommended invariants:

- `D(t)` must be finite.
- Each component should be finite.
- If `p` is empty and config/seed are identical, `D(t)` should remain `0` for
  all semantic observables, ignoring wall-clock metadata.

## Divergence Onset

The first visible divergence tick is:

```text
t_first = min t such that D(t) > theta
```

Current threshold:

```text
theta = 1e-3
```

This threshold is UI-facing. It is not a model law. If it becomes configurable,
it should be stored as a named compare-lab parameter rather than an inline magic
constant.

## Lyapunov-Style Growth Rate

The current estimator is:

```text
t0 = first t such that D(t) > eps
lambda_hat = log(max(eps, D(T)) / max(eps, D(t0))) / max(1, T - t0)
```

with:

```text
eps = 1e-6
```

Interpretation:

- `lambda_hat > 0`: divergence grows over the observed window.
- `lambda_hat = 0`: no measurable divergence or no growth window.
- `lambda_hat < 0`: runs reconverge or the last tick is less divergent than
  onset.

This is Lyapunov-style, not a rigorous Lyapunov exponent. The system is
piecewise, gated, and partly thresholded; near thresholds, very small deltas can
cause discontinuous differences in modes or actions.

Recommended future estimator:

```text
y_t = log(D(t) + eps)
lambda_ols = slope of y_t over t in [t0, T]
```

The OLS slope is less sensitive to the last tick than the current endpoint
ratio.

## Character As Amplifier

The lab's core hypothesis is:

```text
same equations + same seed + different character parameters
=> different local amplification of the same perturbation
```

Let an agent have parameters `theta_i` from body, cognition traits, archetype,
memory, and ToM state. Locally, ignoring hard gates, one tick can be viewed as:

```text
x_i(t + 1) = f_i(x(t), theta_i)
```

Small perturbation propagation is approximately:

```text
delta x_i(t + 1) ~= J_i(t) * delta x(t)
```

where `J_i(t)` is the local sensitivity matrix. In the actual pipeline, many
terms are gated:

```text
mode = gate(drivers, traits, context, thresholds)
action = argmax(score(action | mode, util, access, memory))
```

Near a threshold, the effective gain can be large or discontinuous:

```text
small delta -> driver crossing -> mode flip -> action kind flip
```

That cascade is what ProConflict tries to expose. The amplifier is not an extra
force added by the lab; it is the existing character-conditioned pipeline.

## Amplifier Attribution

Attribution is post-hoc event detection over two completed trajectories. It is
not a causal proof. It identifies observable bifurcation surfaces.

Current event gates:

### Driver Crossing

For driver `d` and threshold `theta_d`:

```text
cross_A = driver_A(t-1) < theta_d and driver_A(t) >= theta_d
       or driver_A(t-1) >= theta_d and driver_A(t) < theta_d

cross_B = same for run B

event if cross_A != cross_B
```

Current threshold:

```text
theta_d = 0.3
```

### Mode Flip

```text
event if mode_A(i,t) != mode_B(i,t)
```

The current implementation deduplicates repeated identical mode-pair events per
agent so the table does not flood.

### Action Kind Flip

```text
event if actionKind_A(i,t) != actionKind_B(i,t)
```

### Tension Spike

```text
event if abs(tension_A(t) - tension_B(t)) >= 0.1
```

### Stress Spike

```text
event if abs(stress_A(i,t) - stress_B(i,t)) >= 0.05
```

Stress spike events are emitted only on first crossing per agent.

## Event Ordering

When several events occur at the same tick, order them by pipeline readability:

```text
driver.crossing
mode.flip
action.kindFlip
tension.spike
stress.spike
```

This ordering is explanatory. It should not be treated as proof that the earlier
listed event caused the later one unless the trace also shows the dependency.

## What To Test

Minimum math-level tests:

1. `applyPerturbations` is pure and deep-clones the world.
2. Body, ToM, fact, trait, and belief targets write exactly one intended state
   location or skip with a reason.
3. Empty perturbation vector produces semantically identical paired runs under
   the same seed.
4. `goalKL` reads `pipelineHistory`, not `snapshot.facts`.
5. Divergence components are finite for partial records.
6. Amplifier attribution detects driver crossings, mode flips, action flips,
   stress spikes, and tension spikes from compact run records.
7. Full record byte equality is never used as the determinism check when record
   snapshots include wall-clock `time`.

## Implementation Map

- UI: `lib/goal-lab/labs/ProConflictLab.tsx`
- Paired runner: `lib/simkit/compare/batchRunner.ts`
- Perturbation primitive: `lib/simkit/compare/perturbationVector.ts`
- Divergence metrics: `lib/simkit/compare/divergenceMetrics.ts`
- Attribution: `lib/simkit/compare/amplifierAttribution.ts`
- Tests: `tests/simkit/perturbation_runner.test.ts`

