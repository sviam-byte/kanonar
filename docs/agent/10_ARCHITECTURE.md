# Architecture (mental model)

## 1) System summary
This system simulates agents making decisions via:
- A context substrate (atoms with magnitudes/confidences + traces),
- A goal hypothesis layer (candidate goals/actions),
- A scoring layer (energy channels + costs + constraints),
- A routing layer (Mixture-of-Experts / “modes”),
- A propagation layer (energy spreading over a decision graph),
- A visualization layer (DecisionGraph views).

The key product requirement is interpretability: every decision should be explainable with traces and energy decomposition.

## 2) Layers and boundaries (conceptual)

### L0: Input / Context
Inputs are converted into “atoms” (facts, beliefs, derived observations).
Each atom should have:
- id, namespace/kind,
- magnitude (signal strength),
- confidence,
- origin,
- trace/provenance (when derived).

### L1: Feature channels (“quarks”)
Atoms are projected into standardized channels:
- threat, uncertainty, norm, attachment, resource, status, curiosity, base
Think: a vector field over the current state.

### L2: Goal hypotheses (“molecules”)
Candidate goals/actions are generated (or retrieved from a catalog) and scored.
Each hypothesis has:
- preconditions,
- expected effects on channels,
- costs,
- trace back to atoms and rules used.

### L3: Routing (Mixture of Experts)
Different “modes” (experts) can score/select differently.
Routing must be explicit, deterministic under seed, and traceable.

### L4: Graph propagation
Once node energies exist, the system spreads energy across edges to model:
- affordances,
- prerequisite chains,
- contagion/attention shifts.

### L5: Presentation
Graph views must never crash on missing data; they should render partial states.

## 3) Failure modes (what we guard against)
- Silent nondeterminism (hidden Math.random, unstable iteration order)
- Untraceable transformations (losing provenance)
- Energy not conserving mass (prop spreads but “creates” energy accidentally)
- UI hard-crashes due to undefined arrays / missing AFRAME / lazy deps

## 4) What to keep stable when refactoring
- Public types/shape of atoms/goals/traces
- Semantics of energy channels (names + sign conventions)
- Default scoring temperature / noise injection points
- Graph propagation contract (node list, edge list, weights, safe guards)
