// NKERNEL-FOUNDATION-0 §3.1–§3.3 / NKERNEL-STEP-0 regression. Pins the
// forced-joint-action N-step: the N = 2 reduction oracle (§2 theorem — the
// N-step must reproduce resolveProtocolStep exactly, all 9 joint actions ×
// both strategy modes × multi-round), the N = 3 pairwise-consistency and
// non-interference oracles, the signed ADR §5.1 folds (mean deltas + summed
// payoffs), the protocol/definition bridges, and the fail-closed paths.
// No runtime wiring; the dyadic kernel is the reference, never modified.

import { describe, expect, it } from 'vitest';

import {
  createTrustExchangeProtocol,
  defaultConflictRelationState,
  resolveProtocolStep,
  type ConflictAction,
  type ConflictActionId,
} from '../../lib/dilemma';
import {
  asKernelConflictStateV1,
  buildTrustExchangeProtocolNV1,
  dyadicPairProjectionV1,
  participantSetFromConflictPlayersV1,
  trustExchangeDefinitionNV1,
} from '../../lib/dilemma/nkernel/nstate';
import { normalizeActionProbabilities } from '../../lib/dilemma/dynamics/math';
import { updateStrategyProfileReplicator } from '../../lib/dilemma/dynamics/engine';
import {
  N_PAIRWISE_OUTCOME_TAG,
  aggregateActionUtilitiesMeanV1,
  resolveConflictNStepV1,
} from '../../lib/dilemma/nkernel/nstep';
import {
  CONFLICT_NSTEP_SCHEMA_VERSION,
  type ConflictStateNV1,
} from '../../lib/dilemma/nkernel/types';
import type { ParticipantSetV1 } from '../../lib/dilemma/definition/participantSet';
import { maxDirectedEdgesV1 } from '../../lib/tom/opponentBelief/beliefGraph';

import { makeStateN } from './nkernelFixtures';

const ACTION_IDS = ['trust', 'withhold', 'betray'] as const satisfies readonly ConflictActionId[];

function forced(actions: Readonly<Record<string, ConflictActionId>>): readonly ConflictAction[] {
  return Object.keys(actions).map((playerId) => ({ playerId, actionId: actions[playerId] }));
}

function mustSet(players: readonly string[]): ParticipantSetV1 {
  const res = participantSetFromConflictPlayersV1(players);
  if (res.ok === false) throw new Error('expected participant set ok');
  return res.value;
}

describe('NKERNEL-STEP-0 conflict-nstep-v1', () => {
  it('N = 2 reduction oracle: reproduces resolveProtocolStep for all 9 joint actions in both strategy modes', () => {
    for (const aAction of ACTION_IDS) {
      for (const bAction of ACTION_IDS) {
        for (const mode of ['freeze', 'learn_from_utility'] as const) {
          const stateN = makeStateN(2);
          const jointActions = forced({ a: aAction, b: bAction });

          const ref = resolveProtocolStep(
            asKernelConflictStateV1(makeStateN(2)),
            createTrustExchangeProtocol(['a', 'b']),
            { forcedJointActions: jointActions, forcedActionStrategyMode: mode },
          );
          const stepN = resolveConflictNStepV1({
            state: stateN,
            protocol: buildTrustExchangeProtocolNV1(mustSet(stateN.players)),
            forcedJointActions: jointActions,
            forcedActionStrategyMode: mode,
          });

          if (ref.ok === false || stepN.ok === false) {
            throw new Error(`expected both steps ok for (${aAction}, ${bAction}, ${mode})`);
          }
          expect(stepN.value.schemaVersion).toBe(CONFLICT_NSTEP_SCHEMA_VERSION);
          expect(stepN.value.state).toEqual(ref.value.state);
          expect(stepN.value.actions).toEqual(ref.value.actions);
          expect(stepN.value.outcome).toEqual(ref.value.outcome);
          expect(stepN.value.strategyProfiles).toEqual(ref.value.strategyProfiles);
          expect(stepN.value.observations['a']['b']).toEqual(ref.value.observations['a']);
          expect(stepN.value.observations['b']['a']).toEqual(ref.value.observations['b']);
          expect(stepN.value.utilities['a']['b']).toEqual(ref.value.utilities['a']);
          expect(stepN.value.utilities['b']['a']).toEqual(ref.value.utilities['b']);
          expect(stepN.value.pairwise).toHaveLength(1);
          expect(stepN.value.pairwise[0].outcome).toEqual(ref.value.outcome);
        }
      }
    }
  });

  it('N = 2 reduction oracle holds over a 5-round learning chain (memory/regime/trace drift)', () => {
    const rounds: readonly (readonly [ConflictActionId, ConflictActionId])[] = [
      ['trust', 'betray'],
      ['betray', 'trust'],
      ['withhold', 'betray'],
      ['trust', 'trust'],
      ['betray', 'betray'],
    ];
    let refState = asKernelConflictStateV1(makeStateN(2));
    let nState = makeStateN(2);
    const protocolN = buildTrustExchangeProtocolNV1(mustSet(nState.players));

    for (const [aAction, bAction] of rounds) {
      const jointActions = forced({ a: aAction, b: bAction });
      const ref = resolveProtocolStep(refState, createTrustExchangeProtocol(['a', 'b']), {
        forcedJointActions: jointActions,
        forcedActionStrategyMode: 'learn_from_utility',
      });
      const stepN = resolveConflictNStepV1({
        state: nState,
        protocol: protocolN,
        forcedJointActions: jointActions,
        forcedActionStrategyMode: 'learn_from_utility',
      });
      if (ref.ok === false || stepN.ok === false) throw new Error('expected both steps ok');
      refState = ref.value.state;
      nState = stepN.value.state;
    }

    expect(nState).toEqual(refState);
    expect(nState.tick).toBe(5);
    expect(nState.trace).toHaveLength(5 * maxDirectedEdgesV1(2));
  });

  it('bridges: the N = 2 protocol constructor is content-equal to the kernel constructor and the N = 3 v3 definition validates', () => {
    expect(buildTrustExchangeProtocolNV1(mustSet(['a', 'b']))).toEqual(createTrustExchangeProtocol(['a', 'b']));

    const definition = trustExchangeDefinitionNV1(mustSet(['a', 'b', 'c']));
    if (definition.ok === false) throw new Error('expected N = 3 definition ok');
    expect(definition.value.playerCount).toBe(3);
    expect(definition.value.roles).toHaveLength(3);
    expect(definition.value.legalActions).toHaveLength(9);
    for (const action of definition.value.legalActions) {
      expect(action.target).toEqual({ mode: 'all_others' });
    }
  });

  it('N = 3 pairwise-consistency: directed slices equal the dyadic kernel on each pair projection, folds follow ADR §5.1', () => {
    const stateN = makeStateN(3);
    const actions: Record<string, ConflictActionId> = { a: 'trust', b: 'betray', c: 'withhold' };
    const stepN = resolveConflictNStepV1({
      state: stateN,
      protocol: buildTrustExchangeProtocolNV1(mustSet(stateN.players)),
      forcedJointActions: forced(actions),
      forcedActionStrategyMode: 'freeze',
    });
    if (stepN.ok === false) throw new Error('expected N step ok');

    const pairs: readonly (readonly [string, string])[] = [['a', 'b'], ['a', 'c'], ['b', 'c']];
    const pairOutcomes: Record<string, Record<string, ReturnType<typeof resolveProtocolStep>>> = {};
    pairs.forEach(([x, y], index) => {
      const projection = dyadicPairProjectionV1(makeStateN(3), x, y);
      if (projection.ok === false) throw new Error('expected projection ok');
      const pairRef = resolveProtocolStep(projection.value, createTrustExchangeProtocol([x, y]), {
        forcedJointActions: forced({ [x]: actions[x], [y]: actions[y] }),
        forcedActionStrategyMode: 'freeze',
      });
      if (pairRef.ok === false) throw new Error('expected pair reference ok');
      if (!pairOutcomes[x]) pairOutcomes[x] = {};
      pairOutcomes[x][y] = pairRef;

      // Declared pair order and per-pair provenance.
      expect(stepN.value.pairwise[index].pair).toEqual([x, y]);
      expect(stepN.value.pairwise[index].outcome).toEqual(pairRef.value.outcome);

      // Directed slices of the N result equal the dyadic kernel's output.
      const refState = pairRef.value.state;
      for (const [from, to] of [[x, y], [y, x]] as const) {
        expect(stepN.value.state.relations[from][to]).toEqual(refState.relations[from][to]);
        expect(stepN.value.state.memories?.[from]?.[to]).toEqual(refState.memories?.[from]?.[to]);
        expect(stepN.value.state.regimes?.[from]?.[to]).toEqual(refState.regimes?.[from]?.[to]);
      }
      expect(stepN.value.observations[x][y]).toEqual(pairRef.value.observations[x]);
      expect(stepN.value.observations[y][x]).toEqual(pairRef.value.observations[y]);
    });

    // ADR §5.1 folds, pinned numerically per player: payoffs summed, agent
    // deltas averaged over the player's N−1 = 2 pairs (absent summand = 0).
    for (const playerId of ['a', 'b', 'c']) {
      const contributions = pairs
        .filter((pair) => pair.includes(playerId))
        .map(([x, y]) => pairOutcomes[x][y])
        .map((res) => (res.ok ? res.value.outcome : undefined))
        .filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== undefined);
      expect(contributions).toHaveLength(2);

      const expectedPayoff = contributions.reduce((acc, outcome) => acc + (outcome.payoffs[playerId] ?? 0), 0);
      expect(stepN.value.outcome.payoffs[playerId]).toBeCloseTo(expectedPayoff, 12);

      const deltas = contributions.map((outcome) => outcome.agentDeltas[playerId] ?? {});
      const keys = new Set<string>([...Object.keys(deltas[0]), ...Object.keys(deltas[1])]);
      const folded = stepN.value.outcome.agentDeltas[playerId] as Record<string, number>;
      expect(Object.keys(folded).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        const first = (deltas[0] as Record<string, number>)[key] ?? 0;
        const second = (deltas[1] as Record<string, number>)[key] ?? 0;
        expect(folded[key]).toBeCloseTo((first + second) / 2, 12);
      }
    }

    // Aggregate tick artifacts: N·(N−1) frames, one history event with all
    // three payoffs, deterministic aggregate tag + sorted union of event tags.
    expect(stepN.value.state.trace).toHaveLength(maxDirectedEdgesV1(3));
    expect(stepN.value.state.history).toHaveLength(1);
    expect(Object.keys(stepN.value.state.history[0].payoffs).sort()).toEqual(['a', 'b', 'c']);
    expect(stepN.value.outcome.outcomeTag).toBe(N_PAIRWISE_OUTCOME_TAG);
    expect([...stepN.value.outcome.eventTags]).toEqual([...stepN.value.outcome.eventTags].sort());
  });

  it('N = 3 non-interference: mutating the c→b relation leaves every a-side directed output byte-equal', () => {
    const actions: Record<string, ConflictActionId> = { a: 'trust', b: 'betray', c: 'withhold' };
    const run = (patchCB: boolean) => {
      const base = makeStateN(3);
      const stateN: ConflictStateNV1 = patchCB
        ? {
          ...base,
          relations: {
            ...base.relations,
            c: { ...base.relations['c'], b: defaultConflictRelationState({ trust: 0.95, bond: 0.9, conflict: 0.02 }) },
          },
        }
        : base;
      const res = resolveConflictNStepV1({
        state: stateN,
        protocol: buildTrustExchangeProtocolNV1(mustSet(stateN.players)),
        forcedJointActions: forced(actions),
        forcedActionStrategyMode: 'freeze',
      });
      if (res.ok === false) throw new Error('expected step ok');
      return res.value;
    };

    const baseline = run(false);
    const mutated = run(true);

    for (const [from, to] of [['a', 'b'], ['b', 'a'], ['a', 'c'], ['c', 'a']] as const) {
      expect(mutated.state.relations[from][to]).toEqual(baseline.state.relations[from][to]);
      expect(mutated.state.memories?.[from]?.[to]).toEqual(baseline.state.memories?.[from]?.[to]);
      expect(mutated.observations[from][to]).toEqual(baseline.observations[from][to]);
    }
    expect(mutated.state.agents['a']).toEqual(baseline.state.agents['a']);
    expect(mutated.outcome.payoffs['a']).toBe(baseline.outcome.payoffs['a']);
    // The addressee pair does change — the oracle has teeth.
    expect(mutated.state.relations['c']['b']).not.toEqual(baseline.state.relations['c']['b']);
  });

  it('fails closed on participant violations: duplicates and N < 2', () => {
    const duplicate = resolveConflictNStepV1({
      state: { ...makeStateN(2), players: ['a', 'b', 'a'] },
      protocol: buildTrustExchangeProtocolNV1(mustSet(['a', 'b'])),
      forcedJointActions: forced({ a: 'trust', b: 'trust' }),
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok === false) {
      expect(duplicate.error.code).toBe('invalid_participants');
      if (duplicate.error.code === 'invalid_participants') {
        expect(duplicate.error.causeCode).toBe('duplicate_participant');
      }
    }

    const solo = resolveConflictNStepV1({
      state: { ...makeStateN(2), players: ['a'] },
      protocol: buildTrustExchangeProtocolNV1(mustSet(['a', 'b'])),
      forcedJointActions: forced({ a: 'trust' }),
    });
    expect(solo.ok).toBe(false);
    if (solo.ok === false) {
      expect(solo.error.code).toBe('invalid_participants');
      if (solo.error.code === 'invalid_participants') {
        expect(solo.error.causeCode).toBe('too_few_participants');
      }
    }
  });

  it('learn mode at N = 3 runs the replicator over mean-aggregated utilities (NKERNEL-CHOICE-0 ADR)', () => {
    const stateN = makeStateN(3);
    const protocol = buildTrustExchangeProtocolNV1(mustSet(stateN.players));
    const learnAtN3 = resolveConflictNStepV1({
      state: stateN,
      protocol,
      forcedJointActions: forced({ a: 'trust', b: 'betray', c: 'withhold' }),
      forcedActionStrategyMode: 'learn_from_utility',
    });
    if (learnAtN3.ok === false) throw new Error('learn mode at N = 3 must be supported after the NKERNEL-CHOICE-0 ADR');

    for (const playerId of ['a', 'b', 'c']) {
      const perTarget = ['a', 'b', 'c']
        .filter((targetId) => targetId !== playerId)
        .map((targetId) => learnAtN3.value.utilities[playerId][targetId]);
      const expected = updateStrategyProfileReplicator(
        {
          playerId,
          probabilities: normalizeActionProbabilities({ trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 }, protocol.actionOrder),
        },
        aggregateActionUtilitiesMeanV1(perTarget, protocol.actionOrder),
        protocol.actionOrder,
      );
      expect(learnAtN3.value.strategyProfiles[playerId]).toEqual(expected);
    }
  });

  it('fails closed on joint-action violations, protocol gaps, and bad pair projections', () => {
    const stateN = makeStateN(3);
    const protocol = buildTrustExchangeProtocolNV1(mustSet(stateN.players));
    const runWith = (jointActions: readonly ConflictAction[]) =>
      resolveConflictNStepV1({ state: makeStateN(3), protocol, forcedJointActions: jointActions });

    const cases: readonly (readonly [readonly ConflictAction[], string])[] = [
      [forced({ a: 'trust', b: 'betray' }), 'missing_player'],
      [forced({ a: 'trust', b: 'betray', c: 'withhold', z: 'trust' }), 'invalid_player'],
      [[...forced({ a: 'trust', b: 'betray', c: 'withhold' }), { playerId: 'a', actionId: 'betray' }], 'duplicate_player'],
      [forced({ a: 'attack' as ConflictActionId, b: 'betray', c: 'withhold' }), 'invalid_action'],
    ];
    for (const [jointActions, expectedCode] of cases) {
      const res = runWith(jointActions);
      expect(res.ok).toBe(false);
      if (res.ok === false) expect(res.error.code).toBe(expectedCode);
    }

    const dyadProtocol = resolveConflictNStepV1({
      state: makeStateN(3),
      protocol: buildTrustExchangeProtocolNV1(mustSet(['a', 'b'])),
      forcedJointActions: forced({ a: 'trust', b: 'betray', c: 'withhold' }),
    });
    expect(dyadProtocol.ok).toBe(false);
    if (dyadProtocol.ok === false) expect(dyadProtocol.error.code).toBe('invalid_protocol');

    const selfPair = dyadicPairProjectionV1(makeStateN(3), 'a', 'a');
    expect(selfPair.ok).toBe(false);
    if (selfPair.ok === false) expect(selfPair.error.code).toBe('invalid_player');
    const foreignPair = dyadicPairProjectionV1(makeStateN(3), 'a', 'z');
    expect(foreignPair.ok).toBe(false);
    if (foreignPair.ok === false) expect(foreignPair.error.code).toBe('invalid_player');
  });

  it('is deterministic and does not mutate the input state', () => {
    const stateN = makeStateN(4);
    const snapshot = JSON.parse(JSON.stringify(stateN));
    const protocol = buildTrustExchangeProtocolNV1(mustSet(stateN.players));
    const jointActions = forced({ a: 'trust', b: 'betray', c: 'withhold', d: 'trust' });

    const first = resolveConflictNStepV1({ state: stateN, protocol, forcedJointActions: jointActions });
    const second = resolveConflictNStepV1({ state: stateN, protocol, forcedJointActions: jointActions });
    if (first.ok === false || second.ok === false) throw new Error('expected both runs ok');

    expect(first.value).toEqual(second.value);
    expect(stateN).toEqual(snapshot);
    expect(first.value.state.trace).toHaveLength(maxDirectedEdgesV1(4));
    expect(first.value.pairwise).toHaveLength(6);
  });
});
