# Variability Map

## Purpose

This document separates disciplined variability from accidental nondeterminism.

That distinction matters because the repo already contains:

- seeded deterministic core logic
- controlled stochastic choice
- heuristic mode switching
- deterministic nonlinear Conflict Lab dynamics
- UI-layer wall-clock seeds and compat-driven variability

## Stable categories

### Deterministic core

Behavior should be reproducible under the same:

- inputs
- seed
- config

Primary anchors:

- `lib/core/noise.ts`
- `lib/goal-lab/pipeline/*`
- `lib/decision/*`
- `tests/pipeline/*`
- `tests/decision/*`
- `tests/simkit/*`

### Controlled stochasticity

Randomness is allowed when it is:

- seeded
- parameterized
- explainable
- visible in trace/telemetry

Primary anchors:

- `lib/decision/decide.ts`
- `lib/config/formulaConfig.ts`
- `lib/config/formulaConfigSim.ts`
- `lib/simkit/core/repetitionDamper.ts`
- simkit decision/orchestrator plugins

### Heuristic branching

This is variability from explicit rules, thresholds, gating, and fallbacks rather than RNG.

Examples:

- mode switches
- ToM enable/disable gates
- driver shaping
- cooldown/family-repeat penalties

### Paired-run sensitivity probes

Compare labs such as ProConflict are deterministic analysis surfaces, not new
policy controllers. They run two trajectories with the same seed/config and one
explicit state perturbation, then compare semantic observables. The math contract
for this class of probe is documented in `docs/PROCONFLICT_MATH.md`.

### Conflict Lab deterministic dynamics

Conflict Lab mechanics should be deterministic transition kernels, not visual
card presets. Sensitivity, cycles, bifurcations, or chaotic-looking trajectories
must come from explicit nonlinear feedback, memory, thresholds, and state
coupling, not from hidden randomness.

The local contract is documented in `docs/CONFLICT_LAB_CONTRACT.md`. In
deterministic mode, the rule is:

```text
same state + same params + same active mechanic => same next state
```

If stochastic Conflict Lab behavior is introduced, it must be an explicit seeded
mode with traceable RNG wiring and tests that compare semantic fields.

## Risk categories

### Accidental variability

Behavior changes because of environment or surface-level setup, not because the model intended it.

Main examples in this repo:

- `Date.now()`-derived seeds in live UI/setup flows
- runtime globals affecting data shape
- mixed truth paths where canonical and compat payloads both feed one surface

## Current hotspots

### Good control

- `lib/core/noise.ts`
- `lib/decision/decide.ts`
- `lib/config/formulaConfig.ts`
- `lib/config/formulaConfigSim.ts`
- `lib/simkit/core/repetitionDamper.ts`

### Weak control

- `hooks/useGoalLabWorld.ts`
- mixed GoalLab adapter/UI layers
- runtime-global-driven data entry points

## Operational rule

Any patch that touches variability should state which mode it belongs to:

1. deterministic
2. controlled stochastic
3. exploratory/sandbox-only

If a change is sandbox-only or non-replay-safe, that must be explicit in code/docs.
