import { clamp, clamp01, safe01 } from './math';

export { clamp, clamp01, safe01 };

export function safeNum(x: unknown, fallback = 0): number {
  return Number.isFinite(x) ? (x as number) : fallback;
}

export function nz(x: number, eps = 1e-9): number {
  return Math.abs(x) < eps ? (x >= 0 ? eps : -eps) : x;
}

export function ema01(prev: number, target: number, beta: number): number {
  const v = (1 - beta) * prev + beta * target;
  return clamp(v, 0, 1);
}
