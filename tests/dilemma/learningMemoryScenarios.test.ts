import { describe, expect, it } from 'vitest';
import {
  createConflictLearningMemory,
  predictedResponseProb,
  updateConflictMemory,
  type ActionImpact,
  type ConflictLearningMemory,
  type ConflictRelationSnapshot,
  type ConflictReward,
} from '../../lib/dilemma/learningMemory';

const blankImpact: ActionImpact = {
  support: 0,
  harm: 0,
  betrayal: 0,
  deception: 0,
  repair: 0,
  dominance: 0,
  submission: 0,
  withdrawal: 0,
  humiliation: 0,
  protection: 0,
};

const neutralRelation: ConflictRelationSnapshot = {
  trust: 0.5,
  bond: 0.3,
  conflict: 0.2,
  fear: 0.1,
};

const neutralReward: ConflictReward = {
  total: 0,
  goalGain: 0,
  safetyGain: 0,
  relationGain: 0,
  powerGain: 0,
  moralCost: 0,
  stressCost: 0,
};

function step(
  memory: ConflictLearningMemory,
  patch: Partial<Parameters<typeof updateConflictMemory>[0]>,
) {
  return updateConflictMemory({
    memory,
    myActionId: 'support',
    otherActionId: 'neutral',
    reward: neutralReward,
    predictionError: 0,
    observedImpact: blankImpact,
    ownImpact: blankImpact,
    relationBefore: neutralRelation,
    ...patch,
  });
}

describe('ConflictLearningMemory scenario protocols', () => {
  it('makes betrayal debt larger when betrayal is surprising and trust was high', () => {
    const trusted = createConflictLearningMemory();
    const guarded = createConflictLearningMemory();

    step(trusted, {
      myActionId: 'support',
      otherActionId: 'betray',
      reward: { ...neutralReward, total: -1, relationGain: -0.7, stressCost: 0.3 },
      predictionError: 0.9,
      observedImpact: { ...blankImpact, betrayal: 0.85, deception: 0.6, harm: 0.25 },
      relationBefore: { trust: 0.9, bond: 0.7, conflict: 0.1, fear: 0.05 },
    });
    step(guarded, {
      myActionId: 'support',
      otherActionId: 'betray',
      reward: { ...neutralReward, total: -0.2, relationGain: -0.2, stressCost: 0.1 },
      predictionError: 0.15,
      observedImpact: { ...blankImpact, betrayal: 0.85, deception: 0.6, harm: 0.25 },
      relationBefore: { trust: 0.2, bond: 0.1, conflict: 0.6, fear: 0.4 },
    });

    expect(trusted.betrayalDebt).toBeGreaterThan(guarded.betrayalDebt * 10);
    expect(trusted.lastPredictionError).toBeCloseTo(0.9);
    expect(guarded.lastPredictionError).toBeCloseTo(0.15);
  });

  it('learns that repeated failed apologies are likely to receive punishment', () => {
    const memory = createConflictLearningMemory();

    for (let i = 0; i < 4; i++) {
      step(memory, {
        myActionId: 'apologize',
        otherActionId: 'punish',
        reward: { ...neutralReward, total: -1, relationGain: -0.55, safetyGain: -0.25, stressCost: 0.4 },
        predictionError: 0.55,
        ownImpact: { ...blankImpact, repair: 0.85, support: 0.45 },
        observedImpact: { ...blankImpact, harm: 0.75, humiliation: 0.45, dominance: 0.4 },
        relationBefore: { trust: 0.35, bond: 0.25, conflict: 0.75, fear: 0.35 },
      });
    }

    const punishP = predictedResponseProb(memory, 'apologize', 'punish', ['forgive', 'punish']);
    const forgiveP = predictedResponseProb(memory, 'apologize', 'forgive', ['forgive', 'punish']);

    expect(punishP).toBeGreaterThan(0.65);
    expect(punishP).toBeGreaterThan(forgiveP);
    expect(memory.actionValue.apologize).toBeLessThan(-0.6);
    expect(memory.conflictMomentum).toBeGreaterThan(0);
    expect(memory.volatility).toBeGreaterThan(0);
  });

  it('lets credible repair build credit and reduce existing conflict momentum', () => {
    const memory = createConflictLearningMemory();

    step(memory, {
      myActionId: 'attack',
      otherActionId: 'counterattack',
      reward: { ...neutralReward, total: -0.8, safetyGain: -0.4, relationGain: -0.5, stressCost: 0.3 },
      predictionError: 0.45,
      ownImpact: { ...blankImpact, harm: 0.7 },
      observedImpact: { ...blankImpact, harm: 0.9, betrayal: 0.35, humiliation: 0.45, dominance: 0.6 },
      relationBefore: { trust: 0.45, bond: 0.3, conflict: 0.65, fear: 0.4 },
    });

    const momentumAfterHarm = memory.conflictMomentum;

    step(memory, {
      myActionId: 'repair',
      otherActionId: 'accept_repair',
      reward: { ...neutralReward, total: 0.65, relationGain: 0.6, safetyGain: 0.2 },
      predictionError: 0.1,
      ownImpact: { ...blankImpact, repair: 0.85, support: 0.65 },
      observedImpact: { ...blankImpact, repair: 0.9, support: 0.8 },
      relationBefore: { trust: 0.42, bond: 0.32, conflict: 0.85, fear: 0.25 },
    });

    expect(memory.repairCredit).toBeGreaterThan(0);
    expect(memory.conflictMomentum).toBeLessThan(momentumAfterHarm);
    expect(memory.actionValue.repair).toBeGreaterThan(0);
  });

  it('keeps long adversarial protocols finite and probability-normalized', () => {
    const memory = createConflictLearningMemory();
    const actions = ['betray', 'punish', 'withdraw'];

    for (let i = 0; i < 40; i++) {
      const otherActionId = actions[i % actions.length];
      step(memory, {
        myActionId: i % 2 === 0 ? 'support' : 'attack',
        otherActionId,
        reward: { ...neutralReward, total: -0.4, relationGain: -0.25, stressCost: 0.2 },
        predictionError: i % 3 === 0 ? 0.8 : 0.35,
        observedImpact: {
          ...blankImpact,
          betrayal: otherActionId === 'betray' ? 0.7 : 0,
          harm: otherActionId === 'punish' ? 0.65 : 0.2,
          withdrawal: otherActionId === 'withdraw' ? 0.8 : 0,
          humiliation: otherActionId === 'punish' ? 0.35 : 0,
        },
        ownImpact: i % 2 === 0 ? { ...blankImpact, support: 0.5 } : { ...blankImpact, harm: 0.55 },
        relationBefore: { trust: 0.55, bond: 0.35, conflict: 0.55, fear: 0.25 },
      });
    }

    const responseProbSum = actions.reduce((sum, actionId) => {
      return sum + predictedResponseProb(memory, 'support', actionId, actions);
    }, 0);

    for (const value of Object.values(memory.actionValue)) {
      expect(Number.isFinite(value)).toBe(true);
    }

    for (const value of [
      ...Object.values(memory.actionCount),
      ...Object.values(memory.opponentActionCount),
      ...Object.values(memory.opponentResponseCount),
      memory.betrayalDebt,
      memory.repairCredit,
      memory.conflictMomentum,
      memory.fearTrace,
      memory.shameTrace,
      memory.volatility,
      memory.lastPredictionError,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(memory.volatility).toBeLessThanOrEqual(1);
    expect(memory.lastPredictionError).toBeLessThanOrEqual(1);
    expect(responseProbSum).toBeCloseTo(1);
  });
});
