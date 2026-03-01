/**
 * Generic numeric clamp with finite-number guard.
 * Non-finite inputs collapse to `min` to avoid NaN/Infinity propagation.
 */
export function clamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  return x < min ? min : x > max ? max : x;
}

/**
 * Clamp to [0, 1].
 * This is the canonical normalization helper used across scoring code.
 */
export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Clamp to [-1, 1] with finite-number guard.
 */
export function clamp11(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < -1 ? -1 : x > 1 ? 1 : x;
}

/**
 * Coerce unknown input into [0, 1].
 * Useful at loose boundaries (e.g. parsed payloads, dynamic config).
 */
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
  if (s <= 0) return v.map(() => 0);
  return v.map((x) => x / s);
}

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
