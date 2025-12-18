
// lib/physio.ts

import { AgentState, Action, PhysioParams } from '../types';
import { stepOU, RNG } from './core/noise';
import { cosSim } from './math/core';

/**
 * Вычисляет множитель-усилитель шума h_i(x) на основе текущего состояния.
 * @param agent - Агент, для которого производится расчёт
 * @returns Коэффициент усиления шума (>= 1.0)
 */
export function computeNoiseAmplifier(agent: AgentState): number {
    const { a_stress, a_sleep, a_HPA: a_hpa, a_dark } = agent.behavioralParams.h_coeffs;

    const stress_norm = (agent.body.acute.stress ?? 0) / 100;
    const sleep_debt_norm = Math.min(1, (agent.body.reserves.sleep_debt_h || 0) / 24);
    const hpa_excess = Math.max(0, (agent.body.regulation.HPA_axis ?? 0.5) - 0.5); // Assuming HPA_0 is 0.5
    const dark_exposure_norm = (agent.state.dark_exposure ?? 0) / 100;

    let h = 1.0;
    h += a_stress * stress_norm;
    h += a_sleep * sleep_debt_norm;
    h += a_hpa * hpa_excess;
    h += a_dark * dark_exposure_norm;

    return Math.max(1, Math.min(h, 3.0));
}

/**
 * Динамически рассчитывает скорости возврата (τ) на основе текущего состояния.
 * @param agent - Агент для расчёта
 * @returns Объект с актуальными значениями tau
 */
export function computeDynamicTimeConstants(agent: AgentState): { tau_energy: number, tau_stress: number, tau_will: number } {
    const behavioralParams = agent.behavioralParams;
    if (!behavioralParams) {
        // Fallback if params are not calculated yet
        return { tau_energy: 0.1, tau_stress: 0.1, tau_will: 0.05 };
    }

    // FIX: Using all available tau properties.
    let { energy: tau_energy, stress: tau_stress, will: tau_will } = behavioralParams.tau;

    // 1. Влияние недосыпа: замедляет ВСЕ процессы восстановления.
    const sleepPenaltyFactor = Math.exp(-0.1 * (agent.body.reserves.sleep_debt_h || 0));
    tau_energy *= sleepPenaltyFactor;
    tau_stress *= sleepPenaltyFactor;

    // 2. Влияние моральной травмы: замедляет восстановление от стресса.
    const moralInjuryPenalty = 1 - (agent.body.acute.moral_injury || 0) / 100;
    tau_stress *= moralInjuryPenalty;

    return { tau_energy, tau_stress, tau_will };
}


export function canPerformAction(agent: AgentState, action: Action): boolean {
    if (!action.tags?.includes('physical')) return true;
    const body = agent.body;
    if (body.acute.injuries_severity > 80) return false;
    // pain_tolerance is 0-1, pain_now is 0-100
    if (body.acute.pain_now > body.constitution.pain_tolerance * 100) return false;
    return true;
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

export const PhysioSystem = {
    /**
     * Updates the agent's core physiological states for one tick.
     * This represents the continuous internal processes of the body.
     */
    update: (agent: AgentState): void => {
        if (!agent.behavioralParams || !agent.rngChannels) {
            return; // Not ready for simulation
        }

        const dynamicTaus = computeDynamicTimeConstants(agent);
        const noiseAmplifier = computeNoiseAmplifier(agent);
        // Update the agent's processNoiseSigma for this tick
        agent.processNoiseSigma = agent.behavioralParams.sigma0 * noiseAmplifier;
        
        const agentRNG = agent.rngChannels.physio;

        // --- Internal Conflict Stress (Δ_self) & Self-Perception Update ---
        const { arch_true, arch_self } = agent.identity;
        let internalConflictStress = 0;
        if (arch_true && arch_self) {
            const delta_self = 1 - cosSim(arch_true, arch_self);
            const GAMMA = 0.5; // Sensitivity to self-discrepancy
            internalConflictStress = GAMMA * delta_self;

            // Update self-perception (λ_self) slowly towards objective reality (λ_true/λ_evidence)
            const BETA_SELF_UPDATE = 0.01; // "подвижность самоопределения"
            const evidence = arch_true; // For now, evidence is just the true profile
            agent.identity.arch_self = arch_self.map((s, i) => (1 - BETA_SELF_UPDATE) * s + BETA_SELF_UPDATE * (evidence[i] || 0));
            
            // Re-normalize self-perception vector
            const sum = agent.identity.arch_self.reduce((a, b) => a + b, 0);
            if (sum > 0) {
                agent.identity.arch_self = agent.identity.arch_self.map(v => v / sum);
            }
        }


        // Step forward the Ornstein-Uhlenbeck processes for internal states.
        
        // STRESS
        const stressSetpoint = 25 + internalConflictStress * 50; // Internal conflict raises baseline stress
        agent.body.acute.stress = clamp(stepOU(
            agent.body.acute.stress,
            stressSetpoint, 
            dynamicTaus.tau_stress,
            agent.processNoiseSigma * 100, // Scale sigma to the state's range (0-100)
            1.0, // dt
            agentRNG
        ), 0, 100);
        
        // FATIGUE
        agent.body.acute.fatigue = clamp(stepOU(
            agent.body.acute.fatigue,
            20, // Setpoint for fatigue
            dynamicTaus.tau_energy, // Using tau_energy as it's related to recovery
            agent.processNoiseSigma * 100,
            1.0,
            agentRNG
        ), 0, 100);
        
        // WILL
        if (agent.state) {
            agent.state.will = clamp(stepOU(
                agent.state.will,
                80, // Setpoint for willpower
                dynamicTaus.tau_will,
                agent.processNoiseSigma * 100,
                1.0,
                agentRNG
            ), 0, 100);
        }
    }
};
