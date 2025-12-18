
import { CharacterState, EntityParams, CharacterEntity, BlackSwanEvent, SimulationPoint, BodyModel, PhysiologyState } from '../types';
import { tickPhysiology, PhysiologyEnv } from './physiology.update';

// --- UTILITIES & CONSTANTS ---
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clip = (val: number, min: number, max: number): number => Math.max(min, Math.min(val, max));
const normalize = (val: number | undefined, max: number = 100, min: number = 0): number => {
    if (val === undefined) return 0;
    const range = max - min;
    if (range === 0) return 0;
    return clip((val - min) / range, 0, 1);
};
const softplus = (x: number) => Math.log1p(Math.exp(x));

const BASE_LAMBDAS = { N: 1/14, H: 1/7, C: 1/10, MI: 0.01 };

const DEFAULTS = {
    kappa0: 0.20,
    zeta0: 0.90,
    h0: 0.025, // Mid-point of [0.015, 0.03]
    sigma_xi: 0.003,
    phi: 0.9,
    rho_J: 0.7,
    rho_MI: 0.1,
    allostatic_decay: 0.98,
    allostatic_accumulation: 0.01,
    moral_injury_lambda: 0.05,
    drift: { theta: 0.1, Dbar: 15, sigmaD: 0.5, eta: 0.25 },
};

const CORRUPTION_THRESHOLD = 75;
const CORRUPTION_DAYS = 7;


interface SDEParams {
    entity: CharacterEntity,
    latents: Record<string, number>,
    state: CharacterState,
    shocks: ShockImpulse,
    day: number;
    quickStates: Record<string, number>;
}

interface ShockImpulse {
    vislag_days: number;
    report_noise: number;
    DS: number;
    Trust_in: number;
    Opt: number;
    BP: number;
}
const ZERO_SHOCKS: ShockImpulse = { vislag_days: 0, report_noise: 0, DS: 0, Trust_in: 0, Opt: 0, BP: 0 };


// --- INSTANTANEOUS PILLAR CALCULATIONS ---

function applyNormalizationFactors(latents: Record<string, number>, entity: CharacterEntity): Record<string, number> {
    const normalizedLatents = { ...latents };
    const p = entity.vector_base || {};

    // SD (Supply/Demand): ops_fieldcraft reduces impact
    const k_sd = 1 - 0.3 * (p['E_Skill_ops_fieldcraft'] ?? 0.5);
    normalizedLatents['SD'] = (normalizedLatents['SD'] ?? 0.5) * k_sd;

    // RP (Reputation/Political): reputation_sensitivity increases impact
    const k_rp = 1 + 0.5 * (p['C_reputation_sensitivity'] ?? 0.5);
    normalizedLatents['RP'] = (normalizedLatents['RP'] ?? 0.5) * k_rp;

    // SO (Social): coalition_loyalty increases impact
    const k_so = 1 + 0.3 * (p['C_coalition_loyalty'] ?? 0.5);
    normalizedLatents['SO'] = (normalizedLatents['SO'] ?? 0.5) * k_so;

    // EW (Electronic Warfare): opsec/hacking skill reduces impact
    const k_ew = 1 - 0.4 * (p['E_Skill_opsec_hacking'] ?? 0.5);
    normalizedLatents['EW'] = (normalizedLatents['EW'] ?? 0.5) * k_ew;
    
    // CH (Character Hardship/Causal Hygiene): stamina_reserve reduces impact of hardship
    const k_ch = 1 - 0.3 * (p['D_stamina_reserve'] ?? 0.5);
    normalizedLatents['CH'] = (normalizedLatents['CH'] ?? 0.5) * k_ch;

    return normalizedLatents;
}

function calculate_Pillar_N_inst({ entity, latents, state, shocks, quickStates }: SDEParams): number {
    const { SD = 0.5, EW = 0.5, CH = 0.5 } = latents;

    const Opt_inst = sigmoid(normalize(entity.identity.clearance_level, 5) + normalize(entity.resources?.risk_budget_cvar) - shocks.Opt);
    
    const N_z = 0.40 * SD + 0.25 * EW + 0.20 * CH + 0.15 * Opt_inst;
    return sigmoid(2.5 * (N_z - 0.5));
}

function calculate_Pillar_H_inst({ entity, state, quickStates }: SDEParams): number {
    const { DR = 0.5, SI = 0.5 } = quickStates;
    const FD = normalize(state.fatigue); // Use dynamic fatigue
    const SR = normalize(state.stress); // Use dynamic stress
    const allostatic_load_norm = normalize(state.allostatic_load, 5); // Max load of 5 for normalization
    const H_z = 0.40 * DR + 0.25 * SI - 0.20 * FD - 0.15 * SR - 0.25 * allostatic_load_norm;
    return sigmoid(2.5 * (H_z - 0.5));
}

function calculate_Pillar_C_inst({ entity, latents, quickStates, state }: SDEParams): number {
    const { SO = 0.5, CH = 0.5 } = latents;
    const apophenia = Math.max(0, SO - CH);
    const ToM_Q = quickStates.ToM_Q ?? 0.5;
    const goal_coherence = entity.vector_base?.B_goal_coherence ?? 0.5;
    const fatigue_norm = normalize(state.fatigue);

    let C_z = 0.35 * goal_coherence +
                0.25 * (entity.vector_base?.G_Self_concept_strength ?? 0.5) +
                0.15 * ToM_Q -
                0.15 * apophenia -
                0.10 * (1 - goal_coherence) - // goal_tension
                0.15 * fatigue_norm; // Fatigue penalty
    
    if (state.mode === 'corruption') {
        C_z -= 0.30 * (entity.vector_base?.A_Justice_Fairness ?? 0.5); // Cynicism reduces coherence
        C_z -= 0.20 * (entity.vector_base?.A_Safety_Care ?? 0.5); // Disregard for safety
    }

    return sigmoid(2.5 * (C_z - 0.5));
}

function calculate_h_components({ entity, latents, state, shocks }: Pick<SDEParams, 'entity' | 'latents' | 'state'| 'shocks'>) {
    const { RP = 0.5, CH = 0.5, SO = 0.5, SD = 0.5 } = latents;
    const B_cooldown = entity.vector_base?.B_cooldown_discipline ?? 0.5;
    const Skill_causal = entity.vector_base?.E_Skill_causal_surgery ?? 0.5;
    
    const DS = (state.darkness !== undefined) ? state.darkness / 100 : (entity.state?.dark_exposure ?? 0) / 100;
    const stress_norm = normalize(state.stress);
    const fatigue_norm = normalize(state.fatigue);
    
    const Vsigma = sigmoid(1.0 * RP + 0.8 * (1 - CH) + 0.7 * Math.max(0, SO - CH) + 0.6 * (1 - SD) + 0.9 * DS - 2.0);
    const C_causal = sigmoid((1 - CH) - B_cooldown - Skill_causal);
    
    const log_H_core = 0.8 * Vsigma + 0.8 * DS + 0.8 * C_causal + 0.4 * stress_norm + 0.2 * fatigue_norm;
    
    const BP = (shocks.BP > 0) ? shocks.BP : (((entity.resources?.time_budget_h || 50) / 168) + (entity.resources?.risk_budget_cvar ?? 0)) / 2;
    const Opt = sigmoid(normalize(entity.identity.clearance_level, 5) + normalize(entity.resources?.risk_budget_cvar) - shocks.Opt);

    // Calculate misalignment based on body state
    let misalign = 0;
    if (entity.body && entity.body.reserves && entity.body.acute) {
         misalign = (
            Math.abs(12 - (entity.body.reserves.circadian_phase_h ?? 12)) / 12 +
            normalize(Math.abs(4.8 - (entity.body.reserves.glycemia_mmol ?? 4.8)), 5) +
            normalize(Math.abs(36.8 - entity.body.acute.temperature_c), 2) +
            normalize(entity.body.acute.injuries_severity)
        ) / 4;
    }
                   
    const h_t_raw = DEFAULTS.h0 * sigmoid(log_H_core) * (1 + 0.5 * Vsigma) * (1 + 0.6 * BP + 0.4 * (1 - Opt)) * (1 + misalign);

    return { h_t: clip(h_t_raw * 0.5, 0.0, 0.04), Vsigma, DS, C_causal };
}

function calculate_shock(event: BlackSwanEvent, { entity, latents, state }: Pick<SDEParams, 'entity' | 'latents' | 'state'>) {
    const { channels } = event;
    const Id = softplus(channels.stress + channels.dark + channels.vislag_days + channels.budget_overrun + channels.topo_break);

    const h_comps = calculate_h_components({entity, latents, state, shocks: ZERO_SHOCKS});

    const AF = sigmoid((latents.U??0.5) + (latents.M??0.5) + (entity.vector_base?.A_Aesthetic_Meaning ?? 0.5) + (entity.vector_base?.G_Narrative_agency ?? 0.5) - h_comps.DS - 1.0);
    const RS = sigmoid(h_comps.Vsigma + h_comps.DS + h_comps.C_causal + 0.5); // BP proxy
    
    const AF_condition_met = (latents.U??0) > 0.6 && (latents.M??0) > 0.6 && (latents.EW??0) > 0.6 && (latents.SD??0) > 0.6 && h_comps.DS < 0.3;

    let J_d_raw = Id * (0.8 * AF - 0.7 * RS);
    
    if (J_d_raw < 0 && AF_condition_met) {
        J_d_raw = Math.max(J_d_raw, -0.05);
    }
    
    return { J_d: J_d_raw, AF, RS };
}

export function stepCharacter(
    entity: CharacterEntity,
    latents: Record<string, number>,
    state: CharacterState,
    dt: number,
    rng: () => number, // seedrandom.prng gives number between 0 and 1
    day: number,
    event: BlackSwanEvent | undefined,
    quickStates: Record<string, number>,
    rampFactor: number,
    isCrisisGuard: boolean
): { nextState: CharacterState, diagnostics: SimulationPoint } {
    
    // --- 0. Телесная физиология → обновление усталости / стресса / allostatic load ---
    if (entity.body && entity.body.structural && entity.body.functional && entity.body.hormonal) {
        const dtHours = dt * 24; // dt в днях → часы

        const env: PhysiologyEnv = {
            physicalLoad: (quickStates['physical_load'] ?? 0.3),
            mentalLoad: (quickStates['mental_load'] ?? 0.3),
            isSleeping: Boolean(quickStates['is_sleeping'] ?? 0),
            ambientTemp: 22,
        };

        const currentPhys: PhysiologyState = {
            reserves: entity.body.reserves,
            acute: entity.body.acute,
            regulation: entity.body.regulation ?? {
                HPA_axis: 0.5, // Use correct property name here as fallback
                arousal: 0.5,
            },
            fitness_index: (entity.body as any).fitness_index,
            fragility_index: (entity.body as any).fragility_index,
            hormonal_tension: (entity.body as any).hormonal_tension,
        };

        // Запускаем тик физиологии
        const nextPhys = tickPhysiology(
            entity.body as unknown as BodyModel,
            currentPhys,
            env,
            dtHours,
        );

        // Записываем обратно в тело сущности (для отображения в UI)
        entity.body.reserves = nextPhys.reserves;
        entity.body.acute = nextPhys.acute;
        entity.body.regulation = nextPhys.regulation;

        // Persist aggregates for next tick
        (entity.body as any).fitness_index = nextPhys.fitness_index;
        (entity.body as any).fragility_index = nextPhys.fragility_index;
        (entity.body as any).hormonal_tension = nextPhys.hormonal_tension;

        const fitness = nextPhys.fitness_index ?? 0.5;
        const hormonal = nextPhys.hormonal_tension ?? 0.5;

        // Маппим физиологию на CharacterState для SDE
        const baseStress = nextPhys.acute.stress_level ?? 0.0;   // 0..1
        const baseFatigue = nextPhys.acute.fatigue ?? 0.0;       // 0..1
        
        const stressPenalty = baseStress + hormonal * 0.3;
        const fatiguePenalty = baseFatigue + (1 - fitness) * 0.3;
        
        const allo = 
            stressPenalty +
            fatiguePenalty +
            (1 - (nextPhys.reserves.immune_tone ?? 0.7));

        // Обновляем state перед расчетом SDE
        state = {
            ...state,
            stress: Math.min(100, stressPenalty * 100), // CharacterState в 0..100
            fatigue: Math.min(100, fatiguePenalty * 100),
            allostatic_load: (state.allostatic_load || 0) * DEFAULTS.allostatic_decay + allo * DEFAULTS.allostatic_accumulation,
        };
    }

    const { S, v, xi, sigma_xi_sq } = state;
    const { zeta0, sigma_xi, phi } = DEFAULTS;
    
    const normalizedLatents = applyNormalizationFactors(latents, entity);

    const sdeParams: SDEParams = { entity, latents: normalizedLatents, state, shocks: ZERO_SHOCKS, day, quickStates };

    const N_inst = calculate_Pillar_N_inst(sdeParams);
    const H_inst = calculate_Pillar_H_inst(sdeParams);
    const C_inst = calculate_Pillar_C_inst(sdeParams);

    const N_ema = (1 - BASE_LAMBDAS.N) * state.N_ema + BASE_LAMBDAS.N * N_inst;
    const H_ema = (1 - BASE_LAMBDAS.H) * state.H_ema + BASE_LAMBDAS.H * H_inst;
    const C_ema = (1 - BASE_LAMBDAS.C) * state.C_ema + BASE_LAMBDAS.C * C_inst;
    
    const mu_t_raw = (N_ema + H_ema + C_ema) / 3;
    
    const circadian_term = 0.02 * Math.sin(2 * Math.PI * ((entity.body?.reserves?.circadian_phase_h ?? 12) / 24));
    const weekly_term = 0.01 * Math.sin(2 * Math.PI * day / 7);
    const mu_t = clip(mu_t_raw + circadian_term + weekly_term, 0, 1);
    
    const { h_t } = calculate_h_components({ entity, latents: normalizedLatents, state, shocks: ZERO_SHOCKS });
    const kappa_t = clip(DEFAULTS.kappa0 * sigmoid(0.35 * normalizedLatents.SD + 0.20 * normalizedLatents.CH + 0.20 * (quickStates.T_topo ?? 0.5) + 0.15 * normalizedLatents.CL + 0.10 * (quickStates.DR ?? 0.5)), 0.02, 0.3);

    let shock_J = 0;
    if (event) {
        const shock_calcs = calculate_shock(event, { entity, latents: normalizedLatents, state });
        shock_J = shock_calcs.J_d;
    }

    const zeta_t = zeta0; // not dynamic for now
    
    // SDE integration (Euler-Maruyama)
    const dxi = -phi * xi * dt + Math.sqrt(2 * phi * sigma_xi_sq) * (rng() - 0.5) * 2 * Math.sqrt(dt); // Correct Gaussian sample approximation
    const next_xi = xi + dxi;
    const xi_proc = next_xi * rampFactor; // Ramp up risk

    const S_norm = S / 100;
    const dv = (kappa_t * (mu_t - S_norm) - h_t * S_norm - zeta_t * v) * dt + xi_proc * Math.sqrt(dt);
    const dS = v * dt;
    
    let next_v = v + dv;
    let next_S = S + dS * 100;

    const deltaS_shock = shock_J * (1 - S / 100);
    next_S = clip(next_S + deltaS_shock * 100, 0, 100);

    let nextState = { ...state, S: next_S, v: next_v, xi: next_xi, N_ema, H_ema, C_ema };

    const diagnostics: SimulationPoint = {
        day: day,
        S: next_S,
        v: next_v,
        mu: mu_t * 100,
        kappa: kappa_t,
        h: h_t,
        S_star: (kappa_t + h_t > 0) ? (kappa_t * mu_t) / (kappa_t + h_t) * 100 : 0,
        N: N_inst * 100,
        H_p: H_inst * 100,
        C: C_inst * 100,
        shock: shock_J * 100, // scaled for display
        deltaS_inertia: -zeta_t * v * dt * 100,
        deltaS_restoring: kappa_t * (mu_t - S_norm) * dt * 100,
        deltaS_destroyer: -h_t * S_norm * dt * 100,
        deltaS_shock: deltaS_shock * 100,
    };

    return { nextState, diagnostics };
}
