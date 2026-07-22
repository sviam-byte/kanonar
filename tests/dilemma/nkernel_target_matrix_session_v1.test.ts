import { describe, expect, it } from 'vitest';

import { runConflictNLabSessionV1 } from '../../lib/dilemma/integration/nliveSession';
import { runConflictTargetMatrixLabSessionV1 } from '../../lib/dilemma/integration/ntargetLiveSession';
import { conflictDirectedActionMatrixToDyadicJointActionsV1 } from '../../lib/dilemma/nkernel/ntargetmatrix';
import { conflictDirectedOutcomeToDyadicV1, replayConflictDirectedHistoryEventV1 } from '../../lib/dilemma/nkernel/ntargetstep';
import { mockAgent, mockWorld } from '../pipeline/fixtures';

function world(ids: readonly string[]) {
  return mockWorld(ids.map((id) => mockAgent(id)));
}

describe('conflict-target-matrix-live-session-v1', () => {
  it('reduces to the existing N=2 live session over semantic fields', () => {
    const config = {
      scenarioId: 'trust_interrogation',
      players: ['A', 'B'] as const,
      totalRounds: 3,
      world: world(['A', 'B']),
      seed: 17,
      pressureSchedule: { shape: 'rising', floor: 0.1 } as const,
    };
    const legacy = runConflictNLabSessionV1(config);
    const matrix = runConflictTargetMatrixLabSessionV1(config);
    if (legacy.ok === false || matrix.ok === false) throw new Error('expected both sessions to run');

    expect(matrix.value.initialState).toEqual(legacy.value.initialState);
    expect(matrix.value.finalState).toEqual(legacy.value.finalState);
    expect(matrix.value.trajectory).toEqual(legacy.value.trajectory);
    expect(matrix.value.history).toEqual(legacy.value.finalState.history);
    expect(matrix.value.metrics).toEqual(legacy.value.metrics);
    expect(matrix.value.decisions).toHaveLength(legacy.value.decisions.length);

    matrix.value.decisions.forEach((decision, round) => {
      const previous = legacy.value.decisions[round];
      const canonicalActions = conflictDirectedActionMatrixToDyadicJointActionsV1(decision.canonical.actionMatrix);
      const referenceActions = conflictDirectedActionMatrixToDyadicJointActionsV1(decision.reference.actionMatrix);
      const canonicalOutcome = conflictDirectedOutcomeToDyadicV1(decision.canonical.step.outcome);
      const referenceOutcome = conflictDirectedOutcomeToDyadicV1(decision.reference.step.outcome);
      if (canonicalActions.ok === false || referenceActions.ok === false
        || canonicalOutcome.ok === false || referenceOutcome.ok === false) {
        throw new Error('expected dyadic matrix adapters to succeed');
      }
      const canonicalActionRecord = Object.fromEntries(canonicalActions.value.map((entry) => [entry.playerId, entry.actionId]));
      const referenceActionRecord = Object.fromEntries(referenceActions.value.map((entry) => [entry.playerId, entry.actionId]));
      expect(decision.choices.A.B).toEqual(previous.choices.A);
      expect(decision.choices.B.A).toEqual(previous.choices.B);
      expect(decision.choices.A.B.rngChannelId).toBe('conflict-live:trust_interrogation:17:A');
      expect(decision.choices.B.A.rngChannelId).toBe('conflict-live:trust_interrogation:17:B');
      expect(canonicalActionRecord).toEqual(previous.canonical.actions);
      expect(referenceActionRecord).toEqual(previous.reference.actions);
      expect(decision.canonical.step.state).toEqual(previous.canonical.step.state);
      expect(decision.reference.step.state).toEqual(previous.reference.step.state);
      expect(canonicalOutcome.value).toEqual(previous.canonical.step.outcome);
      expect(referenceOutcome.value).toEqual(previous.reference.step.outcome);
    });
  });

  it('runs a complete deterministic N=3 matrix session with replayable directed history', () => {
    const config = {
      scenarioId: 'trust_interrogation',
      players: ['a', 'b', 'c'] as const,
      totalRounds: 2,
      world: world(['a', 'b', 'c']),
      seed: 29,
      institutionalPressure: 0.7,
      pressureSchedule: { shape: 'rising', floor: 0.1 } as const,
    };
    const first = runConflictTargetMatrixLabSessionV1(config);
    const second = runConflictTargetMatrixLabSessionV1(config);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(config.world).toEqual(world(['a', 'b', 'c']));
    if (first.ok === false) throw new Error(first.error.message);

    expect(first.value.decisions).toHaveLength(2);
    expect(first.value.history).toHaveLength(2);
    expect(first.value.finalState.trace).toHaveLength(12);
    for (const decision of first.value.decisions) {
      const cells = decision.canonical.actionMatrix.participantIds.flatMap((actorId) => (
        decision.canonical.actionMatrix.participantIds
          .filter((targetId) => targetId !== actorId)
          .map((targetId) => decision.choices[actorId]?.[targetId])
      ));
      expect(cells).toHaveLength(6);
      expect(cells.every(Boolean)).toBe(true);
      expect(decision.choices.a.b.rngChannelId).toBe('conflict-live:trust_interrogation:29:1:a:1:b');
      expect(decision.choices.a.c.rngChannelId).toBe('conflict-live:trust_interrogation:29:1:a:1:c');
      expect(decision.canonical.step.pairwise).toHaveLength(3);
      expect(decision.canonical.actionMatrix.participantIds).toEqual(['a', 'b', 'c']);
    }
    const event = first.value.history[0];
    expect(first.value.pressureHistory).toEqual([0.1, 0.7]);
    expect(first.value.scheduledStates).toHaveLength(2);
    expect(event && 'schemaVersion' in event ? event.schemaVersion : undefined).toBe('conflict-directed-history-event-v1');
    if (!event || !('schemaVersion' in event) || event.schemaVersion !== 'conflict-directed-history-event-v1') throw new Error('expected directed history');
    const replayed = replayConflictDirectedHistoryEventV1({
      state: first.value.scheduledStates[0],
      protocol: { id: 'trust_exchange', roles: { a: 'participant', b: 'participant', c: 'participant' }, phases: ['simultaneous_choice', 'resolution'], actionOrder: ['trust', 'withhold', 'betray'] },
      event,
      forcedActionStrategyMode: 'learn_from_utility',
    });
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.value.state).toEqual(first.value.trajectory[1]);
  });

  it('fails closed on invalid participants and round budgets', () => {
    const invalidPlayers = runConflictTargetMatrixLabSessionV1({
      scenarioId: 'trust_interrogation', players: ['a', 'a'], totalRounds: 1, world: world(['a']),
    });
    expect(invalidPlayers.ok).toBe(false);
    if (invalidPlayers.ok === false) expect(invalidPlayers.error.code).toBe('invalid_participants');

    for (const totalRounds of [0, 1.5, 31, Number.NaN]) {
      const result = runConflictTargetMatrixLabSessionV1({
        scenarioId: 'trust_interrogation', players: ['a', 'b'], totalRounds, world: world(['a', 'b']),
      });
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.error.code).toBe('invalid_round_budget');
    }
    const acceptedUpperBoundary = runConflictTargetMatrixLabSessionV1({
      scenarioId: 'authority_judgment', players: ['a', 'b'], totalRounds: 30, world: world(['a', 'b']),
    });
    expect(acceptedUpperBoundary.ok).toBe(false);
    if (acceptedUpperBoundary.ok === false) expect(acceptedUpperBoundary.error.code).toBe('unsupported_mechanic');
  });
});
