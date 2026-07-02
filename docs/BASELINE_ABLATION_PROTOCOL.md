# BASELINE_ABLATION_PROTOCOL — does each layer earn its place?

> **Status: SCAFFOLD (2026-06-19).** Protocol drafted; not yet run.
>
> This is **D2**. It is the single cheapest decisive test of whether the stack is
> real. The docs currently record **no held-out baseline comparison** (trait model
> vs context-only). **Run this first** — before writing layer contracts (D3). If
> ablating a layer does not move the prediction, the layer is decorative and
> writing it a contract is wasted.

## Purpose

Answer one question per layer: **does removing this layer make held-out prediction
worse, beyond noise?** A layer that survives ablation has earned a contract (D3) and
a ledger row (D4). A layer that doesn't is a candidate for deletion or rewiring.

This is the empirical gate that separates "wired and load-bearing" from "wired and
inert". It is independent of the `d_eff` law — it tests the *predictive* stack, not
the dynamics claim.

## What to ablate (one at a time, hold the rest fixed)

| # | layer ablated | how to disable | expected if load-bearing |
|---|---|---|---|
| A1 | **ToM / dyad model** | freeze partner model to a constant prior | held-out prediction drops in social scenes (S_vulnerable, S_defection) |
| A2 | **archetype / μ channel** | force a neutral μ | drop — **BUT see wiring caveat below** |
| A3 | **lookahead / plan utilities** | truncate to greedy 1-step | drop where `util:plan` carries the signal (S7-heavy scenes) |
| A4 | **drivers EMA** | replace EMA with instantaneous appraisal | drop / added volatility where drivers integrate over time |

**Wiring caveat for A2 (critical):** archetype does **not** flow into
`runGoalLabPipelineV1` (worklog §5, §102) — it has separate readouts. So ablating
the archetype channel *at the pipeline layer* is a **no-op by construction**, and a
null result for A2 would be uninformative, not evidence the layer is dead. A2 must
either (a) be run on the archetype's own readout (`computeArchetypeEffects` /
`fromArchetype`), or (b) be deferred until the channel is wired into the pipeline.
Record which. This is itself a finding the ledger (D4) should carry.

## Baselines to beat

Ordered weakest → strongest. The full stack must beat **all** of these on held-out,
or the corresponding capability is unproven.

| baseline | what it controls for |
|---|---|
| **random** | floor; sanity only |
| **context-only** (no trait/axis input) | "is any of the personality machinery used at all?" — the missing comparison the docs flag |
| **linear bag-of-traits** (logistic/linear on raw axis vector) | "does the nonlinear pipeline beat a flat readout of the same axes?" |
| **π_simple only** (reactive μ-policy, no S0–S9) | "does the deliberative pipeline beat the cheap fallback?" — **NB π_simple is not currently a wired standalone policy** (spine gap); this baseline may need building first |
| **hand-coded heuristic** | "does the learned/derived stack beat an expert if-then?" |

## Held-out sets

- **author-oracle scenes** — the character×scene pack in
  [CONSTRUCT_ORACLES](CONSTRUCT_ORACLES.md) (D5), held out from any fitting.
- **CaSiNo episodes** — negotiation corpus already local
  (`kanonar_behavior_lab/`; see [BEHAVIOR_LAB](BEHAVIOR_LAB.md),
  [BEHAVIOR_LAB_CASINO_RESULTS](BEHAVIOR_LAB_CASINO_RESULTS.md)).

Held-out discipline carries the fc-pipeline paranoia: **nested cross-validation,
permutation test for significance, bootstrap CI on the metric**. No metric is
reported without a permutation p and a bootstrap interval.

## What actually runs today (verified 2026-06-19) — and the missing bridge

**The held-out predictive test does NOT run today.** The existing
`kanonar_behavior_lab/src/models/predict_outcome.py` (→ `prediction_metrics.json`)
is **CaSiNo-internal**: a logistic regression from CaSiNo *behavioral prefix
features* (offer/reject counts, conflict/trust slopes, entropy) to CaSiNo
`deal_outcome`/`attractor_label`. **It never runs the Kanonar trait stack.** So it
is *not* the "trait model vs context-only" comparison the docs flag as missing — do
not cite it as such.

To run the real D2 test we need a **bridge** that does not exist yet:

```
CaSiNo actor (Big-Five, SVO, value2issue prefs)         <- has ground-truth labels
  -> Kanonar AgentState.vector_base                       [BRIDGE 1: trait map]
  -> negotiation scene with offer/accept/reject/demand    [BRIDGE 2: = Step 1 payoff scene]
     affordances, run runGoalLabPipelineV1 at each turn-state
  -> act:prior over negotiation verbs -> CaSiNo v2 action  [BRIDGE 3: action map]
  -> score vs the actor's observed v2 action (top-k / log-loss),
     full-trait MINUS context-only (axes neutralized)
```

**Key dependency this exposes:** BRIDGE 2 *is* the Step 1 payoff harness — the same
negotiation scene that [SCENE_BATTERY_v1 §2](SCENE_BATTERY_v1.md) lists as PENDING
(`S_contest`/`S_defection`). So the only zero-authoring held-out test (CaSiNo) is
blocked on Step 1, not on D5. The plan's "run D2 first" holds for the **sensitivity
slice** (below), but the **predictive slice** is downstream of Step 1.

### Slice that runs today: trait-channel sensitivity (necessary, not sufficient)

The roster sweep already shows axis info changes `act:prior` (8 live axes,
worklog §4). The cheap extension that needs no new code is the **context-only
contrast on the existing harness**: per (character, scene), compare the `act:prior`
spread of the full agent vs the same agent with `vector_base` neutralized to a
constant. If neutralizing does not shrink the spread, the trait channel is inert in
that scene. This is a *precondition* check — it cannot prove "the layer pays for
itself" (no ground truth), but it cheaply flags dead channels before the bridge is
built.

### Recommended order (the honest "next per the logic")

1. **Build Step 1** = the negotiation/payoff scene + affordances (`S_contest`/
   `S_defection`). Unblocks the most: D1's two pending scenes AND BRIDGE 2.
2. **BRIDGE 1** trait map — start from SVO + `value2issue` prefs (map cleanly to
   Power/Safety/reciprocity axes + goal weights); Big-Five inversion optional/v2.
3. **BRIDGE 3** action map — align `act:prior` verbs to the CaSiNo v2 alphabet.
4. Score full-trait vs context-only on held-out CaSiNo actors. *Now* D2 is real.
5. D5 oracle pack is the complementary CRAFT-standard held-out (parallel track).

## Metric and threshold

- **Metric:** held-out predictive score of the action / `act:prior` readout
  (top-k action hit-rate and/or log-loss on the action distribution; rank
  correlation for `act:prior`). Exact metric frozen alongside the §0 observable in
  [SCENE_BATTERY_v1](SCENE_BATTERY_v1.md).
- **"Layer pays for itself"** = full stack beats the layer-ablated variant on
  held-out by a margin whose bootstrap CI excludes 0 **and** permutation p < 0.05.
- **"Capability proven"** = full stack beats the corresponding baseline by the same
  bar.

## Run order and outputs

1. Build the held-out splits (D5 oracle pack + CaSiNo episodes).
2. Run baselines (random → hand-coded). Record the bar each must clear.
3. Run ablations A1–A4 (with the A2 caveat handled).
4. Emit one results table → feeds [FALSIFICATION_LEDGER](FALSIFICATION_LEDGER.md)
   (each layer's row gets status PROVEN / INERT / BLOCKED) and gates which layers
   get a [LAYER_CONTRACTS](LAYER_CONTRACTS.md) entry.

## Open decisions

1. **Held-out source order** — CaSiNo bridge (no authoring, but blocked on Step 1)
   vs D5 author-oracles (no Step 1 dependency, but needs authoring). Recommendation:
   build Step 1 → CaSiNo bridge as the v1 predictive test; D5 in parallel as the
   CRAFT-standard track.
2. **π_simple baseline** — build the standalone reactive μ-policy, or drop this
   baseline for v1 and note the gap? (Most informative for the dual-process claim,
   but it does not exist yet.)
3. **Metric choice** — top-k hit vs action-distribution log-loss vs both; freeze
   with the observable.
4. **A2 routing** — run archetype ablation on its own readout now, or defer to
   post-wiring?
5. **BRIDGE 1 trait map** — SVO + value-prefs only, or also invert Big-Five →
   `vector_base`? (Confirm first whether a Big-Five→axis map exists in
   `kanonar_trait_validation/` / `lib/traits.ts`, or only the forward direction.)

## Assumptions and limitations

This protocol tests *predictive* contribution within the simulation, on held-out
simulation/corpus data. A layer "earning its place" here means it improves
held-out prediction of the model's own action readout (and CaSiNo behaviour) — not
that it corresponds to a validated psychological mechanism. Beating a baseline here
is a craft/engineering result; it does not by itself support the falsifiable
`d_eff(z)` law, which only Layer 3 external data can move.
