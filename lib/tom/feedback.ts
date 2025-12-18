
// lib/tom/feedback.ts
import { ToMV2DashboardMetrics } from '../../types';
import { getNestedValue } from '../param-utils';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * Applies feedback from ToM metrics to the character's own latents.
 * This function implements the AR(1) update rule from the spec.
 * @param latents - The current latent values.
 * @param tom - The calculated ToM v2 metrics for the character.
 * @returns The updated latent values.
 */
export function applyToMFeedback(
    latents: Record<string, number>,
    tom: ToMV2DashboardMetrics
): Record<string, number> {
    const updatedLatents = { ...latents };
    const alpha = 0.9; // AR(1) memory factor, context-dependent in full model

    // CH↑ при IRL_Fit_j↑ и DetectPower_i↑; CH↓ при DecepIncentive_j↑ и P_det низком.
    let ch_target = latents.CH;
    ch_target += 0.1 * tom.irl_fit;
    ch_target += 0.1 * tom.detect_power;
    ch_target -= 0.15 * tom.decep_incentive * (1 - tom.detect_power);
    updatedLatents.CH = alpha * latents.CH + (1 - alpha) * clamp01(ch_target);

    // SD↑ при CredCommit_j↑, NormConflict↓.
    let sd_target = latents.SD;
    sd_target += 0.15 * tom.cred_commit;
    sd_target -= 0.1 * tom.norm_conflict;
    updatedLatents.SD = alpha * latents.SD + (1 - alpha) * clamp01(sd_target);

    // RP↑ при ζ_urg↑ и β_j низком; RP↓ при Trust_{ij}↑.
    let rp_target = latents.RP;
    updatedLatents.RP = alpha * latents.RP + (1 - alpha) * clamp01(rp_target);

    // SO↑ при ToM_InfoGainRate↑ и Identifiability_j↑.
    let so_target = latents.SO;
    so_target += 0.1 * tom.tom_info_gain_rate;
    so_target += 0.1 * tom.identifiability;
    updatedLatents.SO = alpha * latents.SO + (1 - alpha) * clamp01(so_target);

    // EW↑ при Integrity_j↑.
    let ew_target = latents.EW;
    updatedLatents.EW = alpha * latents.EW + (1 - alpha) * clamp01(ew_target);

    // CL↑ при coalition_loyalty↑, Pivotality_i↑.
    let cl_target = latents.CL;
    cl_target += 0.1 * tom.coalition_cohesion; 
    cl_target += 0.05 * tom.pivotality;
    updatedLatents.CL = alpha * latents.CL + (1 - alpha) * clamp01(cl_target);

    return updatedLatents;
}

/**
 * Applies feedback based on prediction error of another agent's behavior.
 * @param latents Current latents
 * @param error Prediction error (-1 to 1, where >0 means they were more trustworthy than expected)
 */
export function applyToMErrorFeedback(
    latents: Record<string, number>,
    error: number
): Record<string, number> {
    const updatedLatents = { ...latents };
    const absError = Math.abs(error);
    
    // Error magnitude increases CH (need better models)
    // If error is negative (they betrayed us unexpectedly), increase RP (Paranoia) and SD (Strictness)
    // If error is positive (they helped unexpectedly), increase CL (Network trust)

    const k1 = 0.05;
    const k2 = 0.05;
    const k3 = 0.05;

    updatedLatents.CH = clamp01((updatedLatents.CH ?? 0.5) + k1 * absError);
    
    if (error < 0) {
        // Negative surprise (betrayal/fail)
        updatedLatents.RP = clamp01((updatedLatents.RP ?? 0.5) + k2 * absError);
        updatedLatents.SD = clamp01((updatedLatents.SD ?? 0.5) + k2 * absError);
        updatedLatents.CL = clamp01((updatedLatents.CL ?? 0.5) - k3 * absError);
    } else {
        // Positive surprise (help)
        updatedLatents.CL = clamp01((updatedLatents.CL ?? 0.5) + k2 * absError);
        updatedLatents.RP = clamp01((updatedLatents.RP ?? 0.5) - k3 * absError);
    }

    return updatedLatents;
}
