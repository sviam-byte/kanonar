// lib/goal-lab/probe/outcomeSignTableV5.ts
//
// Pre-registered sign table v5 — the PAM v2 (challenge/defy) cells, I-0.2.
// FROZEN BEFORE the v5 run; do not edit a row to match it.
//
// Mechanism under test (all flag-gated): PERSONALITY_ACTION_MAP_V2 adds
// challenge/defy priors keyed on trait.autonomy (= A_Liberty_Autonomy 1:1,
// extractCharacter.ts), merged into deriveActionPriors ONLY when
// FC.actionScoring.pamV2 is on. Ledger context: the v4 Liberty cell was DEAD
// with outcome:defied flat at 0.09375 across the axis; the AX-DEAD
// attribution "axis→trait wiring" is corrected in the ledger — the wiring
// exists; the break was the missing PAM entry (fixed here, versioned) and
// the score.ts trait-family regex missing con:challenge (standing DEBT,
// NOT fixed in I-0.2).
//
// `defy` is prior-VOCABULARY only: no possibility/spec/verb consumes it
// (only the `defied` outcome label exists). No behavioral row is registered
// for defy; its assertions are contract-level (atom emitted when ON, absent
// when OFF; tests/goals/pam_v2.test.ts).
//
// Resolution, declared at freeze (not tuned post hoc): 512 seeds per cell.
// From the I-0.1 recorded bound (ledger «Seed-aware re-grade»): per-seed
// outcome-slope sd ≈ 0.27–0.45 ⇒ at n=512 the 95% CI half-width is
// ≈ 1.96·sd/√512 ≈ 0.024–0.039 ≈ 0.8–1.3 × EPS_DEAD (smaller for the
// CRN-paired R3). 512 = the ledger's ~650-seed bound rounded to a power of
// two the runtime affords. Expected R2 effect is honestly small: Δprior over
// the axis ≈ +0.26 → Δmag ≈ +0.09 → Δq ≈ +0.047 vs Gumbel std ≈ 1.28 ⇒
// expected outcome slope 0.005–0.05 straddles EPS_DEAD = 0.03; a DEAD R2
// grades EFFECT SIZE, not wiring — R1 (deterministic prior layer) carries
// the wiring claim.
//
// FROZEN R2/R3 estimator (mirrored in outcome_triage_v5.py, the wording of
// record):
//   y_s(x)  indicator of outcome:defied, seed s, frozen grid linspace(0,1,7),
//           structural zero-fill (p=0 labels are never emitted)
//   b_s     OLS slope with intercept over the grid (interaction_perseed._ols_slope)
//   R2: b̄ = mean_s b_s (ON cell); CI95 = percentile bootstrap over seeds,
//       B = 10000, rng = numpy default_rng(20260706)
//       INVALID_DESIGN  grid != 7, attested seeds != 512 anywhere, seed sets
//                       differ, or |b̄ − b_aggregate| > 1e-9
//       DEAD            |b̄| < EPS_DEAD (0.03, inherited from triage.py)
//       PASS            b̄ > EPS_DEAD AND CI_lo > 0
//       MISLABELED      otherwise
//   R3: d_s = b_on,s − b_off,s (PAIRED by seed: CRN — defy adds no candidate,
//       so the candidate count and hence the per-seed Gumbel stream is
//       flag-invariant); D = mean_s d_s; same bootstrap;
//       PASS ⇔ b̄_on > 0 AND D > EPS_DEAD AND CI_lo > 0;
//       DEAD ⇔ max(|b̄_on|,|b̄_off|) < EPS_DEAD; else MISLABELED.

import type { Confidence } from './signTable';

export interface OutcomeSignPredictionV5 {
  id: 'R0' | 'R1' | 'R2' | 'R3';
  pamV2: 'on' | 'off';
  priorInfluence: 'on'; // all v5 cells ride the v4 reorder
  axis: string;
  readout: string;
  direction: 'up' | 'flat' | 'contrast_up';
  scene: string;
  layer: 'S8' | 'OUTCOME';
  /** Seeds per cell, declared at freeze. */
  seeds: number;
  confidence: Confidence;
  note?: string;
}

export const OUTCOME_SIGN_TABLE_V5: OutcomeSignPredictionV5[] = [
  {
    id: 'R0', pamV2: 'off', priorInfluence: 'on',
    axis: 'A_Liberty_Autonomy', readout: 'outcome:defied', direction: 'flat',
    scene: 'S_coercive_order', layer: 'OUTCOME', seeds: 512, confidence: 'S',
    note: 'negative control: replicates the v4 DEAD at power (flat 0.09375 in v4 @32 seeds); CRN base cell for R3',
  },
  {
    id: 'R1', pamV2: 'on', priorInfluence: 'on',
    axis: 'A_Liberty_Autonomy', readout: 'prior:B:challenge', direction: 'up',
    scene: 'S_coercive_order', layer: 'S8', seeds: 512, confidence: 'S',
    note: 'deterministic wiring row: prior = 0.10 + 0.35·autonomy − 0.15·normSensitivity, near-linear, expected Δ ≈ +0.26 over the axis (pre-dampen ×(1−0.3·socialRisk))',
  },
  {
    id: 'R2', pamV2: 'on', priorInfluence: 'on',
    axis: 'A_Liberty_Autonomy', readout: 'outcome:defied', direction: 'up',
    scene: 'S_coercive_order', layer: 'OUTCOME', seeds: 512, confidence: 'W',
    note: 'expected slope 0.005–0.05 straddles EPS_DEAD — a DEAD here grades effect size, not wiring (R1 carries wiring); seed-aware estimator, frozen above',
  },
  {
    id: 'R3', pamV2: 'on', priorInfluence: 'on',
    axis: 'A_Liberty_Autonomy', readout: 'outcome:defied', direction: 'contrast_up',
    scene: 'S_coercive_order', layer: 'OUTCOME', seeds: 512, confidence: 'W',
    note: 'attribution row: paired CRN contrast (ON − OFF cell R0), D = mean_s(b_on,s − b_off,s); variance-reduced by pairing',
  },
];

export function outcomeV5Predictions(): OutcomeSignPredictionV5[] {
  return [...OUTCOME_SIGN_TABLE_V5];
}
