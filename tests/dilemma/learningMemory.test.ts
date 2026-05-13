import { describe, expect, it } from 'vitest';
import {
  createConflictLearningMemory,
  predictedResponseProb,
  updateConflictMemory,
  type ActionImpact,
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

const neutralReward: ConflictReward = {
  total: 0,
  goalGain: 0,
  safetyGain: 0,
  relationGain: 0,
  powerGain: 0,
  moralCost: 0,
  stressCost: 0,
};

describe('ConflictLearningMemory', () => {
  it('uses smoothed response probabilities before evidence exists', () => {
    const memory = createConflictLearningMemory();
    expect(predictedResponseProb(memory, 'support', 'betray', ['support', 'betray'])).toBeCloseTo(0.5);
  });

  it('updates opponent response counts and action value deterministically', () => {
    const memory = createConflictLearningMemory();
    updateConflictMemory({
      memory,
      myActionId: 'support',
      otherActionId: 'betray',
      reward: { ...neutralReward, total: -0.6, relationGain: -0.4, stressCost: 0.2 },
      predictionError: 0.5,
      observedImpact: { ...blankImpact, betrayal: 0.8, harm: 0.2 },
      ownImpact: { ...blankImpact, support: 0.7 },
      relationBefore: { trust: 0.8, bond: 0.6, conflict: 0.2, fear: 0.1 },
    });

    expect(memory.actionValue.support).toBeLessThan(0);
    expect(memory.actionCount.support).toBeCloseTo(1);
    expect(memory.opponentActionCount.betray).toBeCloseTo(1);
    expect(memory.opponentResponseCount['my:support|other:betray']).toBeCloseTo(1);
    expect(memory.betrayalDebt).toBeGreaterThan(0);
    expect(memory.conflictMomentum).toBeGreaterThan(0);
    expect(memory.lastPredictionError).toBeCloseTo(0.5);
  });

  it('learns a higher probability for observed responses than unobserved responses', () => {
    const memory = createConflictLearningMemory();
    updateConflictMemory({
      memory,
      myActionId: 'apologize',
      otherActionId: 'punish',
      reward: { ...neutralReward, total: -0.3 },
      predictionError: 0.5,
      observedImpact: { ...blankImpact, harm: 0.7, humiliation: 0.4 },
      ownImpact: { ...blankImpact, repair: 0.8 },
      relationBefore: { trust: 0.4, bond: 0.2, conflict: 0.7, fear: 0.3 },
    });

    const punishP = predictedResponseProb(memory, 'apologize', 'punish', ['forgive', 'punish']);
    const forgiveP = predictedResponseProb(memory, 'apologize', 'forgive', ['forgive', 'punish']);
    expect(punishP).toBeGreaterThan(forgiveP);
  });
});
