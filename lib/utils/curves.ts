// lib/utils/curves.ts

export type CurvePreset =
  | 'linear'
  | 'smoothstep'
  | 'sqrt'
  | 'sigmoid'
  | 'pow2'
  | 'pow4'
  | 'exp'
  | 'log'
  | 'hinge';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function safe(x: number, fb: number) {
  return Number.isFinite(x) ? x : fb;
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
    case 'exp': {
      // быстрый рост ближе к 1
      const k = 4;
      return (Math.exp(k * t) - 1) / (Math.exp(k) - 1);
    }
    case 'log': {
      // быстрый рост у нуля, затем насыщение
      const k = 9;
      return Math.log1p(k * t) / Math.log1p(k);
    }
    case 'hinge': {
      // "почти 0" до порога, затем почти линейно
      const h = 0.6;
      if (t <= h) return 0;
      return (t - h) / (1 - h);
    }
    default:
      return t;
  }
}

/**
 * Параметризованная версия: сдвиг (bias) и усиление (gain) по оси X.
 * bias: где находится "центр" реакции (0..1), gain: насколько резкая реакция.
 */
export function curve01Param(
  x: number,
  preset: CurvePreset,
  params?: { bias?: number; gain?: number }
): { y: number; x1: number } {
  const bias = clamp01(safe(params?.bias ?? 0.5, 0.5));
  const gain = Math.max(0.25, Math.min(8, safe(params?.gain ?? 1, 1)));

  // переносим bias в "точку 0.5" и масштабируем отклонение
  const x1 = clamp01(0.5 + (clamp01(x) - bias) * gain);
  const y = curve01(x1, preset);
  return { y, x1 };
}

/** Signed version: x in [-1,1] -> apply curve to |x| and restore sign. */
export function curveSigned01(x: number, preset: CurvePreset): number {
  if (!Number.isFinite(x)) return 0;
  const s = x < 0 ? -1 : 1;
  return s * curve01(Math.abs(x), preset);
}
