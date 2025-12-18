import { AgentPsychState, GoalAxisId, DistortionProfile } from '../../types';
import { GOAL_AXES, MATRIX_K_DIST } from './v3-params';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function makeZeroGoalLogits(): Record<GoalAxisId, number> {
    const z: Record<GoalAxisId, number> = {} as any;
    for (const axis of GOAL_AXES) z[axis] = 0;
    return z;
}

// RESCALED: Reduced from 20.0 to 1.5 to match Traits/Bio scale (~ [-2, 2])
const PSYCH_SCALE = 1.5; 

export function computeDistortionLogits(D: DistortionProfile): Record<GoalAxisId, number> {
    const z = makeZeroGoalLogits();
    if (!D) return z;

    for (const axis of GOAL_AXES) {
        const paramsK = MATRIX_K_DIST[axis];
        if (paramsK) {
            for (const key of Object.keys(paramsK) as (keyof DistortionProfile)[]) {
                const weight = paramsK[key];
                if (weight) {
                    const val = D[key] ?? 0;
                    z[axis] += weight * val * PSYCH_SCALE;
                }
            }
        }
    }
    return z;
}

export function buildPsychGoalLogitsFromPsychLayer(ps: AgentPsychState): Record<GoalAxisId, number> {
    const z = makeZeroGoalLogits();
    
    const c = ps.coping || { avoid: 0, hyperControl: 0, aggression: 0, selfHarm: 0, helper: 0 };
    const a = ps.attachment || { secure: 0, anxious: 0, avoidant: 0, disorganized: 0 };
    const w = ps.worldview || { world_benevolence: 0.5, people_trust: 0.5, system_legitimacy: 0.5, predictability: 0.5, controllability: 0.5, fairness: 0.5, scarcity: 0.5, meaning_coherence: 0.5 };
    const trauma = ps.trauma || { self: 0, others: 0, world: 0, system: 0 };
    const moral = ps.moral;
    
    const md = clamp01(ps.moral?.valueBehaviorGapTotal ?? 0);

    // 1. Coping Styles
    // Helper -> Care
    z.care += 0.8 * c.helper * PSYCH_SCALE;
    z.preserve_order += 0.2 * c.helper * PSYCH_SCALE;
    
    // Aggression -> Power/Control
    z.power_status += 0.6 * c.aggression * PSYCH_SCALE;
    z.control += 0.5 * c.aggression * PSYCH_SCALE;
    
    // Avoidance -> Escape
    z.escape_transcend += 0.8 * c.avoid * PSYCH_SCALE;
    z.free_flow += 0.4 * c.avoid * PSYCH_SCALE;
    z.control -= 0.4 * c.avoid * PSYCH_SCALE;
    
    // HyperControl -> Rigid Order
    z.control += 1.0 * c.hyperControl * PSYCH_SCALE;
    z.preserve_order += 0.8 * c.hyperControl * PSYCH_SCALE;
    z.free_flow -= 0.8 * c.hyperControl * PSYCH_SCALE;
    
    // SelfHarm -> Chaos
    z.escape_transcend += 0.6 * c.selfHarm * PSYCH_SCALE;
    z.chaos_change += 0.6 * c.selfHarm * PSYCH_SCALE;

    // 2. Attachment
    z.care += 0.4 * a.secure * PSYCH_SCALE;
    
    // Anxious -> Control/Status
    z.care += 0.5 * a.anxious * PSYCH_SCALE;
    z.power_status += 0.3 * a.anxious * PSYCH_SCALE; 
    z.control += 0.4 * a.anxious * PSYCH_SCALE;
    
    // Avoidant -> Freedom
    z.free_flow += 0.6 * a.avoidant * PSYCH_SCALE;
    z.care -= 0.4 * a.avoidant * PSYCH_SCALE;
    
    // 4. Worldview Direct Effects
    z.control += 0.5 * (1 - w.people_trust) * PSYCH_SCALE;
    z.care -= 0.4 * (1 - w.people_trust) * PSYCH_SCALE;
    
    z.efficiency += 0.6 * w.scarcity * PSYCH_SCALE;
    z.control += 0.5 * w.scarcity * PSYCH_SCALE;
    
    z.escape_transcend += 0.4 * (1 - w.controllability) * PSYCH_SCALE;
    
    // 5. Moral Dissonance (General)
    z.fix_world += 0.6 * md * PSYCH_SCALE;
    if (md > 0.6) {
        z.escape_transcend += 0.6 * (md - 0.6) / 0.4 * PSYCH_SCALE;
    }
    
    // 6. Trauma Load
    // Self -> Helplessness -> Escape
    z.escape_transcend += 1.0 * (trauma.self ?? 0) * PSYCH_SCALE;
    
    // Others -> Betrayal -> Power/Defense
    z.power_status += 0.8 * (trauma.others ?? 0) * PSYCH_SCALE;
    z.care -= 0.6 * (trauma.others ?? 0) * PSYCH_SCALE;

    // World -> Chaos -> Order
    z.preserve_order += 0.8 * (trauma.world ?? 0) * PSYCH_SCALE;
    z.efficiency += 0.6 * (trauma.world ?? 0) * PSYCH_SCALE;

    // System -> Injustice -> Rebellion
    z.free_flow += 0.8 * (trauma.system ?? 0) * PSYCH_SCALE;
    z.chaos_change += 0.6 * (trauma.system ?? 0) * PSYCH_SCALE;
    z.preserve_order -= 0.6 * (trauma.system ?? 0) * PSYCH_SCALE;

    // 7. Moral Dissonance (Specifics)
    const guilt = moral?.guilt ?? 0;
    const shame = moral?.shame ?? 0;
    
    // Guilt -> Atonement
    z.fix_world += 1.0 * guilt * PSYCH_SCALE;
    z.care += 0.8 * guilt * PSYCH_SCALE;
    
    // Shame -> Hide/Compensate
    z.power_status += 0.8 * shame * PSYCH_SCALE;
    z.preserve_order += 0.6 * shame * PSYCH_SCALE;
    
    return z;
}