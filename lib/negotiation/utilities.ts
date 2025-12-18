import { EntityParams, Counterparty, Mission } from '../../types';

// Utility for the player's character (envoy)
export function u1(char: EntityParams, x: number, mission: Mission): number {
  const eff = 0.6 * (char.competence_core ?? 50) + 0.4 * (char.intel_access ?? 50);
  const cost = 0.01 * (char.accountability ?? 50) * x; // cost of concession
  // value increases with outcome x and effectiveness, reduced by cost
  return mission.stakes * (0.01 * eff * (x / 100)) - cost;
}

// Utility for the counterparty
export function u2(cp: Counterparty, x: number, mission: Mission): number {
  // Gain is higher when x is closer to 0 (more favorable for them)
  const gain = mission.stakes * (1 - 0.01 * cp.hardness * x / 100);
  const cost = 0.005 * cp.scrutiny * (100-x); // cost of being scrutinized for conceding too much
  return gain - cost;
}
