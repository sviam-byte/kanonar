# TENSION_FUNCTIONAL — held contradiction C(t), read-only metric (v1)

> **Status: FROZEN v1 (2026-07-07), I-0.5 / spine WP-B.** Frozen BEFORE the
> first report that cites C(t). Formulas, weights, and thresholds below are the
> observable's DEFINITION — deliberately NOT in `formulaConfig` (same discipline
> as `lib/goal-lab/probe/game.ts`). A change is a new observable version with
> its own dated freeze; do not tune a constant to make a prediction pass.
> Implementation: `lib/metrics/tension.ts`. Read-only guarantee:
> `tests/goals/tension_contract.test.ts` (byte-identical pipeline).
>
> Naming discipline: in code, tests, and lab docs this quantity is only
> "tension mass / held contradiction C(t)" (KANONAR_TZ Principle 3).

## 0. Scope and read-only guarantee

C(t) is computed AFTER the pipeline, from the existing trace only
(`runGoalLabPipelineV1` result). It writes nothing: no atoms, no facts, no
influence on any decision. Influence of C on the gate is Phase II (WP-E) and
requires its own freeze. The contract test proves the pipeline result is
byte-identical whether or not the metric is computed.

## 1. Inputs (trace substrate, verified 2026-07-07)

| input | where in the trace |
|---|---|
| ranked candidates, Δg(a), E_g·Δg(a), Q(a) | S8 `artifacts.decisionSnapshot.ranked[]` (`deltaGoals`, `contribByGoal`, `q`; top-10 as stored) |
| goal energies E_g | S8 `artifacts.decisionSnapshot.goalEnergy` |
| temperature T | S8 `artifacts.decisionSnapshot.temperature` |
| driver shaped/post-inhibition mass | S6 atoms `drv:<name>:<selfId>` → `trace.parts.shaped`, `trace.parts.postInhibition` |
| shame | atom `emo:shame:<selfId>` (any stage; last occurrence wins) |
| epistemic surprise | atoms `belief:surprise:<feature>:<selfId>` (present only when a previous tick left predictions; a one-tick probe has none ⇒ C_epi = 0) |

Declared-absent inputs (v1): `guilt` has no producer in the pipeline
(emotion layer emits fear/anger/shame/relief/resolve/care/arousal/valence);
`valueBehaviorGapTotal`, `archetypeTension`, λ, H(mixture) live in
`lib/metrics/psych-layer.ts` / `lib/archetypes/system.ts`, which do not run in
the goal-lab pipeline. Their weights are frozen NOW (§2.4) and they enter via
the explicit `reflexiveExtras` input when a caller has them; absent ⇒ 0
contribution. Wiring psych/archetype values into the trace is a later,
separately versioned step; the weights do not re-freeze.

## 2. The five source channels

All sums are over finite values; a missing/NaN input contributes 0 (a dead
input is a result to triage, not a crash — same defensive convention as
`runProbe`).

### 2.1 Decisional — antagonistic near-ties with stakes

$$C_{dec}=\sum_{(a,b)\in P}\min(s_a,s_b)\;e^{-|Q_a-Q_b|/\hat T},\qquad
\hat T=\max(0.05,\,T)$$

- Candidate set: `decisionSnapshot.ranked` as stored (top-10).
- $P$ = unordered pairs with $\cos(\Delta g(a),\Delta g(b)) < 0$ strictly,
  computed over the union of goal keys; a candidate with $\|\Delta g\|=0$
  joins no pair.
- Stakes $s_a=\sum_g |E_g\,\Delta g_a(g)|$ (= Σ|`contribByGoal`|): near-ties at
  zero energy are indifference, not tornness (spine §1.2, clarification 3).

### 2.2 Goal-level — co-energized incompatible goals

$$C_{goal}=\sum_{g<g'}E_g\,E_{g'}\,\max(0,-\rho_{gg'})$$

$\rho_{gg'}=\cos\big((\Delta g_a(g))_a,\,(\Delta g_a(g'))_a\big)$ — cosine of
the two goals' delta COLUMNS over the ranked candidate set. A zero-norm column
gives $\rho=0$. Goals enumerated from the union of `deltaGoals` keys; $E$ from
`goalEnergy` (missing ⇒ 0, term vanishes).

### 2.3 Motivational — inhibited drive mass (S6)

$$C_{mot}=\sum_{i\in\text{drivers}}\max(0,\ \text{shaped}_i-\text{postInhibition}_i)$$

over the 7 `drv:*` atoms. The $\max(0,\cdot)$ guard is a v1 clarification of
the spine formula (inhibition can only remove mass; a negative difference is a
data error and must not create negative tension).

### 2.4 Reflexive — identity strain (frozen weights)

$$C_{refl}=\sum_j w_j\,x_j,\qquad x_j\in[0,1]$$

| $j$ | $x_j$ (normalization) | $w_j$ | v1 source |
|---|---|---|---|
| valueBehaviorGapTotal | as-is | 0.25 | `reflexiveExtras` (absent ⇒ 0) |
| guilt | as-is | 0.15 | `reflexiveExtras` (absent ⇒ 0; no pipeline producer) |
| shame | as-is | 0.20 | atom `emo:shame:<selfId>` |
| archetypeTension | as-is | 0.15 | `reflexiveExtras` (absent ⇒ 0) |
| mixture margin $4\lambda(1-\lambda)$ | ×4 maps $[0,0.25]\to[0,1]$; λ = dominant archetype weight | 0.10 | `reflexiveExtras` (absent ⇒ 0) |
| mixture entropy $H/\log_2 4$ | 4 archetype poles ⇒ max 2 bits | 0.15 | `reflexiveExtras` (absent ⇒ 0) |

Weights sum to 1.00 ⇒ $C_{refl}\in[0,1]$. In-trace v1 therefore reads
$C_{refl}=0.20\cdot\text{shame}$; this understatement is declared, not hidden.

### 2.5 Epistemic — largest unresolved surprise

$$C_{epi}=\max_f\ \text{magnitude}\big(\texttt{belief:surprise:}f\texttt{:selfId}\big),\qquad 0\text{ if none}$$

## 3. Retention (heldness) and the export vector

Held contradiction is what SURVIVES ticks without resolution (spine §1.2,
clarification 2):

$$\bar C_k(t)=(1-\alpha)\,\bar C_k(t-1)+\alpha\,C_k(t),\qquad \alpha=0.2$$

predicted trace half-life $t_{1/2}=\ln 2/\ln\frac{1}{1-\alpha}=\ln 2/\ln 1.25\approx 3.106$ ticks
(this number is a pre-registered A3-style check once rollouts exist).

Channel $k$ is **held** at tick $t$ iff $C_k>\theta_{hold}=0.3$ for $m=3$
consecutive ticks. State (`ema`, per-channel run lengths) is carried by the
caller and threaded through the pure function; tick 0 initializes
$\bar C_k(0)=C_k(0)$, run length = 1 if above threshold.

**Export vector (the "6 channels" of KANONAR_TZ §1):**

$$\mathbf C(t)=\big[C_{dec},\,C_{goal},\,C_{mot},\,C_{refl},\,C_{epi},\,C_{total}\big],
\qquad C_{total}=\textstyle\sum_{k\in 5}C_k$$

$C_{total}$ over RAW channels is provisional until normalization (§4) has a
baseline; cross-channel comparisons before that are not meaningful and reports
must say so.

## 4. Normalization (convention frozen, baseline deferred)

Per-channel z-score against a frozen baseline ensemble — the same convention
as v(t) (FREEZE-ITEM SCENE_BATTERY §0, still open): S_neutral, fixed seed set,
per-channel mean/std over the ensemble; $z_k=(C_k-\mu_k)/\sigma_k$ with
$\sigma_k=0$ ⇒ $z_k=0$. The pure post-processor exists in v1
(`normalizeTensionChannels`); the baseline ensemble itself requires the
rollout harness and is deferred to MVP-0 (dated: 2026-07-07). Until then all
exports are RAW and labeled as such.

## 5. Pair typology (pre-registered signatures)

For each antagonistic pair in $P$: a member's polarity is the SIGN of its
dominant `contribByGoal` entry (largest $|\cdot|$; tie ⇒ positive). Pair type:
(+,+) → **AA** (approach–approach), (−,−) → **VV** (avoidance–avoidance),
mixed → **AV**.

Pre-registered signatures (validated in Phase II, scene C3 / WP-F — not
graded before then):

- AA: fast resolution — short hold runs, low $\bar C_{dec}$;
- VV: freezing / leaving the field — `cog:wait` / `no_engagement` share rises
  with VV mass;
- AV: maximal heldness — longest hold runs at intermediate distance.

## 6. Kill rows (pre-registered, ledger C-01..C-04)

- **C-01** blocked-goal scenario ⇒ d_eff↓ while C↑ (the hi-C/lo-d cell is real).
- **C-02** matched-challenge scenario ⇒ d_eff↑ while C↓ (the flow cell is real).
- **C-03** C's fall LEADS the behavioral collapse into the default attractor.
- **C-04** corr(C, d_eff) ≈ 1 across all scenarios ⇒ C is a renamed
  dimensionality — the construct is closed honestly (spine WP-B kill).

All four are OPEN until the WP-C/WP-F harness exists; they are listed in
[FALSIFICATION_LEDGER](FALSIFICATION_LEDGER.md).

## 7. Frozen constants (v1)

| constant | value |
|---|---|
| candidate set | `decisionSnapshot.ranked` as stored (≤10) |
| antagonism threshold | $\cos<0$ strict |
| temperature floor | $\hat T=\max(0.05,T)$ |
| $w$ (reflexive) | 0.25 / 0.15 / 0.20 / 0.15 / 0.10 / 0.15 (§2.4 order) |
| EMA α | 0.2 ($t_{1/2}\approx 3.106$) |
| $\theta_{hold}$, m | 0.3, 3 ticks |
| surprise floor | none beyond the producer's own 0.05 emit-gate |
