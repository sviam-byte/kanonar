import { clamp01 } from '../util/math';
import { DILEMMA_LEARNING_FORMULA } from '../config/formulaConfig';

export type ConflictLearningMemory = {
  actionValue: Record<string, number>;
  actionCount: Record<string, number>;
  opponentActionCount: Record<string, number>;
  opponentResponseCount: Record<string, number>;
  betrayalDebt: number;
  repairCredit: number;
  conflictMomentum: number;
  fearTrace: number;
  shameTrace: number;
  volatility: number;
  lastPredictionError: number;
};

export type ConflictLearningStore = Record<string, ConflictLearningMemory>;

export type ActionImpact = {
  support: number;
  harm: number;
  betrayal: number;
  deception: number;
  repair: number;
  dominance: number;
  submission: number;
  withdrawal: number;
  humiliation: number;
  protection: number;
};

export type ConflictReward = {
  total: number;
  goalGain: number;
  safetyGain: number;
  relationGain: number;
  powerGain: number;
  moralCost: number;
  stressCost: number;
};

export type ConflictRelationSnapshot = {
  trust: number;
  bond: number;
  conflict: number;
  fear: number;
};

export type ConflictLearningTrace = {
  tick: number;
  agentId: string;
  otherId: string;
  actionId: string;
  otherActionId: string;
  utility: {
    baseU: number;
    learnedQ: number;
    expectedResponse: number;
    finalU: number;
  };
  prediction: {
    expectedOtherActionId: string;
    observedOtherActionId: string;
    predictedProbability: number;
    predictionError: number;
  };
  reward: ConflictReward;
  memoryBefore: ConflictLearningMemory;
  memoryAfter: ConflictLearningMemory;
  relationBefore: ConflictRelationSnapshot;
  relationAfter: ConflictRelationSnapshot;
};

export function createConflictLearningMemory(): ConflictLearningMemory {
  return {
    actionValue: {},
    actionCount: {},
    opponentActionCount: {},
    opponentResponseCount: {},
    betrayalDebt: 0,
    repairCredit: 0,
    conflictMomentum: 0,
    fearTrace: 0,
    shameTrace: 0,
    volatility: 0,
    lastPredictionError: 0,
  };
}

export function createConflictLearningStore(): ConflictLearningStore {
  return {};
}

export function conflictMemoryKey(agentId: string, otherId: string): string {
  return `${agentId}->${otherId}`;
}

export function getConflictMemory(
  store: ConflictLearningStore,
  agentId: string,
  otherId: string,
): ConflictLearningMemory {
  const key = conflictMemoryKey(agentId, otherId);
  if (!store[key]) store[key] = createConflictLearningMemory();
  return store[key];
}

export function cloneConflictMemory(memory: ConflictLearningMemory): ConflictLearningMemory {
  return {
    actionValue: { ...memory.actionValue },
    actionCount: { ...memory.actionCount },
    opponentActionCount: { ...memory.opponentActionCount },
    opponentResponseCount: { ...memory.opponentResponseCount },
    betrayalDebt: memory.betrayalDebt,
    repairCredit: memory.repairCredit,
    conflictMomentum: memory.conflictMomentum,
    fearTrace: memory.fearTrace,
    shameTrace: memory.shameTrace,
    volatility: memory.volatility,
    lastPredictionError: memory.lastPredictionError,
  };
}

export function getLearnedActionValue(memory: ConflictLearningMemory, actionId: string): number {
  const q = memory.actionValue[actionId] ?? 0;
  return Number.isFinite(q) ? q : 0;
}

export function responseCountKey(myAction: string, otherAction: string): string {
  return `my:${myAction}|other:${otherAction}`;
}

export function predictedResponseProb(
  memory: ConflictLearningMemory,
  myAction: string,
  otherAction: string,
  allOtherActions: readonly string[],
  alpha = DILEMMA_LEARNING_FORMULA.memory.responseAlpha,
): number {
  if (allOtherActions.length === 0) return 0;
  const numerator = (memory.opponentResponseCount[responseCountKey(myAction, otherAction)] ?? 0) + alpha;
  const denominator = allOtherActions.reduce((sum, actionId) => {
    return sum + (memory.opponentResponseCount[responseCountKey(myAction, actionId)] ?? 0) + alpha;
  }, 0);
  return numerator / Math.max(denominator, 1e-9);
}

export function mostLikelyPredictedResponse(
  memory: ConflictLearningMemory,
  myAction: string,
  allOtherActions: readonly string[],
): { actionId: string; probability: number } {
  let best = allOtherActions[0] ?? '';
  let bestP = 0;
  for (const actionId of allOtherActions) {
    const p = predictedResponseProb(memory, myAction, actionId, allOtherActions);
    if (p > bestP) {
      best = actionId;
      bestP = p;
    }
  }
  return { actionId: best, probability: bestP };
}

export function updateActionValue(oldQ: number, reward: number, learningRate: number): number {
  return oldQ + learningRate * (reward - oldQ);
}

export type ConflictMemoryUpdateInput = {
  memory: ConflictLearningMemory;
  myActionId: string;
  otherActionId: string;
  reward: ConflictReward;
  predictionError: number;
  observedImpact: ActionImpact;
  ownImpact: ActionImpact;
  relationBefore: ConflictRelationSnapshot;
  learningRate?: number;
};

export function updateConflictMemory(input: ConflictMemoryUpdateInput): ConflictLearningMemory {
  const cfg = DILEMMA_LEARNING_FORMULA.memory;
  const memory = input.memory;
  const predictionError = clamp01(input.predictionError);
  const learningRate = clamp01(input.learningRate ?? cfg.learningRateBase);

  decayRecord(memory.actionCount, cfg.countDecay);
  decayRecord(memory.opponentActionCount, cfg.countDecay);
  decayRecord(memory.opponentResponseCount, cfg.countDecay);

  memory.actionCount[input.myActionId] = (memory.actionCount[input.myActionId] ?? 0) + 1;
  memory.opponentActionCount[input.otherActionId] = (memory.opponentActionCount[input.otherActionId] ?? 0) + 1;
  const responseKey = responseCountKey(input.myActionId, input.otherActionId);
  memory.opponentResponseCount[responseKey] = (memory.opponentResponseCount[responseKey] ?? 0) + 1;

  const oldQ = getLearnedActionValue(memory, input.myActionId);
  memory.actionValue[input.myActionId] = updateActionValue(oldQ, input.reward.total, learningRate);

  const betrayalEvent = Math.max(input.observedImpact.betrayal, input.observedImpact.deception);
  const repairEvent = Math.max(input.observedImpact.repair, input.observedImpact.support * 0.5);
  const harmEvent = Math.max(input.observedImpact.harm, input.observedImpact.dominance * 0.35);
  const shameEvent = Math.max(input.ownImpact.betrayal, input.ownImpact.harm * 0.6) * input.reward.moralCost;

  memory.betrayalDebt =
    cfg.betrayalDebtDecay * memory.betrayalDebt
    + betrayalEvent * predictionError * clamp01(input.relationBefore.trust);
  memory.repairCredit =
    cfg.repairCreditDecay * memory.repairCredit
    + repairEvent * (1 - 0.5 * predictionError) * clamp01(input.relationBefore.conflict);
  memory.conflictMomentum =
    cfg.conflictMomentumDecay * memory.conflictMomentum
    + harmEvent
    + betrayalEvent
    + input.observedImpact.humiliation
    - repairEvent;
  memory.fearTrace =
    cfg.fearTraceDecay * memory.fearTrace
    + harmEvent
    + 0.5 * betrayalEvent
    + 0.35 * input.observedImpact.dominance;
  memory.shameTrace =
    cfg.shameTraceDecay * memory.shameTrace
    + shameEvent;
  memory.volatility =
    cfg.volatilityDecay * memory.volatility
    + (1 - cfg.volatilityDecay) * predictionError;
  memory.lastPredictionError = predictionError;

  return normalizeMemory(memory);
}

function decayRecord(record: Record<string, number>, decay: number): void {
  for (const key of Object.keys(record)) {
    const next = record[key] * decay;
    if (next < 1e-6) delete record[key];
    else record[key] = next;
  }
}

function normalizeMemory(memory: ConflictLearningMemory): ConflictLearningMemory {
  memory.betrayalDebt = clampNonNegativeFinite(memory.betrayalDebt);
  memory.repairCredit = clampNonNegativeFinite(memory.repairCredit);
  memory.conflictMomentum = clampNonNegativeFinite(memory.conflictMomentum);
  memory.fearTrace = clampNonNegativeFinite(memory.fearTrace);
  memory.shameTrace = clampNonNegativeFinite(memory.shameTrace);
  memory.volatility = clamp01(memory.volatility);
  memory.lastPredictionError = clamp01(memory.lastPredictionError);
  return memory;
}

function clampNonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
