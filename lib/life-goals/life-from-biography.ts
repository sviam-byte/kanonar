
// lib/life-goals/life-from-biography.ts

import type { GoalAxisId, AgentPsychState, ExposureTraces, Worldview } from '../../types';
import { MATRIX_B_BIO, MATRIX_C_WV, GOAL_AXES, EXPOSURE_KEYS, WORLDVIEW_KEYS } from './v3-params';

/**
 * V3 Engine: Computes Goal Axis Logits (z_bio) directly from Exposures and Worldview.
 * This replaces the old tag-based summation and uses the trained/defined matrix B_Bio and C_Wv.
 * 
 * @param psych The full psychological state containing exposures and worldview.
 * @returns A record of logits for the 10 goal axes.
 */
export function computeBioLogitsV3(psych: AgentPsychState): Record<GoalAxisId, number> {
    const z_bio: Record<GoalAxisId, number> = {} as any;
    
    // Default to zero if inputs missing (e.g. fresh character)
    const E = psych.exposures || {} as ExposureTraces;
    const W = psych.worldview || {} as Worldview;

    // Bio scale affects how strongly past events push goals compared to innate traits
    const BIO_SCALE = 8.0; 

    for (const axis of GOAL_AXES) {
        let logit = 0;
        
        // Contribution from Exposures (Matrix B)
        const paramsB = MATRIX_B_BIO[axis];
        if (paramsB) {
            for (const key of EXPOSURE_KEYS) {
                const weight = paramsB[key];
                if (weight) {
                    const val = E[key] ?? 0;
                    // Logarithmic scaling for exposure to prevent huge values from overwhelming everything
                    // but preserving impact of strong trauma.
                    logit += weight * Math.log1p(val) * BIO_SCALE; 
                }
            }
        }

        // Contribution from Worldview (Matrix C)
        const paramsC = MATRIX_C_WV[axis];
        if (paramsC) {
            for (const key of WORLDVIEW_KEYS) {
                const weight = paramsC[key];
                if (weight) {
                    const val = W[key] ?? 0.5;
                    // Worldview is 0..1, we center at 0.5.
                    logit += weight * (val - 0.5) * BIO_SCALE;
                }
            }
        }
        
        z_bio[axis] = logit;
    }

    return z_bio;
}

// --- DEPRECATED: Legacy exports to prevent breakage during migration ---
export function computeBiographyLatentForGoals(events: any[]): any { return {}; }
export function inferLifeGoalsFromBiography(bio: any, now: any) { return {}; }
