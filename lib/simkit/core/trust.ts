// lib/simkit/core/trust.ts
// Trust/compatibility gates for atom acceptance (v0..v1).

import type { SimWorld } from './types';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export type ThinkVec = number[];

// Read a think vector from common locations (character or facts).
export function getThinkVec(world: SimWorld, charId: string): ThinkVec | null {
  const c: any = world.characters?.[charId];
  const v = c?.mind?.vector ?? c?.thinkVector ?? (world.facts as any)?.[`thinkVec:${charId}`];
  if (!Array.isArray(v) || !v.length) return null;
  const xs = v.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
  return xs.length ? xs : null;
}

export function cosine(a: ThinkVec, b: ThinkVec): number {
  const n = Math.min(a.length, b.length);
  if (n <= 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!Number.isFinite(denom) || denom <= 1e-9) return 0;
  const v = dot / denom;
  return Math.max(-1, Math.min(1, v));
}

// Pull dyadic trust from world facts with a couple of known patterns.
export function getDyadTrust(world: SimWorld, fromId: string, toId: string): number {
  const facts: any = world.facts || {};
  const k1 = `rel:trust:${fromId}:${toId}`;
  const k2 = `rel:${fromId}:${toId}:trust`;
  const k3 = `tom:trust:${fromId}:${toId}`;
  const k4 = `dyad:${fromId}:${toId}:trust`;
  const v = Number(facts[k1]) ?? Number(facts[k2]) ?? Number(facts[k3]) ?? Number(facts[k4]);

  if (Number.isFinite(v)) return clamp01(v);

  // Fallback: relations matrix-like object.
  const rel = facts.relations?.[fromId]?.[toId];
  const vv = Number(rel?.trust ?? rel?.t ?? rel?.loyalty ?? rel?.l);
  if (Number.isFinite(vv)) return clamp01(vv);

  return 0.5;
}

export type AcceptanceDecision = {
  weight: number; // 0..1 multiplier
  status: 'accept' | 'quarantine' | 'reject';
  reasons: string[];
  trust: number;
  compat: number;
};

// Decide whether to accept, quarantine, or reject a received atom.
export function decideAcceptance(
  world: SimWorld,
  listenerId: string,
  speakerId: string,
  baseConfidence: number,
): AcceptanceDecision {
  const trust = getDyadTrust(world, listenerId, speakerId);

  const vL = getThinkVec(world, listenerId);
  const vS = getThinkVec(world, speakerId);
  const compat = vL && vS ? 0.5 + 0.5 * cosine(vL, vS) : 0.6; // map [-1..1] -> [0..1]

  // Observe boosts readiness to process information.
  const obsTick = (world.facts as any)?.[`observeBoost:${listenerId}`];
  const observeBoost = Number.isFinite(obsTick) && world.tickIndex === Number(obsTick) + 1 ? 0.15 : 0;

  // Stress gate: very stressed listener is more likely to quarantine.
  const stress = Number((world.characters as any)?.[listenerId]?.stress ?? 0);
  const stressPenalty = clamp01(stress) * 0.25;

  // Score in logit space.
  const x = -0.2 + 1.1 * trust + 0.65 * compat + 0.55 * clamp01(baseConfidence) + observeBoost - stressPenalty;
  const p = sigmoid(3.2 * (x - 0.5)); // sharpen near 0.5

  const reasons: string[] = [];
  if (trust < 0.35) reasons.push('trust_low');
  if (compat < 0.45) reasons.push('compat_low');
  if (stress > 0.7) reasons.push('stress_high');
  if (observeBoost > 0) reasons.push('observe_boost');

  if (p >= 0.62) {
    return { weight: clamp01(p), status: 'accept', reasons, trust, compat };
  }
  if (p >= 0.32) {
    return { weight: clamp01(p), status: 'quarantine', reasons: reasons.concat(['uncertain']), trust, compat };
  }
  return { weight: clamp01(p), status: 'reject', reasons: reasons.concat(['reject']), trust, compat };
}
