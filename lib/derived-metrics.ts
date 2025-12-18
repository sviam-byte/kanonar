
import { EntityParams, DerivedMetrics, GoalEcology, CharacterState } from '../types';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

const getParam = (p: EntityParams, key: string, defaultValue: number = 0.5): number => p[key] ?? defaultValue;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function calculateDerivedMetrics(
    p: EntityParams,
    latents: Record<string, number>,
    quickStates: Record<string, number>,
    goalEcology: GoalEcology | null,
    charState?: Partial<CharacterState>
): DerivedMetrics {
    
    // --- Intermediate values ---
    const dom_emp = getParam(p, 'vector_base.C_dominance_empathy');
    const dominance = Math.max(0, dom_emp - 0.5) * 2;
    const empathy = Math.max(0, 0.5 - dom_emp) * 2;
    
    const stress_ema_delta = charState?.stress_ema_delta ?? 0;
    const arousal_ema_delta = charState?.arousal_ema_delta ?? 0;

    // --- Metric Calculations ---
    const rho = sigmoid(
        0.35 * latents.RP 
        + 0.15 * getParam(p, 'vector_base.A_Liberty_Autonomy') 
        + 0.10 * getParam(p, 'vector_base.A_Power_Sovereignty') 
        - 0.15 * latents.EW 
        - 0.10 * latents.CH 
        - 0.10 * getParam(p, 'vector_base.C_reputation_sensitivity') 
        + 0.05 * getParam(p, 'vector_base.B_decision_temperature')
    );

    const lambda = sigmoid(
        0.30 * getParam(p, 'vector_base.D_HPA_reactivity')
        + 0.15 * stress_ema_delta
        + 0.10 * arousal_ema_delta
        + 0.15 * getParam(p, 'vector_base.F_Forgetting_noise')
        + 0.10 * getParam(p, 'vector_base.B_decision_temperature')
        - 0.10 * getParam(p, 'vector_base.D_sleep_resilience')
        - 0.10 * getParam(p, 'vector_base.G_Self_concept_strength')
    );

    const iota = sigmoid(
        0.35 * getParam(p, 'vector_base.B_decision_temperature')
        + 0.25 * getParam(p, 'vector_base.B_discount_rate')
        - 0.20 * getParam(p, 'vector_base.B_cooldown_discipline')
        - 0.10 * getParam(p, 'vector_base.G_Metacog_accuracy')
        + 0.10 * (getParam(p, 'body.acute.fatigue', 0) / 100)
    );
    
    // Placeholder for base kappa and h calculation, simplified
    const kappa_base = sigmoid(0.35*latents.SD + 0.20*latents.CH);
    const h_base = sigmoid(latents.RP);

    const resilience = sigmoid(
        0.30 * kappa_base
        + 0.20 * quickStates.DR
        + 0.15 * latents.SD
        + 0.10 * latents.EW
        + 0.10 * latents.CL
        - 0.10 * h_base
        - 0.05 * (getParam(p, 'state.backlog_load', 0) / 100)
        - 0.05 * (getParam(p, 'body.reserves.sleep_debt_h', 0) / 72)
    );

    const antifragility = sigmoid(
        0.20 * (latents.U ?? 0.5) // U is not calculated, using placeholder
        + 0.15 * getParam(p, 'vector_base.A_Aesthetic_Meaning')
        + 0.15 * getParam(p, 'vector_base.G_Narrative_agency')
        + 0.15 * getParam(p, 'vector_base.E_Model_calibration')
        + 0.10 * latents.CH
        + 0.10 * latents.SD
        - 0.15 * quickStates.dark_susceptibility
    );
    
    const regulatoryGain = sigmoid(
        0.30 * getParam(p, 'vector_base.B_cooldown_discipline')
        + 0.20 * getParam(p, 'vector_base.B_goal_coherence')
        + 0.15 * getParam(p, 'vector_base.E_KB_civic')
        + 0.15 * getParam(p, 'vector_base.G_Metacog_accuracy')
        + 0.10 * latents.EW
        + 0.10 * latents.CH
    );

    const chaosPressure = sigmoid(
        0.40 * Math.max(0, latents.SO - latents.CH)
        + 0.20 * getParam(p, 'observation.noise')
        + 0.15 * getParam(p, 'observation.report_noise')
        - 0.10 * getParam(p, 'vector_base.E_Skill_chronicle_verify')
        - 0.05 * getParam(p, 'vector_base.E_KB_stem')
    );
    
    const socialFriction = sigmoid(
        0.25 * dominance
        - 0.20 * empathy
        - 0.15 * getParam(p, 'vector_base.C_reciprocity_index')
        - 0.10 * getParam(p, 'vector_base.C_coalition_loyalty')
        + 0.15 * (1 - getParam(p, 'vector_base.C_betrayal_cost'))
        + 0.10 * quickStates.dark_susceptibility
    );

    const reputationFragility = sigmoid(
        0.30 * getParam(p, 'vector_base.C_reputation_sensitivity')
        + 0.20 * (1 / (1 + (getParam(p, 'memory.visibility_lag_days', 0))))
        - 0.20 * getParam(p, 'vector_base.E_Skill_opsec_hacking')
        - 0.15 * (getParam(p, 'authority.signature_weight.diplomacy') ?? 0.5)
        + 0.15 * (getParam(p, 'state.dark_exposure', 0) / 100)
    );
    
    const darkTendency = sigmoid(
        0.30 * (getParam(p, 'state.dark_exposure', 0) / 100)
        + 0.20 * (getParam(p, 'body.acute.moral_injury', 0) / 100)
        + 0.20 * getParam(p, 'body.regulation.HPA_axis')
        - 0.15 * latents.EW
        - 0.10 * latents.SD
        - 0.05 * getParam(p, 'vector_base.E_KB_civic')
    );

    const goalTension = goalEcology?.tension ?? 0;
    const frustration = (goalEcology?.frustration ?? 0) * 10;

    const sensoriumReliability = sigmoid(
        -0.35 * getParam(p, 'observation.noise')
        - 0.15 * getParam(p, 'observation.report_noise')
        + 0.20 * getParam(p, 'vector_base.E_KB_stem')
        + 0.10 * getParam(p, 'vector_base.E_Epi_volume')
        + 0.10 * getParam(p, 'vector_base.E_Epi_recency')
        + 0.10 * getParam(p, 'body.constitution.vision_acuity', 1)
        - 0.10 * (getParam(p, 'body.constitution.hearing_db', 0) / 80)
    );
    
    const sleepPressure = sigmoid(
        (getParam(p, 'body.reserves.sleep_debt_h', 0) / 72)
        + getParam(p, 'body.reserves.sleep_homeostat_S')
        - getParam(p, 'vector_base.D_sleep_resilience')
    );

    const energyMargin = sigmoid(
        (getParam(p, 'body.reserves.energy_store_kJ', 0) / 2000)
        + getParam(p, 'body.reserves.hydration')
        + getParam(p, 'body.reserves.O2_margin')
        - (getParam(p, 'state.backlog_load', 0) / 100) // workload proxy
    );
    
    // --- Body Vsigma & Tail Risk Integration ---
    const physFitness = quickStates['phys_fitness'] ?? 0.5;
    const physFragility = quickStates['phys_fragility'] ?? 0.5;
    const hormoneTension = quickStates['hormone_tension'] ?? 0.5;

    const bodyVolatilityFactor =
        0.3 * (1 - physFitness) +
        0.5 * physFragility +
        0.2 * hormoneTension;

    const Vsigma_body = clamp01(bodyVolatilityFactor);
    
    // Vsigma_core is loosely based on previous logic (e.g. h_base/rho) or can be approximated from latents
    const Vsigma_core = h_base; // reusing h_base which is derived from RP

    const Vsigma_total = clamp01(
      Vsigma_core * (1 + 0.5 * bodyVolatilityFactor),
    );

    const body_tail_risk = clamp01(
        0.5 * physFragility +
        0.3 * (1 - physFitness) +
        0.2 * hormoneTension,
    );

    const load_capacity = clamp01(
        physFitness * (1 - physFragility),
    );


    return {
        rho,
        lambda,
        iota,
        resilience,
        antifragility,
        regulatoryGain,
        chaosPressure,
        socialFriction,
        reputationFragility,
        darkTendency,
        goalTension,
        frustration,
        sensoriumReliability,
        sleepPressure,
        energyMargin,
        Vsigma_core,
        Vsigma_body,
        Vsigma_total,
        body_tail_risk,
        load_capacity
    };
}
