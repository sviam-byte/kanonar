
import { CharacterEntity, CharacterState } from '../types';
import { calculateLatentsAndQuickStates } from './metrics/latentsQuick';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clip = (val: number, min: number, max: number): number => Math.max(min, Math.min(val, max));
const normalize = (val: number | undefined, max: number = 100, min: number = 0): number => {
    if (val === undefined) return 0;
    const range = max - min;
    if (range === 0) return 0;
    return clip((val - min) / range, 0, 1);
};

const DEFAULTS = {
    kappa0: 0.20,
    h0: 0.025,
};

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

// These functions are extracted from lib/sde.ts to be reusable for static analysis
function calculate_Pillar_N_inst(entity: CharacterEntity, latents: Record<string, number>, quickStates: Record<string, number>): number {
    const { SD = 0.5, EW = 0.5, CH = 0.5 } = latents;
    const Opt_inst = sigmoid(normalize(entity.identity.clearance_level, 5) + normalize(entity.resources?.risk_budget_cvar));
    const N_z = 0.40 * SD + 0.25 * EW + 0.20 * CH + 0.15 * Opt_inst;
    return sigmoid(2.5 * (N_z - 0.5));
}

function calculate_Pillar_H_inst(quickStates: Record<string, number>, state: Partial<CharacterState>): number {
    const { DR = 0.5, SI = 0.5 } = quickStates;
    const FD = normalize(state.fatigue);
    const SR = normalize(state.stress);
    const H_z = 0.40 * DR + 0.25 * SI - 0.20 * FD - 0.15 * SR;
    return sigmoid(2.5 * (H_z - 0.5));
}

function calculate_Pillar_C_inst(entity: CharacterEntity, latents: Record<string, number>, quickStates: Record<string, number>): number {
    const { SO = 0.5, CH = 0.5 } = latents;
    const apophenia = Math.max(0, SO - CH);
    const ToM_Q = quickStates.ToM_Q ?? 0.5;
    const goal_coherence = entity.vector_base?.B_goal_coherence ?? 0.5;
    const C_z = 0.35 * goal_coherence +
                0.25 * (entity.vector_base?.G_Self_concept_strength ?? 0.5) +
                0.15 * ToM_Q - 0.15 * apophenia - 0.10 * (1-goal_coherence);
    return sigmoid(2.5 * (C_z - 0.5));
}

function calculate_h_components(entity: CharacterEntity, latents: Record<string, number>, state: Partial<CharacterState>) {
    const { RP = 0.5, CH = 0.5, SO = 0.5, SD = 0.5 } = latents;
    const B_cooldown = entity.vector_base?.B_cooldown_discipline ?? 0.5;
    const Skill_causal = entity.vector_base?.E_Skill_causal_surgery ?? 0.5;
    const DS = (state.darkness ?? entity.state.dark_exposure ?? 0) / 100;
    const stress_norm = normalize(state.stress ?? entity.body.acute.stress);
    const fatigue_norm = normalize(state.fatigue ?? entity.body.acute.fatigue);
    
    const Vsigma = sigmoid(1.0 * RP + 0.8 * (1 - CH) + 0.7 * Math.max(0, SO - CH) + 0.6 * (1 - SD) + 0.9 * DS - 2.0);
    const C_causal = sigmoid((1 - CH) - B_cooldown - Skill_causal);
    
    const log_H_core = 0.8 * Vsigma + 0.8 * DS + 0.8 * C_causal + 0.4 * stress_norm + 0.2 * fatigue_norm;
    
    const BP = ((entity.resources?.time_budget_h || 50) / 168 + (entity.resources?.risk_budget_cvar ?? 0)) / 2;
    const Opt = sigmoid(normalize(entity.identity.clearance_level, 5) + normalize(entity.resources?.risk_budget_cvar));

    const misalign = (Math.abs(12 - (entity.body.reserves.circadian_phase_h ?? 12)) / 12 +
                   normalize(Math.abs(4.8 - (entity.body.reserves.glycemia_mmol ?? 4.8)), 5) +
                   normalize(Math.abs(36.8 - entity.body.acute.temperature_c), 2) +
                   normalize(entity.body.acute.injuries_severity)) / 4;
                   
    const h_t_raw = DEFAULTS.h0 * sigmoid(log_H_core) * (1 + 0.5 * Vsigma) * (1 + 0.6 * BP + 0.4 * (1 - Opt)) * (1 + misalign);

    return { h_t: clip(h_t_raw * 0.5, 0.0, 0.04) };
}

export function calculateSdeDiagnostics(
    entity: CharacterEntity,
    latents: Record<string, number>,
    quickStates: Record<string, number>,
    day: number = 0,
    state: Partial<CharacterState> = {}
): { mu: number, kappa: number, h: number, S_star: number, N_inst: number, H_inst: number, C_inst: number } {
    
    const normalizedLatents = applyNormalizationFactors(latents, entity);

    const N_inst = calculate_Pillar_N_inst(entity, normalizedLatents, quickStates);
    const H_inst = calculate_Pillar_H_inst(quickStates, state);
    const C_inst = calculate_Pillar_C_inst(entity, normalizedLatents, quickStates);
    
    // In a static analysis, we assume EMA states are equal to instantaneous states
    const N_ema = N_inst;
    const H_ema = H_inst;
    const C_ema = C_inst;
    
    const mu_t_raw = (N_ema + H_ema + C_ema) / 3;
    
    const circadian_term = 0.02 * Math.sin(2 * Math.PI * ((entity.body.reserves.circadian_phase_h ?? 12) / 24));
    const weekly_term = 0.01 * Math.sin(2 * Math.PI * day / 7);
    const mu_t = clip(mu_t_raw + circadian_term + weekly_term, 0, 1);
    
    const { h_t } = calculate_h_components(entity, normalizedLatents, state);
    const kappa_t = clip(DEFAULTS.kappa0 * sigmoid(0.35*normalizedLatents.SD + 0.20*normalizedLatents.CH + 0.20*(quickStates.T_topo ?? 0.5) + 0.15*normalizedLatents.CL + 0.10*(quickStates.DR ?? 0.5)), 0.02, 0.3);
    
    const S_star = (kappa_t + h_t > 0) ? (kappa_t * mu_t) / (kappa_t + h_t) * 100 : 0;
    
    return {
        mu: mu_t,
        kappa: kappa_t,
        h: h_t,
        S_star,
        N_inst,
        H_inst,
        C_inst,
    };
}
