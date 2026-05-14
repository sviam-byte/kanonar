import { CONFLICT_LAB_DYNAMICS_FORMULA } from '../../config/formulaConfig';
import type { ConflictAgentState, ConflictRelationState, ConflictState, TrajectoryMetrics } from './types';

const cfg = CONFLICT_LAB_DYNAMICS_FORMULA;

export function stateDistance(a: ConflictState, b: ConflictState): number {
  const [p0, p1] = a.players;
  const agentDistance =
    squaredAgentDistance(a.agents[p0], b.agents[p0])
    + squaredAgentDistance(a.agents[p1], b.agents[p1]);
  const relationDistance =
    squaredRelationDistance(a.relations[p0][p1], b.relations[p0][p1])
    + squaredRelationDistance(a.relations[p1][p0], b.relations[p1][p0]);
  const envDistance =
    square(a.environment.resourceScarcity - b.environment.resourceScarcity)
    + square(a.environment.externalPressure - b.environment.externalPressure)
    + square(a.environment.visibility - b.environment.visibility)
    + square(a.environment.institutionalPressure - b.environment.institutionalPressure);

  return Math.sqrt(
    cfg.trajectory.distanceWeights.agent * agentDistance
    + cfg.trajectory.distanceWeights.relation * relationDistance
    + cfg.trajectory.distanceWeights.environment * envDistance,
  );
}

export function collapseScore(state: ConflictState): number {
  const [a, b] = state.players;
  const ab = state.relations[a][b];
  const ba = state.relations[b][a];
  const resentment = average(state.agents[a].resentment, state.agents[b].resentment);
  const fear = average(state.agents[a].fear, state.agents[b].fear);
  const stress = average(state.agents[a].stress, state.agents[b].stress);
  const trust = average(ab.trust, ba.trust);
  const conflict = average(ab.conflict, ba.conflict);
  const w = cfg.trajectory.collapseWeights;

  return clampFinite01(
    w.antiTrust * (1 - trust)
    + w.conflict * conflict
    + w.resentment * resentment
    + w.fear * fear
    + w.stress * stress,
  );
}

export function repairCapacity(state: ConflictState): number {
  const [a, b] = state.players;
  const ab = state.relations[a][b];
  const ba = state.relations[b][a];
  const w = cfg.trajectory.repairCapacityWeights;
  const trust = average(ab.trust, ba.trust);
  const bond = average(ab.bond, ba.bond);
  const legitimacy = average(ab.perceivedLegitimacy, ba.perceivedLegitimacy);
  const resentment = average(state.agents[a].resentment, state.agents[b].resentment);
  const fear = average(state.agents[a].fear, state.agents[b].fear);

  return clampFinite01(
    w.trust * trust
    + w.bond * bond
    + w.legitimacy * legitimacy
    - w.resentment * resentment
    - w.fear * fear,
  );
}

export function detectCyclePeriod(
  trajectory: readonly ConflictState[],
  epsilon: number,
): number | undefined {
  const last = trajectory[trajectory.length - 1];
  if (!last) return undefined;
  for (let i = trajectory.length - 2; i >= 0; i--) {
    if (stateDistance(last, trajectory[i]) < epsilon) {
      return trajectory.length - 1 - i;
    }
  }
  return undefined;
}

export function estimateDivergenceRate(
  baseline: readonly ConflictState[],
  perturbed: readonly ConflictState[],
): number | undefined {
  const n = Math.min(baseline.length, perturbed.length);
  if (n < 2) return undefined;
  const d0 = stateDistance(baseline[0], perturbed[0]);
  const dt = stateDistance(baseline[n - 1], perturbed[n - 1]);
  if (d0 <= 0 || dt <= 0) return undefined;
  return Math.log(dt / d0) / (n - 1);
}

export function trajectoryMetrics(
  trajectory: readonly ConflictState[],
  options?: { cycleEpsilon?: number; perturbed?: readonly ConflictState[] },
): TrajectoryMetrics {
  const first = trajectory[0];
  const last = trajectory[trajectory.length - 1] ?? first;
  return {
    distanceFromStart: first && last ? stateDistance(first, last) : 0,
    collapseScore: last ? collapseScore(last) : 0,
    repairCapacity: last ? repairCapacity(last) : 0,
    cyclePeriod: detectCyclePeriod(trajectory, options?.cycleEpsilon ?? 0.03),
    divergenceRate: options?.perturbed ? estimateDivergenceRate(trajectory, options.perturbed) : undefined,
  };
}

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
    + square(a.perceivedLegitimacy - b.perceivedLegitimacy);
}

function square(value: number): number {
  return value * value;
}

function average(a: number, b: number): number {
  return (a + b) / 2;
}

function clampFinite01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

