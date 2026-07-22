import { describe, expect, it } from 'vitest';
import { resolveProtocolStep } from '../../lib/dilemma/dynamics/engine';
import { createTrustExchangeProtocol, TRUST_EXCHANGE_ACTION_ORDER } from '../../lib/dilemma/dynamics/trustExchange';
import type { ConflictActionId } from '../../lib/dilemma/dynamics/types';
import { buildParticipantSetV1 } from '../../lib/dilemma/definition/participantSet';
import { asKernelConflictStateV1, buildTrustExchangeProtocolNV1, dyadicPairProjectionV1 } from '../../lib/dilemma/nkernel/nstate';
import { buildConflictDirectedActionMatrixV1 } from '../../lib/dilemma/nkernel/ntargetmatrix';
import {
  CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION,
  CONFLICT_DIRECTED_OUTCOME_SCHEMA_VERSION,
  CONFLICT_TARGET_MATRIX_STEP_SCHEMA_VERSION,
  conflictDirectedOutcomeToDyadicV1,
  replayConflictDirectedHistoryEventV1,
  resolveConflictTargetMatrixStepV1,
  type ConflictDirectedHistoryEventV1,
  type ConflictTargetMatrixStateV1,
} from '../../lib/dilemma/nkernel/ntargetstep';
import { makeStateN } from './nkernelFixtures';

function protocolN(players: readonly string[]) {
  const set = buildParticipantSetV1(players.map((participantId, index) => ({ participantId, roleId: `role-${index}` })));
  if (set.ok === false) throw new Error('expected participant set');
  return buildTrustExchangeProtocolNV1(set.value);
}

function matrixFor(
  players: readonly string[],
  actionFor: (actorId: string, targetId: string) => ConflictActionId,
) {
  const rows: Record<string, Record<string, ConflictActionId>> = {};
  for (const actorId of players) {
    rows[actorId] = {};
    for (const targetId of players) {
      if (actorId !== targetId) rows[actorId][targetId] = actionFor(actorId, targetId);
    }
  }
  const built = buildConflictDirectedActionMatrixV1(players, rows);
  if (built.ok === false) throw new Error('expected valid matrix');
  return built.value;
}

describe('NKERNEL-TARGET-MATRIX-STEP-0 conflict-target-matrix-step-v1', () => {
  it('N=2 reduction is byte-identical for all nine actions in both strategy modes', () => {
    for (const aAction of TRUST_EXCHANGE_ACTION_ORDER) {
      for (const bAction of TRUST_EXCHANGE_ACTION_ORDER) {
        for (const mode of ['freeze', 'learn_from_utility'] as const) {
          const state = makeStateN(2);
          const reference = resolveProtocolStep(
            asKernelConflictStateV1(state),
            createTrustExchangeProtocol(['a', 'b']),
            {
              forcedJointActions: [
                { playerId: 'a', actionId: aAction },
                { playerId: 'b', actionId: bAction },
              ],
              forcedActionStrategyMode: mode,
            },
          );
          const matrixStep = resolveConflictTargetMatrixStepV1({
            state,
            protocol: protocolN(state.players),
            actionMatrix: matrixFor(state.players, (actorId) => actorId === 'a' ? aAction : bAction),
            forcedActionStrategyMode: mode,
          });
          if (reference.ok === false || matrixStep.ok === false) throw new Error('expected both steps');

          const projected = conflictDirectedOutcomeToDyadicV1(matrixStep.value.outcome);
          if (projected.ok === false) throw new Error('expected dyadic outcome projection');
          expect(matrixStep.value.schemaVersion).toBe(CONFLICT_TARGET_MATRIX_STEP_SCHEMA_VERSION);
          expect(matrixStep.value.outcome.schemaVersion).toBe(CONFLICT_DIRECTED_OUTCOME_SCHEMA_VERSION);
          expect(JSON.stringify(matrixStep.value.state)).toBe(JSON.stringify(reference.value.state));
          expect(JSON.stringify(projected.value)).toBe(JSON.stringify(reference.value.outcome));
          expect(matrixStep.value.pairwise).toEqual([{ pair: ['a', 'b'], outcome: reference.value.outcome }]);
          expect('schemaVersion' in matrixStep.value.state.history[0]).toBe(false);
        }
      }
    }
  });

  it('N=2 reduction remains byte-identical over a five-round learning chain', () => {
    const rounds: readonly (readonly [ConflictActionId, ConflictActionId])[] = [
      ['trust', 'betray'],
      ['betray', 'trust'],
      ['withhold', 'betray'],
      ['trust', 'trust'],
      ['betray', 'betray'],
    ];
    let referenceState = asKernelConflictStateV1(makeStateN(2));
    let matrixState: ConflictTargetMatrixStateV1 = makeStateN(2);
    for (const [aAction, bAction] of rounds) {
      const reference = resolveProtocolStep(referenceState, createTrustExchangeProtocol(['a', 'b']), {
        forcedJointActions: [
          { playerId: 'a', actionId: aAction },
          { playerId: 'b', actionId: bAction },
        ],
        forcedActionStrategyMode: 'learn_from_utility',
      });
      const matrixStep = resolveConflictTargetMatrixStepV1({
        state: matrixState,
        protocol: protocolN(matrixState.players),
        actionMatrix: matrixFor(matrixState.players, (actorId) => actorId === 'a' ? aAction : bAction),
        forcedActionStrategyMode: 'learn_from_utility',
      });
      if (reference.ok === false || matrixStep.ok === false) throw new Error('expected both steps');
      referenceState = reference.value.state;
      matrixState = matrixStep.value.state;
    }
    expect(JSON.stringify(matrixState)).toBe(JSON.stringify(referenceState));
  });

  it('N=3 sends the exact two directed cells to each dyadic pair and preserves fold order', () => {
    const state = makeStateN(3);
    const actionByEdge: Record<string, ConflictActionId> = {
      'a>b': 'trust',
      'b>a': 'betray',
      'a>c': 'withhold',
      'c>a': 'trust',
      'b>c': 'trust',
      'c>b': 'betray',
    };
    const matrix = matrixFor(state.players, (actorId, targetId) => actionByEdge[`${actorId}>${targetId}`]);
    const step = resolveConflictTargetMatrixStepV1({ state, protocol: protocolN(state.players), actionMatrix: matrix });
    if (step.ok === false) throw new Error('expected matrix step');

    const pairs = [['a', 'b'], ['a', 'c'], ['b', 'c']] as const;
    pairs.forEach(([a, b], index) => {
      const projection = dyadicPairProjectionV1(state, a, b);
      if (projection.ok === false) throw new Error('expected pair projection');
      const reference = resolveProtocolStep(projection.value, createTrustExchangeProtocol([a, b]), {
        forcedJointActions: [
          { playerId: a, actionId: actionByEdge[`${a}>${b}`] },
          { playerId: b, actionId: actionByEdge[`${b}>${a}`] },
        ],
        forcedActionStrategyMode: 'freeze',
      });
      if (reference.ok === false) throw new Error('expected pair step');
      expect(step.value.pairwise[index]).toEqual({ pair: [a, b], outcome: reference.value.outcome });
      expect(step.value.state.relations[a][b]).toEqual(reference.value.state.relations[a][b]);
      expect(step.value.state.relations[b][a]).toEqual(reference.value.state.relations[b][a]);
    });
    expect(step.value.state.trace).toHaveLength(6);
    expect(step.value.pairwise).toHaveLength(3);
  });

  it('N=3 stores honest directed history and replays it fail-closed', () => {
    const state = makeStateN(3);
    const matrix = matrixFor(state.players, (actorId, targetId) => (
      actorId === 'a' && targetId === 'b' ? 'trust'
        : actorId === 'a' ? 'withhold'
          : actorId === 'b' ? 'betray'
            : 'trust'
    ));
    const step = resolveConflictTargetMatrixStepV1({ state, protocol: protocolN(state.players), actionMatrix: matrix });
    if (step.ok === false) throw new Error('expected matrix step');

    expect('actions' in step.value.outcome).toBe(false);
    expect(step.value.outcome.directedActions.actionsByActorTarget.a).toEqual({ b: 'trust', c: 'withhold' });
    const event = step.value.state.history[0] as ConflictDirectedHistoryEventV1;
    expect(event.schemaVersion).toBe(CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION);
    expect('actions' in event).toBe(false);
    expect(event.directedActions).toEqual(matrix);

    const replay = replayConflictDirectedHistoryEventV1({ state, protocol: protocolN(state.players), event });
    if (replay.ok === false) throw new Error('expected replay');
    expect(replay.value).toEqual(step.value);

    const secondMatrix = matrixFor(state.players, (actorId, targetId) => (
      actorId === 'c' && targetId === 'a' ? 'betray' : 'withhold'
    ));
    const second = resolveConflictTargetMatrixStepV1({
      state: step.value.state,
      protocol: protocolN(state.players),
      actionMatrix: secondMatrix,
    });
    if (second.ok === false) throw new Error('expected second matrix step');
    expect(second.value.state.history).toHaveLength(2);
    const secondEvent = second.value.state.history[1] as ConflictDirectedHistoryEventV1;
    const secondReplay = replayConflictDirectedHistoryEventV1({
      state: step.value.state,
      protocol: protocolN(state.players),
      event: secondEvent,
    });
    if (secondReplay.ok === false) throw new Error('expected second replay');
    expect(secondReplay.value).toEqual(second.value);

    const tampered = { ...event, payoffs: { ...event.payoffs, a: event.payoffs.a + 1 } };
    const rejected = replayConflictDirectedHistoryEventV1({ state, protocol: protocolN(state.players), event: tampered });
    expect(rejected.ok).toBe(false);
    if (rejected.ok === false) expect(rejected.error.code).toBe('history_event_mismatch');
  });

  it('is deterministic, immutable, and target-cell changes stay pair-local before player folds', () => {
    const state = makeStateN(3);
    const snapshot = JSON.parse(JSON.stringify(state));
    const baselineMatrix = matrixFor(state.players, () => 'trust');
    const changedMatrix = matrixFor(state.players, (actorId, targetId) => (
      actorId === 'c' && targetId === 'b' ? 'betray' : 'trust'
    ));
    const run = (actionMatrix: unknown) => resolveConflictTargetMatrixStepV1({
      state,
      protocol: protocolN(state.players),
      actionMatrix,
    });
    const first = run(baselineMatrix);
    const second = run(baselineMatrix);
    const changed = run(changedMatrix);
    if (first.ok === false || second.ok === false || changed.ok === false) throw new Error('expected matrix steps');

    expect(first.value).toEqual(second.value);
    expect(state).toEqual(snapshot);
    expect(changed.value.pairwise[0]).toEqual(first.value.pairwise[0]);
    expect(changed.value.pairwise[1]).toEqual(first.value.pairwise[1]);
    expect(changed.value.pairwise[2]).not.toEqual(first.value.pairwise[2]);
    expect(changed.value.state.relations.a).toEqual(first.value.state.relations.a);
  });

  it('fails before transition on invalid matrix, protocol, replay tick, and N=2 directed replay', () => {
    const state = makeStateN(3);
    const matrix = matrixFor(state.players, () => 'trust');
    const invalidMatrix = resolveConflictTargetMatrixStepV1({
      state,
      protocol: protocolN(state.players),
      actionMatrix: { ...matrix, actionsByActorTarget: { ...matrix.actionsByActorTarget, a: { b: 'trust' } } },
    });
    expect(invalidMatrix.ok).toBe(false);
    if (invalidMatrix.ok === false) expect(invalidMatrix.error.code).toBe('invalid_action_matrix');

    const invalidProtocol = resolveConflictTargetMatrixStepV1({
      state,
      protocol: { ...protocolN(state.players), actionOrder: ['trust', 'betray', 'withhold'] as readonly ConflictActionId[] },
      actionMatrix: matrix,
    });
    expect(invalidProtocol.ok).toBe(false);
    if (invalidProtocol.ok === false) expect(invalidProtocol.error.code).toBe('invalid_protocol');

    const step = resolveConflictTargetMatrixStepV1({ state, protocol: protocolN(state.players), actionMatrix: matrix });
    if (step.ok === false) throw new Error('expected matrix step');
    const event = step.value.state.history[0] as ConflictDirectedHistoryEventV1;
    const stale = replayConflictDirectedHistoryEventV1({
      state,
      protocol: protocolN(state.players),
      event: { ...event, tick: 1 },
    });
    expect(stale.ok).toBe(false);
    if (stale.ok === false) expect(stale.error.code).toBe('invalid_directed_history_event');

    const dyad = makeStateN(2);
    const directedDyadEvent = { ...event, directedActions: matrixFor(dyad.players, () => 'trust'), payoffs: { a: 0, b: 0 } };
    const dyadReplay = replayConflictDirectedHistoryEventV1({
      state: dyad,
      protocol: protocolN(dyad.players),
      event: directedDyadEvent,
    });
    expect(dyadReplay.ok).toBe(false);
    if (dyadReplay.ok === false) expect(dyadReplay.error.code).toBe('directed_history_requires_n_gt_2');
  });
});
