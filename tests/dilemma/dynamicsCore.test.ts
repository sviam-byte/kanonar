import { describe, expect, it } from 'vitest';
import {
  actionImpactForTrustExchange,
  applyRegimeHysteresis,
  applyRelationDelta,
  classifyRegime,
  computePredictionError,
  computeRelationDelta,
  computeReward,
  createConflictLearningMemory,
  defaultConflictRegimeState,
  defaultConflictRelationState,
  predictedResponseProb,
  updateDynamicsConflictMemory,
} from '../../lib/dilemma';

describe('Conflict Lab canonical learning dynamics', () => {
  it('computes prediction error from smoothed opponent response counts', () => {
    const memory = createConflictLearningMemory();
    const before = computePredictionError(memory, 'trust', 'betray', ['trust', 'withhold', 'betray']);

    const afterMemory = updateDynamicsConflictMemory({
      memoryBefore: memory,
      myActionId: 'trust',
      otherActionId: 'betray',
      reward: { total: -1, goalGain: -1, safetyGain: 0, relationGain: -0.5, powerGain: 0, moralCost: 0, stressCost: 0.2 },
      predictionError: before.predictionError,
      observedImpact: actionImpactForTrustExchange('betray'),
      ownImpact: actionImpactForTrustExchange('trust'),
      relationBefore: defaultConflictRelationState({ trust: 0.8, bond: 0.6 }),
    });
    const after = computePredictionError(afterMemory, 'trust', 'betray', ['trust', 'withhold', 'betray']);

    expect(before.predictionError).toBeCloseTo(2 / 3);
    expect(predictedResponseProb(afterMemory, 'trust', 'betray', ['trust', 'withhold', 'betray'])).toBeGreaterThan(1 / 3);
    expect(after.predictionError).toBeLessThan(before.predictionError);
  });

  it('updates Q-values deterministically and keeps memory finite', () => {
    const memory = createConflictLearningMemory();
    const next = updateDynamicsConflictMemory({
      memoryBefore: memory,
      myActionId: 'betray',
      otherActionId: 'withhold',
      reward: { total: 0.4, goalGain: 0.5, safetyGain: 0, relationGain: -0.1, powerGain: 0.2, moralCost: 0.1, stressCost: 0.1 },
      predictionError: 0.4,
      observedImpact: actionImpactForTrustExchange('withhold'),
      ownImpact: actionImpactForTrustExchange('betray'),
      relationBefore: defaultConflictRelationState(),
    });
    const repeat = updateDynamicsConflictMemory({
      memoryBefore: memory,
      myActionId: 'betray',
      otherActionId: 'withhold',
      reward: { total: 0.4, goalGain: 0.5, safetyGain: 0, relationGain: -0.1, powerGain: 0.2, moralCost: 0.1, stressCost: 0.1 },
      predictionError: 0.4,
      observedImpact: actionImpactForTrustExchange('withhold'),
      ownImpact: actionImpactForTrustExchange('betray'),
      relationBefore: defaultConflictRelationState(),
    });

    expect(next).toEqual(repeat);
    expect(next.actionValue.betray).toBeGreaterThan(0);
    expect(Number.isFinite(next.betrayalDebt)).toBe(true);
  });

  it('makes betrayal debt larger under high trust, high bond, and high prediction error', () => {
    const low = updateDynamicsConflictMemory({
      memoryBefore: createConflictLearningMemory(),
      myActionId: 'trust',
      otherActionId: 'betray',
      reward: { total: -0.2, goalGain: -0.2, safetyGain: 0, relationGain: -0.1, powerGain: 0, moralCost: 0, stressCost: 0.1 },
      predictionError: 0.1,
      observedImpact: actionImpactForTrustExchange('betray'),
      ownImpact: actionImpactForTrustExchange('trust'),
      relationBefore: defaultConflictRelationState({ trust: 0.2, bond: 0.1 }),
    });
    const high = updateDynamicsConflictMemory({
      memoryBefore: createConflictLearningMemory(),
      myActionId: 'trust',
      otherActionId: 'betray',
      reward: { total: -1, goalGain: -1, safetyGain: 0, relationGain: -0.8, powerGain: 0, moralCost: 0, stressCost: 0.3 },
      predictionError: 0.9,
      observedImpact: actionImpactForTrustExchange('betray'),
      ownImpact: actionImpactForTrustExchange('trust'),
      relationBefore: defaultConflictRelationState({ trust: 0.9, bond: 0.8 }),
    });

    expect(high.betrayalDebt).toBeGreaterThan(low.betrayalDebt * 10);
  });
});

describe('Conflict Lab canonical relation dynamics and regimes', () => {
  it('scales betrayal relation damage by current trust, bond, and prediction error', () => {
    const lowRelation = defaultConflictRelationState({ trust: 0.2, bond: 0.1, conflict: 0.2 });
    const highRelation = defaultConflictRelationState({ trust: 0.85, bond: 0.75, conflict: 0.2 });
    const memory = createConflictLearningMemory();
    const lowDelta = computeRelationDelta({
      relationBefore: lowRelation,
      memoryBefore: memory,
      observedImpact: actionImpactForTrustExchange('betray'),
      ownImpact: actionImpactForTrustExchange('trust'),
      predictionError: 0.1,
    });
    const highDelta = computeRelationDelta({
      relationBefore: highRelation,
      memoryBefore: memory,
      observedImpact: actionImpactForTrustExchange('betray'),
      ownImpact: actionImpactForTrustExchange('trust'),
      predictionError: 0.9,
    });

    expect(Math.abs(highDelta.trust ?? 0)).toBeGreaterThan(Math.abs(lowDelta.trust ?? 0));
    expect(highDelta.conflict ?? 0).toBeGreaterThan(lowDelta.conflict ?? 0);
  });

  it('saturates support and repair as trust approaches one', () => {
    const low = computeRelationDelta({
      relationBefore: defaultConflictRelationState({ trust: 0.2, bond: 0.2, conflict: 0.6 }),
      memoryBefore: createConflictLearningMemory(),
      observedImpact: actionImpactForTrustExchange('trust'),
      ownImpact: actionImpactForTrustExchange('trust'),
      predictionError: 0,
    });
    const high = computeRelationDelta({
      relationBefore: defaultConflictRelationState({ trust: 0.92, bond: 0.8, conflict: 0.6 }),
      memoryBefore: createConflictLearningMemory(),
      observedImpact: actionImpactForTrustExchange('trust'),
      ownImpact: actionImpactForTrustExchange('trust'),
      predictionError: 0,
    });

    expect(low.trust ?? 0).toBeGreaterThan(high.trust ?? 0);
  });

  it('updates volatility from prediction error and relation movement', () => {
    const relation = defaultConflictRelationState({ volatility: 0.1, conflict: 0.3, trust: 0.7 });
    const delta = computeRelationDelta({
      relationBefore: relation,
      memoryBefore: createConflictLearningMemory(),
      observedImpact: actionImpactForTrustExchange('betray'),
      ownImpact: actionImpactForTrustExchange('trust'),
      predictionError: 0.9,
    });
    const after = applyRelationDelta(relation, delta);

    expect(after.volatility).toBeGreaterThan(relation.volatility);
  });

  it('keeps hostile and ruptured regimes from flickering through hysteresis', () => {
    const hostile = defaultConflictRegimeState({ regime: 'hostile', ticksInRegime: 3 });
    const weakRepair = createConflictLearningMemory();
    weakRepair.repairCredit = 0.2;
    const stillHostile = applyRegimeHysteresis(hostile, defaultConflictRelationState({ conflict: 0.4, trust: 0.5 }), weakRepair);

    const goodRepair = createConflictLearningMemory();
    goodRepair.repairCredit = 0.5;
    const firstExitTick = applyRegimeHysteresis(hostile, defaultConflictRelationState({ conflict: 0.4, trust: 0.5 }), goodRepair);
    const secondExitTick = applyRegimeHysteresis(firstExitTick, defaultConflictRelationState({ conflict: 0.4, trust: 0.5 }), goodRepair);

    const ruptured = defaultConflictRegimeState({ regime: 'ruptured', ticksInRegime: 4 });
    const notEnoughForRuptureExit = applyRegimeHysteresis(
      ruptured,
      defaultConflictRelationState({ conflict: 0.30, trust: 0.35, perceivedThreat: 0.25 }),
      goodRepair,
    );

    expect(classifyRegime(defaultConflictRelationState({ conflict: 0.7 }))).toBe('hostile');
    expect(stillHostile.regime).toBe('hostile');
    expect(firstExitTick.regime).toBe('hostile');
    expect(secondExitTick.regime).not.toBe('hostile');
    expect(notEnoughForRuptureExit.regime).toBe('ruptured');
  });

  it('computes finite rewards from before and after relation state', () => {
    const reward = computeReward({
      payoff: 0.5,
      actionId: 'trust',
      relationBefore: defaultConflictRelationState({ trust: 0.4, bond: 0.3, conflict: 0.5 }),
      relationAfter: defaultConflictRelationState({ trust: 0.5, bond: 0.4, conflict: 0.35 }),
      ownImpact: actionImpactForTrustExchange('trust'),
      observedImpact: actionImpactForTrustExchange('trust'),
    });

    expect(Number.isFinite(reward.total)).toBe(true);
    expect(reward.relationGain).toBeGreaterThan(0);
  });
});
