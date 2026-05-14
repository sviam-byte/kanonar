import { CONFLICT_LAB_DYNAMICS_FORMULA } from '../../config/formulaConfig';
import { clamp01 } from '../../util/math';
import type { ActionImpact, ConflictLearningMemory } from '../learningMemory';
import { boundedLogitShift } from './math';
import type {
  ConflictRegime,
  ConflictRegimeState,
  ConflictRelationState,
  RelationDelta,
} from './types';

const cfg = CONFLICT_LAB_DYNAMICS_FORMULA;

export interface RelationDeltaInput {
  relationBefore: ConflictRelationState;
  memoryBefore: ConflictLearningMemory;
  observedImpact: ActionImpact;
  ownImpact: ActionImpact;
  predictionError: number;
}

export function computeRelationDelta(input: RelationDeltaInput): RelationDelta {
  const relation = input.relationBefore;
  const memory = input.memoryBefore;
  const observed = input.observedImpact;
  const own = input.ownImpact;
  const pe = clamp01(input.predictionError);
  const support = clamp01(observed.support + 0.35 * own.support);
  const repair = clamp01(observed.repair + 0.50 * own.repair);
  const harm = clamp01(observed.harm + 0.35 * observed.dominance);
  const betrayal = clamp01(Math.max(observed.betrayal, observed.deception));
  const humiliation = clamp01(observed.humiliation);
  const threat = clamp01((observed.threat ?? 0) + harm + 0.45 * betrayal);
  const protection = clamp01(observed.protection + own.protection);
  const withdrawal = clamp01(observed.withdrawal + 0.35 * own.withdrawal);
  const momentum = Math.min(2, memory.conflictMomentum);

  const trust =
    0.13 * support * (1 - relation.trust)
    + 0.12 * repair * relation.conflict
    - 0.16 * harm * relation.trust
    - 0.24 * betrayal * relation.trust * (0.5 + relation.bond)
    - 0.18 * pe * betrayal * relation.trust
    - 0.05 * memory.betrayalDebt * relation.trust
    - 0.04 * withdrawal * relation.trust;

  const bond =
    0.10 * support * (1 - relation.bond)
    + 0.10 * repair * (1 - relation.bond)
    - 0.18 * betrayal * relation.bond
    - 0.12 * harm * relation.bond
    - 0.08 * observed.withdrawal * relation.bond;

  const conflict =
    0.18 * harm * (1 - relation.conflict)
    + 0.22 * betrayal * (1 - relation.conflict)
    + 0.13 * humiliation * (1 - relation.conflict)
    + 0.05 * withdrawal * (1 - relation.conflict)
    + 0.08 * momentum * (1 - relation.conflict)
    - 0.16 * repair * relation.conflict
    - 0.015 * relation.conflict;

  const perceivedThreat =
    0.18 * threat * (1 - relation.perceivedThreat)
    + 0.12 * observed.dominance * (1 - relation.perceivedThreat)
    + 0.16 * pe * threat * (1 - relation.perceivedThreat)
    - 0.14 * protection * relation.perceivedThreat
    - 0.015 * relation.perceivedThreat;

  const perceivedLegitimacy =
    0.08 * support * (1 - relation.perceivedLegitimacy)
    + 0.10 * repair * (1 - relation.perceivedLegitimacy)
    - 0.16 * betrayal * relation.perceivedLegitimacy
    - 0.10 * humiliation * relation.perceivedLegitimacy
    - 0.07 * observed.dominance * relation.perceivedLegitimacy;

  const volatility =
    cfg.transitionDynamics.trustExchange.volatilityDecay * relation.volatility
    + cfg.transitionDynamics.trustExchange.volatilityPredictionErrorWeight * pe
    + cfg.transitionDynamics.trustExchange.volatilityConflictDeltaWeight * Math.abs(conflict)
    + cfg.transitionDynamics.trustExchange.volatilityTrustDeltaWeight * Math.abs(trust);

  return {
    trust,
    bond,
    conflict,
    perceivedThreat,
    perceivedLegitimacy,
    volatility: clamp01(volatility) - relation.volatility,
  };
}

export function applyRelationDelta(relation: ConflictRelationState, delta: RelationDelta): ConflictRelationState {
  return {
    trust: boundedLogitShift(relation.trust, delta.trust ?? 0, cfg.transition.relationDriveScale.trust),
    bond: boundedLogitShift(relation.bond, delta.bond ?? 0, cfg.transition.relationDriveScale.bond),
    perceivedThreat: boundedLogitShift(relation.perceivedThreat, delta.perceivedThreat ?? 0, cfg.transition.relationDriveScale.perceivedThreat),
    conflict: boundedLogitShift(relation.conflict, delta.conflict ?? 0, cfg.transition.relationDriveScale.conflict),
    perceivedLegitimacy: boundedLogitShift(relation.perceivedLegitimacy, delta.perceivedLegitimacy ?? 0, cfg.transition.relationDriveScale.perceivedLegitimacy),
    volatility: boundedLogitShift(relation.volatility, delta.volatility ?? 0, cfg.transition.relationDriveScale.volatility),
  };
}

export function classifyRegime(relation: ConflictRelationState): ConflictRegime {
  if (relation.conflict > 0.82 || (relation.trust < 0.15 && relation.perceivedThreat > 0.55)) return 'ruptured';
  if (relation.conflict > 0.65 || relation.perceivedThreat > 0.70) return 'hostile';
  if (relation.conflict > 0.48 || relation.volatility > 0.55) return 'volatile';
  if (relation.conflict > 0.28 || relation.trust < 0.45 || relation.perceivedThreat > 0.35) return 'strained';
  return 'secure';
}

export function applyRegimeHysteresis(
  previous: ConflictRegimeState,
  relation: ConflictRelationState,
  memory: ConflictLearningMemory,
): ConflictRegimeState {
  const candidate = classifyRegime(relation);
  const prev = previous.regime;

  if (prev === 'ruptured') {
    const eligible = relation.conflict < 0.35 && relation.trust > 0.30 && memory.repairCredit > 0.65;
    const exitEligibleTicks = eligible ? previous.exitEligibleTicks + 1 : 0;
    if (exitEligibleTicks >= 2) return nextRegime('hostile', prev, previous, 0);
    return { regime: 'ruptured', ticksInRegime: previous.ticksInRegime + 1, exitEligibleTicks };
  }

  if (candidate === 'ruptured') return nextRegime('ruptured', prev, previous, 0);

  if (prev === 'hostile') {
    const eligible = relation.conflict < 0.45 && memory.repairCredit > 0.35;
    const exitEligibleTicks = eligible ? previous.exitEligibleTicks + 1 : 0;
    if (exitEligibleTicks < 2) {
      return { regime: 'hostile', ticksInRegime: previous.ticksInRegime + 1, exitEligibleTicks };
    }
  }

  if (candidate === 'hostile') return nextRegime('hostile', prev, previous, 0);
  return nextRegime(candidate, prev, previous, 0);
}

function nextRegime(
  regime: ConflictRegime,
  previousRegime: ConflictRegime,
  previous: ConflictRegimeState,
  exitEligibleTicks: number,
): ConflictRegimeState {
  return {
    regime,
    ticksInRegime: regime === previousRegime ? previous.ticksInRegime + 1 : 0,
    exitEligibleTicks,
  };
}
