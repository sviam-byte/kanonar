// lib/context/v2/math-utils.ts

export function safeNumber(x: number | null | undefined): number {
  if (x === null || x === undefined) return 0;
  if (Number.isNaN(x)) return 0;
  if (!Number.isFinite(x)) {
    return x > 0 ? 1e3 : -1e3; // мягкий кламп бесконечностей
  }
  return x;
}

/**
 * Нормализация неотрицательных весов в сумму 1.
 * Если все веса нулевые / NaN — возвращает равномерное распределение по ключам.
 */
export function normalizeWeightsSafe(
  weights: Record<string, number>
): Record<string, number> {
  const cleaned: Record<string, number> = {};
  let sum = 0;

  for (const [k, v] of Object.entries(weights)) {
    const val = Math.max(0, safeNumber(v));
    cleaned[k] = val;
    sum += val;
  }

  const keys = Object.keys(cleaned);
  if (!keys.length) return {};

  if (sum <= 1e-9 || !Number.isFinite(sum)) {
    const u = 1 / keys.length;
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = u;
    return out;
  }

  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(cleaned)) {
    out[k] = v / sum;
  }
  return out;
}

/**
 * softmax над массивом логитов с защитой от переполнения и NaN.
 * При проблемах — равномерное распределение.
 */
export function softmaxSafe(xs: number[]): number[] {
  if (!xs.length) return [];
  const cleaned = xs.map((x) => safeNumber(x));
  const maxX = Math.max(...cleaned);
  const exps = cleaned.map((x) => Math.exp(x - maxX));
  const sum = exps.reduce((a, b) => a + b, 0);

  if (sum <= 1e-9 || !Number.isFinite(sum)) {
    const u = 1 / Math.max(1, xs.length);
    return xs.map(() => u);
  }

  return exps.map((e) => e / sum);
}
