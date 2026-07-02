# LAYER_CONTRACTS — what each layer of the psyche stack promises

> **Status: SCAFFOLD (2026-06-19).** Contract skeletons only. **Do not fill a
> contract for a layer until [BASELINE_ABLATION_PROTOCOL](BASELINE_ABLATION_PROTOCOL.md)
> (D2) proves it load-bearing.** A contract for an inert layer is documentation of
> wiring, not a contract — "ещё одна вещь в себе".

This is **D3**. One contract per layer of the stack:

```
axis → psyche/archetype → ToM → goals → decision → transition
```

Each contract has the same 9 fields. The last field — **external distinguishing
test + the baseline this layer must beat** — is mandatory; without it the contract
is just a wiring description.

## Wiring truths (freeze in the header, verified 2026-06-18)

Before any contract is written, these facts about the *live* pipeline hold and must
not be papered over:

- **archetype layer does NOT flow into `runGoalLabPipelineV1`** — it has its own
  readouts (worklog §5/§102). One of the four stack layers is wired *to the side*,
  not in line. Resolve this before giving it a pretty contract.
- **continuous μ-mixture is NOT in the runtime** — `agent.archetype` uses discrete
  `actualId`/`shadowId` + λ blend only (worklog §115). The contract must describe
  what runs, not the intended mixture.
- **the `w(z)` dual-process gate is NOT wired** — `selectDecisionMode`
  ([decisionGate.ts](../lib/simkit/core/decisionGate.ts)) gives 3 hard modes
  triggered by arousal/surprise/fatigue, **not** a continuous `w(z)=σ(β(budget−cost(z)))`
  mixture of π_simple/π_complex, and no hysteresis (spine gap).
- **π_simple does NOT exist as a standalone policy** — π_complex = the S0–S9
  pipeline; a real reactive μ-basis fallback is not wired.

A layer in {archetype, w(z), π_simple} is therefore **sidecar or absent**. Mark it
so in its contract; do not write it as if it were in line.

## Contract template (per layer)

```md
### <layer name>   [status: IN-LINE | SIDECAR | ABSENT | INERT-by-D2]

- **Purpose** — what it computes and why the stack needs it.
- **Inputs** — atoms/fields read (namespaces, stages).
- **Outputs** — atoms/fields written (the slice of `v(t)` it contributes).
- **Must-not** — forbidden reads/writes (e.g. action must not read `goal:*`;
  `ctx:*` not consumed after S3 without a documented fallback).
- **Trace** — what the trace/UI must show for this layer (per
  docs/EXPLAINABILITY.md, docs/ORACLES.md).
- **Metric** — how its contribution is measured (held-out, from D2).
- **Failure modes** — what counts as a bug; what must not be silently clamped.
- **External distinguishing test** — the scene/dataset that would show this layer
  is doing real work.
- **Baseline it must beat** — the D2 baseline below which the layer is unproven.
```

## Layers (skeleton — fields to fill after D2)

### axis → feature/trait   [status: IN-LINE]
- Purpose: project `vector_base` axes into appraisal features (`feat:char:*`).
- Outputs into `v`: drives `emo:*`, `drv:*` downstream.
- Known: only **8 of ~52 axes** are live at this layer (worklog §4). The contract
  must enumerate the 8 and explicitly list the dead ~44 as out-of-contract here.
- *fill after D2.*

### psyche / archetype (μ)   [status: SIDECAR — not in `runGoalLabPipelineV1`]
- Purpose: μ-pole behavioural bias (SR/SN/ON/OR) + λ shadow blend.
- **Must resolve the sidecar fact first.** Either wire it into the pipeline or
  document it as an out-of-line readout with its own oracle.
- *fill after D2 + wiring decision.*

### ToM / dyad model   [status: IN-LINE]
- Purpose: partner model feeding social appraisal.
- External distinguishing test: social scenes (S_vulnerable, S_defection) where a
  frozen-partner ablation (D2 A1) should hurt.
- *fill after D2.*

### goals / plan utilities   [status: IN-LINE]
- Purpose: `util:plan:*` lookahead utilities (S7).
- Must-not: `action:*` must not read `goal:*` directly (INVARIANTS).
- *fill after D2.*

### decision   [status: IN-LINE; gate w(z) ABSENT]
- Purpose: action selection (`act:prior:*` → argmax, Gumbel-sampled).
- Known: the continuous `w(z)` gate and π_simple fallback are absent; only 3 hard
  modes exist. The contract documents what runs.
- *fill after D2.*

### transition / dynamics   [status: ABSENT — `stepDynamics` is a stub]
- Purpose: tick-to-tick state update producing the trajectory `{v(t)}` that `d_eff`
  needs (see [SCENE_BATTERY_v1 §0 gap](SCENE_BATTERY_v1.md)).
- This layer must exist before any `d_eff` number is reportable.
- *fill after the rollout harness lands.*

## Open decisions

1. **Archetype routing** — wire μ into the pipeline, or formalize it as an
   out-of-line readout with its own contract + oracle? (Blocks the archetype
   contract and D2 A2.)
2. **Which layers get a full contract in v1** — strictly those D2 marks PROVEN.
3. **w(z) / π_simple** — document-as-absent now, or hold these contracts until the
   gate is built (Step 2)?

## Cross-links

- Gated by: [BASELINE_ABLATION_PROTOCOL](BASELINE_ABLATION_PROTOCOL.md) (D2).
- Observable + trace surface: [SCENE_BATTERY_v1 §0](SCENE_BATTERY_v1.md),
  [EXPLAINABILITY](EXPLAINABILITY.md), [ORACLES](ORACLES.md), [INVARIANTS](INVARIANTS.md).
- Each layer's status is mirrored as a row in
  [FALSIFICATION_LEDGER](FALSIFICATION_LEDGER.md).

## Assumptions and limitations

These contracts describe the behaviour of internal simulation layers. A layer
"doing real work" means measurable held-out predictive contribution within the
simulation — not correspondence to a validated biological or psychological module.
