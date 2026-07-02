// lib/goal-lab/probe/outcomeSignTableV4.ts
//
// Pre-registered sign table v4 — the directional cells of the T1.5 factorial,
// RE-FROZEN 2026-07-02 after the ORDER-PRIOR-POSS fix (runPipelineV1: when
// priorInfluence is ON, act:prior is derived BEFORE possibilities, so
// candidate magnitudes finally carry personality). The v3 flat negative
// controls stand as graded (V3-FACTORIAL) and are not re-run; the OFF cells
// are bit-identical by construction (legacy order when the flag is off).
//
// Resolution note (declared at freeze, not tuned post hoc): v4 sweeps use
// 32 seeds (v3 used 8) — expected effects are choice-probability shifts of a
// few percent against talk's q-dominance (q≈1.05 vs coercive ≈0.4–0.5), and
// 8 seeds cannot resolve below 12.5%.
//
// v4 mechanism scope (all flag-gated or production-neutral, found while
// diagnosing the v3 DEADs, fixed BEFORE this freeze):
//   1. ORDER-PRIOR-POSS — priors derived before possibilities when ON;
//   2. THREATEN-PRIOR-MISWIRE — threaten def read the flat 'confront' prior
//      instead of its own (defs.ts; production-neutral: same fallback);
//   3. TOPK-POOL-CAP — legacy topK=10 also capped the Gumbel choice pool;
//      widened to priorInfluence.topK=16 when ON.
//
// FROZEN BEFORE the v4 run; do not edit a row to match it.

import type { Confidence } from './signTable';
import type { OutcomeDirectionV3 } from './outcomeSignTableV3';

export interface OutcomeSignPredictionV4 {
  priorInfluence: 'on'; // all v4 cells are ON — OFF is unchanged legacy
  axis: string;
  readout: string;
  direction: OutcomeDirectionV3;
  scene: string;
  layer: 'OUTCOME';
  confidence: Confidence;
  note?: string;
}

export const OUTCOME_SIGN_TABLE_V4: OutcomeSignPredictionV4[] = [
  {
    priorInfluence: 'on', axis: 'A_Care_Compassion', readout: 'coop_rate',
    direction: 'up', scene: 'S_defection', layer: 'OUTCOME', confidence: 'W',
    note: 'mechanism-only cell: cooperative verbs in the static menu, prior now carries Care into their magnitudes',
  },
  {
    priorInfluence: 'on', axis: 'A_Power_Sovereignty', readout: 'outcome:self_favoring',
    direction: 'up', scene: 'S_contest_pressure', layer: 'OUTCOME', confidence: 'S',
    note: 'THE main row, attempt 2: Power → threaten/command magnitudes (PAM powerDrive .30/.40) → Q → chosen outcomes. Also gates candidate EXISTENCE at low Power (threaten mag < .07 floor)',
  },
  {
    priorInfluence: 'on', axis: 'A_Power_Sovereignty', readout: 'outcome_mean_other',
    direction: 'down', scene: 'S_contest_pressure', layer: 'OUTCOME', confidence: 'W',
    note: 'payoff-weighted corollary',
  },
  {
    priorInfluence: 'on', axis: 'A_Care_Compassion', readout: 'coop_rate',
    direction: 'up', scene: 'S_defection_pressure', layer: 'OUTCOME', confidence: 'W',
    note: 'cooperation as a costly choice against a defect-tempting frame',
  },
  {
    priorInfluence: 'on', axis: 'A_Liberty_Autonomy', readout: 'outcome:defied',
    direction: 'up', scene: 'S_coercive_order', layer: 'OUTCOME', confidence: 'W',
    note: 'W: challenge has no PAM entry — its prior barely moves with Liberty even reordered; a second miss deepens AX-DEAD (axis→trait wiring), not the harness',
  },
  {
    priorInfluence: 'on', axis: 'A_Power_Sovereignty', readout: 'outcome:self_favoring',
    direction: 'interaction', scene: 'S_contest_pressure', layer: 'OUTCOME', confidence: 'W',
    note: 'slope larger at B_decision_temperature=0.1 than at 0.9 — REFRAMED from noise-domination to q-dominance: at low T the axis must flip the argmax through the candidate-existence floor; cells @T0.1/@T0.9',
  },
];

export function outcomeV4Predictions(): OutcomeSignPredictionV4[] {
  return [...OUTCOME_SIGN_TABLE_V4];
}
