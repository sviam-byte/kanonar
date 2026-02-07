# Agent Docs Index

## Purpose
These files are written for fast onboarding of an LLM/agent that must:
- understand the system’s conceptual model,
- locate corresponding code quickly,
- make patches without breaking invariants,
- validate changes with tests.

## Read order
1) 10_ARCHITECTURE.md
2) 20_MATH_MODEL.md
3) 30_WORKFLOWS.md
4) 40_TESTING.md
5) 50_CONTRIBUTING_AGENT.md

## Where to look in code (discovery map)
Because repo layouts vary, use ripgrep to map the concepts:

### Core model (atoms/goals/energy)
- rg -n "ContextAtom|Atom|Quark|Molecule" src
- rg -n "Goal|GoalState|Hypothesis|Pool" src
- rg -n "EnergyChannel|channel" src
- rg -n "spreadEnergy|propagat|diffus" src

### Pipelines / stages (S0..S*)
- rg -n "S0|S1|S2|stage|pipeline" src

### Mixture of Experts (modes)
- rg -n "Mixture|MoE|expert|mode|gate" src

### Graph / visualization
- rg -n "DecisionGraph|ForceGraph|react-force-graph|AFRAME" src

### Tests
- ls -la test tests __tests__ src/**/__tests__
- rg -n "vitest|jest|mocha|ava" .

## Conventions expected by these docs
- “Energy” is a unitless internal scalar used for ranking and propagation.
- “Channel” is a named component of energy (threat/uncertainty/norm/attachment/resource/status/curiosity/base).
- “Trace” is provenance metadata carried through transformations.
