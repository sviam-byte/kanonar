
export const clamp01 = (x: number): number => {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
};

export const mix = (a: number, b: number, t: number): number => {
  return a * (1 - t) + b * t;
};

// Beta distribution helpers
export function initBetaFromMean(mean: number, strength = 2): { alpha: number; beta: number } {
  const m = clamp01(mean);
  const s = Math.max(0.1, strength);
  return {
    alpha: m * s + 1, // +1 for smoothing
    beta: (1 - m) * s + 1,
  };
}

// Exact-mean beta init (no +1 shrink towards 0.5).
// Useful when you want betaMean(initBetaFromMeanExact(m)) ≈ m.
export function initBetaFromMeanExact(
  mean: number,
  strength = 8,
  minAB = 1
): { alpha: number; beta: number } {
  const m = clamp01(mean);
  const min = Math.max(1e-6, minAB);
  const s = Math.max(2 * min, strength);

  // Preserve mean exactly: alpha = m*s, beta = (1-m)*s
  let alpha = m * s;
  let beta = (1 - m) * s;

  // Ensure alpha/beta are not too small while preserving mean (scale both).
  if (alpha < min) {
    const k = min / Math.max(alpha, 1e-12);
    alpha *= k;
    beta *= k;
  }
  if (beta < min) {
    const k = min / Math.max(beta, 1e-12);
    alpha *= k;
    beta *= k;
  }

  alpha = Math.max(min, Math.min(alpha, 100));
  beta = Math.max(min, Math.min(beta, 100));

  return { alpha, beta };
}

export function betaUpdate(
  current: { alpha: number; beta: number },
  observation: number,
  weight = 1.0,
  decay = 0.95
): { alpha: number; beta: number } {
  const obs = clamp01(observation);
  const w = Math.max(0, weight);
  
  // Decay old evidence
  let a = current.alpha * decay;
  let b = current.beta * decay;
  
  // Add new evidence
  a += obs * w;
  b += (1 - obs) * w;
  
  // Prevent infinite growth or collapse
  a = Math.max(1e-6, Math.min(a, 200));
  b = Math.max(1e-6, Math.min(b, 200));
  
  return { alpha: a, beta: b };
}

export function betaMean(cell: { alpha: number; beta: number }): number {
  const d = cell.alpha + cell.beta;
  if (d <= 0) return 0.5;
  return cell.alpha / d;
}

export function betaConfidence(cell: { alpha: number; beta: number }): number {
  const sum = cell.alpha + cell.beta;
  // heuristic: higher sum = more evidence = higher confidence
  // map sum=2 -> 0, sum=20 -> ~0.9
  return clamp01(1 - Math.exp(-0.12 * Math.max(0, sum - 2)));
}
