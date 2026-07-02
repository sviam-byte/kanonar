// lib/goal-lab/probe/outcomeSignTable.ts
//
// Pre-registered sign table for OBSERVABLE B (outcomes) — v2.
// FROZEN 2026-07-02, BEFORE the first sweep run: the freeze commit is the
// pre-registration timestamp. Do not edit a row to match a run; a miss is a
// FALSIFIED / MISLABELED ledger row (docs/FALSIFICATION_LEDGER.md), not a fix.
//
// v1 (signTable.ts, frozen 2026-06-18) targets observable A (act:prior etc.)
// and is untouched. This table targets the outcome:* readout family (layer
// OUTCOME, lib/goal-lab/probe/game.ts). Deliberately minimal — 3 rows: the
// re-operationalization of the dead C-constructs (betrayal_cost,
// coalition_loyalty, reciprocity) is task T3 and gets its own freeze.

import type { SignDirection, Confidence } from './signTable';

export interface OutcomeSignPrediction {
  axis: string;
  /** outcome:<label> | outcome_mean_self | outcome_mean_other | coop_rate */
  readout: string;
  direction: SignDirection;
  scene: string;
  layer: 'OUTCOME';
  confidence: Confidence;
  note?: string;
}

export const OUTCOME_SIGN_TABLE: OutcomeSignPrediction[] = [
  {
    axis: 'A_Power_Sovereignty',
    readout: 'outcome:self_favoring',
    direction: 'up',
    scene: 'S_contest',
    layer: 'OUTCOME',
    confidence: 'S',
    note: 'THE T1 kill test (GOALS_AND_TASKS): Power must shift chosen OUTCOMES toward self_favoring, not just priors; live prior shift + flat outcome share ⇒ the stack breaks intention→consequence',
  },
  {
    axis: 'A_Power_Sovereignty',
    readout: 'outcome_mean_other',
    direction: 'down',
    scene: 'S_contest',
    layer: 'OUTCOME',
    confidence: 'W',
    note: 'payoff-weighted corollary of self_favoring↑ — distinct measurement, same mechanism',
  },
  {
    axis: 'A_Care_Compassion',
    readout: 'coop_rate',
    direction: 'up',
    scene: 'S_defection',
    layer: 'OUTCOME',
    confidence: 'W',
    note: 'W: S_defection was not Care-targeted; toy agent lacks most real-roster axes. Dead C-axes deliberately NOT frozen here (T3).',
  },
];

export function outcomeActivePredictions(): OutcomeSignPrediction[] {
  return [...OUTCOME_SIGN_TABLE];
}
