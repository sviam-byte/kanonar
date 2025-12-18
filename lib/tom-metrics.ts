
import { EntityParams, ToMDashboardMetrics, V42Metrics, ToMV2DashboardMetrics } from '../types';
import { computeToMCore } from './tom/core';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const getParam = (p: EntityParams, key: string, defaultValue: number = 0.5): number => p[key] ?? defaultValue;

export function calculateToMMetrics(
    p: EntityParams,
    latents: Record<string, number>,
    v42: V42Metrics,
    tomV2Metrics: ToMV2DashboardMetrics | null
): ToMDashboardMetrics {
    
    // Prepare input for Core
    const coreInput = {
        latents,
        v42,
        params: {
            metacog: getParam(p, 'vector_base.G_Metacog_accuracy'),
            evidenceQuality: getParam(p, 'evidence.evidence_quality'),
            obsNoise: getParam(p, 'observation.noise'),
            reportNoise: getParam(p, 'observation.report_noise'),
            darkExposure: getParam(p, 'state.dark_exposure', 0) / 100,
            modelCalibration: getParam(p, 'vector_base.E_Model_calibration'),
            memoryFidelity: getParam(p, 'vector_base.A_Memory_Fidelity'),
            networkCl: latents.CL ?? 0.5,
            infoHyg: v42.InfoHyg_t,
        },
        shocks: { urgency: 0, info: 0 } // Static analysis assumes no shock
    };

    const { Q, U, depth } = computeToMCore(coreInput);

    // --- Delegation Rate ---
    // Derived logic remains specific to dashboard/decision making
    const Anchors = sigmoid(2.6 * (0.45 * getParam(p, 'vector_base.G_Self_concept_strength') + 0.30 * getParam(p, 'vector_base.G_Identity_rigidity') + 0.15 * getParam(p, 'vector_base.B_goal_coherence')));
    const Mandate = clamp01(0.6 * getParam(p, 'Authority') + 0.25 * getParam(p, 'chain_of_command') + 0.15 * getParam(p, 'Clearance'));
    
    // Metrics used for delegation logic
    const Urgency = sigmoid(2.4 * (0.5 * v42.ExhaustRisk_t + 0.5 * v42.TailRisk_t - 0.5));
    const Irrev = clamp01(v42.Rmargin_t);
    const TrustEnv = sigmoid(2.8 * (0.35 * v42.InfoHyg_t + 0.25 * coreInput.params.evidenceQuality + 0.20 * latents.CL - 0.20 * coreInput.params.darkExposure - 0.5));

    const BaseDel = sigmoid(3.2 * (
        0.30 * (1 - v42.Agency_t) + 0.18 * (1 - v42.WMcap_t) + 0.15 * (1 - Irrev)
        + 0.12 * v42.DriveU_t + 0.10 * (0.5 * v42.ExhaustRisk_t + 0.5 * getParam(p, 'vector_base.D_HPA_reactivity')) + 0.08 * getParam(p, 'vector_base.B_decision_temperature')
        + 0.07 * v42.Habit_t - 0.10 * latents.SD + 0.20 * Urgency - 0.5
    ));
    
    const ToM_gain = sigmoid(3 * (0.6 * Q - 0.4 * U - 0.5));
    const DelRate_base = clamp01(BaseDel * (0.8 + 0.4 * ToM_gain) * (1 - 0.5 * Anchors) + 0.25 * Mandate + 0.25 * TrustEnv);

    let DelRate_star = DelRate_base;
    if (tomV2Metrics) {
        const { identifiability, cred_commit } = tomV2Metrics;
        const DecepRisk_net = tomV2Metrics.decep_incentive * (1 - tomV2Metrics.detect_power);
        DelRate_star = DelRate_base * (1 + 0.25 * identifiability + 0.20 * cred_commit - 0.20 * DecepRisk_net);
    }

    return {
        delegability: clamp01(DelRate_star),
        toM_DepthEff: depth,
        toM_Quality: Q,
        toM_Unc: U,
    };
}
