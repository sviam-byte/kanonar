
// lib/features/scale.ts


// map [a..b] to [0..1]
export { clamp01 } from '../util/math';
export function mapRange01(x: number, a: number, b: number) {
  if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b) || a === b) return 0;
  const t = (x - a) / (b - a);
  return clamp01(t);
}

// safe number
export function num(x: any, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}
