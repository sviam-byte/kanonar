
export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
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
