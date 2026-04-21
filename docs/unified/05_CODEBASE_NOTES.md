# Codebase Notes

## What Lives Here

This repository contains several different kinds of systems in one place.

## Main Logic Families

### Context and Atom System

- `lib/context/*`
- `lib/atoms/*`
- `lib/affect/*`
- `lib/features/*`
- `lib/relations/*`

What it does:

- turns world state, memory, relations, and observations into atoms
- derives base and subjective context axes
- preserves trace/provenance for downstream reasoning

### GoalLab Pipeline

- `lib/goal-lab/pipeline/*`
- `lib/goals/*`
- `lib/drivers/*`
- `lib/decision/*`
- `lib/intents/*`
- `lib/actions/specs/*`

What it does:

- builds staged reasoning from raw atoms to drivers, goals, possibilities, and chosen actions
- carries explainability payloads in stage artifacts
- optionally runs lookahead and belief persistence

### ToM and Social Reasoning

- `lib/tom/*`
- `lib/contextual/*` style modules embedded under `lib/tom/contextual/*`
- `lib/relations/*`

What it does:

- computes dyadic priors and policy signals
- surfaces social threat, trust, rank, and mode signals
- feeds action priors and social interpretation layers

### Emotion and Appraisal

- `lib/emotion/*`
- `lib/emotions/*`
- `lib/affect/*`

What it does:

- derives appraisal-level emotional signals
- generates emotion atoms and dyadic emotion structure
- feeds drivers, ToM policy, and explanation panels

### Simulation / SimKit

- `lib/simkit/*`
- `components/sim/*`
- `pages/SimulatorPage.tsx`

What it does:

- runs a tick-based simulation world
- hosts plugins that can call GoalLab decision logic
- adds mode gating, action execution, placement, memory, and orchestrator flows

### Visualization and Debugging

- `components/goal-lab/*`
- `components/goal-lab-v2/*`
- `lib/graph/*`
- `lib/decision-graph/*`
- `components/console/*`

What it does:

- renders pipeline stages, graph views, atom inspectors, POMDP panes, reports, and diagnostics
- exposes both legacy and newer GoalLab shells

## Important Cross-Cutting Patterns

### Seeded reasoning exists, but not everywhere

- core logic uses seeded randomness utilities and testable deterministic flows
- live UI setup still creates some seeds from wall clock values

### Explainability is a first-class design goal

Many modules preserve:

- `trace.usedAtomIds`
- `trace.parts`
- per-stage artifacts
- ranked action breakdowns

### There are multiple generations of contracts

You will see all of these in the repo:

- canonical v2-style atom/pipeline contracts
- snapshot adapters
- legacy GoalSandbox-oriented flows
- simulator bridge contracts

This is normal for this codebase, but it means agents must be explicit about which layer they are touching.

## Where Bugs Are Most Likely

- boundary layers that mix old and new contracts
- UI surfaces that assume full data
- seed/replay-sensitive surfaces
- giant spec/catalog files with many behavior branches
- route-level surfaces that still point to legacy pages

## Safe Mental Model

When in doubt, think of the repo like this:

1. `lib/goal-lab/pipeline/*` is the reasoning spine.
2. `lib/config/*` defines the allowed knobs.
3. `tests/*` tell you which invariants are actually protected.
4. UI layers are important, but they are consumers and orchestrators more often than they are canonical truth.
