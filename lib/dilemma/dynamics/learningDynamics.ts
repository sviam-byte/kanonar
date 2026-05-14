import { DILEMMA_LEARNING_FORMULA } from '../../config/formulaConfig';
import { clamp01 } from '../../util/math';
import {
  cloneConflictMemory,
  getLearnedActionValue,
  mostLikelyPredictedResponse,
  predictedResponseProb,
  updateConflictMemory as updateLegacyConflictMemory,
  type ActionImpact,
  type ConflictLearningMemory,
  type ConflictReward,
} from '../learningMemory';
import type { ConflictActionId, ConflictRelationState } from './types';

export function computePredictionError(
  memory: ConflictLearningMemory,
  myActionId: ConflictActionId,
  observedOtherActionId: ConflictActionId,
  allOtherActions: readonly ConflictActionId[],
): { expectedOtherActionId: ConflictActionId; predictedProbability: number; predictionError: number } {
  const expected = mostLikelyPredictedResponse(memory, myActionId, allOtherActions);
  const observedProbability = predictedResponseProb(memory, myActionId, observedOtherActionId, allOtherActions);
  return {
    expectedOtherActionId: (expected.actionId || allOtherActions[0]) as ConflictActionId,
    predictedProbability: observedProbability,
    predictionError: clamp01(1 - observedProbability),
  };
}

export function computeExpectedResponseUtility(
  memory: ConflictLearningMemory,
  myActionId: ConflictActionId,
  allOtherActions: readonly ConflictActionId[],
): number {
  const predicted = mostLikelyPredictedResponse(memory, myActionId, allOtherActions);
  if (!predicted.actionId) return 0;
  const action = predicted.actionId as ConflictActionId;
  const p = predicted.probability;
  if (action === 'trust') return 0.35 * p;
  if (action === 'withhold') return -0.05 * p;
  return -0.45 * p;
}

export function computeReward(args: {
  payoff: number;
  actionId: ConflictActionId;
  relationBefore: ConflictRelationState;
  relationAfter: ConflictRelationState;
  ownImpact: ActionImpact;
  observedImpact: ActionImpact;
}): ConflictReward {
  const cfg = DILEMMA_LEARNING_FORMULA.reward;
  const relationGain =
    cfg.relationScale
    * (
      0.45 * (args.relationAfter.trust - args.relationBefore.trust)
      + 0.30 * (args.relationAfter.bond - args.relationBefore.bond)
      - 0.25 * (args.relationAfter.conflict - args.relationBefore.conflict)
      - 0.20 * (args.relationAfter.perceivedThreat - args.relationBefore.perceivedThreat)
    );
  const safetyGain = args.relationBefore.perceivedThreat - args.relationAfter.perceivedThreat;
  const powerGain = cfg.powerWeightBase * args.ownImpact.dominance + cfg.powerWeightScale * args.ownImpact.betrayal;
  const moralCost = cfg.moralCostScale * (args.ownImpact.harm + args.ownImpact.betrayal + args.ownImpact.humiliation);
  const stressCost = cfg.stressScale * (args.observedImpact.harm + args.observedImpact.betrayal + args.relationAfter.conflict);
  const goalGain = args.payoff;
  const total = goalGain + safetyGain + relationGain + powerGain - moralCost - stressCost;

  return {
    total: finite(total),
    goalGain: finite(goalGain),
    safetyGain: finite(safetyGain),
    relationGain: finite(relationGain),
    powerGain: finite(powerGain),
    moralCost: finite(moralCost),
    stressCost: finite(stressCost),
  };
}

export function updateActionValue(oldQ: number, reward: number, learningRate: number): number {
  return oldQ + clamp01(learningRate) * (reward - oldQ);
}

export function updateOpponentModel(args: {
  memory: ConflictLearningMemory;
  myActionId: ConflictActionId;
  otherActionId: ConflictActionId;
  allOtherActions: readonly ConflictActionId[];
}): { expectedOtherActionId: ConflictActionId; predictedProbability: number; predictionError: number } {
  return computePredictionError(args.memory, args.myActionId, args.otherActionId, args.allOtherActions);
}

export function updateConflictMemory(args: {
  memoryBefore: ConflictLearningMemory;
  myActionId: ConflictActionId;
  otherActionId: ConflictActionId;
  reward: ConflictReward;
  predictionError: number;
  observedImpact: ActionImpact;
  ownImpact: ActionImpact;
  relationBefore: ConflictRelationState;
}): ConflictLearningMemory {
  const memory = cloneConflictMemory(args.memoryBefore);
  return updateLegacyConflictMemory({
    memory,
    myActionId: args.myActionId,
    otherActionId: args.otherActionId,
    reward: args.reward,
    predictionError: args.predictionError,
    observedImpact: args.observedImpact,
    ownImpact: args.ownImpact,
    relationBefore: {
      trust: args.relationBefore.trust,
      bond: args.relationBefore.bond,
      conflict: args.relationBefore.conflict,
      fear: args.relationBefore.perceivedThreat,
    },
  });
}

export function learnedActionValue(memory: ConflictLearningMemory, actionId: ConflictActionId): number {
  return getLearnedActionValue(memory, actionId);
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
