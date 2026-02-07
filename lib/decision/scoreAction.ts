import type { ActionCandidate } from './actionCandidate';

/**
 * Q(a) = Σ_g E_g * Δg(a) − cost(a)
 * confidence используется как мягкий мультипликатор.
 */
export function scoreAction(action: ActionCandidate, goalEnergy: Record<string, number>): number {
  let q = 0;
  for (const [g, delta] of Object.entries(action.deltaGoals)) {
    q += (goalEnergy[g] ?? 0) * delta;
  }
  q -= action.cost;
  return q * Math.max(0, Math.min(1, action.confidence));
}
