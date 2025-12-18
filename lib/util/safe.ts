export function clamp(x:number, lo:number, hi:number){ return Math.min(hi, Math.max(lo, x)); }
export function safeNum(x:any, fallback=0){ return Number.isFinite(x) ? x as number : fallback; }
export function safe01(x:any, fallback=0){ return clamp(safeNum(x, fallback), 0, 1); }
export function nz(x:number, eps=1e-9){ return Math.abs(x) < eps ? (x>=0? eps : -eps) : x; }

export function ema01(prev: number, target: number, beta: number): number {
  const v = (1 - beta) * prev + beta * target;
  return Math.max(0, Math.min(1, v));
}

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}