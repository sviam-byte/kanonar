import { clamp01 } from '../util/math';
export { clamp01 };

export function sum(a: number[]) { return a.reduce((p, c) => p + c, 0); }
export function normalizeL1Safe(v: number[]) {
  const s = sum(v.map(x => Math.max(0, x)));
  return s > 1e-12 ? v.map(x => Math.max(0, x) / s) : v.map(() => 1 / v.length);
}
export function softmax(v: number[]) {
  const m = Math.max(...v);
  const e = v.map(x => Math.exp(x - m));
  const s = sum(e);
  return s > 0 ? e.map(x => x / s) : v.map(() => 1 / v.length);
}
export function logitsFromProbs(p: number[], eps = 1e-9) {
  return p.map(x => Math.log((x + eps) / (1 - x + eps)));
}
export function toPercents(p: number[]) { return p.map(x => clamp01(x) * 100); }
