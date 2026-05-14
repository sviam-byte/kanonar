# Conflict Lab Math Spec

Conflict Lab models conflict as a deterministic nonlinear discrete dynamical
system:

```text
X[t + 1] = F(X[t]; Theta, M[t])
```

`X[t]` is the full conflict state, `Theta` is the fixed parameter set, `M[t]`
is the active protocol, and `F` is the transition map. Mechanics are not visual
cards or action pools. They are local game protocols that define roles, phases,
observation, legal actions, payoff, validation, and state transition.

## Core State

The canonical state shape is:

```text
X[t] = (A[t], R[t], E[t], M[t], H[t], P[t], G[t])
```

- `A[t]`: agent internals, including goal pressure, fear, stress, resentment,
  loyalty, dominance need, cooperation tendency, and will.
- `R[t]`: directed relation state, including trust, bond, perceived threat,
  conflict, perceived legitimacy, and volatility.
- `E[t]`: environment state, including resource scarcity, external pressure,
  visibility, and institutional pressure.
- `M[t]`: directed learning memory, including action values, opponent response
  counts, betrayal debt, repair credit, conflict momentum, fear/shame traces,
  volatility, and last prediction error.
- `H[t]`: event history and per-agent trajectory frames.
- `P[t]`: deterministic strategy profiles used by the replicator update.
- `G[t]`: directed conflict regimes with hysteresis.

All psychological, relational, and environmental scalar state variables are
bounded to `[0, 1]`.

## Protocol Step

Each step follows the same contract:

```text
O_i(t) = Omega_i(X[t], M[t])
V_i(a) = U_i(a, O_i(t), theta_i)
p_i(t + 1) = Replicator(p_i(t), V_i)
a_i(t) = argmax p_i(t + 1)
Y[t] = Psi_M(X[t], a_1(t), a_2(t))
PE_i(t) = 1 - P_i(a_j observed | a_i)
R[t + 1] = UpdateRelation(R[t], Y[t], M[t], PE[t])
M[t + 1] = UpdateMemory(M[t], Y[t], reward[t], PE[t])
G[t + 1] = UpdateRegime(G[t], R[t + 1], M[t + 1])
X[t + 1] = F(X[t], Y[t], M[t + 1], G[t + 1], Theta)
```

The canonical choice mode is `replicator + argmax`. The probabilities are not
sampled; they are traceable strategy mass. Ties are resolved deterministically
by the protocol action order.

Utility includes both base character/relation scoring and directed learning
terms:

```text
U = baseU + betaQ * Q(action) + betaE * expectedResponse
    - betaV * volatilityRisk - betaD * betrayalDebtPenalty
```

Seeded stochastic choice may exist in legacy or exploratory modes, but it is not
the canonical deterministic math core.

### Intervention Mode

Forced joint actions are an explicit intervention mode, not the canonical
autonomous choice path. By default:

```text
forced action => outcome uses forced action, strategy profile is frozen
```

This prevents test fixtures and external interventions from pretending that the
agent voluntarily selected the forced action. If a caller intentionally wants
the old behavior, it must request
`forcedActionStrategyMode: "learn_from_utility"`, in which case strategy
profiles update from the current utility scores while the outcome still uses
the forced action. Step traces must surface this as `intervention.forced`.

### Bounded Logit Transition

Scalar updates use bounded logit-space drive:

```text
logit(x[t + 1]) = logit(x[t]) + driveScale * drive
```

`driveScale` is not EMA retention or decay. If `drive = 0`, the scalar remains
unchanged. Any future decay/forgetting term must be represented separately.

### Memory Update

Directed memory updates are deterministic:

```text
Q(a) <- Q(a) + eta * (reward - Q(a))
count(myAction, otherAction) <- lambda * count + 1
betrayalDebt <- lambdaD * debt + betrayal * PE * trust * (0.5 + bond)
repairCredit <- lambdaR * repair + repairImpact * credibility * conflict
conflictMomentum <- lambdaC * momentum + harm + betrayal + humiliation - repair
```

Prediction error is currently the simple smoothed-frequency form:

```text
PE = 1 - P(observedOtherAction | myAction)
```

This makes the dynamics non-Markovian in relation state alone: identical
relations can transition differently when directed memories differ.

### Regime Hysteresis

Directed relations carry a regime:

```text
secure | strained | volatile | hostile | ruptured
```

Regime transitions use hysteresis. For example, hostile is entered when
conflict or perceived threat crosses the hostile threshold, but exits only after
sustained lower conflict and sufficient repair credit. Rupture cannot be undone
by one small positive event; it requires sustained repair conditions.

## Protocol-Induced Attractors

A scenario with roles is a protocol, not an attractor by itself:

```text
role scenario -> protocol -> transition map -> trajectory -> attractor / basin
```

An attractor is an observed regime of trajectories under repeated application of
the protocol. One protocol may produce several attractors depending on initial
conditions, such as repair, cold conflict, rupture, compliance, or cyclic
escalation.

## First Reference Protocol: Trust Exchange

`trust_exchange` is the first reference protocol because it is the smallest
complete proof of the architecture.

- Roles: both players are `participant`.
- Phase: simultaneous hidden choice.
- Actions: `trust`, `withhold`, `betray`.
- Observation: each player sees self state, directed relation, environment, and
  public protocol context, but not the other player's current action.
- Resolution: both actions are validated before payoff and transition.
- Transition: outcomes define base drives, then relation drives are modulated
  by current directed relation, directed memory, prediction error, action
  impact, and environment before bounded logit-space shifts are applied.

Example outcome regimes:

- mutual trust increases trust and bond while reducing stress, fear, and
  conflict;
- one-sided betrayal rewards the betrayer materially while increasing victim
  fear, resentment, threat, and conflict; the relational hit is stronger when
  prior trust/bond and external pressure are high;
- mutual betrayal degrades both sides;
- withholding preserves safety but slowly raises guarded conflict.

Each tick appends one trajectory frame per directed agent relation. A frame
records selected action, observed other action, utility decomposition,
prediction error, relation before/delta/after, memory before/after, reward, and
regime before/after. This is the explanation substrate for trajectory analysis.

## UI Runtime Bridge v1.5

The UI bridge exposes canonical execution as a typed report:

```text
ConflictCoreRunReport =
  canonical_dynamics | unsupported_kernel
```

In v1.5 only `trust_exchange` may return `canonical_dynamics`. Other protocol
cards may still show their roles, phases, observation model, payoff sketch, and
legacy scenario trace, but they must report `unsupported_kernel` until their
domain kernels exist. This keeps the interface honest: protocol-card structure
is not the same thing as executable nonlinear dynamics.

The bridge action vocabulary for `trust_exchange` is deliberately small:

```text
trust | withhold | betray
```

Legacy scenario actions such as `manipulate` remain legacy-runner actions until
the trust kernel explicitly expands its canonical action space.

## Trajectory Analysis

The lab studies trajectories rather than isolated choices:

```text
Gamma(X0) = { X0, X1, ..., XT }
```

Required pure analysis helpers include:

- semantic distance between states;
- collapse score;
- repair capacity;
- simple cycle candidate detection;
- perturbation divergence estimate.

Full byte equality is not the right comparison target for larger simulation
records. Conflict Lab math helpers compare semantic bounded state fields.

## Implementation Contract

The deterministic core must preserve:

```text
same state + same params + same active protocol => same next state
```

No hidden `Math.random()`, broad fallback, UI-only domain enforcement, or
string-only mechanic modeling is valid in the core. New mechanics must be added
as typed protocols with independent unit tests before UI wiring.
