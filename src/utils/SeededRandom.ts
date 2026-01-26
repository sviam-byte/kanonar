/**
 * Deterministic seeded PRNG (Mulberry32) + helpers.
 *
 * Why:
 * - Math.random() is not seedable.
 * - We need reproducible simulation runs & debuggable stochastic decisions.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number | string) {
    this.state = SeededRandom.seedToUint32(seed);
  }

  /** Convert seed to unsigned 32-bit integer. */
  static seedToUint32(seed: number | string): number {
    if (typeof seed === 'number') {
      // Keep only 32 bits.
      return (seed >>> 0) || 1;
    }

    // FNV-1a 32-bit hash for strings
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) || 1;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    // Mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const out = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return out;
  }

  /** Uniform uint32 in [0, 2^32-1]. */
  nextUint32(): number {
    return (this.next() * 4294967296) >>> 0;
  }

  /** Choose one element from a non-empty array. */
  choice<T>(array: T[]): T {
    if (!array.length) throw new Error('Empty array');
    const index = Math.floor(this.next() * array.length);
    return array[index];
  }

  /**
   * Gumbel(0, temperature) noise for Gumbel-Max trick.
   *
   * temperature:
   *  - 0.1: almost argmax
   *  - 1.0: human-ish
   *  - 5.0: chaos
   */
  nextGumbel(temperature: number = 1.0): number {
    // Sample via -ln(-ln(U)) * T
    const u = Math.max(1e-9, Math.min(1 - 1e-9, this.next()));
    return -Math.log(-Math.log(u)) * temperature;
  }

  /** Fork a deterministic sub-stream (useful for channels). */
  fork(tag: number | string): SeededRandom {
    const a = this.state;
    const b = SeededRandom.seedToUint32(tag);
    // cheap mix
    const mixed = (a ^ b ^ 0x9e3779b9) >>> 0;
    return new SeededRandom(mixed);
  }
}
