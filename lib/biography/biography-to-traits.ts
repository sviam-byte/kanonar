
// lib/biography/biography-to-traits.ts
import type { BiographyState, BiographyLatent } from './types-biography';
import type { VectorBase } from '../types';

// Matrix W_bio: How biography latent bends the 44-vector.
// Refined weights for clearer impact.
export const BIO_TO_VECTOR_WEIGHTS: Record<string, Partial<Record<string, number>>> = {
  'bio_combat_exposure': {
    'A_Safety_Care': -0.8, 
    'D_pain_tolerance': 0.9,
    'D_HPA_reactivity': -0.6, // Desensitization
    'E_Skill_ops_fieldcraft': 1.0,
    'C_dominance_empathy': -0.5,
    'A_Power_Sovereignty': 0.5
  },
  'bio_injury': {
      'D_pain_tolerance': 0.8,
      'A_Safety_Care': 0.9, 
      'body.acute.pain_now': 0.6,
      'D_stamina_reserve': -0.6,
      'G_Self_concept_strength': -0.3
  },
  'bio_loss': {
    'C_reciprocity_index': -0.8,
    'B_exploration_rate': -0.7,
    'G_Narrative_agency': -0.8,
    'A_Aesthetic_Meaning': -0.5,
    'C_coalition_loyalty': -0.4
  },
  'bio_betrayal': {
      'C_reciprocity_index': -1.0,
      'C_betrayal_cost': 0.9,
      'A_Transparency_Secrecy': 0.8,
      'G_Identity_rigidity': 0.7,
      'C_coalition_loyalty': -0.7,
      'A_Justice_Fairness': 0.5 // Cynical justice
  },
  'bio_service': {
      'C_coalition_loyalty': 0.9,
      'A_Legitimacy_Procedure': 0.9,
      'B_cooldown_discipline': 0.8,
      'A_Power_Sovereignty': -0.5,
      'G_Self_consistency_drive': 0.7
  },
  'bio_caregiving': {
      'A_Safety_Care': 1.0,
      'C_dominance_empathy': -0.8, // High empathy
      'C_coalition_loyalty': 0.6,
      'A_Power_Sovereignty': -0.4
  },
  'bio_training': {
      'F_Skill_learning_rate': 0.7,
      'B_goal_coherence': 0.8,
      'E_Model_calibration': 0.7,
      'G_Metacog_accuracy': 0.6
  },
  'bio_imprisonment': {
      'A_Liberty_Autonomy': 1.2, // Desperate for freedom
      'G_Narrative_agency': -0.9, 
      'A_Power_Sovereignty': -0.8,
      'C_betrayal_cost': 0.7,
      'escape_transcend': 0.9 
  },
  'bio_crisis': {
      'D_HPA_reactivity': 0.7,
      'B_decision_temperature': 0.6,
      'G_Identity_rigidity': -0.5,
      'A_Tradition_Continuity': -0.6
  },
  'bio_status_experience': {
      'A_Power_Sovereignty': 0.8,
      'G_Self_concept_strength': 0.7,
      'C_reputation_sensitivity': 0.6
  },
  'bio_bonds': {
      'C_reciprocity_index': 0.8,
      'C_coalition_loyalty': 0.7,
      'A_Transparency_Secrecy': -0.5
  }
};

export function applyBiographyToVectorBase(
  v_base: VectorBase,
  bioState: BiographyState,
): VectorBase {
  const { latent } = bioState;
  const out: VectorBase = { ...v_base };

  // Magnitude control. 0.8 means a strong bio event can significantly shift parameters.
  const MAGNITUDE = 0.8; 

  for (const [latentKey, latentValue] of Object.entries(latent)) {
    const axisWeights = BIO_TO_VECTOR_WEIGHTS[latentKey];
    if (!axisWeights) continue;
    
    // Only apply positive latent values (presence of experience)
    if (latentValue <= 0.01) continue;

    for (const [axis, w] of Object.entries(axisWeights)) {
      const delta = (w ?? 0) * latentValue * MAGNITUDE;
      // We add delta, allowing it to push values towards 0 or 1
      out[axis] = (out[axis] ?? 0.5) + delta;
    }
  }

  // Normalization / Clamping to [0, 1]
  for (const axis of Object.keys(out)) {
    const v = out[axis] ?? 0;
    out[axis] = Math.max(0, Math.min(1, v));
  }

  return out;
}
