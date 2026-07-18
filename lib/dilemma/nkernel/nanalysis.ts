// NKERNEL-TRAJECTORY-0 (NKERNEL_FOUNDATION_0 §6.3): N-generalization of the
// dyadic trajectory analysis (lib/dilemma/dynamics/analysis.ts). The dyadic
// formulas are sums over the two agents / two directed relations and means of
// two values; the N forms sum over all N agents and all N·(N−1) ordered
// relations and average over the same sets, so at N = 2 every quantity reduces
// to the dyadic one exactly — pinned byte-for-byte by the reduction oracle in
// tests/dilemma/nkernel_trajectory_v1.test.ts.
//
// The squared per-agent/per-relation distances mirror the module-private
// helpers of analysis.ts verbatim (same field order, same accumulation order).
// This is the single sanctioned duplication of the slice: the helpers are not
// exported, and exporting them would edit a runtime file — the N = 2 oracle
// makes any drift between the copies fail loudly instead.

import { CONFLICT_LAB_DYNAMICS_FORMULA } from '../../config/formulaConfig';
import { normalizeConflictState } from '../dynamics/state';
import type {
  ConflictAgentState,
  ConflictRelationState,
  TrajectoryMetrics,
} from '../dynamics/types';
import { asKernelConflictStateV1 } from './nstate';
import type { ConflictStateNV1 } from './types';

const cfg = CONFLICT_LAB_DYNAMICS_FORMULA;

/**
 * Weighted Euclidean norm of the full N-state difference: all N agents, all
 * N·(N−1) ordered relations, the shared environment. Assumes both states carry
 * the same player set (like the dyadic stateDistance, which indexes b's maps
 * with a's players).
 */
export function stateDistanceNV1(a: ConflictStateNV1, b: ConflictStateNV1): number {
  const ca = normalizeConflictState(asKernelConflictStateV1(a));
  const cb = normalizeConflictState(asKernelConflictStateV1(b));

  let agentDistance = 0;
  for (const playerId of ca.players) {
    agentDistance += squaredAgentDistance(ca.agents[playerId], cb.agents[playerId]);
  }

  let relationDistance = 0;
  for (const fromId of ca.players) {
    for (const toId of ca.players) {
      if (fromId === toId) continue;
      relationDistance += squaredRelationDistance(ca.relations[fromId][toId], cb.relations[fromId][toId]);
    }
  }

  const envDistance =
    square(ca.environment.resourceScarcity - cb.environment.resourceScarcity)
    + square(ca.environment.externalPressure - cb.environment.externalPressure)
    + square(ca.environment.visibility - cb.environment.visibility)
    + square(ca.environment.institutionalPressure - cb.environment.institutionalPressure);

  return Math.sqrt(
    cfg.trajectory.distanceWeights.agent * agentDistance
    + cfg.trajectory.distanceWeights.relation * relationDistance
    + cfg.trajectory.distanceWeights.environment * envDistance,
  );
}

/** Same weights as the dyadic collapseScore; means run over N agents and N·(N−1) ordered relations. */
export function collapseScoreNV1(state: ConflictStateNV1): number {
  const canonical = normalizeConflictState(asKernelConflictStateV1(state));
  const resentment = meanOverPlayers(canonical.players, (id) => canonical.agents[id].resentment);
  const fear = meanOverPlayers(canonical.players, (id) => canonical.agents[id].fear);
  const stress = meanOverPlayers(canonical.players, (id) => canonical.agents[id].stress);
  const trust = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].trust);
  const conflict = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].conflict);
  const w = cfg.trajectory.collapseWeights;

  return clampFinite01(
    w.antiTrust * (1 - trust)
    + w.conflict * conflict
    + w.resentment * resentment
    + w.fear * fear
    + w.stress * stress,
  );
}

/** Same weights as the dyadic repairCapacity; means run over N agents and N·(N−1) ordered relations. */
export function repairCapacityNV1(state: ConflictStateNV1): number {
  const canonical = normalizeConflictState(asKernelConflictStateV1(state));
  const w = cfg.trajectory.repairCapacityWeights;
  const trust = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].trust);
  const bond = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].bond);
  const legitimacy = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].perceivedLegitimacy);
  const resentment = meanOverPlayers(canonical.players, (id) => canonical.agents[id].resentment);
  const fear = meanOverPlayers(canonical.players, (id) => canonical.agents[id].fear);

  return clampFinite01(
    w.trust * trust
    + w.bond * bond
    + w.legitimacy * legitimacy
    - w.resentment * resentment
    - w.fear * fear,
  );
}

export function detectCyclePeriodNV1(
  trajectory: readonly ConflictStateNV1[],
  epsilon: number,
): number | undefined {
  const last = trajectory[trajectory.length - 1];
  if (!last) return undefined;
  for (let i = trajectory.length - 2; i >= 0; i--) {
    if (stateDistanceNV1(last, trajectory[i]) < epsilon) {
      return trajectory.length - 1 - i;
    }
  }
  return undefined;
}

export function estimateDivergenceRateNV1(
  baseline: readonly ConflictStateNV1[],
  perturbed: readonly ConflictStateNV1[],
): number | undefined {
  const n = Math.min(baseline.length, perturbed.length);
  if (n < 2) return undefined;
  const d0 = stateDistanceNV1(baseline[0], perturbed[0]);
  const dt = stateDistanceNV1(baseline[n - 1], perturbed[n - 1]);
  if (d0 <= 0 || dt <= 0) return undefined;
  return Math.log(dt / d0) / (n - 1);
}

export function trajectoryMetricsNV1(
  trajectory: readonly ConflictStateNV1[],
  options?: { cycleEpsilon?: number; perturbed?: readonly ConflictStateNV1[] },
): TrajectoryMetrics {
  const first = trajectory[0];
  const last = trajectory[trajectory.length - 1] ?? first;
  return {
    distanceFromStart: first && last ? stateDistanceNV1(first, last) : 0,
    collapseScore: last ? collapseScoreNV1(last) : 0,
    repairCapacity: last ? repairCapacityNV1(last) : 0,
    cyclePeriod: detectCyclePeriodNV1(trajectory, options?.cycleEpsilon ?? 0.03),
    divergenceRate: options?.perturbed ? estimateDivergenceRateNV1(trajectory, options.perturbed) : undefined,
  };
}

function meanOverPlayers(players: readonly string[], read: (playerId: string) => number): number {
  let sum = 0;
  for (const playerId of players) sum += read(playerId);
  return sum / Math.max(1, players.length);
}

function meanOverRelations(players: readonly string[], read: (fromId: string, toId: string) => number): number {
  let sum = 0;
  let count = 0;
  for (const fromId of players) {
    for (const toId of players) {
      if (fromId === toId) continue;
      sum += read(fromId, toId);
      count++;
    }
  }
  return sum / Math.max(1, count);
}

// Mirrors of analysis.ts module-private helpers — field order kept verbatim.
function squaredAgentDistance(a: ConflictAgentState, b: ConflictAgentState): number {
  return square(a.goalPressure - b.goalPressure)
    + square(a.fear - b.fear)
    + square(a.stress - b.stress)
    + square(a.resentment - b.resentment)
    + square(a.loyalty - b.loyalty)
    + square(a.dominanceNeed - b.dominanceNeed)
    + square(a.cooperationTendency - b.cooperationTendency)
    + square(a.will - b.will);
}

function squaredRelationDistance(a: ConflictRelationState, b: ConflictRelationState): number {
  return square(a.trust - b.trust)
    + square(a.bond - b.bond)
    + square(a.perceivedThreat - b.perceivedThreat)
    + square(a.conflict - b.conflict)
    + square(a.perceivedLegitimacy - b.perceivedLegitimacy)
    + square(a.volatility - b.volatility);
}

function square(value: number): number {
  return value * value;
}

function clampFinite01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
