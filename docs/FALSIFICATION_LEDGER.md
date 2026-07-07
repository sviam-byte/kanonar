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
| C-01 | blocked-goal scenario ⇒ d_eff↓ while C↑ (the hi-C/lo-d dissociation cell is real) | LAW | OPEN (pre-registered 2026-07-07 with the C(t) freeze) | metric exists (`lib/metrics/tension.ts`, [TENSION_FUNCTIONAL](TENSION_FUNCTIONAL.md) FROZEN v1); scenario needs the WP-C rollout harness | cell does not separate (C flat or falls with d_eff) · *no test yet — WP-F* |
| C-02 | matched-challenge scenario ⇒ d_eff↑ while C↓ (the flow cell is real) | LAW | OPEN (pre-registered 2026-07-07) | same substrate as C-01 | cell does not separate · *no test yet — WP-F* |
| C-03 | C's fall LEADS the behavioral collapse into the default attractor (capitulation = annihilation of C) | LAW | OPEN (pre-registered 2026-07-07) | needs trajectories (WP-C) + attractor classifier (L-03) | C falls after or simultaneously with the collapse, or not at all · *no test yet — WP-F* |
| C-04 | C is NOT a renamed dimensionality: corr(C, d_eff) stays away from 1 across scenarios | LAW/meta | OPEN (pre-registered 2026-07-07) | the spine's own kill for the construct (WP-B) | corr(C, d_eff)≈1 everywhere ⇒ close the construct honestly · *no test yet — WP-F* |
| AX-1..8 | each of the 8 LIVE axes drives its pre-registered readout, correctly signed | CRAFT (+ LAW on Layer 3 anchors) | SUPPORTED (sign), held-out OPEN | sign-audit PASS + population-stable cons 1.00 (worklog §4); held-out not run. **Re-graded 2026-07-02: evidence is WIRING-ONLY** — all readouts are act:prior/util:plan, which provably do not reach the S8 choice (Q-PRIOR-DROP, B-POWER-OUTCOME) | wrong sign on held-out, or no lift over context-only baseline · [BASELINE_ABLATION_PROTOCOL](BASELINE_ABLATION_PROTOCOL.md) (D2) |
| AX-DEAD | `A_Liberty_Autonomy` is genuinely dead (not a missing affordance) | CRAFT | OPEN | dead on toy *and* real chars (worklog §93). **Attribution corrected 2026-07-06 (I-0.2 recon):** the "axis→trait wiring" phrasing was wrong — the wiring EXISTS (`extractCharacter.ts:52`: `trait.autonomy = clamp01(A_Liberty_Autonomy)`, 1:1 mirror of powerDrive). The real breaks: (a) PAM had no `challenge`/`defy` entry → `getPrior(...,'challenge',0.15)` (`defs.ts:1875`) always fell back to a personality-flat constant — addressed flag-gated in PAM-V2; (b) `score.ts:311` trait families key on `aff:attack\|aff:confront\|aff:threaten` id prefixes — `con:challenge` matches NO family, so even trait.autonomy's Q-terms never touch it — **standing DEBT, not fixed in I-0.2** | comes alive in `S_coercive_order` once challenge/defy carry priors (v5 rows R1/R2/R3, `outcomeSignTableV5.ts`). **Re-graded 2026-07-06 (v5 run): the axis is NOT dead — it is BLOCKED at the Q-bottleneck.** Prior layer fully alive (R1 ρ=+1.00, Δ=+0.336); outcome effect bounded \|slope\|<0.04 @95% (R2/R3 DEAD at 512 seeds, b̄_off=0.0 exactly). Remaining falsifier moves to the Q side (family-miss DEBT / q-dominance) · [SCENE_BATTERY_v1 §2](SCENE_BATTERY_v1.md) |
| AX-FLIP | `C_betrayal_cost→confront` sign is character-dependent (predicted non-identifiability) | CRAFT | SUPPORTED | cons 0.64 sign-flip (worklog §4). **Re-graded 2026-07-02: wiring-only evidence** (act:prior layer — see Q-PRIOR-DROP) | consistency ≥0.8 (i.e. NOT character-dependent) would falsify the compensation story · roster_triage |
| MU-1..4 | μ poles produce distinct, correctly-signed behavioural tops (SR→rebel, SN→coordinate, ON→optimize, OR→deceive) | CRAFT | SUPPORTED (own readout) | archetype_probe 5/5 (worklog §5) — **but on the sidecar readout, not the pipeline** | a pole's top action matches another pole, or doesn't survive wiring into the pipeline · archetype_probe / D2 A2 |
| STK-1..4 | each stack layer (ToM/archetype/lookahead/drivers) earns its place (held-out lift) | CRAFT | OPEN | none — the missing comparison | ablating the layer does not hurt held-out beyond noise · [BASELINE_ABLATION_PROTOCOL](BASELINE_ABLATION_PROTOCOL.md) (D2) |
| INV-1 | Layer 2 (internal) cannot raise confidence in a LAW claim | meta | SUPPORTED (by construction) | the gate produces collapse by design (SCENE_BATTERY §0) | — definitional; recorded so no one later cites L2 as evidence for a LAW row |
| OBS-VOCAB | The chosen observable (`act:prior`) can express defection/betrayal | CRAFT/impl | FALSIFIED-as-hoped | act:prior vocabulary = `deriveActionPriors` base ∪ `PERSONALITY_ACTION_MAP` — prosocial-biased; **no `betray`/`deceive`/`loot`/`defend_ally`** (verified 2026-06-19, `lib/decision/actionPriors.ts` + `lib/config/formulaConfig.ts`). Defection shows only as reduced cooperation + `harm`/`avoid`/`confront` | extending the action map would add defect verbs — a separate behavior-affecting decision. Bounds S_defection AND the Phase-2 mafia/defection attractor work · `tests/goals/negotiation_scenes.test.ts` (OBSERVABLE LIMIT guard) |
| S-CONTEST | A scarce-resource contest expresses Power on `act:prior` | CRAFT | SUPPORTED | sweep `A_Power_Sovereignty` 0.1→0.9 → command +0.308, threaten +0.231, accuse +0.154 (2026-06-19) | Power axis fails to move command/threaten in S_contest · `tests/goals/negotiation_scenes.test.ts` |
| B-POWER-OUTCOME | Power shifts the `self_favoring` share of chosen OUTCOMES in S_contest — not just priors ([SCENE_BATTERY §0-B](SCENE_BATTERY_v1.md), observable B) | CRAFT | **FALSIFIED (2026-07-02)** — the kill test fired | outcome_triage: outcome distribution **byte-identical across the whole Power sweep** (no_deal 0.625 / fair_split 0.375 at every axis value; `self_favoring` never chosen) while the prior shift stays live (S-CONTEST +0.308). Mechanism: (1) coercive possibilities are event-gated — `command` needs `collectSocialEventGate` pressure ("not idle bossiness", `lib/possibilities/defs.ts:1188-1191`), which a static probe scene never generates, so the candidates never spawn; (2) Q of the candidates that do spawn is axis-flat (q:negotiate identical at Power 0 vs 1). **Personality currently has zero effect on the chosen action in these scenes** — seeds move the choice (Gumbel alive), the axis does not. S-CONTEST hereby reads as wiring-only | recorded, not fixed. Next decision (scene v2 / affordance): give probe scenes event pressure, or route priors into S8 Q — both behavior-affecting, neither is an edit of frozen tables · `kanonar_behavior_lab/src/basis/outcome_triage.py` + `data/reports/outcome_triage.json` |
| B-CARE-COOP | Care raises `coop_rate` in S_defection (observable B) | CRAFT | **FALSIFIED (2026-07-02)** | outcome_triage: `coop_rate` flat at 0.75 across the whole Care sweep (both_cooperate 0.75 / no_engagement 0.25, byte-identical per axis value) — same mechanism as B-POWER-OUTCOME | same decision point as B-POWER-OUTCOME · `outcome_triage.py` + `outcome_triage.json` |
| Q-PRIOR-DROP | `act:prior` reaches the S8 choice (the intention→consequence link exists in the mechanism) | CRAFT/impl | FALSIFIED-as-shipped (2026-07-02) | possibility magnitude (the only act:prior carrier) enters `buildActionCandidates` only as `fallbackDelta` (`actionCandidateUtils.ts:387`) and is dropped whenever `BASE_EFFECTS` fire (`:296-305`); Q = Σ goalEnergy·Δg − cost − risk has no prior term (`scoreAction.ts`). The second path (axes→goals→goalEnergy→Q) exists but S7 domains move ~0.02 (over-normalized) | fix under test: `FC.actionScoring.priorInfluence` (default OFF = the D2 ablation switch); v3 cells `on × S_defection` isolate it · `outcomeSignTableV3.ts` + `outcome_triage_v3.py` |
| ORDER-PRIOR-POSS | Possibility magnitudes carry `act:prior` (the assumption behind the Q-PRIOR-DROP fix) | CRAFT/impl | **FALSIFIED (2026-07-02, discovered BY the v3 factorial)** | `runPipelineV1.ts`: `derivePossibilitiesRegistry` runs at :993, `deriveActionPriors` at :1018 — **after**. Every `getPrior` inside possibility defs sees no act:prior atoms and returns its default, ENGINE-WIDE (production too). Measured: with the flag ON, `q:threaten` is byte-identical at Power 0 and 1 — the prior term added a constant per verb (reshuffling base rates: share→loot, self_favoring 0→0.375, mean_self 1.875→3.625) but cannot carry personality. act:prior atoms currently feed only off-decide diagnostics (`scorePossibility` → `action:utility:*`) | next fix (v4): when priorInfluence is ON, derive priors BEFORE possibilities (flag stays the ablation switch; legacy order when OFF). Killing test: `q` of a prior-carrying candidate still flat across the axis after reorder · v4 freeze |
| GATE-SOURCES | Static probe scenes can express coercive constructs at S8 | CRAFT/impl | FALSIFIED for static scenes (2026-07-02) | coercive possibilities are event-first (`collectSocialEventGate`, `defs.ts:277-399`); probe worlds had `eventLog: []`; gate inputs `evidence`/`authority` had NO producer anywhere in lib (orphaned reads, `defs.ts:256-262`) | fix under test: event pressure via `world.eventLog` (S_contest_pressure / S_defection_pressure / S_coercive_order) + `authority` scene metric → `ctx:authority` aux (worldFacts/deriveAxes); v3 cells `off × pressure` isolate it · `outcomeSignTableV3.ts` |
| NOISE-DOM | S8 choice reflects Q differences at probe temperature (T≈1.25, tieBand 0.08×1.4, Gumbel std≈1.28 vs Q gaps 0.05–0.25) | CRAFT/impl | REFRAMED (2026-07-02 run) | v3 interaction cells: slope 0.000 at BOTH T=0.1 and T=0.9 — not noise-domination but **q-dominance**: at low T `talk` (q≈1.05) wins deterministically; the axis never moves q (ORDER-PRIOR-POSS), so temperature is moot until it does | re-test the interaction after the v4 reorder; if q then moves but outcomes still flat at low T, the Q-gap/effect-size story takes over · `outcome_triage_v3.py`. **v4 re-grade (2026-07-04, same run's data — no new sweep; grading-audit repair): MISLABELED** — OLS slopes +0.054 @T0.1 vs +0.080 @T0.9, the low-T>high-T ordering fails; q-dominance NOT supported on outcomes. Next test needs per-seed rows + a pre-frozen seed-aware statistic — **done 2026-07-05 (I-0.1): MISLABELED confirmed with CI; the design itself cannot decide the question at 32 seeds (MDE≈0.14 vs EPS_DEAD=0.03) — see «Seed-aware re-grade»** |
| THREATEN-PRIOR-MISWIRE | The threaten possibility carries the threaten prior | CRAFT/impl | FALSIFIED→FIXED (2026-07-02, v4) | `defs.ts` threaten def read `getPrior(...,'confront')` — a personality-flat goal-domain composite (0.56, static) — while PAM emits a dedicated threaten prior (moves 0.10→0.33 with Power). Measured: q:threaten byte-identical under the v4 reorder until fixed | fixed production-neutrally (legacy order ⇒ same fallback 0.25); re-check via t15 Δq contract test |
| TOPK-POOL-CAP | Every spawned candidate can in principle be chosen | CRAFT/impl | FALSIFIED-as-shipped (2026-07-02) | `runPipelineV1.ts` `topK: 10` feeds `decideAction`, whose Gumbel pool = topRanked — candidates ranked 11+ (e.g. `command`, q below share's 0.123) can NEVER be chosen regardless of noise | widened to `priorInfluence.topK=16` when the flag is ON; legacy 10 otherwise. Production cap recorded as standing DEBT |
| V4-FACTORIAL | With the chain connected (ORDER-PRIOR-POSS + THREATEN-PRIOR-MISWIRE + TOPK-POOL-CAP, all ON-gated), personality reaches OUTCOMES | CRAFT | **RAN 2026-07-02 — first outcome-level effects ever**: 1 PASS + 1 MISLABELED interaction + 3 NON_MONOTONE + 1 DEAD | By frozen thresholds (MONO_RHO 0.90): Care→coop_rate @ S_defection_pressure **PASS** (ρ=+0.94); interaction **MISLABELED after audit repair**: OLS slope +0.054 @T0.1 vs +0.080 @T0.9, so the preregistered low-T > high-T ordering fails. The original +0.062/+0.031 values were endpoint deltas incorrectly reported as slopes; this run does **not** support the q-dominance account. *Seed-aware re-grade 2026-07-05 (estimator frozen b4aefe8 pre-run): MISLABELED confirmed — D=−0.0268, CI95=[−0.161,+0.107], d_s>0 on 6/32 seeds; design bound MDE≈0.14 recorded (see «Seed-aware re-grade» section).* Power @ S_contest_pressure: self_favoring ρ=+0.78 d=+0.031 and mean_other ρ=−0.90 d=−0.406 — both directionally right, graded NON_MONOTONE by the frozen bar (recorded, not re-graded); Care @ static S_defection NON_MONOTONE with a **sign-surprise to adjudicate: Care↑ → i_defect↑ (ρ=+0.79), mean_self +0.50** — mechanism-only cell, no pressure; Liberty @ S_coercive_order **DEAD** — the predicted W-miss, AX-DEAD (axis→trait wiring) now confirmed on outcomes too | thin-slice risks: 32 seeds, d≈0.03–0.06 near resolution; replicate before believing the remaining PASS. Next: export per-seed outcomes and freeze a seed-aware interaction statistic before rerunning; ~~adjudicate the Care/i_defect flip~~ **done 2026-07-07: ARTIFACT (noise-rank coupling) — see CARE-DEFECT-SIGN**; AX-DEAD → wiring audit (T3-adjacent) · `outcome_triage_v4.json` |
| V3-FACTORIAL | The 2×3 factorial attributes the T1 falsification | CRAFT | **RAN 2026-07-02** — negative controls 3/3 PASS(flat); all 5 directional cells DEAD/ABSENT; interaction DEAD | Both levers WORK but don't yet connect: pressure scenes spawn coercive candidates (contract test: threaten/command in ranked; absent in static) and the flag changes composition (share→loot; self_favoring 0→0.375, mean_self 1.875→3.625) — yet every axis slope is exactly 0 because possibility magnitudes are built BEFORE priors exist (ORDER-PRIOR-POSS). Liberty: `outcome:defied` ABSENT — `challenge` spawns with q≈−0.003 and is never chosen; AX-DEAD stands as predicted (W-miss recorded) | v4: reorder priors→possibilities under the flag, re-freeze the directional cells, rerun · `outcome_triage_v3.json` |
| PAM-V2 | Insubordinate priors (challenge/defy, keyed on `trait.autonomy`) connect Liberty to choice — the OBS-VOCAB "separate behavior-affecting decision", taken VERSIONED (author decision 2026-07-05) | CRAFT | **RAN 2026-07-06 (freeze c15d6b4): wiring PASS, outcome effect BOUNDED-DEAD** | R1 **PASS** — prior:B:challenge ρ=+1.00, Δ=+0.336 over the Liberty axis (predicted up, ≈+0.26); R0 **PASS(flat)** range=0.0 (OFF control replicates the v4 DEAD exactly); R2 **DEAD** — b̄=−0.0167, sd(b_s)=0.240, CI95=[−0.0372,+0.0038] @512 seeds ⇒ the outcome effect is bounded: \|slope\| < 0.04 at 95%, point estimate ≈0; R3 **DEAD** with b̄_off = 0.0 EXACTLY (per-seed choices never vary with Liberty when OFF). Aggregate identity 3.5e-18. As DECLARED at freeze: DEAD here grades effect size, not wiring — the Δq ≈ +0.047 vs Gumbel std 1.28 is swallowed by talk's q-dominance; consistent with the standing `score.ts` con:challenge family-miss DEBT | next lever is Q-side, not prior-side: the con:challenge family miss (DEBT) and/or q-dominance itself; do NOT re-run this cell without a Q-side change · `outcome_triage_v5.py` + `outcome_triage_v5.json` + `test_outcome_triage_v5.py` (pins) |
| CARE-DEFECT-SIGN | The v4 sign-surprise Care↑→`i_defect`↑ in static S_defection (ρ=+0.79, Δ=+0.156, mean_self +0.50) is a genuine preference reversal | CRAFT | **ADJUDICATED: ARTIFACT (2026-07-07, I-0.3)** — noise-rank coupling, not preference | Per-seed data (`outcome_sweep_on_v4_perseed.csv`): the chosen-verb distribution is **piecewise-constant** over the Care axis (identical at {0, 1/6}, {1/3, 1/2, 2/3}, {5/6, 1}); 25/32 seeds flip between ADJACENT values 1/6→1/3, in systematic verb→verb pairs (seeds 13/16/22 all share→submit; 4/5/10/11 all monologue→loot); Care-favored verbs (help/comfort/treat/encourage) are NEVER chosen at any Care value; `share` (cooperate) drops 3→0 as Care RISES. Mechanism (direct repro, seed 13, Care 1/6 vs 1/3): `decideAction` draws Gumbel noise **sequentially over topRanked** (`lib/decision/decide.ts:172-175`) — noise is keyed to RANK POSITION, not candidate identity. At Care 1/3 `threaten` exits the top-10 (its prior falls with Care — correctly signed at the q layer), every lower candidate shifts up one rank, the noise vector stays positionally identical, and the jackpot draw (noise 4.4695, formerly on rank-8 `share`) lands on `submit`. One composition change ⇒ wholesale permutation of per-seed choices. `mean_self +0.50` is pure bookkeeping of i_defect's [5,0] payoff | The pre-registered Care→coop_rate verdict (NON_MONOTONE) stands; the surprise carries no mechanism content. **Standing DEBT (NOISE-RANK-COUPLING): any outcome-layer sweep cell where the axis changes topK composition/order re-deals noise for all lower ranks — per-seed flips at 32 seeds are dominated by this, and plateau boundaries can mimic monotone ρ over 7 axis values.** Fix (identity-keyed noise, e.g. hash(seed, candidateId)) changes every frozen experiment's output ⇒ own versioned flag-gated freeze, out of I-0 scope · per-seed CSV retains the raw data |
| DIL-OUTCOME | Personality axes shape dilemma-lab outcomes (they DO enter the utility: `lib/dilemma/runner.ts:99-107` vb()) | CRAFT | OPEN — no outcome-level validation exists | coupling verified in code; zero pre-registered outcome predictions | axes fail to move trust_exchange outcome distribution · *no test yet — post-T1.5, reuse the Game/outcome pattern* |
| MAF-OUTCOME | Personality axes shape mafia vote/night outcomes (coupling exists: `lib/mafia/decisions/vote.ts:153` traitSnapshot) | CRAFT | OPEN — no outcome-level validation exists | coupling verified in code; zero pre-registered outcome predictions | axes fail to move vote outcomes · *no test yet — Phase 2 prerequisite* |

(Row groups `AX-1..8`, `MU-1..4`, `STK-1..4` expand to one row per item when the
results land.)

## V4 interaction grading

### Purpose

Проверить пре-регистрированное утверждение: наклон зависимости
`Power → outcome:self_favoring` при `T=0.1` больше, чем при `T=0.9`.

### Formula

```text
slope_T = Σᵢ(xᵢ − x̄)(yᵢ,T − ȳ_T) / Σᵢ(xᵢ − x̄)²
PASS ⇔ slope_0.1 > 0 and slope_0.1 − slope_0.9 > 0.03
```

### Variables

- `xᵢ ∈ [0,1]` — значение `A_Power_Sovereignty`, семь замороженных точек.
- `yᵢ,T ∈ [0,1]` — доля `outcome:self_favoring` по 32 seed при температуре `T`.
- `0.03` — замороженный минимальный порог эффекта `EPS_DEAD`, применённый к
  разности OLS slopes.

### Source of truth

- implementation: `kanonar_behavior_lab/src/basis/outcome_triage_v4.py`
- frozen input: `kanonar_behavior_lab/data/reports/outcome_sweep_on_v4.csv`
- generated report: `kanonar_behavior_lab/data/reports/outcome_triage_v4.json`
- regression test: `kanonar_behavior_lab/tests/test_outcome_triage_v4.py`

### Invariants

- OLS использует все точки оси и свободный член.
- Endpoint delta сохраняется только как диагностика и не называется slope.
- Порог и модель классификации записываются в metadata отчёта.

### Minimal example

```text
slope_0.1 = +0.054
slope_0.9 = +0.080
difference = −0.027
verdict = MISLABELED
```

### Failure modes

- Подмена slope разностью крайних точек является ошибкой классификатора.
- Агрегированный CSV не позволяет оценить seed-level uncertainty; для нового
  факторного прогона нужны per-seed строки и заранее замороженная статистика
  *(закрыто 2026-07-05 — см. seed-aware re-grade ниже)*.

### Seed-aware re-grade (2026-07-05, I-0.1 / WP-A)

**Estimator frozen by commit `b4aefe8` BEFORE the re-run** (frozen wording =
docstring of `interaction_perseed.py`):

```text
b_{T,s}  OLS slope with intercept of the outcome:self_favoring indicator
         over the frozen 7-point grid (structural zero-fill), seed s
d_s   =  b_{0.1,s} − b_{0.9,s}          (paired: CRN — same seed, same
                                         decision-noise stream in both cells)
D     =  mean_s d_s
CI95  =  percentile bootstrap over seeds, B = 10000, rng seed 20260705
PASS  ⇔  mean_s b_{0.1,s} > 0  ∧  D > EPS_DEAD(0.03)  ∧  CI_lo > 0
```

**Result: MISLABELED confirmed, now with uncertainty.** The re-run reproduced
`outcome_sweep_on_v4.csv` byte-identically (sha256 pin `cd703aae…` holds), so
this grades the same experiment, not a new one:

```text
mean b_{0.1} = +0.0536  (sd across seeds 0.2721, n = 32)
mean b_{0.9} = +0.0804  (sd across seeds 0.4546, n = 32)
D            = −0.0268   CI95 = [−0.1607, +0.1071]
d_s > 0 for only 6/32 seeds — the preregistered ordering fails seed-wise
consistency: |D − (b_agg,0.1 − b_agg,0.9)| ≈ 7·10⁻¹⁸  (OLS linearity identity)
```

**Recorded design bound (standing):** SE(D) = sd(d_s)/√32 = 0.3916/√32 ≈ 0.069,
so the 95% half-width ≈ 0.136 ≈ 4.5 × EPS_DEAD. Minimal detectable |D| of this
design ≈ 0.14; resolving |D| = EPS_DEAD = 0.03 needs
n ≈ (1.96·0.3916/0.03)² ≈ 655 seeds. **The interaction question at the frozen
effect threshold is undecidable at 32 seeds — do not re-ask it at 32; re-test
requires ~650 seeds or a variance-reduced observable.**

- implementation: `kanonar_behavior_lab/src/basis/interaction_perseed.py`
  (`--selftest`: closed-form slopes, all verdict branches)
- frozen input: `outcome_sweep_on_v4_perseed.csv` (sha256 `b11b0d64…`)
- generated report: `outcome_interaction_perseed.json`
- regression test: `kanonar_behavior_lab/tests/test_interaction_perseed.py`
  (pins both hashes, the verdict, and the 6/32 seed-level count)

## V5 grading (PAM v2: challenge/defy — I-0.2)

### Purpose

Проверить пре-регистрированные утверждения `outcomeSignTableV5.ts` (FROZEN
2026-07-06, до прогона): версионированные insubordinate-priors соединяют
Liberty с выбором в `S_coercive_order`.

### Formula

```text
R0 (flat control, pamV2 OFF):  PASS(flat) ⇔ range(outcome:defied) < EPS_DEAD
R1 (wiring, S8):               triage._classify 'up' на prior:B:challenge
                               (rho ≥ MONO_RHO ∧ delta > EPS_DEAD)
R2 (seed-aware, pamV2 ON):     b_s = OLS slope с intercept индикатора
                               outcome:defied на сетке linspace(0,1,7)
                               (structural zero-fill), b̄ = mean_s b_s;
                               CI95 = percentile bootstrap по сидам,
                               B=10000, rng seed 20260706;
                               PASS ⇔ b̄ > EPS_DEAD ∧ CI_lo > 0;
                               DEAD ⇔ |b̄| < EPS_DEAD
R3 (CRN-контраст):             d_s = b_on,s − b_off,s (спарено сидом; defy
                               не добавляет кандидата ⇒ Gumbel-поток
                               инвариантен флагу); D = mean_s d_s;
                               PASS ⇔ b̄_on > 0 ∧ D > EPS_DEAD ∧ CI_lo > 0
INVALID_DESIGN:                сетка ≠ 7 · сидов ≠ 512 · сид-множества
                               различаются · |b̄ − b_aggregate| > 1e-9
```

### Variables

- 512 сидов на ячейку — задекларировано при freeze из записанной границы
  I-0.1: sd(b_s) ≈ 0.27–0.45 ⇒ полуширина CI ≈ 1.96·sd/√512 ≈ 0.024–0.039 ≈
  0.8–1.3 × EPS_DEAD (у R3 меньше за счёт CRN).
- Ожидаемый эффект R2 (задекларировано при freeze): Δprior ≈ +0.26 →
  Δmag ≈ +0.09 → Δq ≈ +0.047 при Gumbel std ≈ 1.28 ⇒ slope 0.005–0.05 —
  страддлит EPS_DEAD; DEAD у R2/R3 грейдит **effect size**, wiring несёт R1.

### Source of truth

- pre-registration: `lib/goal-lab/probe/outcomeSignTableV5.ts`
- implementation: `kanonar_behavior_lab/src/basis/outcome_triage_v5.py`
  (`--selftest`: замкнутые формы, все ветки вердиктов)
- frozen inputs: `outcome_sweep_on_v5_{off,on}[_perseed].csv`
- generated report: `outcome_triage_v5.json`
- regression test: `kanonar_behavior_lab/tests/test_outcome_triage_v5.py`
  (при freeze — selftest+тождество; пины хэшей/вердиктов — при results-коммите)

### Results (2026-07-06; freeze c15d6b4, run same day)

```text
R0  PASS(flat)   range = 0.0 (точный ноль: OFF-контроль реплицировал v4-DEAD)
R1  PASS         rho = +1.00, delta = +0.336 (wiring доказан на prior-слое)
R2  DEAD         b̄ = −0.0167, sd(b_s) = 0.240, CI95 = [−0.0372, +0.0038], n = 512
R3  DEAD         b̄_off = 0.0 ТОЧНО; D = −0.0167 (тот же CI — off-ячейка нулевая)
agg-identity     |b̄ − b_agg| = 3.5·10⁻¹⁸
```

Вывод (в терминах freeze-декларации): wiring работает, effect size на
исходах ограничен |slope| < 0.04 @95% — Δq ≈ +0.047 тонет в q-доминировании
talk (Gumbel std ≈ 1.28). Следующий рычаг — Q-сторона (family-miss DEBT
`score.ts` / само q-доминирование), НЕ повторный прогон этой ячейки.

## Pending spine edit (item 4 of the plan — NOT a new file)

`kanonar_spine.md` does **not yet exist as a repo file** (it lives as north-star
framing only). *(Update 2026-07-05: the file now exists —
`docs/docs_conceptual/KANONAR_SPINE.md`, committed 65e0ad7, DRAFT-FOR-FREEZE;
the two seams below still belong in it at its freeze, which remains the
author's open decision.)* When it is created, two seams belong in it directly —
do not spawn a separate doc:

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
