
// lib/core/character_mapper.ts
// Implements the mapping from (θ + body + legacy) -> P_i as described in Section 2 of the design document.

import { CharacterEntity, CharacterParams } from '../../types';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const get = (obj: Record<string, number> | undefined, key: string, def: number = 0.5): number => obj?.[key] ?? 0.5;


/**
 * Maps a character's base attributes to a set of dynamic behavioral parameters (P_i).
 * This function translates the static character sheet into the parameters that drive the simulation models.
 * @param character The character entity to map.
 * @returns An object containing the calculated behavioral parameters.
 */
export function mapCharacterToBehaviorParams(character: CharacterEntity): CharacterParams {
    const p = character.vector_base;
    const body = character.body;
    const legacy = character; // Using the whole entity for legacy fields

    // --- Mapping Formulas from Design Document ---

    // 1. Base Temperature T_i(0)
    const T_min = 0.15, T_max = 1.3;
    const impulsiveness = get(p, 'B_decision_temperature');
    const selfControl = get(p, 'B_cooldown_discipline');
    const T0 = T_min + (T_max - T_min) * sigmoid(5 * (impulsiveness - selfControl));

    // 2. Planning Horizon κ_i
    const planning = get(p, 'G_Narrative_agency');
    const cognitiveComplexity = get(p, 'E_Model_calibration');
    const kappa = 20 + 180 * sigmoid(5 * (planning + cognitiveComplexity) - 5);

    // 3. Time Constants τ_i
    const MAX_KCAL = 2500;
    const VO2MAX_REF = 50;
    const ENDURANCE_REF = 0.8;
    const vo2_norm = (body.capacity?.VO2max || VO2MAX_REF) / VO2MAX_REF;
    const endurance_norm = (body.constitution?.endurance_max || ENDURANCE_REF) / ENDURANCE_REF;
    const sleepDebtFactor = Math.exp(-0.1 * (body.reserves?.sleep_debt_h || 0));

    const tau_energy = (0.05 + 0.35 * (1 - Math.tanh(1.5 * (vo2_norm - 1)))) * sleepDebtFactor;
    
    const stoicism = get(p, 'B_cooldown_discipline');
    const dark_exposure_norm = (legacy.state?.dark_exposure || 0) / 100;
    const hpa_axis = body.regulation?.HPA_axis || 0.5;
    const tau_stress = 0.02 + 0.23 * sigmoid(4 * (stoicism - (hpa_axis - 0.5) - dark_exposure_norm));

    const focus = get(p, 'G_Metacog_accuracy'); // Proxy for focus
    const tau_attention = (0.05 + 0.30 * sigmoid(3 * focus - 1.5)) * sleepDebtFactor;
    
    const resilience = get(p, 'G_Self_consistency_drive');
    const moral_injury_norm = (body.acute?.moral_injury || 0) / 100;
    const tau_will = 0.01 + 0.19 * sigmoid(5 * (resilience - moral_injury_norm));

    // 4. Base Process Noise σ_{0,i}
    const neuroticism = 1 - get(p, 'G_Self_consistency_drive'); // Proxy
    // SAFE ACCESS: context?.age
    const charAge = legacy.context?.age ?? 30;
    const experience = (charAge - 20) / 40; // Normalize age 20-60 as 0-1 experience
    const sigma0 = 0.02 + 0.23 * sigmoid(6 * (neuroticism - 0.5 * experience));

    // 5. Heteroskedasticity Coefficients h_i(x)
    const h_coeffs = { a_HPA: 0.8, a_stress: 1.0, a_sleep: 3.0, a_dark: 0.3 };
    
    // 6. CVaR Parameter λ_i^{CVaR}
    // Use optional chaining for cognitive block
    const risk_aversion = get(character.cognitive?.utility_shape, 'risk_aversion', 0.5); // This is 0-1, where 1 is risk-averse
    const risk_budget = legacy.resources?.risk_budget_cvar || 0.5;
    const cvar_lambda = Math.min(1, Math.max(0, sigmoid(3 * (risk_aversion - 0.5)) + (1 - risk_budget) ));

    // 7. Prospect Theory Parameters
    const risk_tolerance = 1 - risk_aversion;
    const gamma = 0.6 + 0.6 * sigmoid(3 * (risk_tolerance - 0.5));
    const persistence = get(p, 'G_Self_consistency_drive'); // Persistence proxy
    const delta = 0.8 + 0.6 * sigmoid(3 * (persistence - 0.5));
    const lambda_loss = 1.0 + 2.0 * sigmoid(4 * ( (1 - stoicism) + moral_injury_norm - 0.5));
    
    // 8. Adaptation Rates ρ, ζ
    const plasticity = get(p, 'F_Plasticity');
    const rigidity = get(p, 'G_Identity_rigidity');
    const retrieval_noise = legacy.memory?.retrieval_noise || 0.2;
    const rhoL = (0.05 + 0.3 * plasticity) * (1 - 0.5 * retrieval_noise);
    const rhoS = rhoL * 1.2;
    const rho_goals = rhoL;
    const zeta_belief = 0.05 + 0.4 * (1 - rigidity);

    // 9. GIL Parameters φ_max, β
    const conformity = 1 - get(p, 'G_Self_concept_strength'); // Proxy
    const phi_max = 0.3 + 0.55 * sigmoid(4 * (conformity - 0.5));
    const suspicion = 1 - get(p, 'C_reciprocity_index');
    const auth_respect = get(p, 'A_Legitimacy_Procedure');
    const phi_beta = {
        b0: -2.0,
        bTrust: 3.0 * (1 - 0.5 * suspicion),
        bAlign: 2.0,
        bMatch: 1.0,
        bPower: 1.5 * (1 + 0.5 * auth_respect),
        bBond: 1.0,
        bConflict: 2.5,
        bMentor: 2.0,
        bLeadership: 3.5,
    };

    // 10. Soft Ban λ
    const principled = get(p, 'A_Causality_Sanctity'); // Proxy for strictness
    const lambda_soft_ban = 0.5 + 1.5 * sigmoid(4 * (principled - 0.5));

    // 11. Shock Parameters λ_shock, J_i
    const LAMBDA_MAX = 0.2;
    const shock_lambda = LAMBDA_MAX * sigmoid(2 * ( (get(p, 'B_exploration_rate') - 0.5) + (dark_exposure_norm - 0.5) ) );
    
    const HPA_MAX = 1.0; 
    const shock_profile_J = {
        stress: 0.2 + 0.4 * (hpa_axis / HPA_MAX),
        energy: -(0.4 - 0.3 * ((vo2_norm + endurance_norm) / 2)),
        injury: 0.3 * (1 - (body.reserves?.immune_tone || 0.5)),
        moral: 0.5 * dark_exposure_norm,
    };

    // 12. Appraisal & Yerkes-Dodson Parameters
    const stimulation_seeking = get(p, 'B_exploration_rate');
    const yerkes_A_star = 0.4 + 0.4 * stimulation_seeking;
    const yerkes_sigma_A = 0.2 + 0.1 * (1 - get(p, 'D_HPA_reactivity'));
    const emotional_reactivity = get(p, 'D_HPA_reactivity');
    const kappa_T_sensitivity = 0.8 * emotional_reactivity;
    const kappa_proc_sensitivity = 1.0;
    
    // Derive appraisal weights from traits, as per spec
    const appraisal_weights = {
        valence: {
            threat: -0.6 * (1 + (1 - get(p, 'A_Safety_Care'))),
            socialPressure: -0.3 * (1 + get(p, 'C_reputation_sensitivity')),
            legalRisk: -0.1,
            bioHazard: -0.2,
            supply: 0.5,
        },
        control: {
            uncertainty: -0.5 * (1 + (1 - get(p, 'B_tolerance_ambiguity'))),
            clearance: 0.3,
            threat: -0.4,
            socialPressure: -0.2,
        },
        arousal: {
            threat: 0.7 * (1 + get(p, 'D_HPA_reactivity')),
            uncertainty: 0.3,
            socialPressure: 0.2,
        },
    };

    // 13. Gumbel Beta
    const decisiveness = get(p, 'G_Metacog_accuracy'); // Proxy
    const gumbel_beta = Math.min(0.8, 0.05 + 0.75 * (((body.reserves?.sleep_debt_h || 0) / 24) + 0.5 * (1 - decisiveness)));

    // 14. Planning Style
    // Deliberate if high discipline + high agency
    // Simple if low agency OR high impulsivity
    // Instinctive if very high impulsivity AND very low discipline
    let planningStyle: 'deliberate' | 'simple' | 'instinctive' = 'deliberate';
    const discipline = get(p, 'B_cooldown_discipline');
    const agency = get(p, 'G_Narrative_agency');
    const impulsive = get(p, 'B_decision_temperature');
    
    if (impulsive > 0.8 && discipline < 0.3) planningStyle = 'instinctive';
    else if (agency < 0.4 || impulsive > 0.6) planningStyle = 'simple';

    const P: CharacterParams = {
        T0,
        kappa,
        // FIX: Added will to tau
        tau: { energy: tau_energy, stress: tau_stress, attention: tau_attention, width: 0.5, will: tau_will },
        sigma0,
        h_coeffs,
        cvar_lambda,
        prospect: { gamma, delta, lambda_loss },
        rho_goals,
        rhoL,
        rhoS,
        zeta_belief,
        phi_max,
        phi_beta,
        lambda_soft_ban,
        shock_lambda,
        shock_profile_J,
        appraisal_weights,
        yerkes_A_star,
        yerkes_sigma_A,
        kappa_T_sensitivity,
        kappa_proc_sensitivity,
        gumbel_beta,
        planningStyle,
        archMetrics: {
            AGENCY: get(p, 'ARCH_AGENCY', 0.5),
            ACCEPT: get(p, 'ARCH_ACCEPT', 0.5),
            ACTION: get(p, 'ARCH_ACTION', 0.5),
            RADICAL: get(p, 'ARCH_RADICAL', 0.5),
            SCOPE: get(p, 'ARCH_SCOPE', 0.5),
            TRUTH: get(p, 'ARCH_TRUTH', 0.5),
            CARE: get(p, 'ARCH_CARE', 0.5),
            MANIP: get(p, 'ARCH_MANIP', 0.5),
            FORMAL: get(p, 'ARCH_FORMAL', 0.5),
        },
    };

    return P;
}
