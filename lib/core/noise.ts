// lib/core/noise.ts
// Seedable deterministic RNG utilities used across the sim.

/** Stable non-crypto hash -> 32-bit unsigned int (FNV-1a). */
function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

export const hashString32 = hash32;

let globalRunSeed: number = 12345;

/**
 * Set global seed for the run.
 * - number: used as is (uint32)
 * - string: hashed to uint32
 * Returns the normalized uint32 seed.
 */
export function setGlobalRunSeed(seed: number | string): number {
  const s = typeof seed === 'string' ? hash32(seed) : (Number(seed) >>> 0);
  globalRunSeed = (s >>> 0) || 1;
  return globalRunSeed;
}

export function getGlobalRunSeed(): number {
  return globalRunSeed;
}

// 1. Simple deterministic PRNG (xorshift32)
export class RNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = (seed >>> 0) || 1;
  }

  // xorshift32
  next(): number {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed;
  }

  // float in [0, 1)
  nextFloat(): number {
    // Divide by 2^32 to avoid returning 1.0
    return this.next() / 4294967296;
  }

  // Normal(0,1) via Box-Muller
  nextGaussian(): number {
    const u1 = Math.max(1e-12, this.nextFloat());
    const u2 = Math.max(1e-12, this.nextFloat());
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  choice<T>(arr: T[]): T {
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('Empty array');
    const idx = Math.floor(this.nextFloat() * arr.length);
    return arr[idx];
  }
}

// 2. Per-agent RNG channel factory (globalSeed ^ agentHash ^ channel)
export function makeAgentRNG(identityId: string, channel: number): RNG {
  const hash = hash32(String(identityId));
  const ch = (Number(channel) >>> 0) || 0;
  const baseSeed = (globalRunSeed ^ hash ^ ch) >>> 0;
  return new RNG(baseSeed || 1);
}

export function sampleGumbel(scale: number, rng: RNG): number {
  // Gumbel: -log(-log(U)), U~Uniform(0,1)
  const u = Math.max(1e-9, Math.min(1 - 1e-9, rng.nextFloat()));
  return scale * -Math.log(-Math.log(u));
}

/**
 * Derived RNG helper (deterministic fork).
 * Useful for UI rerolls / per-stage noise without mutating agent channels.
 */
export function makeDerivedRNG(salt: string, baseSeed?: number | string): RNG {
  const base = typeof baseSeed === 'string' ? hash32(baseSeed) : (Number(baseSeed ?? globalRunSeed) >>> 0);
  const mixed = hash32(`${base}:${String(salt)}`);
  const seed = ((base ^ mixed) >>> 0) || 1;
  return new RNG(seed);
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
  // Knuth
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.nextFloat();
  } while (p > L);
  return k - 1;
}
