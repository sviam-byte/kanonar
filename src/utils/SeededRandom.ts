// src/utils/SeededRandom.ts

/**
 * Deterministic PRNG (Mulberry32) with optional string seed hashing.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number | string) {
    if (typeof seed === 'string') {
      // FNV-1a 32-bit hash
      let h = 2166136261;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      this.state = h >>> 0;
    } else {
      this.state = (seed >>> 0) || 1;
    }
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Deterministic choice from array. */
  choice<T>(array: T[]): T {
    if (!array.length) throw new Error('Empty array');
    const index = Math.floor(this.next() * array.length);
    return array[index];
  }

  /**
   * Gumbel noise for Gumbel-Max / Gumbel-Softmax sampling.
   * temperature: 0.1 = almost deterministic, 1.0 = human-ish, 5.0 = chaos.
   */
  nextGumbel(temperature: number = 1.0): number {
    const u = Math.max(1e-12, this.next());
    return -Math.log(-Math.log(u)) * temperature;
  }
}
