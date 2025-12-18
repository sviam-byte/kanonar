
// lib/life-goals/life-engine.ts
import { AgentPsychState, ExposureTraces, Worldview, DistortionProfile, GoalAxisId, LifeGoalVector, LifeGoalComponents, V42Metrics, CharacterEntity, VectorBase } from '../../types';
import { MATRIX_B_BIO, MATRIX_C_WV, MATRIX_K_DIST, GOAL_AXES, EXPOSURE_KEYS, WORLDVIEW_KEYS } from './v3-params';
import { buildPsychGoalLogitsFromPsychLayer, makeZeroGoalLogits, computeDistortionLogits } from './psych-to-goals';
import { LifeGoalId } from './types-life';
import { computeBioLogitsV3 } from './life-from-biography';

// Type aliases
export type GoalLogits = Record<GoalAxisId, number>;
export type ArchetypePack = { main: GoalLogits, shadow: GoalLogits };

// --- Helper Functions ---

function entropy(E: ExposureTraces): number {
    let sum = 0;
    let sqSum = 0;
    for(const k of EXPOSURE_KEYS) {
        const v = E[k];
        sum += v;
        sqSum += v*v;
    }
    if(sum <= 0.001) return 0;
    return 1 - (sqSum / (sum*sum));
}

function computeAggregatedDistortion(D: DistortionProfile): number {
    if (!D) return 0;
    const keys = Object.keys(D) as (keyof DistortionProfile)[];
    if (keys.length === 0) return 0;
    const sum = keys.reduce((acc, k) => acc + (D[k] || 0), 0);
    return sum / keys.length;
}

function computeAggregatedMoral(moral: any): number {
    if (!moral) return 0;
    return (moral.guilt ?? 0) * 0.6 + (moral.shame ?? 0) * 0.4;
}

// Robust Z-Score Normalization
// Centers values around 0 and scales by std dev to prevent one layer dominating via raw magnitude
function normalizeLogits(logits: Record<GoalAxisId, number>): Record<GoalAxisId, number> {
    const values = Object.values(logits);
    if (values.length === 0) return logits;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    const out: Record<GoalAxisId, number> = {} as any;
    // If flat distribution (stdDev ~ 0), keep as 0
    if (stdDev < 1e-6) {
        for (const k of GOAL_AXES) out[k] = 0;
        return out;
    }

    for (const k of GOAL_AXES) {
        out[k] = (logits[k] - mean) / stdDev;
    }
    return out;
}

export function computeTemperatureV3(ps: AgentPsychState, vector_base: VectorBase | undefined): number {
    const S = (ps as any).Stress ? (ps as any).Stress / 100 : 0;
    
    // Get character's base decision temperature from vector_base. It's a value from 0 to 1.
    // 0 = cold calculation, 1 = impulsive.
    // We want to map this to a base temperature range.
    const baseDecisionTemp = vector_base?.B_decision_temperature ?? 0.5;
    
    // Higher B_decision_temperature means higher goal selection temperature (more randomness).
    // An average character (0.5) will have a base temp of 1.2.
    const baseTemp = 0.8 + (baseDecisionTemp * 0.8); 

    // High stress -> lower temp (tunnel vision, more deterministic goal)
    const stressFactor = 1 - 0.6 * S;

    return Math.max(0.3, baseTemp * stressFactor); 
}

// Simple hash for deterministic noise
function hash32(str: string): number {
    let hash = 5381;
    let i = str.length;
    while(i) {
      hash = (hash * 33) ^ str.charCodeAt(--i);
    }
    return hash >>> 0;
}

// Final Mapping: Goal Axes (10) -> Life Goals (Specific List)
export function mapAxesToLifeGoals(logits: GoalLogits, temp: number): LifeGoalVector {
    const out: LifeGoalVector = {};
    
    // Weighted mapping from Axes to Specific Life Goals
    const mapping: Record<GoalAxisId, Partial<Record<LifeGoalId, number>>> = {
        care: { protect_lives: 2.0, maintain_bonds: 1.5, seek_status: -0.5 },
        control: { maintain_order: 1.5, accumulate_resources: 1.0, preserve_autonomy: -0.5 },
        power_status: { seek_status: 2.0, serve_authority: 0.5, protect_lives: -0.3 },
        truth: { pursue_truth: 2.0, seek_comfort: -0.5 },
        free_flow: { preserve_autonomy: 2.0, maintain_order: -1.0 },
        preserve_order: { maintain_order: 1.5, serve_authority: 1.5, preserve_autonomy: -0.5 },
        efficiency: { accumulate_resources: 1.5, maintain_order: 0.5 },
        chaos_change: { preserve_autonomy: 1.0, self_transcendence: 1.0, maintain_order: -1.5 },
        fix_world: { protect_lives: 1.0, maintain_order: 0.5, seek_status: 0.5 },
        escape_transcend: { seek_comfort: 1.5, self_transcendence: 1.5, maintain_bonds: -0.5 }
    };

    const lifeGoalScores: Record<string, number> = {};
    
    for (const axis of GOAL_AXES) {
        const val = logits[axis];
        const targets = mapping[axis];
        if (targets) {
            for (const [gid, weight] of Object.entries(targets)) {
                lifeGoalScores[gid] = (lifeGoalScores[gid] || 0) + val * (weight || 0);
            }
        }
    }
    
    const goalKeys = Object.keys(lifeGoalScores) as LifeGoalId[];
    if (goalKeys.length === 0) return {};

    // Softmax with temperature
    const maxScore = Math.max(...Object.values(lifeGoalScores));
    let sumExp = 0;
    const expScores: Record<string, number> = {};

    for(const gid of goalKeys) {
        const score = lifeGoalScores[gid];
        const ex = Math.exp((score - maxScore) / temp); 
        expScores[gid] = ex;
        sumExp += ex;
    }

    for(const gid of goalKeys) {
        out[gid] = expScores[gid] / sumExp;
    }

    return out;
}


// --- Main Engine Function ---

export function computeLifeGoalsLogits(
  character: CharacterEntity,
  z_traits: GoalLogits,
  z_bio_legacy: GoalLogits, 
  z_psych_legacy: GoalLogits, 
  arche: ArchetypePack,
  ps: AgentPsychState,
  entityId?: string 
): { finalVector: LifeGoalVector; debug: LifeGoalComponents } {
    
  // 1. Extract State Variables
  const Stress = (ps as any).v42metrics?.V_t < 0.3 ? 0.8 : ((ps as any).body?.acute?.stress ?? 0) / 100;
  const Recovery = (ps as any).v42metrics?.Recovery_t ?? 0.5;
  const WMcap = (ps as any).v42metrics?.WMcap_t ?? 0.5;

  const E_traces = ps.exposures || {} as ExposureTraces;
  const W_view = ps.worldview || {} as Worldview;
  const D_prof = ps.distortion || {} as DistortionProfile;
  const m_moral = ps.moral || { valueBehaviorGapTotal: 0 } as any; 
  
  // 2. Compute Layers
  const normTraits = z_traits; // Already scaled
  
  const z_bio = computeBioLogitsV3(ps);
  const normBio = z_bio;
  
  const z_psych = buildPsychGoalLogitsFromPsychLayer(ps);
  const z_distortion = computeDistortionLogits(D_prof);
  // Combine Psych + Distortion before norm
  const z_psych_combined = makeZeroGoalLogits();
  for(const k of GOAL_AXES) z_psych_combined[k] = z_psych[k] + z_distortion[k];
  const normPsych = z_psych_combined;
  
  // 3. Dynamic Weighting
  // wT: Traits (Nature)
  // wB: Bio (Nurture)
  // wP: Psych (State)
  
  // Under high Stress/Low Recovery -> Psych layer dominates (survival mode)
  // Under high WMcap/Recovery -> Traits/Bio dominate (stable personality)
  
  const wP = 0.8 + 2.0 * Stress + 0.5 * (1 - Recovery);
  const wT = 1.8 * (1 - 0.6 * Stress) * (0.5 + 0.5 * WMcap);
  const wB = 1.8 * (1 - 0.2 * Stress);

  // Archetype Weight
  const wA = 2.0; // Archetype has strong structural influence
  const wShadow = Math.max(ps.shadowActivation ?? 0, (ps.shame ?? 0) * 0.8);
  const wMain = 1.0 - wShadow;

  // 4. Mix Layers
  const z_total = makeZeroGoalLogits();
  
  // Mix Archetype Logits
  const zA_mix = makeZeroGoalLogits();
  for (const axis of GOAL_AXES) {
      zA_mix[axis] = ((arche.main[axis] || 0) * wMain + (arche.shadow[axis] || 0) * wShadow);
  }
  const normArch = zA_mix;

  // Deterministic Noise
  const z_noise = makeZeroGoalLogits();
  if (entityId) {
      const seed = hash32(entityId);
      for (const axis of GOAL_AXES) {
          const axisStr = axis as string;
          const axisSeed = seed + axisStr.length;
          const rand = ((axisSeed * 9301 + 49297) % 233280) / 233280;
          z_noise[axis] = (rand - 0.5) * 0.5; // Small noise
      }
  }

  for (const axis of GOAL_AXES) {
      z_total[axis] = 
          wT * normTraits[axis] + 
          wB * normBio[axis] +
          wP * normPsych[axis] +
          wA * normArch[axis] +
          z_noise[axis];
  }

  // --- NEW: Z-SCORE NORMALIZATION ---
  const z_normalized = normalizeLogits(z_total);

  // 5. Map to Life Goals
  const T_final = computeTemperatureV3(ps, character.vector_base);
  const finalVector = mapAxesToLifeGoals(z_normalized, T_final);
  
  const z_worldview = computeBioLogitsV3({ ...ps, exposures: {} as any }); 

  return {
      finalVector,
      debug: {
          g_traits: normTraits,
          g_bio: normBio,
          g_psych: normPsych, // Display normalized combined psych
          g_archetype_main: arche.main,
          g_archetype_shadow: arche.shadow,
          g_worldview: z_worldview,
          g_distortion: z_distortion, // Raw distortion for drill-down
          weights: { wT, wB, wP },
          temperature: T_final,
          worldview: W_view,
          exposureTraces: E_traces,
          psych_details: { S: Stress, D: computeAggregatedDistortion(D_prof), H: wShadow, M: computeAggregatedMoral(m_moral), P: 0 },
          distortions: D_prof
      }
  };
}

// --- DEPRECATED ---
export function computeBiographyLatentForGoals(events: any[]): any { return {}; }
export function inferLifeGoalsFromBiography(bio: any, now: any) { return {}; }
