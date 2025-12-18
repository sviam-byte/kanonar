// lib/life-goals/life-from-traits.ts
import type { VectorBase, GoalAxisId } from '../types';
import { GOAL_AXES } from './v3-params';

// High-level Traits derived from 44-vector
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

// A: Trait × Axis44 mapping
export const TRAIT_AXIS_WEIGHTS: Record<TraitId, Partial<Record<string, number>>> = {
  care: { 'A_Safety_Care': 1.5, 'C_dominance_empathy': -1.0, 'C_reciprocity_index': 0.6 },
  harshness: { 'A_Safety_Care': -1.2, 'C_betrayal_cost': 0.8, 'A_Power_Sovereignty': 1.0 },
  agency: { 'G_Narrative_agency': 1.5, 'A_Liberty_Autonomy': 1.2, 'A_Power_Sovereignty': 0.6 },
  submission: { 'C_coalition_loyalty': 1.2, 'A_Legitimacy_Procedure': 1.0, 'A_Liberty_Autonomy': -0.8 },
  trust: { 'C_reciprocity_index': 1.2, 'A_Transparency_Secrecy': -0.8, 'C_reputation_sensitivity': 0.5 },
  paranoia: { 'C_betrayal_cost': 1.5, 'C_reciprocity_index': -0.8, 'A_Transparency_Secrecy': 1.0 },
  stability: { 'B_cooldown_discipline': 1.2, 'A_Tradition_Continuity': 1.0, 'B_goal_coherence': 0.8 },
  novelty_seeking: { 'B_exploration_rate': 1.5, 'A_Tradition_Continuity': -0.8, 'F_Plasticity': 0.8 },
};

export function computeTraitsFromVector(
  v_eff: VectorBase,
): Record<TraitId, number> {
  const out: Record<TraitId, number> = {} as any;
  for (const t of TRAITS) {
    const row = TRAIT_AXIS_WEIGHTS[t] ?? {};
    let s = 0;
    for (const [axis, w] of Object.entries(row)) {
      // Axes are 0..1. Center at 0.5 for signed contribution.
      const val = (v_eff[axis] ?? 0.5) - 0.5;
      s += (w ?? 0) * (val * 2); 
    }
    // Sigmoid to map back to 0..1 intensity. 
    // VERY Sharp slope (8) to make traits distinct/binary based on vector.
    out[t] = 1 / (1 + Math.exp(-8 * s));
  }
  return out;
}

// Matrix T_Goals: Traits -> Goal Axes (10 dims)
const TRAIT_TO_GOAL_AXIS: Record<GoalAxisId, Partial<Record<TraitId, number>>> = {
    care: { care: 2.0, harshness: -1.0, trust: 0.8 },
    control: { paranoia: 1.5, harshness: 1.0, submission: 0.5, stability: 0.8 },
    power_status: { agency: 1.2, harshness: 0.8, novelty_seeking: 0.5, submission: -0.8 },
    truth: { novelty_seeking: 1.2, stability: -0.5, trust: 0.5, paranoia: 0.3 },
    free_flow: { novelty_seeking: 1.5, stability: -1.2, agency: 1.0 },
    preserve_order: { stability: 1.5, submission: 1.0, novelty_seeking: -1.0 },
    efficiency: { stability: 1.0, harshness: 0.5, agency: 0.5 },
    chaos_change: { novelty_seeking: 1.8, stability: -1.5, agency: 0.5 },
    fix_world: { agency: 1.5, paranoia: 0.6, care: 0.5 }, 
    escape_transcend: { paranoia: 1.2, care: -0.5, novelty_seeking: 0.8 }
};

export function computeTraitLogits(v_eff: VectorBase): Record<GoalAxisId, number> {
    const traits = computeTraitsFromVector(v_eff);
    const z: Record<GoalAxisId, number> = {} as any;
    
    // REDUCED: from 15.0 to 3.0 to rebalance against other layers.
    const LOGIT_SCALE = 3.0;

    for (const axis of GOAL_AXES) {
        let logit = 0;
        const weights = TRAIT_TO_GOAL_AXIS[axis];
        if (weights) {
            for (const [tId, w] of Object.entries(weights)) {
                const val = traits[tId as TraitId] ?? 0.5;
                // Center trait value (0..1 -> -0.5..0.5)
                logit += (w ?? 0) * (val - 0.5) * LOGIT_SCALE;
            }
        }
        z[axis] = logit;
    }
    return z;
}