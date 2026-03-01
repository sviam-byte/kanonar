
export function clamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  return x < min ? min : x > max ? max : x;
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp11(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < -1 ? -1 : x > 1 ? 1 : x;
}

/** clamp01 that accepts unknown and coerces to number first */
export function safe01(x: unknown, fallback = 0): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function ema(oldValue: number, delta: number, alpha: number): number {
  return oldValue + alpha * delta;
}

export function normalize(v: number[]): number[] {
  let s = 0; 
  for (const x of v) s += x;
  if (s <= 0) return v.map(_ => 0);
  return v.map(x => x / s);
}

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
