# Variability Map

## Purpose

This document separates disciplined variability from accidental nondeterminism.

That distinction matters because the repo already contains:

- seeded deterministic core logic
- controlled stochastic choice
- heuristic mode switching
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
