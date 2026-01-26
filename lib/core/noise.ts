// --- /lib/core/noise.ts ---

import { SeededRandom } from '../../src/utils/SeededRandom';

/**
 * Global run seed used to derive per-agent RNG channels.
 *
 * IMPORTANT:
 * - Must be set once per simulation run (before creating agents).
 * - If not set, we default to 1 (deterministic, but not very useful).
 */
let globalRunSeed: number | string = 1;

export function setGlobalRunSeed(seed: number | string): void {
  globalRunSeed = seed ?? 1;
}

export function getGlobalRunSeed(): number | string {
  return globalRunSeed;
}

/**
 * Deterministic RNG wrapper used by simulation systems.
 * Keeps the old API (next/nextFloat/nextGaussian).
 */
export class RNG {
  private r: SeededRandom;

  constructor(seed: number | string) {
    this.r = new SeededRandom(seed);
  }

  /** Returns uint32 (0..2^32-1). */
  next(): number {
    return this.r.nextUint32();
  }

  /** Returns float in [0, 1). */
  nextFloat(): number {
    return this.r.next();
  }

  /** Standard normal N(0, 1). */
  nextGaussian(): number {
    // Box–Muller
    const u1 = this.nextFloat() || 1e-10;
    const u2 = this.nextFloat() || 1e-10;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Gumbel(0, scale) noise. */
  nextGumbel(scale: number): number {
    return this.r.nextGumbel(scale);
  }
}

/**
 * Stable 32-bit hash for ids.
 */
function fnv1a32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

/**
 * Create a unique deterministic RNG channel for a given agent.
 *
 * Seed mixing = hash(agentId) XOR hash(globalRunSeed) XOR channel
 */
export function makeAgentRNG(identityId: string, channel: number): RNG {
  const idHash = fnv1a32(String(identityId || ''));
  const runHash = fnv1a32(String(globalRunSeed));
  const baseSeed = (idHash ^ runHash ^ (channel >>> 0)) >>> 0;
  return new RNG(baseSeed || 1);
}

export function sampleGumbel(scale: number, rng: RNG): number {
  // Gumbel distribution is sampled by -log(-log(U)), where U ~ Uniform(0,1)
  const u = Math.max(1e-9, Math.min(1 - 1e-9, rng.nextFloat()));
  return scale * -Math.log(-Math.log(u));
}

/**
 * Ornstein–Uhlenbeck step.
 */
export function stepOU(
  currentValue: number,
  setpoint: number,
  tau: number,
  sigma: number,
  dt: number,
  rng: RNG
): number {
  const drift = tau * (setpoint - currentValue) * dt;
  const diffusion = sigma * Math.sqrt(dt) * rng.nextGaussian();
  return currentValue + drift + diffusion;
}

export function samplePoisson(lambda: number, rng: RNG): number {
  // Knuth's algorithm
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.nextFloat();
  } while (p > L);
  return k - 1;
}
