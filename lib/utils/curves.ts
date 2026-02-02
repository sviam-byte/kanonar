// lib/utils/curves.ts

export type CurvePreset =
  | 'linear'
  | 'smoothstep'
  | 'sqrt'
  | 'sigmoid'
  | 'pow2'
  | 'pow4';

/**
 * Parametrized curve spec:
 * - keeps CurvePreset compatibility
 * - adds exp / pow / sigmoid with tunable params per agent/channel
 */
export type CurveSpec =
  | { type: 'preset'; preset: CurvePreset }
  | { type: 'pow'; k: number } // y = x^k
  | { type: 'exp'; k: number } // normalized exp: (e^{kx}-1)/(e^{k}-1)
  | { type: 'sigmoid'; center?: number; slope?: number } // normalized logistic
  | { type: 'smoothstep' } // explicit (same as preset)
  | { type: 'linear' }
  | { type: 'sqrt' };

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

export function normalizeCurveSpec(spec: CurvePreset | CurveSpec | undefined): CurveSpec {
  if (!spec) return { type: 'preset', preset: 'smoothstep' };
  if (typeof spec === 'string') return { type: 'preset', preset: spec };
  return spec;
}

export function curve01Param(x: number, spec: CurvePreset | CurveSpec): number {
  const t = clamp01(x);
  const s = normalizeCurveSpec(spec);

  switch (s.type) {
    case 'preset':
      return curve01(t, s.preset);
    case 'linear':
      return t;
    case 'smoothstep':
      return t * t * (3 - 2 * t);
    case 'sqrt':
      return Math.sqrt(t);
    case 'pow': {
      // guard k
      const k = Number.isFinite(s.k) ? Math.max(1e-3, s.k) : 1;
      return Math.pow(t, k);
    }
    case 'exp': {
      // normalized exp:
      // y = (exp(k t)-1) / (exp(k)-1)
      const k = Number.isFinite(s.k) ? s.k : 1;
      if (Math.abs(k) < 1e-6) return t;
      const num = Math.exp(k * t) - 1;
      const den = Math.exp(k) - 1;
      return den === 0 ? t : clamp01(num / den);
    }
    case 'sigmoid': {
      // normalized logistic:
      // y = (sig(t) - sig(0)) / (sig(1)-sig(0)) for chosen center/slope
      const center = Number.isFinite(s.center as any) ? (s.center as number) : 0.5;
      const slope = Number.isFinite(s.slope as any) ? (s.slope as number) : 10;
      const sig = (z: number) => 1 / (1 + Math.exp(-slope * (z - center)));
      const y = sig(t);
      const y0 = sig(0);
      const y1 = sig(1);
      const den = y1 - y0;
      return den === 0 ? t : clamp01((y - y0) / den);
    }
    default:
      return t;
  }
}

export function curveSigned01Param(x: number, spec: CurvePreset | CurveSpec): number {
  if (!Number.isFinite(x)) return 0;
  const sign = x < 0 ? -1 : 1;
  return sign * curve01Param(Math.abs(x), spec);
}
