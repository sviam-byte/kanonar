// lib/utils/curves.ts

export type CurvePreset =
  | 'linear'
  | 'smoothstep'
  | 'sqrt'
  | 'sigmoid'
  | 'pow2'
  | 'pow4';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Apply a non-linear response curve to x in [0,1]. */
export function curve01(x: number, preset: CurvePreset): number {
  const t = clamp01(x);
  switch (preset) {
    case 'linear':
      return t;
    case 'smoothstep':
      return t * t * (3 - 2 * t);
    case 'sqrt':
      return Math.sqrt(t);
    case 'pow2':
      return t * t;
    case 'pow4':
      return t * t * t * t;
    case 'sigmoid': {
      const k = 10;
      const y = 1 / (1 + Math.exp(-k * (t - 0.5)));
      const y0 = 1 / (1 + Math.exp(k * 0.5));
      const y1 = 1 / (1 + Math.exp(-k * 0.5));
      return (y - y0) / (y1 - y0);
    }
    default:
      return t;
  }
}

/** Signed version: x in [-1,1] -> apply curve to |x| and restore sign. */
export function curveSigned01(x: number, preset: CurvePreset): number {
  if (!Number.isFinite(x)) return 0;
  const s = x < 0 ? -1 : 1;
  return s * curve01(Math.abs(x), preset);
}
