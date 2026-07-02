import type { ActionCandidate } from './actionCandidate';
import { FC } from '../config/formulaConfig';

/**
 * Q(a) = Σ_g E_g * Δg(a) − cost(a) − riskPenalty(1 − conf)
 *
 * confidence is treated as an additive risk penalty rather than a multiplier.
 * At conf=1 → no penalty. At conf=0.5 → penalty = FC.actionScoring.riskCoeff × |rawQ| × 0.5.
 * This avoids the over-pessimism of the old multiplicative model where conf=0.5
 * would halve Q regardless of the magnitude of the risk.
 */
export function scoreAction(action: ActionCandidate, goalEnergy: Record<string, number>): number {
  let q = 0;
  for (const [g, delta] of Object.entries(action.deltaGoals)) {
    q += (goalEnergy[g] ?? 0) * delta;
  }

  // T1.5 (ledger Q-PRIOR-DROP): the possibility magnitude is the only carrier
  // of act:prior; without this term personality never reaches the choice.
  // Default off — the flag is the D2 ablation switch.
  const PI = FC.actionScoring.priorInfluence;
  if (PI?.enabled) {
    q += PI.weight * (action.priorMagnitude ?? 0);
  }

  q -= action.cost;

  const conf = Math.max(0, Math.min(1, action.confidence));
  const penalty = FC.actionScoring.riskCoeff * Math.abs(q) * (1 - conf);
  return q - penalty;
}
