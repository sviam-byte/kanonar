
import { GoalAxisId, GoalLayer, AgentContextFrame, ContextAtom } from '../../types';

export type TargetKind = 'PERSON' | 'GROUP' | 'INSTITUTION' | 'PLACE' | 'PRINCIPLE' | 'ROLE';

// Raw Biography Features (Global)
export type BioFeatureId = 
  | 'B_saved_others'
  | 'B_parent_role'
  | 'B_betrayed_system'
  | 'B_betrayed_by_peer'
  | 'B_raised_in_strict_order'
  | 'B_exposed_to_chaos'
  | 'B_leader_exp'
  | 'B_chronic_pain'
  | 'B_chronic_stress'
  | 'B_attachment_trauma'
  | 'B_exile' 
  | 'B_moral_injury'
  | 'B_humiliation'
  | 'B_coercion'
  | 'B_strict_moral_upbringing'
  | 'B_abandonment'
  | 'B_bullying'
  | 'B_approval_deprivation'
  | 'B_military_socialization'
  | 'B_status_loss_history'
  | 'B_group_trauma'
  | 'B_witnessed_injustice'
  | 'B_long_term_commitments'
  | 'B_lied_to_history'
  | 'B_existential_crises'
  | 'B_dissociation_history'
  | 'B_no_safe_place_childhood'
  | 'B_sleep_disorders'
  | 'B_burnout'
  | 'B_sensory_sensitivity'
  | 'B_identity_threats'
  | 'B_trauma_overwhelm'
  | 'B_trauma_overload'
  | 'B_trauma_with_X_type'
  | 'B_torture'
  | 'B_injury'
  | 'B_overwork'
  | 'B_scarcity'
  | 'B_survival_mode'
  | 'B_high_responsibility'
  | 'B_failed_rescue'
  | 'B_captivity'
  | 'B_oath_taken'
  | 'B_loss'
  | 'B_political_prisoner'
  | 'B_hero_complex'
  | 'B_success'
  | 'B_betrayal_committed'
  | 'B_rel_devotion';

// Relational Biography Features (Specific to Actor -> Target)
export type RelationalBioFeatureId =
  | 'B_rel_saved'         // I saved/helped Target
  | 'B_rel_failed_save'   // I failed to save Target
  | 'B_rel_harmed'        // I harmed Target
  | 'B_rel_betrayed_by'   // Target betrayed me
  | 'B_rel_obeyed'        // I obeyed Target
  | 'B_rel_controlled_by' // Target controlled me strictly
  | 'B_rel_humiliated_by' // Target humiliated me
  | 'B_rel_care_from'     // Target cared for me
  | 'B_rel_shared_trauma' // We experienced trauma together
  | 'B_rel_approval_deprivation' // I wanted approval from Target but didn't get it
  | 'B_rel_devotion'      // Deep devotion/commitment to Target (goal embrace)
  | 'B_rel_romance'       // Romantic feelings/bond
  | 'B_rel_friendship';   // Platonic friendship bond

// Concrete Life Goal IDs (C)
export type ConcreteGoalId =
  // 1. Self-Regulation / Affect
  | 'c_reduce_tension'
  | 'c_avoid_pain_phys'
  | 'c_avoid_pain_psych'
  | 'c_restore_sleep'
  | 'c_restore_energy'
  | 'c_reduce_overload'
  
  // 2. Identity
  | 'c_preserve_self_integrity'
  | 'c_reduce_guilt'
  | 'c_reduce_shame'
  | 'c_keep_autonomy'
  | 'c_obey_internal_code'
  
  // 3. Social
  | 'c_protect_close_ones'
  | 'c_maintain_bonds'
  | 'c_avoid_rejection'
  | 'c_gain_approval_group'
  
  // 4. Order / System
  | 'c_maintain_order'
  | 'c_obey_legit_auth'
  | 'c_undermine_unjust_system'
  | 'c_increase_status'
  | 'c_preserve_group_safety'
  
  // 5. Meaning / Truth
  | 'c_fix_local_injustice'
  | 'c_pursue_long_term_project'
  | 'c_seek_truth'
  | 'c_preserve_meaning'
  
  // 6. Escape
  | 'c_leave_situation'
  | 'c_dissociate'
  | 'c_find_safe_place'

  // 7. Universal Targeted Goals
  | 'c_protect_target'
  | 'c_obey_target'
  | 'c_please_target'
  | 'c_avoid_target'
  | 'c_break_with_target'
  | 'c_dominate_target'
  | 'c_reform_target'
  | 'c_support_target'
  | 'c_coordinate_with_target';


export interface ConcreteGoalDef {
  id: ConcreteGoalId;
  label: string;
  baseLogit: number;
  layer: GoalLayer;
  domain: string;
  
  preGoalWeights: Partial<Record<GoalAxisId, number>>;
  metricWeights: Partial<Record<string, number>>;
  bioWeights: Partial<Record<BioFeatureId, number>>;
}

export interface TargetedGoalDef {
  id: ConcreteGoalId;
  labelTemplate: string; // "Protect {target}"
  baseLogit: number;
  layer: GoalLayer;
  domain: string;

  preGoalWeights: Partial<Record<GoalAxisId, number>>;
  
  // Keys here match RelationalMetricInput keys (Trust, Fear, etc.)
  relationalMetricWeights: Partial<Record<string, number>>;
  
  // Keys here are RelationalBioFeatureId
  relationalBioWeights: Partial<Record<RelationalBioFeatureId, number>>;
}

export interface GoalContribDetail {
    category: 'Base' | 'Trait/Archetype' | 'State/Metric' | 'Bio/History' | 'Relational' | 'Oath';
    key: string;
    agentValue: number; // The value found in the agent state
    weight: number;     // The weight defined in the goal definition
    contribution: number; // agentValue * weight
}

export interface ConcreteGoalInstance {
  id: string; // e.g. 'c_reduce_tension' or 'c_protect_target_character-tegan'
  defId: ConcreteGoalId;
  label: string; // Human readable
  score: number; // Final probability (softmax)
  logit: number; // Raw logit
  layer: GoalLayer;
  domain: string;
  
  // Target info if applicable
  targetId?: string;
  targetKind?: TargetKind;

  // Summary Debug info
  contribs: {
    base: number;
    preGoals: number;
    metrics: number; // Combined (Global + Relational)
    bio: number;     // Combined (Global + Relational)
  };
  
  // Detailed Breakdown for Inspection
  breakdown: GoalContribDetail[];
  
  // Human-readable formula for UI
  formula: string;
}

export interface GoalSandboxSnapshot {
  scenarioId: string;
  tick: number;
  agentId: string;
  contextGoals: ConcreteGoalInstance[];
  // Added fields for deep debugging
  frame?: AgentContextFrame;
  atoms?: ContextAtom[];
}
