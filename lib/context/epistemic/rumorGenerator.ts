
// lib/context/epistemic/rumorGenerator.ts
import { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';
import { clamp01 } from './perceptionProfile';
import { hash32, mulberry32 } from './deterministicRng';

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

// MVP: generates 1-2 belief distortions ("rumors") if uncertainty is high
// - belief:norm:surveillance (paranoid about observation)
// - belief:scene:hostility (paranoid about environment)
export function generateRumorBeliefs(input: {
  atomsAfterAxes: ContextAtom[];   // must contain ctx:uncertainty
  selfId: string;
  tick: number;
  seed: number;                   
}): ContextAtom[] {
  const u = clamp01(getMag(input.atomsAfterAxes, `ctx:uncertainty:${input.selfId}`, getMag(input.atomsAfterAxes, 'ctx:uncertainty', 0)));
  if (u < 0.4) return []; // Low uncertainty -> clear perception

  // Intensity of distortion (0..1)
  const strength = clamp01((u - 0.4) / 0.6); 

  const rng = mulberry32(hash32(`${input.seed}|${input.tick}|${input.selfId}`));
  const out: ContextAtom[] = [];

  // Probabilities based on strength
  const p1 = 0.35 + 0.45 * strength; // surveillance belief
  const p2 = 0.25 + 0.40 * strength; // hostility belief

  // 1) "I feel watched"
  if (rng() < p1) {
    const believed = clamp01(0.4 + 0.6 * strength + 0.2 * rng());
    out.push(normalizeAtom({
      id: `belief:norm:surveillance:${input.selfId}`,
      kind: 'tom_belief', // Using generic belief kind
      ns: 'obs',
      origin: 'belief',
      source: 'rumor',
      magnitude: believed,
      confidence: clamp01(0.35 + 0.55 * (1 - strength)), // Higher uncertainty = lower confidence in the delusion
      tags: ['belief', 'rumor', 'surveillance'],
      label: `rumor:surveillance≈${Math.round(believed * 100)}%`,
      trace: { usedAtomIds: [`ctx:uncertainty:${input.selfId}`], notes: ['generated from uncertainty'], parts: { uncertainty: u, strength, p: p1 } }
    } as any));
  }

  // 2) "The environment is hostile"
  if (rng() < p2) {
    const believed = clamp01(0.3 + 0.7 * strength + 0.2 * rng());
    out.push(normalizeAtom({
      id: `belief:scene:hostility:${input.selfId}`,
      kind: 'tom_belief',
      ns: 'obs',
      origin: 'belief',
      source: 'rumor',
      magnitude: believed,
      confidence: clamp01(0.35 + 0.55 * (1 - strength)),
      tags: ['belief', 'rumor', 'hostility'],
      label: `rumor:hostility≈${Math.round(believed * 100)}%`,
      trace: { usedAtomIds: [`ctx:uncertainty:${input.selfId}`], notes: ['generated from uncertainty'], parts: { uncertainty: u, strength, p: p2 } }
    } as any));
  }

  // Summary banner for UI
  if (out.length > 0) {
    out.push(normalizeAtom({
      id: `belief:banner:${input.selfId}`,
      kind: 'ctx_axis', // Or summary_banner if available in catalog
      ns: 'obs',
      origin: 'belief',
      source: 'rumor',
      magnitude: clamp01(strength),
      confidence: 1,
      tags: ['belief', 'banner', 'summary'],
      label: `rumors:${out.length - 0} u=${Math.round(u * 100)}%`,
      trace: { usedAtomIds: [`ctx:uncertainty:${input.selfId}`], notes: ['belief banner'], parts: { uncertainty: u, strength } }
    } as any));
  }

  return out;
}
