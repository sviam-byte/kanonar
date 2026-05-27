# Agent Docs Index

Status: contributor/agent reference. The main documentation book starts at `README.md` -> `docs/MATH_INDEX.md`; this folder remains useful for patch workflow and contributor rules.

## Purpose
These files are written for fast onboarding of an LLM/agent that must:
- understand the system's conceptual model
- locate corresponding code quickly
- make patches without breaking invariants
- validate changes with tests

## Canonical book path
Before using this folder as a patch reference, read:

- `README.md`
- `docs/MATH_INDEX.md`
- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`

`docs/unified/*` is the control-plane reference for the current repo shape.
This `docs/agent/*` folder remains useful, but it is not the canonical book entry.

## Read order
0) `README.md`
1) `docs/MATH_INDEX.md`
2) `docs/unified/README.md`
3) `docs/unified/01_CONTROL_PLANE.md`
4) `docs/unified/02_AGENT_QUICKSTART.md`
5) `docs/unified/03_SYSTEM_MAP.md`
6) `10_ARCHITECTURE.md`
7) `20_MATH_MODEL.md`
8) `30_WORKFLOWS.md`
9) `40_TESTING.md`
10) `50_CONTRIBUTING_AGENT.md`
11) `60_STABILIZATION_MEMORY.md`

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
