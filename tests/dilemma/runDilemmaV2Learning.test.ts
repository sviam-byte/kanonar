import { describe, expect, it } from 'vitest';
import { runDilemmaV2 } from '../../lib/dilemma';
import type { V2RunResult } from '../../lib/dilemma';
import type { AgentState, WorldState } from '../../types';

function makeAgent(id: string, patch: Record<string, number> = {}): AgentState {
  return {
    entityId: id,
    title: id,
    vector_base: {
      A_Safety_Care: 0.65,
      A_Power_Sovereignty: 0.35,
      A_Knowledge_Truth: 0.62,
      A_Transparency_Secrecy: 0.55,
      A_Legitimacy_Procedure: 0.52,
      C_reciprocity_index: 0.70,
      C_betrayal_cost: 0.68,
      C_coalition_loyalty: 0.60,
      C_reputation_sensitivity: 0.58,
      C_dominance_empathy: 0.66,
      B_decision_temperature: 0.35,
      B_goal_coherence: 0.74,
      B_discount_rate: 0.30,
      B_exploration_rate: 0.28,
      G_Self_concept_strength: 0.62,
      G_Self_consistency_drive: 0.66,
      ...patch,
    },
    state: {
      will: 70,
      loyalty: 62,
      dark_exposure: 10,
      drift_state: 12,
      burnout_risk: 0.08,
      backlog_load: 30,
      overload_sensitivity: 40,
    },
    body: {
      acute: {
        stress: 12,
        fatigue: 8,
        moral_injury: 0,
        pain_now: 0,
      },
      regulation: {
        arousal: 0.45,
      },
    },
    cognitive: {
      fallback_policy: 'support',
      planning_horizon: 8,
      deception_propensity: 20,
      shame_guilt_sensitivity: 72,
      w_goals: {
        trust_partner: 0.8,
        survive_interrogation: 0.6,
      },
    },
    relationships: {},
  } as unknown as AgentState;
}

function makeWorld(): WorldState {
  const a = makeAgent('agent-a');
  const b = makeAgent('agent-b', {
    A_Power_Sovereignty: 0.58,
    C_betrayal_cost: 0.45,
    B_decision_temperature: 0.48,
  });

  a.relationships = {
    'agent-b': {
      trust: 0.72,
      align: 0.62,
      respect: 0.58,
      fear: 0.08,
      bond: 0.55,
      conflict: 0.12,
      history: [],
    },
  } as AgentState['relationships'];
  b.relationships = {
    'agent-a': {
      trust: 0.66,
      align: 0.58,
      respect: 0.54,
      fear: 0.10,
      bond: 0.48,
      conflict: 0.16,
      history: [],
    },
  } as AgentState['relationships'];

  return {
    tick: 0,
    agents: [a, b],
    locations: [],
    leadership: { leaderId: null },
    initialRelations: {},
  } as unknown as WorldState;
}

function runLearningScenario(): V2RunResult {
  return runDilemmaV2({
    scenarioId: 'trust_interrogation',
    players: ['agent-a', 'agent-b'],
    totalRounds: 3,
    world: makeWorld(),
    seed: 1234,
  });
}

function semanticLearningTrace(result: V2RunResult) {
  return result.game.rounds.map((round) => {
    const out: Record<string, unknown> = { choices: round.choices };
    for (const playerId of result.game.players) {
      const learning = round.traces[playerId].learning;
      out[playerId] = learning
        ? {
            actionId: learning.actionId,
            otherActionId: learning.otherActionId,
            utility: learning.utility,
            prediction: learning.prediction,
            reward: learning.reward,
            relationBefore: learning.relationBefore,
            relationAfter: learning.relationAfter,
            memoryAfter: {
              actionValue: learning.memoryAfter.actionValue,
              actionCount: learning.memoryAfter.actionCount,
              opponentResponseCount: learning.memoryAfter.opponentResponseCount,
              betrayalDebt: learning.memoryAfter.betrayalDebt,
              repairCredit: learning.memoryAfter.repairCredit,
              conflictMomentum: learning.memoryAfter.conflictMomentum,
              volatility: learning.memoryAfter.volatility,
            },
          }
        : null;
    }
    return out;
  });
}

describe('runDilemmaV2 learning trace', () => {
  it('records memory updates, reward, prediction, and finite utility terms', () => {
    const result = runLearningScenario();

    expect(result.game.rounds).toHaveLength(3);

    for (const round of result.game.rounds) {
      for (const playerId of result.game.players) {
        const trace = round.traces[playerId];
        const learning = trace.learning;
        expect(learning).toBeDefined();
        if (!learning) continue;

        const beforeCount = learning.memoryBefore.actionCount[trace.chosenActionId] ?? 0;
        const afterCount = learning.memoryAfter.actionCount[trace.chosenActionId] ?? 0;
        expect(afterCount).toBeGreaterThan(beforeCount);

        expect(learning.actionId).toBe(trace.chosenActionId);
        expect(Number.isFinite(learning.utility.baseU)).toBe(true);
        expect(Number.isFinite(learning.utility.learnedQ)).toBe(true);
        expect(Number.isFinite(learning.utility.finalU)).toBe(true);
        expect(Number.isFinite(learning.reward.total)).toBe(true);
        expect(Number.isFinite(learning.prediction.predictedProbability)).toBe(true);
        expect(learning.prediction.predictionError).toBeGreaterThanOrEqual(0);
        expect(learning.prediction.predictionError).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for semantic learning trace fields under the same seed', () => {
    const first = runLearningScenario();
    const second = runLearningScenario();

    expect(first.game.rounds.map((round) => round.choices)).toEqual(
      second.game.rounds.map((round) => round.choices),
    );
    expect(semanticLearningTrace(first)).toEqual(semanticLearningTrace(second));
  });
});
