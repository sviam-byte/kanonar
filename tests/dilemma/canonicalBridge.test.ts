import { describe, expect, it } from 'vitest';
import {
  getScenario,
  runCanonicalConflictLab,
  runDilemmaV2,
} from '../../lib/dilemma';
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
      regulation: { arousal: 0.45 },
    },
    cognitive: {
      fallback_policy: 'support',
      planning_horizon: 8,
      deception_propensity: 20,
      shame_guilt_sensitivity: 72,
      w_goals: { trust_partner: 0.8, survive_interrogation: 0.6 },
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
    'agent-b': { trust: 0.72, align: 0.62, respect: 0.58, fear: 0.08, bond: 0.55, conflict: 0.12, history: [] },
  } as AgentState['relationships'];
  b.relationships = {
    'agent-a': { trust: 0.66, align: 0.58, respect: 0.54, fear: 0.10, bond: 0.48, conflict: 0.16, history: [] },
  } as AgentState['relationships'];

  return {
    tick: 0,
    agents: [a, b],
    locations: [],
    leadership: { leaderId: null },
    initialRelations: {},
  } as unknown as WorldState;
}

describe('canonical Conflict Lab bridge', () => {
  it('runs trust_exchange through canonical dynamics and returns normalized state', () => {
    const report = runCanonicalConflictLab({
      scenario: getScenario('trust_interrogation'),
      players: ['agent-a', 'agent-b'],
      totalRounds: 3,
      world: makeWorld(),
      institutionalPressure: 0.6,
    });

    expect(report.runtime).toBe('canonical_dynamics');
    if (report.runtime !== 'canonical_dynamics') return;

    expect(report.protocolId).toBe('trust_exchange');
    expect(report.initialState.memories['agent-a']?.['agent-b']).toBeDefined();
    expect(report.finalState.regimes['agent-a']?.['agent-b']).toBeDefined();
    expect(report.steps).toHaveLength(3);
    expect(report.frames).toHaveLength(6);
    expect(Number.isFinite(report.metrics.distanceFromStart)).toBe(true);
  });

  it('returns unsupported report for protocol kernels that are not canonical yet', () => {
    const report = runCanonicalConflictLab({
      scenario: getScenario('authority_judgment'),
      players: ['agent-a', 'agent-b'],
      totalRounds: 2,
      world: makeWorld(),
    });

    expect(report.runtime).toBe('unsupported_kernel');
    if (report.runtime !== 'unsupported_kernel') return;
    expect(report.mechanicId).not.toBe('trust_exchange');
    expect(report.reason).toContain('canonical kernel pending');
  });

  it('is deterministic for the same canonical config and reflects scheduled pressure', () => {
    const config = {
      scenario: getScenario('trust_interrogation'),
      players: ['agent-a', 'agent-b'] as const,
      totalRounds: 3,
      world: makeWorld(),
      institutionalPressure: 0.8,
      pressureSchedule: { shape: 'rising', floor: 0.2 } as const,
    };
    const first = runCanonicalConflictLab(config);
    const second = runCanonicalConflictLab(config);

    expect(first).toEqual(second);
    expect(first.runtime).toBe('canonical_dynamics');
    if (first.runtime !== 'canonical_dynamics') return;
    expect(first.steps[0].state.environment.institutionalPressure).toBeLessThan(
      first.finalState.environment.institutionalPressure,
    );
  });
});

describe('runDilemmaV2 canonical core attachment', () => {
  it('attaches canonical dynamics for trust_exchange without removing legacy rounds', () => {
    const result = runDilemmaV2({
      scenarioId: 'trust_interrogation',
      players: ['agent-a', 'agent-b'],
      totalRounds: 3,
      world: makeWorld(),
      seed: 1234,
    });

    expect(result.game.rounds).toHaveLength(3);
    expect(result.conflictCore?.runtime).toBe('canonical_dynamics');
    if (result.conflictCore?.runtime !== 'canonical_dynamics') return;
    expect(result.conflictCore.frames).toHaveLength(6);
  });

  it('attaches unsupported status for non-canonical mechanics', () => {
    const result = runDilemmaV2({
      scenarioId: 'authority_judgment',
      players: ['agent-a', 'agent-b'],
      totalRounds: 2,
      world: makeWorld(),
      seed: 1234,
    });

    expect(result.game.rounds).toHaveLength(2);
    expect(result.conflictCore?.runtime).toBe('unsupported_kernel');
  });
});
