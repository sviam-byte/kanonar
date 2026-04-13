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
export const softplus = (x: number): number => Math.log1p(Math.exp(-Math.abs(x))) + Math.max(x, 0);
export const sat = (x: number, lo: number, hi: number): number => lo + (hi - lo) * sigmoid(x);

/**
 * Alternative normalization used by legacy solver/math code.
 * Falls back to a uniform distribution when sum is non-positive.
 */
export function normalizeUniform(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x;
  if (s <= 0) return v.map(() => 1 / Math.max(1, v.length));
  return v.map((x) => x / s);
}

export function hash32(s: string): number {
  let h = 2166136261 | 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function xorshift32(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function cosSim(a: number[], b: number[]): number {
  let sa = 0;
  let sb = 0;
  let sp = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sa += a[i] * a[i];
    sb += b[i] * b[i];
    sp += a[i] * b[i];
  }
  if (sa === 0 || sb === 0) return 0;
  return sp / Math.sqrt(sa * sb);
}

export const linMix = (parts: { value: number; weight: number; name?: string }[]) => {
  const v = parts.reduce((s, p) => s + p.value * p.weight, 0);
  return { value: clamp01(v), parts };
};

export const noisyOr = (values: number[]): number => {
  const prod = values.reduce((p, v) => p * (1 - v), 1);
  return clamp01(1 - prod);
};

export function logit(p: number): number {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
}

export function invLogit(x: number): number {
  return sigmoid(x);
}

export function entropy01(p: number): number {
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
  return -(q * Math.log(q) + (1 - q) * Math.log(1 - q));
}

export function softmax(xs: number[], tau = 1): number[] {
  const t = Math.max(1e-6, tau);
  const ys = xs.map((x) => x / t);
  const m = Math.max(...ys);
  const exps = ys.map((y) => Math.exp(y - m));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / s);
}
