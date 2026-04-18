// lib/mafia/helpers.ts
//
// Utility: seeded RNG, trait reader, math.

import type { AgentState, WorldState } from '../../types';

// ═══════════════════════════════════════════════════════════════
// Math
// ═══════════════════════════════════════════════════════════════

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

// ═══════════════════════════════════════════════════════════════
// Deterministic xorshift32 RNG
// ═══════════════════════════════════════════════════════════════

export type RngState = { s: number };

export function makeRng(seed: number): RngState {
  // ensure non-zero state
  const s = (seed | 0) || 0x9e3779b1;
  return { s };
}

export function nextUint(rng: RngState): number {
  let x = rng.s | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  rng.s = x | 0;
  return (x >>> 0);
}

export function nextFloat(rng: RngState): number {
  return nextUint(rng) / 0x100000000;
}

export function pickOne<T>(rng: RngState, arr: readonly T[]): T {
  return arr[Math.floor(nextFloat(rng) * arr.length)];
}

export function shuffle<T>(rng: RngState, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(rng) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Softmax-sample from {id: score} with temperature. Returns chosen id. */
export function sampleSoftmax(
  rng: RngState,
  scores: Record<string, number>,
  temperature: number
): string {
  const keys = Object.keys(scores);
  if (keys.length === 0) throw new Error('sampleSoftmax: empty');
  if (keys.length === 1) return keys[0];

  const T = Math.max(1e-4, temperature);
  const vals = keys.map(k => scores[k]);
  const maxV = Math.max(...vals);
  const exps = vals.map(v => Math.exp((v - maxV) / T));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(e => e / sum);

  const r = nextFloat(rng);
  let acc = 0;
  for (let i = 0; i < keys.length; i++) {
    acc += probs[i];
    if (r < acc) return keys[i];
  }
  return keys[keys.length - 1];
}

/** Argmax with deterministic tie-break (first wins). */
export function argmax(scores: Record<string, number>): string {
  const keys = Object.keys(scores);
  if (keys.length === 0) throw new Error('argmax: empty');
  let best = keys[0];
  let bestV = scores[best];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (scores[k] > bestV) { best = k; bestV = scores[k]; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════
// Agent trait reader
// ═══════════════════════════════════════════════════════════════

/** Read vector_base value with fallback. Always clamped to [0,1]. */
export function vb(agent: AgentState, key: string, fb = 0.5): number {
  const val = Number((agent as any)?.vector_base?.[key]);
  return Number.isFinite(val) ? clamp01(val) : fb;
}

/** Find agent in world by id. */
export function findAgent(world: WorldState, id: string): AgentState | null {
  const agents = (world as any).agents ?? [];
  for (const a of agents) {
    if (a.entityId === id || a.id === id) return a;
  }
  return null;
}

/** Clone only the agents we need for this game. */
export function cloneAgents(
  world: WorldState,
  playerIds: readonly string[]
): Record<string, AgentState> {
  const result: Record<string, AgentState> = {};
  for (const id of playerIds) {
    const a = findAgent(world, id);
    if (a) result[id] = JSON.parse(JSON.stringify(a));
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Relationship / ToM access
// ═══════════════════════════════════════════════════════════════

export type RelSnapshot = {
  trust: number;
  bond: number;
  conflict: number;
  align: number;
  respect: number;
  fear: number;
  familiarity: number;
};

export function readRel(agent: AgentState, otherId: string): RelSnapshot {
  const rel = (agent as any).relationships?.[otherId] ?? {};
  return {
    trust: clamp01(Number(rel.trust ?? 0.5)),
    bond: clamp01(Number(rel.bond ?? 0.3)),
    conflict: clamp01(Number(rel.conflict ?? 0)),
    align: clamp01(Number(rel.align ?? 0.5)),
    respect: clamp01(Number(rel.respect ?? 0.5)),
    fear: clamp01(Number(rel.fear ?? 0)),
    familiarity: clamp01(Number(rel.familiarity ?? 0.3)),
  };
}

export type TomSnapshot = {
  trust: number;
  competence: number;
  reliability: number;
  dominance: number;
  uncertainty: number;
  vulnerability: number;
};

export function readTom(
  agent: AgentState,
  selfId: string,
  otherId: string
): TomSnapshot {
  const tomState = (agent as any).tom;
  const entry = tomState?.[selfId]?.[otherId]
    ?? tomState?.views?.[selfId]?.[otherId]
    ?? null;
  const t = entry?.traits ?? {};
  return {
    trust: clamp01(Number(t.trust ?? 0.5)),
    competence: clamp01(Number(t.competence ?? 0.5)),
    reliability: clamp01(Number(t.reliability ?? 0.5)),
    dominance: clamp01(Number(t.dominance ?? 0.5)),
    uncertainty: clamp01(Number(t.uncertainty ?? 0.5)),
    vulnerability: clamp01(Number(t.vulnerability ?? 0.5)),
  };
}
