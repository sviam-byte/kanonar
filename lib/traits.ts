
import { VectorBase } from './types';

export type TraitId =
  | 'care'
  | 'harshness'
  | 'agency'
  | 'submission'
  | 'trust'
  | 'paranoia'
  | 'stability'
  | 'novelty_seeking';

export const TRAITS: TraitId[] = [
  'care',
  'harshness',
  'agency',
  'submission',
  'trust',
  'paranoia',
  'stability',
  'novelty_seeking',
];

// Matrix A: Trait × Axis44 (Simplified weights)
const A: Record<TraitId, Partial<Record<string, number>>> = {
  care: {
    'A_Safety_Care': 1.0,
    'C_dominance_empathy': -0.5,
    'C_reciprocity_index': 0.3
  },
  harshness: {
    'A_Safety_Care': -0.8,
    'C_betrayal_cost': 0.4,
    'A_Power_Sovereignty': 0.5
  },
  agency: {
    'G_Narrative_agency': 1.0,
    'A_Liberty_Autonomy': 0.8,
    'A_Power_Sovereignty': 0.4
  },
  submission: {
    'A_Legitimacy_Procedure': 0.6,
    'C_coalition_loyalty': 0.7,
    'A_Liberty_Autonomy': -0.5
  },
  trust: {
    'C_reciprocity_index': 0.8,
    'A_Transparency_Secrecy': -0.3,
    'C_reputation_sensitivity': 0.2
  },
  paranoia: {
    'C_betrayal_cost': 1.0,
    'A_Transparency_Secrecy': 0.6,
    'C_reciprocity_index': -0.4
  },
  stability: {
    'B_cooldown_discipline': 0.8,
    'A_Tradition_Continuity': 0.6,
    'B_goal_coherence': 0.5
  },
  novelty_seeking: {
    'B_exploration_rate': 1.0,
    'A_Tradition_Continuity': -0.6,
    'F_Plasticity': 0.4
  }
};

export function computeTraits(v_eff: VectorBase): Record<TraitId, number> {
  const out: Record<TraitId, number> = {} as any;
  for (const t of TRAITS) {
    let s = 0;
    const row = A[t] || {};
    for (const axis of Object.keys(row)) {
      const w = row[axis] ?? 0;
      // v_eff is 0..1, we center it at 0.5 for signed contribution
      const val = (v_eff[axis] ?? 0.5) - 0.5;
      s += w * (val * 2); // scale to -1..1 range
    }
    // Sigmoid activation to map back to 0..1 intensity
    out[t] = 1 / (1 + Math.exp(-2 * s));
  }
  return out;
}
