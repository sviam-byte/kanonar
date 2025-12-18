
import { Biography, BiographicalEvent, StoryTime, VectorBase } from '../types'; // Changed to root types for consistency
import { LifeGoalId, LifeGoalVector } from './types-life';
import { TraitId } from './traits';

const LIFE_DECAY_LAMBDA = 0.0005; // Slow decay for life goals derived from bio

function timeDecay(age: number, lambda: number): number {
  if (age <= 0) return 1;
  return Math.exp(-lambda * age);
}

// Soft sigmoid to map raw accumulated bio-weight to 0..1
function sigmaLife(x: number): number {
  const k = 0.8;
  return 1 / (1 + Math.exp(-k * (x - 2))); // Shifted center
}

// Heuristic mapping for legacy events based on tags
const TAG_TO_LIFE_MAP: Record<string, Partial<Record<LifeGoalId, number>>> = {
    'betrayal': { maintain_bonds: -0.3, preserve_autonomy: 0.3, accumulate_resources: 0.1 },
    'achievement': { seek_status: 0.5, accumulate_resources: 0.2, serve_authority: 0.1 },
    'trauma': { seek_comfort: 0.4, protect_lives: 0.2, maintain_order: 0.1 },
    'oath': { maintain_order: 0.5, serve_authority: 0.4, pursue_truth: 0.2 },
    'care': { protect_lives: 0.5, maintain_bonds: 0.4, self_transcendence: 0.2 },
    'leadership': { maintain_order: 0.4, seek_status: 0.4, serve_authority: 0.3 },
    'loss': { maintain_bonds: 0.3, seek_comfort: 0.2 },
    'discovery': { pursue_truth: 0.6, preserve_autonomy: 0.2 },
    'conflict': { accumulate_resources: 0.2, preserve_autonomy: 0.3 },
    'service': { serve_authority: 0.6, maintain_order: 0.3 },
};

export function inferLifeGoalsFromBiography(
  biography: Biography,
  now: StoryTime,
): LifeGoalVector {
  const accum: Partial<Record<LifeGoalId, number>> = {};

  for (const ev of biography.events) {
    const age = Math.max(0, now - ev.time);
    const ageDays = age / (1000 * 60 * 60 * 24); 
    
    const decay = timeDecay(ageDays, LIFE_DECAY_LAMBDA);
    const sign = ev.valence === 0 ? 1 : ev.valence; 
    const baseWeight = ev.intensity * decay; 

    // 1. Use explicit weights if available
    if (ev.lifeGoalWeights) {
        for (const [gid, w] of Object.entries(ev.lifeGoalWeights)) {
            const g = gid as LifeGoalId;
            const contrib = baseWeight * Number(w ?? 0); // Ensure w is treated as number
            accum[g] = (accum[g] ?? 0) + contrib;
        }
        continue;
    }

    // 2. Fallback: Infer from tags
    if (ev.tags) {
        for (const tag of ev.tags) {
             const mapping = TAG_TO_LIFE_MAP[tag];
             if (mapping) {
                 for (const [gid, w] of Object.entries(mapping)) {
                     const g = gid as LifeGoalId;
                     // Valence modifier: positive events reinforce the goal, negative might reduce it 
                     // OR motivate it (redemption). 
                     // Simplification: Positive valence = +weight, Negative valence = complex (often +weight for compensation)
                     // For now, let's assume intensity drives importance regardless of valence, 
                     // but negative valence might flip specific goals if we had signed logic.
                     // Here we just accumulate "importance".
                     const contrib = baseWeight * (w ?? 0);
                     accum[g] = (accum[g] ?? 0) + contrib;
                 }
             }
        }
    }
  }

  const result: LifeGoalVector = {};
  for (const gid of Object.keys(accum) as LifeGoalId[]) {
    result[gid] = sigmaLife(accum[gid] ?? 0);
  }

  return result;
}

// Mapping Matrix: Traits -> Life Goals
// Which 44-vector traits predispose to which life goals?
const TRAIT_TO_LIFE_MAP: Record<TraitId, Partial<Record<LifeGoalId, number>>> = {
    care: { protect_lives: 0.8, maintain_bonds: 0.6, self_transcendence: 0.3 },
    harshness: { maintain_order: 0.5, accumulate_resources: 0.4, protect_lives: -0.3, seek_status: 0.3 },
    agency: { preserve_autonomy: 0.8, seek_status: 0.5, self_transcendence: 0.3, accumulate_resources: 0.3 },
    submission: { serve_authority: 0.9, maintain_order: 0.4, preserve_autonomy: -0.6, maintain_bonds: 0.2 },
    trust: { maintain_bonds: 0.7, serve_authority: 0.2 },
    paranoia: { accumulate_resources: 0.6, maintain_bonds: -0.4, preserve_autonomy: 0.4, seek_comfort: 0.3 },
    stability: { maintain_order: 0.8, seek_comfort: 0.5, serve_authority: 0.3 },
    novelty_seeking: { pursue_truth: 0.7, maintain_order: -0.3, self_transcendence: 0.2 }
};

export function inferLifeGoalsFromTraits(
    traitScores: Record<TraitId, number>
): LifeGoalVector {
    const raw: Partial<Record<LifeGoalId, number>> = {};
    
    for(const [trait, score] of Object.entries(traitScores)) {
        const map = TRAIT_TO_LIFE_MAP[trait as TraitId];
        if(!map) continue;
        
        for(const [goal, weight] of Object.entries(map)) {
            const g = goal as LifeGoalId;
            const w = weight ?? 0;
            // Score 0.5 is neutral.
            // Normalize score contribution: (score - 0.5) * 2 gives -1..1 range
            // If trait is high, it pushes goal. If low, it pulls.
            const impact = (score - 0.5) * 2 * w; 
            raw[g] = (raw[g] ?? 0) + impact;
        }
    }
    
    const result: LifeGoalVector = {};
    // Convert raw scores to 0..1
    for(const g of Object.keys(raw) as LifeGoalId[]) {
        // Sigmoid to map -X..+X to 0..1. 
        // Center around 0 (neutral).
        result[g] = 1 / (1 + Math.exp(-2 * (raw[g] ?? 0)));
    }
    
    return result;
}

export function mergeLifeGoals(
  g_explicit: LifeGoalVector | undefined,
  g_trait: LifeGoalVector | undefined,
  g_bio: LifeGoalVector | undefined,
  weights = { exp: 0.6, trait: 0.2, bio: 0.2 },
): LifeGoalVector {
  // Union of all keys
  const keys = new Set<LifeGoalId>([
      ...Object.keys(g_explicit || {}) as LifeGoalId[],
      ...Object.keys(g_trait || {}) as LifeGoalId[],
      ...Object.keys(g_bio || {}) as LifeGoalId[],
  ]);

  const merged: LifeGoalVector = {};

  for (const gid of keys) {
    const e = g_explicit?.[gid] ?? 0;
    const t = g_trait?.[gid] ?? 0;
    const b = g_bio?.[gid] ?? 0;

    // Weighted sum
    const val = weights.exp * e + weights.trait * t + weights.bio * b;
    if (val > 0.01) {
        merged[gid] = Math.min(1, Math.max(0, val));
    }
  }

  return merged;
}
