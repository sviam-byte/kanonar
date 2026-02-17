import type { ActionCandidate } from './actionCandidate';

/**
 * Q(a) = Σ_g E_g * Δg(a) − cost(a) − riskPenalty(1 − conf)
 *
 * confidence is treated as an additive risk penalty rather than a multiplier.
 * At conf=1 → no penalty. At conf=0.5 → penalty = RISK_COEFF × |rawQ| × 0.5.
 * This avoids the over-pessimism of the old multiplicative model where conf=0.5
 * would halve Q regardless of the magnitude of the risk.
 */
const RISK_COEFF = 0.4;

export function scoreAction(action: ActionCandidate, goalEnergy: Record<string, number>): number {
  let q = 0;
  for (const [g, delta] of Object.entries(action.deltaGoals)) {
    q += (goalEnergy[g] ?? 0) * delta;
  }
  q -= action.cost;

  const conf = Math.max(0, Math.min(1, action.confidence));
  const penalty = RISK_COEFF * Math.abs(q) * (1 - conf);
  return q - penalty;
}
