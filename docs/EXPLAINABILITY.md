# Explainability spec (what UI must expose) — v69

Goal: make “why did it decide this” answerable from the UI without reading code.

Sources of truth:
- AtomGraph: `lib/graph/atomGraph.ts`
- Energy propagation: `lib/graph/atomEnergy.ts`
- ctx selection: `lib/context/layers.ts` (`getCtx`)
- Goal derivation/projection: `lib/goals/goalAtoms.ts`
- UI: `components/goal-lab/*`

Definitions:
- Dependency edge: `u → v` if `u ∈ trace.usedAtomIds(v)`
- Energy overlay: propagated attribution mass along dependency edges (channelized)

---

## 1) Minimum UI contract (per layer)

### 1.1 For ctx axes (base and final)

For each axis:
- show base: `ctx:<axis>:<id>` value
- show final: `ctx:final:<axis>:<id>` value (if exists)
- show delta:
  - `Δ(axis) = final - base`

Additionally, for each `ctx:final:*`:
- show its trace.usedAtomIds (must include base axis)
- show lens parameters used (bias, sensitivity) *or* their upstream trait/body values.

### 1.2 For goals (`goal:*`)

For each goal atom:
- show magnitude (score)
- show direct dependencies: `trace.usedAtomIds`
- show per-channel top-K contributions from energy propagation:
  - `(sourceAtomId, contributionMass)` list, K<=topK

Required:
- a goal should be “explainable” without hunting for hidden links.

### 1.3 For utilities (`util:*`)

For each util atom:
- show magnitude (normalized)
- show which goal atoms contributed to it (trace)
- show any normalization/squash info if applicable (range, clamp)

This is critical because util is the bridge to action.

### 1.4 For actions (`action:*`)

For each action atom:
- show final decision flag (selected or not)
- show score components:
  - utility contribution (from util atoms)
  - priors contribution
  - access gating (allowed/forbidden)
  - noise (if used) and seed

Hard rule:
- action explain must NOT cite `goal:*` directly (only util, priors, access, etc.).

---

## 2) Graph semantics contract

### 2.1 Edges

Edges are derivation dependencies:
- edge existence: `u → v` ⇔ `u ∈ trace.usedAtomIds(v)`

Therefore:
- edge weight is NOT “causal weight”
- edge is “this atom was used to compute that atom”

### 2.2 Energy/flow overlay

Energy overlay is defined by `propagateAtomEnergy` (uniform split with retention).
Edge flow number shown in UI must be one of:
- per-step flow
- or accumulated flow over steps

UI must label which it is.

---

## 3) Explainability failure modes (and what to do)

### 3.1 Missing trace

Symptom:
- edges missing, “why” panels empty.

Root cause:
- derived atoms not writing `trace.usedAtomIds`.

Fix policy:
- any derived atom that influences goals/utils/actions must carry trace.

### 3.2 Base/final confusion

Symptom:
- user cannot tell whether the system used objective or subjective axes.

Fix policy:
- show both layers + delta, and ensure goal scoring uses final-first (`getCtx`).

### 3.3 Hairball graph

Symptom:
- too many nodes, unreadable.

Fix policy:
- default to collapsed/meta view
- allow expanding:
  - by namespace
  - by top-K contributions
  - by following a single path from selected node

---

## 4) “Enough explanation” criteria (acceptance)

For a chosen action, the UI must allow reconstructing this chain:

1) Which utilities were high/low (util panel)
2) Which goals produced those utilities (goal→util trace)
3) Which ctx:final axes drove those goals (goal trace + energy topK)
4) How ctx:final differed from ctx:base (base/final delta panel)
5) Which character traits/body state caused the delta (lens trace to feat:char:* atoms)

If any step is impossible, explainability is incomplete.
