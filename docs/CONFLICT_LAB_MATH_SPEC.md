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
X[t] = (A[t], R[t], E[t], H[t], P[t])
```

- `A[t]`: agent internals, including goal pressure, fear, stress, resentment,
  loyalty, dominance need, cooperation tendency, and will.
- `R[t]`: directed relation state, including trust, bond, perceived threat,
  conflict, and perceived legitimacy.
- `E[t]`: environment state, including resource scarcity, external pressure,
  visibility, and institutional pressure.
- `H[t]`: event history of previous outcomes.
- `P[t]`: deterministic strategy profiles used by the replicator update.

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
X[t + 1] = F(X[t], Y[t], Theta)
```

The canonical choice mode is `replicator + argmax`. The probabilities are not
sampled; they are traceable strategy mass. Ties are resolved deterministically
by the protocol action order.

Seeded stochastic choice may exist in legacy or exploratory modes, but it is not
the canonical deterministic math core.

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
- Transition: outcomes update agent and relation variables through bounded
  logit-space shifts.

Example outcome regimes:

- mutual trust increases trust and bond while reducing stress, fear, and
  conflict;
- one-sided betrayal rewards the betrayer materially while increasing victim
  fear, resentment, threat, and conflict;
- mutual betrayal degrades both sides;
- withholding preserves safety but slowly raises guarded conflict.

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

