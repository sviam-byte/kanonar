
import { DyadConfigForA, DyadOverride } from '../lib/tom/dyad-metrics';

// Example config for Maera Alb
export const DYAD_CONFIGS: Record<string, DyadConfigForA> = {
  'character-maera-alb': {
    // Likes those with similar values/fairness/legitimacy
    like_sim_axes: {
      A_Justice_Fairness: 1.0,
      A_Legitimacy_Procedure: 0.8,
      C_coalition_loyalty: 0.6,
    },
    // Likes those who are less dominant/aggressive (complementarity)
    like_opposite_axes: {
      C_dominance_empathy: 1.0,   // Maera is high dominance (0.8), likes low dominance partners (empathy)
      B_decision_temperature: 0.5, // Likes calmer people if she is impulsive (or vice versa)
    },

    // Trusts those with high Integrity/Fairness match
    trust_sim_axes: {
      A_Justice_Fairness: 1.0,
      A_Transparency_Secrecy: 0.8,
    },
    // Trusts those with high Loyalty/Reliability
    trust_partner_axes: {
      C_coalition_loyalty: 1.0,
      C_reciprocity_index: 0.7,
      G_Self_consistency_drive: 0.5,
    },

    // Fears those with high Power/Aggression/Chaos
    fear_threat_axes: {
      A_Power_Sovereignty: 0.8,
      B_decision_temperature: 0.5, // impulsive = threat
      // C_deception not directly in vector base, handled by logic usually, but maybe implicit in low Transparency?
    },
    fear_dom_axes: {
      A_Power_Sovereignty: 1.0,
      C_reputation_sensitivity: 0.5,
    },

    // Respects Competence/Intelligence
    respect_partner_axes: {
      E_Model_calibration: 1.0,
      E_KB_civic: 0.8,
      B_goal_coherence: 0.7,
      G_Narrative_agency: 0.6,
    },

    // Closeness via emotional/care axes
    closeness_sim_axes: {
      A_Safety_Care: 0.8,
      C_dominance_empathy: 0.5, // similarity in empathy style
    },

    // Dominance via Power/Status
    dominance_axes: {
      A_Power_Sovereignty: 1.0,
      C_dominance_empathy: 0.8, // High value = Dominance
      G_Narrative_agency: 0.5,
    },

    // Personal bias
    bias_liking: 0.0,
    bias_trust: -0.2,       // Default distrust
    bias_fear: 0.1,         // Slight paranoia
    bias_respect: 0.0,
    bias_closeness: -0.1,   // Distant
    bias_dominance: 0.2,    // Asserts control
  },
  // Add other character configs here...
};

export const DYAD_OVERRIDES: Record<string, DyadOverride[]> = {
    // Example: Maera has specific feelings about Vestar (if he existed in the set)
    // 'character-maera-alb': [
    //   { targetId: 'character-vestar', liking_delta: 0.6, fear_delta: 0.3 },
    // ],
};
