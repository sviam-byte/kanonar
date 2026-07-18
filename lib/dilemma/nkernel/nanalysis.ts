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
import type {
  ConflictAgentState,
  ConflictRelationState,
  Result,
  TrajectoryMetrics,
} from '../dynamics/types';
import { normalizeConflictStateNV1, type CanonicalConflictStateNV1 } from './nstate';
import type { ConflictNStepErrorV1, ConflictStateNV1 } from './types';

const cfg = CONFLICT_LAB_DYNAMICS_FORMULA;

export type ConflictNAnalysisErrorV1 =
  | { readonly code: 'invalid_state'; readonly stateLabel: string; readonly cause: ConflictNStepErrorV1; readonly message: string }
  | { readonly code: 'participant_set_mismatch'; readonly expected: readonly string[]; readonly actual: readonly string[]; readonly message: string }
  | { readonly code: 'invalid_epsilon'; readonly epsilon: number; readonly message: string }
  | { readonly code: 'empty_trajectory'; readonly message: string };

type AnalysisResult<T> = Result<T, ConflictNAnalysisErrorV1>;

function canonicalize(state: ConflictStateNV1, stateLabel: string): AnalysisResult<CanonicalConflictStateNV1> {
  const normalized = normalizeConflictStateNV1(state);
  if (normalized.ok === false) {
    return {
      ok: false,
      error: {
        code: 'invalid_state',
        stateLabel,
        cause: normalized.error,
        message: `${stateLabel} is invalid: ${normalized.error.message}`,
      },
    };
  }
  return normalized;
}

function samePlayers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((playerId, index) => playerId === b[index]);
}

/**
 * Weighted Euclidean norm of the full N-state difference: all N agents, all
 * N·(N−1) ordered relations, the shared environment. Assumes both states carry
 * the same player set (like the dyadic stateDistance, which indexes b's maps
 * with a's players).
 */
export function stateDistanceNV1(a: ConflictStateNV1, b: ConflictStateNV1): AnalysisResult<number> {
  const aResult = canonicalize(a, 'left state');
  if (aResult.ok === false) return aResult;
  const bResult = canonicalize(b, 'right state');
  if (bResult.ok === false) return bResult;
  const ca = aResult.value;
  const cb = bResult.value;
  if (!samePlayers(ca.players, cb.players)) {
    return {
      ok: false,
      error: {
        code: 'participant_set_mismatch',
        expected: [...ca.players],
        actual: [...cb.players],
        message: 'state distance requires identical ordered participant sets',
      },
    };
  }

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

  return { ok: true, value: Math.sqrt(
    cfg.trajectory.distanceWeights.agent * agentDistance
    + cfg.trajectory.distanceWeights.relation * relationDistance
    + cfg.trajectory.distanceWeights.environment * envDistance,
  ) };
}

/** Same weights as the dyadic collapseScore; means run over N agents and N·(N−1) ordered relations. */
export function collapseScoreNV1(state: ConflictStateNV1): AnalysisResult<number> {
  const normalized = canonicalize(state, 'state');
  if (normalized.ok === false) return normalized;
  const canonical = normalized.value;
  const resentment = meanOverPlayers(canonical.players, (id) => canonical.agents[id].resentment);
  const fear = meanOverPlayers(canonical.players, (id) => canonical.agents[id].fear);
  const stress = meanOverPlayers(canonical.players, (id) => canonical.agents[id].stress);
  const trust = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].trust);
  const conflict = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].conflict);
  const w = cfg.trajectory.collapseWeights;

  return { ok: true, value: clampFinite01(
    w.antiTrust * (1 - trust)
    + w.conflict * conflict
    + w.resentment * resentment
    + w.fear * fear
    + w.stress * stress,
  ) };
}

/** Same weights as the dyadic repairCapacity; means run over N agents and N·(N−1) ordered relations. */
export function repairCapacityNV1(state: ConflictStateNV1): AnalysisResult<number> {
  const normalized = canonicalize(state, 'state');
  if (normalized.ok === false) return normalized;
  const canonical = normalized.value;
  const w = cfg.trajectory.repairCapacityWeights;
  const trust = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].trust);
  const bond = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].bond);
  const legitimacy = meanOverRelations(canonical.players, (from, to) => canonical.relations[from][to].perceivedLegitimacy);
  const resentment = meanOverPlayers(canonical.players, (id) => canonical.agents[id].resentment);
  const fear = meanOverPlayers(canonical.players, (id) => canonical.agents[id].fear);

  return { ok: true, value: clampFinite01(
    w.trust * trust
    + w.bond * bond
    + w.legitimacy * legitimacy
    - w.resentment * resentment
    - w.fear * fear,
  ) };
}

export function detectCyclePeriodNV1(
  trajectory: readonly ConflictStateNV1[],
  epsilon: number,
): AnalysisResult<number | undefined> {
  if (!Number.isFinite(epsilon) || epsilon < 0) {
    return { ok: false, error: { code: 'invalid_epsilon', epsilon, message: `cycle epsilon must be finite and >= 0, got ${epsilon}` } };
  }
  const last = trajectory[trajectory.length - 1];
  if (!last) return { ok: true, value: undefined };
  for (let i = trajectory.length - 2; i >= 0; i--) {
    const distance = stateDistanceNV1(last, trajectory[i]);
    if (distance.ok === false) return distance;
    if (distance.value < epsilon) {
      return { ok: true, value: trajectory.length - 1 - i };
    }
  }
  return { ok: true, value: undefined };
}

export function estimateDivergenceRateNV1(
  baseline: readonly ConflictStateNV1[],
  perturbed: readonly ConflictStateNV1[],
): AnalysisResult<number | undefined> {
  const n = Math.min(baseline.length, perturbed.length);
  if (n < 2) return { ok: true, value: undefined };
  const d0 = stateDistanceNV1(baseline[0], perturbed[0]);
  if (d0.ok === false) return d0;
  const dt = stateDistanceNV1(baseline[n - 1], perturbed[n - 1]);
  if (dt.ok === false) return dt;
  if (d0.value <= 0 || dt.value <= 0) return { ok: true, value: undefined };
  return { ok: true, value: Math.log(dt.value / d0.value) / (n - 1) };
}

export function trajectoryMetricsNV1(
  trajectory: readonly ConflictStateNV1[],
  options?: { cycleEpsilon?: number; perturbed?: readonly ConflictStateNV1[] },
): AnalysisResult<TrajectoryMetrics> {
  const first = trajectory[0];
  if (!first) return { ok: false, error: { code: 'empty_trajectory', message: 'trajectory metrics require at least one state' } };
  const last = trajectory[trajectory.length - 1];
  const distance = stateDistanceNV1(first, last);
  if (distance.ok === false) return distance;
  const collapse = collapseScoreNV1(last);
  if (collapse.ok === false) return collapse;
  const repair = repairCapacityNV1(last);
  if (repair.ok === false) return repair;
  const cycle = detectCyclePeriodNV1(trajectory, options?.cycleEpsilon ?? 0.03);
  if (cycle.ok === false) return cycle;
  const divergence = options?.perturbed
    ? estimateDivergenceRateNV1(trajectory, options.perturbed)
    : { ok: true as const, value: undefined };
  if (divergence.ok === false) return divergence;
  return {
    ok: true,
    value: {
      distanceFromStart: distance.value,
      collapseScore: collapse.value,
      repairCapacity: repair.value,
      cyclePeriod: cycle.value,
      divergenceRate: divergence.value,
    },
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
