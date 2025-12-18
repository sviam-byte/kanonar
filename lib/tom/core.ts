
import { V42Metrics } from '../../types';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export interface ToMCoreInput {
    latents: Record<string, number>;
    v42: V42Metrics;
    params: {
        metacog: number; // G_Metacog_accuracy
        evidenceQuality: number; // evidence.evidence_quality
        obsNoise: number; // observation.noise
        reportNoise: number; // observation.report_noise
        darkExposure: number; // state.dark_exposure (0-1)
        modelCalibration: number; // E_Model_calibration
        memoryFidelity: number; // A_Memory_Fidelity
        networkCl: number; // CL latent
        infoHyg: number; // v42.InfoHyg
    };
    shocks?: {
        urgency: number;
        info: number;
    }
}

export interface ToMCoreOutput {
    Q: number;     // Quality of model (0-1)
    U: number;     // Uncertainty (0-1)
    depth: number; // Effective depth (0-1 scale, mapping to 1..4 steps)
    metaU: number; // Meta-uncertainty
}

export function computeToMCore(input: ToMCoreInput): ToMCoreOutput {
    const { latents, v42, params, shocks } = input;
    const ζ_info = shocks?.info ?? 0;
    const ζ_urg = shocks?.urgency ?? 0;

    // 1. Effective Depth (Capacity driven)
    // Driven by Working Memory, impacted by urgency
    const deadlinePenalty = ζ_urg * 0.3; 
    const depth = clamp01(0.2 + 0.6 * v42.WMcap_t - deadlinePenalty + 0.15 * params.metacog);

    // 2. Quality (Q) - Capability driven
    // CH (Causal Hygiene) is the main driver, reduced by noise and dark exposure
    const Q_logit = 3 * (
        0.35 * (latents.CH ?? 0.5) + 
        0.25 * params.metacog + 
        0.15 * params.evidenceQuality - 
        0.15 * params.obsNoise - 
        0.10 * params.reportNoise - 
        0.10 * params.darkExposure - 
        0.5
    );
    const Q = sigmoid(Q_logit);

    // 3. Meta-Uncertainty (MetaU) - Awareness of limits
    const MetaU_logit = 2.8 * (
        0.30 * params.obsNoise + 
        0.22 * params.reportNoise + 
        0.22 * (1 - params.modelCalibration) + 
        0.16 * (1 - params.memoryFidelity) - 
        0.20 * (latents.CH ?? 0.5) - 
        0.5
    );
    const metaU = sigmoid(MetaU_logit);

    // 4. Final Uncertainty (U)
    // Inverse of Quality + Meta-confusion + Shock
    const U_logit = 3 * (
        0.35 * metaU + 
        0.25 * (1 - Q) + 
        0.20 * ζ_info - 
        0.5
    );
    const U = sigmoid(U_logit);

    return { Q, U, depth, metaU };
}
