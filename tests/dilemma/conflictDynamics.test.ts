import { describe, expect, it } from 'vitest';
import {
  collapseScore,
  createTrustExchangeProtocol,
  defaultConflictAgentState,
  defaultConflictRelationState,
  detectCyclePeriod,
  estimateDivergenceRate,
  getObservationForPlayer,
  repairCapacity,
  resolveProtocolStep,
  runConflictTrajectory,
  selectDominantAction,
  stateDistance,
  trajectoryMetrics,
  updateStrategyProfileReplicator,
  validateJointAction,
  type ConflictAction,
  type ConflictActionId,
  type ConflictState,
  type StrategyProfile,
} from '../../lib/dilemma';

function makeState(patch?: Partial<ConflictState>): ConflictState {
  const players = ['a', 'b'] as const;
  const strategyProfiles: Record<string, StrategyProfile> = {
    a: {
      playerId: 'a',
      probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 },
    },
    b: {
      playerId: 'b',
      probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 },
    },
  };

  return {
    tick: 0,
    players,
    agents: {
      a: defaultConflictAgentState({ cooperationTendency: 0.72, loyalty: 0.62 }),
      b: defaultConflictAgentState({ cooperationTendency: 0.68, loyalty: 0.58 }),
    },
    relations: {
      a: { b: defaultConflictRelationState({ trust: 0.62, bond: 0.42, conflict: 0.15 }) },
      b: { a: defaultConflictRelationState({ trust: 0.60, bond: 0.40, conflict: 0.18 }) },
    },
    environment: {
      resourceScarcity: 0.25,
      externalPressure: 0.30,
      visibility: 0.20,
      institutionalPressure: 0.45,
    },
    history: [],
    strategyProfiles,
    ...(patch ?? {}),
  };
}

function forced(a: ConflictActionId, b: ConflictActionId): readonly ConflictAction[] {
  return [
    { playerId: 'a', actionId: a },
    { playerId: 'b', actionId: b },
  ];
}

function expectBoundedState(state: ConflictState): void {
  for (const playerId of state.players) {
    for (const value of Object.values(state.agents[playerId])) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  }

  for (const fromId of state.players) {
    for (const toId of state.players) {
      if (fromId === toId) continue;
      for (const value of Object.values(state.relations[fromId][toId])) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  }

  for (const value of Object.values(state.environment)) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
}

describe('Conflict Lab deterministic dynamics scaffold', () => {
  it('resolves trust_exchange deterministically for the same semantic input', () => {
    const state = makeState();
    const protocol = createTrustExchangeProtocol(state.players);
    const first = resolveProtocolStep(state, protocol, forced('trust', 'betray'));
    const second = resolveProtocolStep(state, protocol, forced('trust', 'betray'));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toEqual(second.value);
  });

  it('hides current opponent action from pre-resolution observation', () => {
    const state = makeState();
    const protocol = createTrustExchangeProtocol(state.players);
    const observation = getObservationForPlayer(state, protocol, 'a');

    expect(observation.ok).toBe(true);
    if (!observation.ok) return;
    expect(observation.value.availableActionIds).toEqual(['trust', 'withhold', 'betray']);
    expect(Object.keys(observation.value)).not.toContain('actions');
    expect(Object.keys(observation.value)).not.toContain('currentOpponentActionId');
    expect(Object.keys(observation.value)).not.toContain('jointAction');
  });

  it('rejects invalid joint action shape through typed validation errors', () => {
    const state = makeState();
    const protocol = createTrustExchangeProtocol(state.players);
    const duplicateActions: readonly ConflictAction[] = [
      { playerId: 'a', actionId: 'trust' },
      { playerId: 'a', actionId: 'trust' },
    ];
    const duplicate = validateJointAction(state, protocol, duplicateActions);
    const invalid = validateJointAction(state, protocol, [
      { playerId: 'a', actionId: 'trust' },
      { playerId: 'b', actionId: 'invalid_action' as ConflictActionId },
    ]);

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('duplicate_player');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('invalid_action');
  });

  it('updates intended directions for trust exchange outcomes', () => {
    const protocol = createTrustExchangeProtocol(['a', 'b'] as const);
    const mutual = resolveProtocolStep(makeState(), protocol, forced('trust', 'trust'));
    const betrayed = resolveProtocolStep(makeState(), protocol, forced('trust', 'betray'));
    const mutualBetrayal = resolveProtocolStep(makeState(), protocol, forced('betray', 'betray'));
    const guarded = resolveProtocolStep(makeState(), protocol, forced('withhold', 'withhold'));

    expect(mutual.ok && betrayed.ok && mutualBetrayal.ok && guarded.ok).toBe(true);
    if (!mutual.ok || !betrayed.ok || !mutualBetrayal.ok || !guarded.ok) return;

    expect(mutual.value.outcome.outcomeTag).toBe('mutual_trust');
    expect(mutual.value.state.relations.a.b.trust).toBeGreaterThan(makeState().relations.a.b.trust);
    expect(mutual.value.state.relations.a.b.bond).toBeGreaterThan(makeState().relations.a.b.bond);

    expect(betrayed.value.outcome.outcomeTag).toBe('a_betrayed');
    expect(betrayed.value.state.relations.a.b.trust).toBeLessThan(makeState().relations.a.b.trust);
    expect(betrayed.value.state.agents.a.resentment).toBeGreaterThan(makeState().agents.a.resentment);

    expect(mutualBetrayal.value.outcome.outcomeTag).toBe('mutual_betrayal');
    expect(mutualBetrayal.value.state.relations.a.b.conflict).toBeGreaterThan(makeState().relations.a.b.conflict);

    expect(guarded.value.outcome.outcomeTag).toBe('mutual_withhold');
    expect(guarded.value.state.relations.a.b.conflict).toBeGreaterThan(makeState().relations.a.b.conflict);
  });

  it('keeps replicator profiles finite, normalized, deterministic, and tie-stable', () => {
    const profile: StrategyProfile = {
      playerId: 'a',
      probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 },
    };
    const utilities = [
      { actionId: 'trust' as const, U: 1, G: 0, R: 0, S: 0, L: 0, I: 0, P: 0, C: 0 },
      { actionId: 'withhold' as const, U: 1, G: 0, R: 0, S: 0, L: 0, I: 0, P: 0, C: 0 },
      { actionId: 'betray' as const, U: 0, G: 0, R: 0, S: 0, L: 0, I: 0, P: 0, C: 0 },
    ];
    const next = updateStrategyProfileReplicator(profile, utilities, ['trust', 'withhold', 'betray']);
    const repeat = updateStrategyProfileReplicator(profile, utilities, ['trust', 'withhold', 'betray']);
    const sum = Object.values(next.probabilities).reduce((acc, value) => acc + value, 0);

    expect(next).toEqual(repeat);
    expect(sum).toBeCloseTo(1);
    for (const value of Object.values(next.probabilities)) expect(Number.isFinite(value)).toBe(true);
    expect(selectDominantAction(next, ['trust', 'withhold', 'betray'])).toBe('trust');
  });

  it('keeps all bounded scalar fields inside [0, 1]', () => {
    const state = makeState({
      agents: {
        a: defaultConflictAgentState({ fear: 0.98, stress: 0.97, resentment: 0.96 }),
        b: defaultConflictAgentState({ fear: 0.99, stress: 0.98, resentment: 0.97 }),
      },
    });
    const result = runConflictTrajectory(
      state,
      createTrustExchangeProtocol(state.players),
      8,
      Array.from({ length: 8 }, () => forced('betray', 'betray')),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const step of result.value) expectBoundedState(step.state);
  });

  it('computes finite deterministic trajectory metrics', () => {
    const state = makeState();
    const run = runConflictTrajectory(
      state,
      createTrustExchangeProtocol(state.players),
      3,
      [forced('trust', 'trust'), forced('withhold', 'withhold'), forced('trust', 'betray')],
    );
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    const trajectory = [state, ...run.value.map((step) => step.state)];
    const perturbed = makeState({
      relations: {
        a: { b: defaultConflictRelationState({ trust: 0.63, bond: 0.42, conflict: 0.15 }) },
        b: { a: defaultConflictRelationState({ trust: 0.61, bond: 0.40, conflict: 0.18 }) },
      },
    });
    const perturbedRun = runConflictTrajectory(
      perturbed,
      createTrustExchangeProtocol(perturbed.players),
      3,
      [forced('trust', 'trust'), forced('withhold', 'withhold'), forced('trust', 'betray')],
    );
    expect(perturbedRun.ok).toBe(true);
    if (!perturbedRun.ok) return;
    const perturbedTrajectory = [perturbed, ...perturbedRun.value.map((step) => step.state)];
    const metrics = trajectoryMetrics(trajectory, { cycleEpsilon: 0.000001 });
    const divergence = estimateDivergenceRate(trajectory, perturbedTrajectory);

    expect(Number.isFinite(stateDistance(trajectory[0], trajectory[1]))).toBe(true);
    expect(Number.isFinite(collapseScore(trajectory[3]))).toBe(true);
    expect(Number.isFinite(repairCapacity(trajectory[3]))).toBe(true);
    expect(Number.isFinite(metrics.distanceFromStart)).toBe(true);
    expect(Number.isFinite(divergence)).toBe(true);
    expect(detectCyclePeriod([state, state], 0.000001)).toBe(1);
  });
});
