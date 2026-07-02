# FALSIFICATION_LEDGER — every claim, its killing test, its status

> **Status: SCAFFOLD (2026-06-19), but LIVE from here on.** This is **D4**, the
> anti-numerology document. It is not a phase; it is maintained continuously from
> D1 onward. Until a pretty concept has a test that would kill it, it is not
> science — it is a "вещь в себе".

## How to read this ledger

One row per claim. Five columns:

- **Claim** — the assertion, stated so it could be false.
- **Standard** — *which* standard judges it (see below). This is the key honesty
  move: not every claim is judged the same way.
- **Status** — `OPEN` / `SUPPORTED` / `FALSIFIED` / `BLOCKED` (+ blocker).
- **Evidence** — what currently bears on it (with location).
- **Killing result** — the concrete observation that would falsify it, and **where
  that test lives** (or "no test yet" — which means the claim is decorative today).

### The two standards (per-claim, not global)

The project makes claims of two different kinds and they are **not** judged the
same way. State the standard explicitly per row.

- **CRAFT** — "this is a good generative model for the novel." Judged by
  author-oracle agreement ([CONSTRUCT_ORACLES](CONSTRUCT_ORACLES.md)) + internal
  coherence. A legitimate standard. (This is overview-claim #5: a generative model
  for the fiction.)
- **LAW** — "this is a falsifiable law about real minds." Judged **only** by Layer 3
  external data (IGT/casino, iterated-PD/public-goods, neuro). Internal validation
  (Layer 2) **cannot** raise confidence in a LAW claim, because the gate produces
  the collapse by construction. (This is overview-claim #4.)

> The "one invariant" framing is Kainrax's aesthetic-modelling commitment, **not** a
> proven fact about psychology. Rows asserting it carry standard = LAW and stay
> `OPEN`/`BLOCKED` until Layer 3 moves them. (This distinction is to be sewn into
> `kanonar_spine.md` §0/§1 — see "Pending spine edit" below.)

## Ledger

| # | Claim | Standard | Status | Evidence | Killing result · where the test lives |
|---|---|---|---|---|---|
| L-01 | `d_eff(z)↓` monotonically with load (the central law) | LAW | BLOCKED: no trajectory harness | L1 estimator calibrated (8/8 anchors, [DYNAMICS_LAYER1_CALIBRATION](DYNAMICS_LAYER1_CALIBRATION.md)); but `stepDynamics` is a stub → no `{v(t)}` | `d_eff` flat or ↑ as z falls, on external trajectories · *no test yet (Step 3 + Layer 3)* |
| L-02 | ↑determinism as z falls (Lyapunov/FTLE) | LAW | BLOCKED | FTLE distribution not built; `computeLyapunov` returns a single composite number (spine gap) | divergence does not shrink with load · *no test yet* |
| L-03 | #attractors falls as z falls (deeper funnel) | LAW | OPEN | attractor classifier (RQA + Rosenstein λ sign + σ) not built (worklog §1 gap) | attractor count stable/rising under load · *no test yet* |
| L-04 | criticality: σ≈1 at baseline, σ leaves 1 subcritically | LAW | OPEN | branching-ratio σ not implemented | σ stays ≈1 under load, or never ≈1 · *no test yet* |
| L-05 | "провал без злодеев" = deterministic fall into the default attractor when B/will sag (a *consequence*, not a plot device) | LAW (consequence of L-01/L-03) | OPEN | follows from L-01+L-03 if those hold | default-attractor capture not predicted by z · *downstream of L-01/L-03* |
| L-06 | dual-process gate `w(z)=σ(β(budget−cost(z)))` with hysteresis | LAW/impl | FALSIFIED-as-stated (not wired) | only 3 hard modes via arousal/surprise/fatigue, no continuous w(z), no hysteresis (D3 wiring truths) | — already known absent; reclassify once built · [LAYER_CONTRACTS](LAYER_CONTRACTS.md) |
| AX-1..8 | each of the 8 LIVE axes drives its pre-registered readout, correctly signed | CRAFT (+ LAW on Layer 3 anchors) | SUPPORTED (sign), held-out OPEN | sign-audit PASS + population-stable cons 1.00 (worklog §4); held-out not run | wrong sign on held-out, or no lift over context-only baseline · [BASELINE_ABLATION_PROTOCOL](BASELINE_ABLATION_PROTOCOL.md) (D2) |
| AX-DEAD | `A_Liberty_Autonomy` is genuinely dead (not a missing affordance) | CRAFT | OPEN | dead on toy *and* real chars (worklog §93) | comes alive in `S_coercive_order` with a `defy` affordance · [SCENE_BATTERY_v1 §2](SCENE_BATTERY_v1.md) |
| AX-FLIP | `C_betrayal_cost→confront` sign is character-dependent (predicted non-identifiability) | CRAFT | SUPPORTED | cons 0.64 sign-flip (worklog §4) | consistency ≥0.8 (i.e. NOT character-dependent) would falsify the compensation story · roster_triage |
| MU-1..4 | μ poles produce distinct, correctly-signed behavioural tops (SR→rebel, SN→coordinate, ON→optimize, OR→deceive) | CRAFT | SUPPORTED (own readout) | archetype_probe 5/5 (worklog §5) — **but on the sidecar readout, not the pipeline** | a pole's top action matches another pole, or doesn't survive wiring into the pipeline · archetype_probe / D2 A2 |
| STK-1..4 | each stack layer (ToM/archetype/lookahead/drivers) earns its place (held-out lift) | CRAFT | OPEN | none — the missing comparison | ablating the layer does not hurt held-out beyond noise · [BASELINE_ABLATION_PROTOCOL](BASELINE_ABLATION_PROTOCOL.md) (D2) |
| INV-1 | Layer 2 (internal) cannot raise confidence in a LAW claim | meta | SUPPORTED (by construction) | the gate produces collapse by design (SCENE_BATTERY §0) | — definitional; recorded so no one later cites L2 as evidence for a LAW row |
| OBS-VOCAB | The chosen observable (`act:prior`) can express defection/betrayal | CRAFT/impl | FALSIFIED-as-hoped | act:prior vocabulary = `deriveActionPriors` base ∪ `PERSONALITY_ACTION_MAP` — prosocial-biased; **no `betray`/`deceive`/`loot`/`defend_ally`** (verified 2026-06-19, `lib/decision/actionPriors.ts` + `lib/config/formulaConfig.ts`). Defection shows only as reduced cooperation + `harm`/`avoid`/`confront` | extending the action map would add defect verbs — a separate behavior-affecting decision. Bounds S_defection AND the Phase-2 mafia/defection attractor work · `tests/goals/negotiation_scenes.test.ts` (OBSERVABLE LIMIT guard) |
| S-CONTEST | A scarce-resource contest expresses Power on `act:prior` | CRAFT | SUPPORTED | sweep `A_Power_Sovereignty` 0.1→0.9 → command +0.308, threaten +0.231, accuse +0.154 (2026-06-19) | Power axis fails to move command/threaten in S_contest · `tests/goals/negotiation_scenes.test.ts` |
| B-POWER-OUTCOME | Power shifts the `self_favoring` share of chosen OUTCOMES in S_contest — not just priors ([SCENE_BATTERY §0-B](SCENE_BATTERY_v1.md), observable B) | CRAFT | **FALSIFIED (2026-07-02)** — the kill test fired | outcome_triage: outcome distribution **byte-identical across the whole Power sweep** (no_deal 0.625 / fair_split 0.375 at every axis value; `self_favoring` never chosen) while the prior shift stays live (S-CONTEST +0.308). Mechanism: (1) coercive possibilities are event-gated — `command` needs `collectSocialEventGate` pressure ("not idle bossiness", `lib/possibilities/defs.ts:1188-1191`), which a static probe scene never generates, so the candidates never spawn; (2) Q of the candidates that do spawn is axis-flat (q:negotiate identical at Power 0 vs 1). **Personality currently has zero effect on the chosen action in these scenes** — seeds move the choice (Gumbel alive), the axis does not. S-CONTEST hereby reads as wiring-only | recorded, not fixed. Next decision (scene v2 / affordance): give probe scenes event pressure, or route priors into S8 Q — both behavior-affecting, neither is an edit of frozen tables · `kanonar_behavior_lab/src/basis/outcome_triage.py` + `data/reports/outcome_triage.json` |
| B-CARE-COOP | Care raises `coop_rate` in S_defection (observable B) | CRAFT | **FALSIFIED (2026-07-02)** | outcome_triage: `coop_rate` flat at 0.75 across the whole Care sweep (both_cooperate 0.75 / no_engagement 0.25, byte-identical per axis value) — same mechanism as B-POWER-OUTCOME | same decision point as B-POWER-OUTCOME · `outcome_triage.py` + `outcome_triage.json` |

(Row groups `AX-1..8`, `MU-1..4`, `STK-1..4` expand to one row per item when the
results land.)

## Pending spine edit (item 4 of the plan — NOT a new file)

`kanonar_spine.md` does **not yet exist as a repo file** (it lives as north-star
framing only). When it is created, two seams belong in it directly — do not spawn a
separate doc:

- **§0/§1:** declare the per-claim standard. Claim #5 (generative model for the
  novel) is judged CRAFT (author-oracle + coherence) — a legitimate standard.
  Claim #4 (falsifiable law about real minds) is judged only by Layer 3. State that
  "one invariant" is an aesthetic-modelling commitment, not a proven fact.
- **§4 Layer 2:** rename "internal validation" → "implementation consistency
  check". State explicitly: L2 cannot raise confidence in the law, because the gate
  produces the collapse by construction (= row INV-1).

## Maintenance rule

Every new claim added anywhere in the docs gets a row here **with a killing result**
or it does not ship. A row whose "killing result" is "no test yet" is flagged as
decorative until a test exists.

## Cross-links

- Standards operationalized in: [CONSTRUCT_ORACLES](CONSTRUCT_ORACLES.md) (CRAFT),
  [EXTERNAL_DATA_VALIDATION_SUMMARY](EXTERNAL_DATA_VALIDATION_SUMMARY.md) (LAW/Layer 3).
- Status of stack layers: [LAYER_CONTRACTS](LAYER_CONTRACTS.md),
  [BASELINE_ABLATION_PROTOCOL](BASELINE_ABLATION_PROTOCOL.md).
- Observable + `d_eff` gap: [SCENE_BATTERY_v1 §0](SCENE_BATTERY_v1.md).
