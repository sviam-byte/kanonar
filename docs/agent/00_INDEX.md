# Agent Docs Index

## Purpose
These files are written for fast onboarding of an LLM/agent that must:
- understand the system's conceptual model
- locate corresponding code quickly
- make patches without breaking invariants
- validate changes with tests

## Official entrypoint
Before using this folder as your main map, read:

- `docs/unified/README.md`
- `docs/unified/01_CONTROL_PLANE.md`
- `docs/unified/02_AGENT_QUICKSTART.md`
- `docs/unified/03_SYSTEM_MAP.md`

`docs/unified/*` is the reconciled control-plane layer for the current repo shape.
This `docs/agent/*` folder remains useful, but it is no longer the only onboarding surface.

## Read order
0) `docs/unified/README.md`
1) `docs/unified/01_CONTROL_PLANE.md`
2) `docs/unified/02_AGENT_QUICKSTART.md`
3) `docs/unified/03_SYSTEM_MAP.md`
4) `10_ARCHITECTURE.md`
5) `20_MATH_MODEL.md`
6) `30_WORKFLOWS.md`
7) `40_TESTING.md`
8) `50_CONTRIBUTING_AGENT.md`

## Where to look in code
Because repo layouts vary, use ripgrep to map concepts to current code.

### Core model
- `rg -n "ContextAtom|Atom|Quark|Molecule" lib components pages tests`
- `rg -n "Goal|GoalState|Hypothesis|Pool" lib components pages tests`
- `rg -n "EnergyChannel|channel" lib components pages tests`
- `rg -n "spreadEnergy|propagat|diffus" lib components pages tests`

### Pipelines / stages
- `rg -n "S0|S1|S2|stage|pipeline" lib components pages tests`

### Mixture of Experts / modes
- `rg -n "Mixture|MoE|expert|mode|gate" lib components pages tests`

### Graph / visualization
- `rg -n "DecisionGraph|ForceGraph|react-force-graph|AFRAME" lib components pages tests`

### Tests
- `rg -n "vitest|jest|mocha|ava" .`

## Conventions expected by these docs
- "Energy" is a unitless internal scalar used for ranking and propagation.
- "Channel" is a named component of energy.
- "Trace" is provenance metadata carried through transformations.
