// lib/goal-lab/probe/signTable.ts
//
// Phase 2 of the static-basis sign-audit (docs/agents/05_GOAL_LAB_MATH.md):
// the PRE-REGISTERED sign table. Direction of each construct's effect is
// declared HERE, before the sweep is run. Without pre-registration, reading the
// signs off the results is fitting, not validation.
//
// Frozen 2026-06-18. Do not edit a row to match a run; if a prediction is
// wrong, that is a MISLABELED / NON-MONOTONE finding to record, not a fix.

export type SignDirection =
  | 'up'          // readout increases with the axis
  | 'down'        // readout decreases with the axis
  | 'variance'    // axis raises dispersion/entropy, not a signed mean shift
  | 'interaction' // axis changes the slope of another relation
  | 'inverted_u'; // non-monotone, known/adjudicated

export type Confidence = 'S' | 'W'; // strong / weak

export interface SignPrediction {
  axis: string;
  /** Readout this prediction targets (matches sweep.ts readout strings, loosely). */
  readout: string;
  direction: SignDirection;
  scene: string;
  layer: 'S7' | 'S8' | 'S7+S8' | 'interaction';
  confidence: Confidence;
  /** True when the scene/affordance is not built yet (contest/defection). */
  pending?: boolean;
  note?: string;
}

export const SIGN_TABLE: SignPrediction[] = [
  {
    axis: 'A_Care_Compassion',
    readout: 'goal:affiliation',
    direction: 'up',
    scene: 'S_vulnerable',
    layer: 'S7+S8',
    confidence: 'S',
    note: 'affiliation up; help action up',
  },
  {
    axis: 'A_Power_Sovereignty',
    readout: 'act:dominate|assert',
    direction: 'up',
    scene: 'S_hierarchy',
    layer: 'S8',
    confidence: 'S',
    note: 'dominate/assert up, status up, affiliation down; invisible on S7 (probe finding)',
  },
  {
    axis: 'A_Safety_Care',
    readout: 'goal:safety',
    direction: 'up',
    scene: 'S_threat',
    layer: 'S7+S8',
    confidence: 'S',
    note: 'safety up; withdraw/avoid up',
  },
  {
    axis: 'A_Liberty_Autonomy',
    readout: 'act:challenge_authority',
    direction: 'up',
    scene: 'S_hierarchy',
    layer: 'S8',
    confidence: 'S',
    note: 'submission down; challenge-authority up',
  },
  {
    axis: 'C_betrayal_cost',
    readout: 'goal:safety',
    direction: 'inverted_u',
    scene: 'S_threat',
    layer: 'S8',
    confidence: 'W',
    note: 'threat-appraisal up; affiliation inverted-U already seen in probe — adjudicate, not pass/fail',
  },
  {
    axis: 'B_decision_temperature',
    readout: 'action_entropy',
    direction: 'variance',
    scene: 'S_neutral',
    layer: 'S8',
    confidence: 'S',
    note: 'raises action entropy (dispersion, not a signed shift)',
  },
  {
    axis: 'D_HPA_reactivity',
    readout: 'stress->behavior slope',
    direction: 'interaction',
    scene: 'S_threat',
    layer: 'interaction',
    confidence: 'W',
    note: 'steeper coupling of stress to behavior under threat',
  },
  // --- pending the payoff harness (Step 1): contest / defection scenes ---
  {
    axis: 'C_coalition_loyalty',
    readout: 'act:defend_ally',
    direction: 'up',
    scene: 'S_defection',
    layer: 'S8',
    confidence: 'S',
    pending: true,
    note: 'defend-ally up, betray-ally down — needs payoff scene',
  },
  {
    axis: 'A_Power_Sovereignty',
    readout: 'goal:control',
    direction: 'up',
    scene: 'S_contest',
    layer: 'S8',
    confidence: 'S',
    pending: true,
    note: 'scarce-resource contest — needs payoff scene',
  },
];

export function activePredictions(): SignPrediction[] {
  return SIGN_TABLE.filter(p => !p.pending);
}
