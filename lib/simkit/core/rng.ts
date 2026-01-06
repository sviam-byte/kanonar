// lib/simkit/core/rng.ts
// Mulberry32 — быстрый детерминированный PRNG для симуляций.

export class RNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  nextU32(): number {
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  next(): number {
    return this.nextU32() / 4294967296;
  }

  int(min: number, max: number): number {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    if (b < a) return a;
    return a + Math.floor(this.next() * (b - a + 1));
  }

  pick<T>(arr: T[]): T | null {
    if (!arr.length) return null;
    return arr[this.int(0, arr.length - 1)];
  }
}
