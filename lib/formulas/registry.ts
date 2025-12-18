
import { AgentState } from '../../types';
import { getNestedValue } from '../param-utils';

export const FORMULA_REGISTRY: Record<string, string> = {
  // --- V4.2 Metrics (Existing) ---
  'V_t': '0.5 + 0.5 * tanh(2.2 * (0.22*{vector_base.A_Aesthetic_Meaning} + 0.16*{latents.SO} + 0.12*{vector_base.B_exploration_rate} + 0.12*{vector_base.E_Epi_recency} + 0.10*{vector_base.D_sleep_resilience} - 0.14*{body.acute.stress}% - 0.10*{body.acute.fatigue}% - 0.08*{body.reserves.sleep_debt_h} - 0.08*{body.acute.pain_now}% - 0.08*{body.acute.moral_injury}% - 0.5))',
  'A_t': 'sigmoid(3.0 * (0.62*{body.regulation.arousal} + 0.20*{vector_base.D_HPA_reactivity} - 0.10*{body.reserves.sleep_debt_h} - 0.08*{body.acute.fatigue}% - 0.5))',
  'WMcap_t': 'sigmoid(3.0 * (0.30*{compute.compute_budget}% + 0.22*{vector_base.D_sleep_resilience} + 0.18*{vector_base.B_goal_coherence} - 0.16*{body.acute.stress}% - 0.07*{body.acute.fatigue}% - 0.07*{body.reserves.sleep_debt_h} - 0.5)) * yerkes({v42metrics.A_t}) * yerkes_stress({body.acute.stress}%)',
  'DQ_t': 'sigmoid(3.0 * (0.30*{latents.CH} + 0.22*{vector_base.G_Metacog_accuracy} + 0.18*{latents.SD} + 0.10*{vector_base.E_KB_stem} - 0.10*{vector_base.B_decision_temperature} - 0.05*{body.acute.stress}% - 0.05*{body.reserves.sleep_debt_h} - 0.5)) * (0.6 + 0.4*{v42metrics.WMcap_t})',
  'Habit_t': 'sigmoid(2.8 * (0.28*{vector_base.B_decision_temperature} + 0.22*{body.reserves.sleep_debt_h} + 0.18*{body.acute.stress}% + 0.16*{vector_base.E_Epi_schema_strength} - 0.10*{vector_base.E_Model_calibration} - 0.10*{vector_base.B_cooldown_discipline} - 0.5))',
  'Agency_t': 'sigmoid(3.0 * (0.34*{vector_base.G_Narrative_agency} + 0.22*{vector_base.G_Self_concept_strength} + 0.18*{vector_base.B_goal_coherence} + 0.10*{latents.SD} - 0.08*{state.drift_state}% - 0.06*{overshoot} - 0.5)) * (1 - 0.45*{v42metrics.Habit_t})',
  'TailRisk_t': 'sigmoid(3.0 * (0.30*{latents.RP} + 0.20*{v42metrics.A_t} + 0.15*{vector_base.B_decision_temperature} + 0.15*{vector_base.D_HPA_reactivity} + 0.10*{MetaU} - 0.20*{latents.SD} - 0.10*{vector_base.E_Skill_opsec_hacking} - 0.5))',
  'Rmargin_t': 'clamp01(sigmoid(3.0 * (h_mean({vector_base.A_Reversibility}, {latents.SD}) - 0.25*{latents.RP} - 0.15*{vector_base.B_decision_temperature} - 0.5)) + 0.5)',
  'PlanRobust_t': 'sigmoid(3.0 * (0.28*{latents.SD} + 0.22*{latents.CH} + 0.22*{v42metrics.WMcap_t} - 0.18*{v42metrics.TailRisk_t} - 0.10*{DoseFrag} - 0.5))',
  'DriveU_t': '1 - exp(-2.2 * (0.28*(1-{body.reserves.energy}) + 0.18*(1-{body.reserves.hydration}) + 0.16*DefG + 0.16*(1-{body.reserves.O2_margin}) + 0.12*{body.acute.pain_now}% + 0.10*SleepP))',
  'ExhaustRisk_t': 'sigmoid(3.2 * (0.30*{body.reserves.sleep_debt_h} + 0.25*{body.acute.fatigue}% + 0.18*{vector_base.D_HPA_reactivity} - 0.18*{vector_base.D_stamina_reserve} - 0.09*{vector_base.D_sleep_resilience} - 0.5))',
  'Recovery_t': 'sigmoid(3.0 * (0.34*{vector_base.D_sleep_resilience} + 0.24*{vector_base.D_stamina_reserve} + 0.16*{vector_base.F_Extinction_rate} - 0.18*{body.reserves.sleep_debt_h} - 0.10*{body.acute.stress}% - 0.5)) * (1 - 0.5*{v42metrics.ExhaustRisk_t})',
  'ImpulseCtl_t': 'sigmoid(3.0 * (0.30*{latents.SD} + 0.26*{vector_base.B_cooldown_discipline} + 0.10*{vector_base.E_KB_civic} - 0.18*{vector_base.B_decision_temperature} - 0.12*{vector_base.D_HPA_reactivity} - 0.5)) * (0.7 + 0.3*{v42metrics.WMcap_t})',
  'InfoHyg_t': 'sigmoid(3.0 * (0.50*g_mean({latents.CH}, 0.6+0.4*{vector_base.E_Skill_opsec_hacking}) + 0.18*{vector_base.E_Skill_chronicle_verify} + 0.12*{vector_base.A_Memory_Fidelity} - 0.12*{state.dark_exposure}% - 0.10*{observation.noise} - 0.08*{observation.report_noise} - 0.5))',
  'RAP_t': 'clamp01(sigmoid(2.5 * (0.40*{Pv_norm} + 0.35*{v42metrics.DQ_t} + 0.25*{v42metrics.Agency_t} - 0.5)) * RiskPenalty * PlanBoost)',

  // --- Derived Metrics ---
  'rho': 'sigmoid(0.35*{latents.RP} + 0.15*{vector_base.A_Liberty_Autonomy} + 0.10*{vector_base.A_Power_Sovereignty} - 0.15*{latents.EW} - 0.10*{latents.CH} - 0.10*{vector_base.C_reputation_sensitivity} + 0.05*{vector_base.B_decision_temperature})',
  'lambda': 'sigmoid(0.30*{vector_base.D_HPA_reactivity} + 0.15*stress_delta + 0.10*arousal_delta + 0.15*{vector_base.F_Forgetting_noise} + 0.10*{vector_base.B_decision_temperature} - 0.10*{vector_base.D_sleep_resilience} - 0.10*{vector_base.G_Self_concept_strength})',
  'iota': 'sigmoid(0.35*{vector_base.B_decision_temperature} + 0.25*{vector_base.B_discount_rate} - 0.20*{vector_base.B_cooldown_discipline} - 0.10*{vector_base.G_Metacog_accuracy} + 0.10*{body.acute.fatigue}%)',
  'resilience': 'sigmoid(0.30*kappa_base + 0.20*{quickStates.DR} + 0.15*{latents.SD} + 0.10*{latents.EW} + 0.10*{latents.CL} - 0.10*h_base - 0.05*{state.backlog_load}%)',
  'antifragility': 'sigmoid(0.20*U + 0.15*{vector_base.A_Aesthetic_Meaning} + 0.15*{vector_base.G_Narrative_agency} + 0.15*{vector_base.E_Model_calibration} + 0.10*{latents.CH} + 0.10*{latents.SD} - 0.15*{quickStates.dark_susceptibility})',
  'chaosPressure': 'sigmoid(0.40*max(0, {latents.SO} - {latents.CH}) + 0.20*{observation.noise} + 0.15*{observation.report_noise} - 0.10*{vector_base.E_Skill_chronicle_verify} - 0.05*{vector_base.E_KB_stem})',
  'socialFriction': 'sigmoid(0.25*Dominance - 0.20*Empathy - 0.15*{vector_base.C_reciprocity_index} - 0.10*{vector_base.C_coalition_loyalty} + 0.15*(1-{vector_base.C_betrayal_cost}) + 0.10*{quickStates.dark_susceptibility})',
  'reputationFragility': 'sigmoid(0.30*{vector_base.C_reputation_sensitivity} + 0.20*LagFactor - 0.20*{vector_base.E_Skill_opsec_hacking} - 0.15*DiplomacyAuth + 0.15*{state.dark_exposure}%)',
  'darkTendency': 'sigmoid(0.30*{state.dark_exposure}% + 0.20*{body.acute.moral_injury}% + 0.20*{body.regulation.HPA_axis} - 0.15*{latents.EW} - 0.10*{latents.SD} - 0.05*{vector_base.E_KB_civic})',
  'sleepPressure': 'sigmoid(({body.reserves.sleep_debt_h}/72) + {body.reserves.sleep_homeostat_S} - {vector_base.D_sleep_resilience})',
  'energyMargin': 'sigmoid(({body.reserves.energy_store_kJ}/2000) + {body.reserves.hydration} + {body.reserves.O2_margin} - {state.backlog_load}%)',
  'Vsigma_core': '{latents.RP} (proxy)',
  'Vsigma_body': 'clamp01(0.3*(1-{quickStates.phys_fitness}) + 0.5*{quickStates.phys_fragility} + 0.2*{quickStates.hormone_tension})',
  'Vsigma_total': 'Vsigma_core * (1 + 0.5*Vsigma_body)',
  'body_tail_risk': 'clamp01(0.5*{quickStates.phys_fragility} + 0.3*(1-{quickStates.phys_fitness}) + 0.2*{quickStates.hormone_tension})',
  'load_capacity': 'clamp01({quickStates.phys_fitness} * (1-{quickStates.phys_fragility}))',
  'sensoriumReliability': 'sigmoid(-0.35*{observation.noise} - 0.15*{observation.report_noise} + 0.20*{vector_base.E_KB_stem} + 0.10*{vector_base.E_Epi_volume} + 0.10*{vector_base.E_Epi_recency} + 0.10*{body.constitution.vision_acuity} - 0.10*HearingLoss)',

  // --- Field Metrics ---
  'SELF_SUBJECT': 'clamp01(0.4*{vector_base.G_Narrative_agency} + 0.3*{vector_base.A_Liberty_Autonomy} + 0.3*{vector_base.B_goal_coherence} - 0.4*{trauma.self} - 0.2*{trauma.world})',
  'SELF_INTEGRITY': 'clamp01(0.4*{vector_base.G_Self_consistency_drive} + 0.3*{vector_base.G_Identity_rigidity} + 0.3*(1-{state.dark_exposure}%) - 0.5*{trauma.self})',
  'OTHERS_CARE': 'clamp01(0.4*{vector_base.A_Safety_Care} + 0.3*(1-{vector_base.C_dominance_empathy}) + 0.3*{vector_base.C_reciprocity_index} - 0.5*{trauma.others})',
  'OTHERS_DEPENDENCE': 'clamp01(0.4*{vector_base.C_reputation_sensitivity} + 0.3*{vector_base.C_coalition_loyalty} + 0.3*(1-{vector_base.G_Self_concept_strength}) + 0.5*{trauma.others})',
  'WORLD_ACCEPTANCE': 'clamp01(0.4*{vector_base.E_Model_calibration} + 0.3*{vector_base.A_Knowledge_Truth} + 0.3*(1-{body.acute.moral_injury}%) - 0.6*{trauma.world})',
  'WORLD_CHANGE_STYLE': 'clamp01(0.4*{vector_base.B_exploration_rate} + 0.3*{vector_base.F_Value_update_rate} + 0.3*(1-{vector_base.A_Tradition_Continuity}) + 0.4*{trauma.world})',
  'SYSTEM_FORMALITY': 'clamp01(0.4*{vector_base.A_Legitimacy_Procedure} + 0.3*{vector_base.B_cooldown_discipline} + 0.3*{vector_base.E_KB_civic} - 0.5*{trauma.system})',
  'SYSTEM_LOYALTY': 'clamp01(0.4*{state.loyalty}% + 0.3*{vector_base.A_Causality_Sanctity} + 0.3*{vector_base.C_coalition_loyalty} - 0.7*{trauma.system})',

  // --- Quick States ---
  'social_support_proxy': '({vector_base.C_reciprocity_index} + {vector_base.C_coalition_loyalty} + (1-{vector_base.A_Transparency_Secrecy})) / 3',
  'DR': '({vector_base.B_cooldown_discipline} + {vector_base.B_goal_coherence} + {vector_base.E_Model_calibration}) / 3',
  'SI': '({vector_base.A_Tradition_Continuity} + {vector_base.A_Legitimacy_Procedure} + {vector_base.A_Safety_Care}) / 3',
  'dark_susceptibility': '({vector_base.C_reputation_sensitivity} + {state.dark_exposure}% + {body.acute.moral_injury}%) / 3',
  'phys_fitness': '({body.functional.strength_upper} + {body.functional.aerobic_capacity}) / 2',
  'phys_fragility': '({body.functional.injury_risk.knees} + {body.functional.injury_risk.lower_back}) / 2',
  'hormone_tension': '({body.regulation.HPA_axis} + {body.acute.stress}%) / 2',
  'ToM_Q': '({vector_base.G_Metacog_accuracy} + {latents.CH}) / 2',
  'T_topo': '{vector_base.E_KB_topos}',
  'prMonstro': 'sigmoid(2.2*{body.acute.stress}% + 1.6*{body.acute.fatigue}% + 1.4*{state.dark_exposure}% + 1.2*{body.acute.moral_injury}% - 1.5*{state.loyalty}% - 0.8*{quickStates.social_support_proxy} - 0.3*{latents.SD} - 0.3*{latents.EW} - 3.0)',

  // --- ToM Metrics ---
  'delegability': 'sigmoid(3.2 * (0.30*(1-{v42metrics.Agency_t}) + 0.18*(1-{v42metrics.WMcap_t}) + 0.15*(1-{v42metrics.Rmargin_t}) + 0.12*{v42metrics.DriveU_t} + 0.10*(0.5*{v42metrics.ExhaustRisk_t} + 0.5*{vector_base.D_HPA_reactivity}) + 0.08*{vector_base.B_decision_temperature} + 0.07*{v42metrics.Habit_t} - 0.10*{latents.SD} + 0.20*Urgency - 0.5)) * (0.8 + 0.4*ToMGain) * (1 - 0.5*Anchors) + 0.25*Mandate + 0.25*TrustEnv',
  'toM_Quality': 'sigmoid(3 * (0.35*{latents.CH} + 0.25*{vector_base.G_Metacog_accuracy} + 0.15*{evidence.evidence_quality} - 0.15*{observation.noise} - 0.10*{observation.report_noise} - 0.10*{state.dark_exposure}% - 0.5))',
  'toM_Unc': 'sigmoid(3 * (0.35*MetaU + 0.25*(1-Q) + 0.20*Shock - 0.5))',

  // --- Psych Metrics ---
  'trustBias': 'clamp01(0.3*{bio_latent.betrayalPeer} + 0.3*{bio_latent.betrayalLeader} + 0.2*(1-{worldview.people_trust}) + 0.3*{vector_base.C_betrayal_cost})',
  'threatBias': 'clamp01(0.3*{bio_latent.traumaWorld} + 0.2*{bio_latent.traumaSystem} + 0.2*(1-{worldview.world_benevolence}) + 0.3*{vector_base.D_HPA_reactivity})',
  'selfBlameBias': 'clamp01(0.5*{bio_latent.traumaSelf} + 0.3*{bio_latent.rescueFailure} - 0.2*{bio_latent.rescueSuccess})',
  'controlIllusion': 'clamp01(0.4*{vector_base.A_Power_Sovereignty}*(1-{worldview.controllability}) + 0.3*{bio_latent.leadershipEpisodes} + 0.2*(1-{vector_base.B_tolerance_ambiguity}))',
  'blackWhiteThinking': 'clamp01(0.4*{vector_base.G_Identity_rigidity} + 0.3*(1-{vector_base.B_tolerance_ambiguity}) + 0.3*{bio_latent.traumaSystem})',
  'catastrophizing': 'clamp01(0.4*{vector_base.C_reputation_sensitivity} + 0.3*{psych.distortion.threatBias} + 0.2*{vector_base.D_HPA_reactivity})',
  'discountingPositive': 'clamp01(0.4*{bio_latent.socialLossNegative} - 0.2*{bio_latent.socialBondPositive} + 0.3*{psych.distortion.selfBlameBias})',
  'personalization': 'clamp01(0.4*{psych.distortion.selfBlameBias} + 0.4*{vector_base.C_reputation_sensitivity})',
  'mindReading': 'clamp01(0.4*{psych.distortion.trustBias} + 0.3*{vector_base.C_reputation_sensitivity} + 0.2*{vector_base.C_betrayal_cost})',
  'coping_avoid': 'clamp01(0.5*{psych.distortion.threatBias} + 0.3*{psych.distortion.catastrophizing} + 0.2*(1-{vector_base.D_stamina_reserve}))',
  'coping_hyperControl': 'clamp01(0.6*{psych.distortion.controlIllusion} + 0.3*{vector_base.A_Legitimacy_Procedure})',
  'coping_aggression': 'clamp01(0.4*{psych.distortion.threatBias} + 0.4*{vector_base.D_HPA_reactivity} + 0.2*{psych.distortion.blackWhiteThinking})',
  'coping_selfHarm': 'clamp01(0.6*{psych.distortion.selfBlameBias} + 0.3*{bio_latent.traumaSelf})',
  'coping_helper': 'clamp01(0.5*{vector_base.A_Safety_Care} + 0.3*{bio_latent.rescueSuccess} - 0.2*{psych.distortion.trustBias})',
  'attach_secure': 'clamp01(0.4*{bio_latent.socialBondPositive} + 0.4*{vector_base.C_reciprocity_index} - 0.2*{bio_latent.betrayalPeer})',
  'attach_anxious': 'clamp01(0.4*{bio_latent.socialLossNegative} + 0.4*{vector_base.C_reputation_sensitivity})',
  'attach_avoidant': 'clamp01(0.4*{bio_latent.betrayalPeer} + 0.4*{vector_base.A_Liberty_Autonomy} - 0.2*{bio_latent.socialBondPositive})',
  'attach_disorganized': 'clamp01(0.5*{bio_latent.traumaOthers} + 0.3*{bio_latent.traumaSelf})',
  'moral_guilt': 'clamp01(0.4*{bio_latent.rescueFailure} + 0.3*{vector_base.C_dominance_empathy})',
  'moral_shame': 'clamp01(0.4*{bio_latent.subordinationEpisodes} + 0.4*{vector_base.C_reputation_sensitivity})',
};

// Helper to substitute values in formula string
export function resolveFormula(formula: string, context: any): string {
    return formula.replace(/\{([^}]+)\}/g, (match, path) => {
        // Handle special shorthand keys like %
        const isPercent = path.endsWith('%');
        const cleanPath = isPercent ? path.slice(0, -1) : path;
        
        let val: number | undefined;
        
        if (cleanPath === 'overshoot') {
            const dose = ((getNestedValue(context, 'memory.attention.E') ?? 0) / (getNestedValue(context, 'memory.attention.A_star') ?? 1));
            val = Math.max(0, dose - 1);
        } else if (cleanPath.startsWith('v42metrics.')) {
            val = context.v42metrics?.[cleanPath.split('.')[1]];
        } else if (cleanPath.startsWith('latents.')) {
            val = context.latents?.[cleanPath.split('.')[1]];
        } else if (cleanPath.startsWith('quickStates.')) {
            val = context.quickStates?.[cleanPath.split('.')[1]];
        } else if (cleanPath.startsWith('bio_latent.')) {
             val = context._debug_bio_latent?.[cleanPath.split('.')[1]];
        } else if (cleanPath.startsWith('psych.')) {
             // Handle psych.distortion.x etc
             val = getNestedValue(context.psych, cleanPath.replace('psych.', ''));
        } else if (cleanPath.startsWith('trauma.')) {
             val = context.trauma?.[cleanPath.split('.')[1]];
        } else if (cleanPath.startsWith('worldview.')) {
             val = context.psych?.worldview?.[cleanPath.split('.')[1]];
        } else if (cleanPath === 'MetaU') {
             val = 0.5; // Placeholder
        } else {
             val = getNestedValue(context, cleanPath);
        }

        if (val === undefined) return '?';
        
        // Use the percent flag to divide by 100 if the value is expected to be normalized in the formula
        if (isPercent) {
             return (val / 100).toFixed(3);
        }
        
        return val.toFixed(3);
    });
}
