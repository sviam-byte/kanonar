// lib/goal-lab/probe/outcomeSignTableV3.ts
//
// Pre-registered sign table v3 — the T1.5 FACTORIAL: (priorInfluence flag) ×
// (scene: static / pressure / coercive-order). FROZEN 2026-07-02, BEFORE the
// first factorial run; the freeze commit is the pre-registration timestamp.
// Do not edit a row to match a run — a miss is a ledger row.
//
// The factorial exists to ATTRIBUTE the T1 falsification (ledger
// B-POWER-OUTCOME): 'flat' cells are negative controls / isolation cells, and
// are predictions in exactly the same sense as 'up'/'down'. v1 (signTable.ts)
// and v2 (outcomeSignTable.ts) stay untouched.

import type { SignDirection, Confidence } from './signTable';

/** 'flat' = pre-registered NO-effect (range below the triage dead-band). */
export type OutcomeDirectionV3 = SignDirection | 'flat';

export interface OutcomeSignPredictionV3 {
  /** FC.actionScoring.priorInfluence.enabled during the sweep. */
  priorInfluence: 'on' | 'off';
  axis: string;
  readout: string;
  direction: OutcomeDirectionV3;
  scene: string;
  layer: 'OUTCOME';
  confidence: Confidence;
  note?: string;
}

export const OUTCOME_SIGN_TABLE_V3: OutcomeSignPredictionV3[] = [
  // --- negative control: replicate the T1 falsification -------------------
  {
    priorInfluence: 'off', axis: 'A_Power_Sovereignty', readout: 'outcome:self_favoring',
    direction: 'flat', scene: 'S_contest', layer: 'OUTCOME', confidence: 'S',
    note: 'replication of B-POWER-OUTCOME FALSIFIED: static scene, prior dropped from Q',
  },
  // --- isolation: data fix alone (menu widens, slope stays flat) ----------
  {
    priorInfluence: 'off', axis: 'A_Power_Sovereignty', readout: 'outcome:self_favoring',
    direction: 'flat', scene: 'S_contest_pressure', layer: 'OUTCOME', confidence: 'W',
    note: 'events widen the menu (self_favoring appears at base rate) but the axis slope stays flat — prior still dropped from Q',
  },
  // --- isolation: mechanism fix alone --------------------------------------
  {
    priorInfluence: 'on', axis: 'A_Power_Sovereignty', readout: 'outcome:self_favoring',
    direction: 'flat', scene: 'S_contest', layer: 'OUTCOME', confidence: 'W',
    note: 'prior reaches Q but coercive candidates still absent from the static menu',
  },
  {
    priorInfluence: 'on', axis: 'A_Care_Compassion', readout: 'coop_rate',
    direction: 'up', scene: 'S_defection', layer: 'OUTCOME', confidence: 'W',
    note: 'mechanism isolated: cooperative verbs are already in the static menu, so prior-in-Q alone should move coop_rate',
  },
  // --- full fix: both levers ------------------------------------------------
  {
    priorInfluence: 'on', axis: 'A_Power_Sovereignty', readout: 'outcome:self_favoring',
    direction: 'up', scene: 'S_contest_pressure', layer: 'OUTCOME', confidence: 'S',
    note: 'THE T1.5 main row: with candidates spawnable AND prior in Q, Power must reach outcomes',
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
  // --- AX-DEAD discriminator -------------------------------------------------
  {
    priorInfluence: 'on', axis: 'A_Liberty_Autonomy', readout: 'outcome:defied',
    direction: 'up', scene: 'S_coercive_order', layer: 'OUTCOME', confidence: 'W',
    note: 'the SCENE_BATTERY §4 Liberty test. W: no PERSONALITY_ACTION_MAP entry feeds challenge — a miss CONFIRMS AX-DEAD (axis→trait wiring), not the scene',
  },
  // --- noise-domination check (F3) — tests the sampler, not tuned ----------
  {
    priorInfluence: 'on', axis: 'A_Power_Sovereignty', readout: 'outcome:self_favoring',
    direction: 'interaction', scene: 'S_contest_pressure', layer: 'OUTCOME', confidence: 'W',
    note: 'axis→outcome slope is LARGER at B_decision_temperature=0.1 than at 0.9 (cells S_contest_pressure@T0.1 / @T0.9); tests NOISE-DOM without touching T/tieBand',
  },
];

export function outcomeV3Predictions(): OutcomeSignPredictionV3[] {
  return [...OUTCOME_SIGN_TABLE_V3];
}
