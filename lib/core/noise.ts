// --- /lib/core/noise.ts ---

/**
 * Global run seed for the whole simulation session.
 * IMPORTANT: do not keep it as a const - it must be overrideable from UI/tests.
 */
let globalRunSeed: number = 12345;

export function getGlobalRunSeed(): number {
  return globalRunSeed >>> 0;
}

export function setGlobalRunSeed(seed: number | string): number {
  globalRunSeed = (typeof seed === 'string' ? hashString32(seed) : (seed >>> 0)) || 1;
  return globalRunSeed;
}

function hashString32(s: string): number {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
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
    // 2^32
    return this.next() / 4294967296;
  }

  // Normal(0,1) via Box-Muller
  nextGaussian(): number {
    const u1 = Math.max(1e-12, this.nextFloat());
    const u2 = Math.max(1e-12, this.nextFloat());
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// 2. Per-agent RNG channel factory (globalSeed ^ agentHash ^ channel)
export function makeAgentRNG(identityId: string, channel: number): RNG {
  const hash = hashString32(identityId);
  const baseSeed = (globalRunSeed ^ hash ^ (channel >>> 0)) >>> 0;
  return new RNG(baseSeed);
}

export function sampleGumbel(scale: number, rng: RNG): number {
  // Gumbel distribution is sampled by -log(-log(U)) where U is uniform(0,1)
  // Avoid u=0 or u=1 for log.
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
