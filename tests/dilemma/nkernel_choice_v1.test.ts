// NKERNEL-CHOICE-0 regression. Pins the endogenous N-choice: the N = 2
// reduction oracle (the choice step must reproduce the kernel's NON-forced
// resolveProtocolStep byte-for-byte, single round and 5-round chain), the
// ADR-signed component-wise MEAN aggregation at N = 3 (independent hand-rolled
// mean, not the implementation helper), the replicator→dominant composition,
// choice non-interference, determinism/immutability, and fail-closed
// passthrough. No runtime wiring; the dyadic kernel stays the reference.

import { describe, expect, it } from 'vitest';

import {
  createTrustExchangeProtocol,
  getObservationForPlayer,
  resolveProtocolStep,
  selectDominantAction,
  updateStrategyProfileReplicator,
} from '../../lib/dilemma';
import { normalizeActionProbabilities } from '../../lib/dilemma/dynamics/math';
import { evaluateTrustExchangeUtilities } from '../../lib/dilemma/dynamics/trustExchange';
import type { ActionUtilityBreakdown } from '../../lib/dilemma/dynamics/types';
import { resolveConflictNChoiceStepV1 } from '../../lib/dilemma/nkernel/nchoice';
import {
  asKernelConflictStateV1,
  buildTrustExchangeProtocolNV1,
  dyadicPairProjectionV1,
  participantSetFromConflictPlayersV1,
} from '../../lib/dilemma/nkernel/nstate';
import {
  CONFLICT_NCHOICE_SCHEMA_VERSION,
  type ConflictStateNV1,
} from '../../lib/dilemma/nkernel/types';
import type { ParticipantSetV1 } from '../../lib/dilemma/definition/participantSet';

import { makeStateN } from './nkernelFixtures';

function mustSet(players: readonly string[]): ParticipantSetV1 {
  const res = participantSetFromConflictPlayersV1(players);
  if (res.ok === false) throw new Error('expected participant set ok');
  return res.value;
}

function perTargetUtilities(stateN: ConflictStateNV1, selfId: string, targetId: string): readonly ActionUtilityBreakdown[] {
  const projection = dyadicPairProjectionV1(stateN, selfId, targetId);
  if (projection.ok === false) throw new Error('expected projection ok');
  const observation = getObservationForPlayer(
    projection.value,
    createTrustExchangeProtocol([selfId, targetId]),
    selfId,
  );
  if (observation.ok === false) throw new Error('expected observation ok');
  return evaluateTrustExchangeUtilities(observation.value);
}

describe('NKERNEL-CHOICE-0 conflict-nchoice-v1', () => {
  it('N = 2 reduction oracle: reproduces the non-forced resolveProtocolStep byte-for-byte', () => {
    const stateN = makeStateN(2);
    const ref = resolveProtocolStep(
      asKernelConflictStateV1(makeStateN(2)),
      createTrustExchangeProtocol(['a', 'b']),
    );
    const choice = resolveConflictNChoiceStepV1({
      state: stateN,
      protocol: buildTrustExchangeProtocolNV1(mustSet(stateN.players)),
    });

    if (ref.ok === false || choice.ok === false) throw new Error('expected both steps ok');
    expect(choice.value.schemaVersion).toBe(CONFLICT_NCHOICE_SCHEMA_VERSION);
    expect(choice.value.chosenActions).toEqual(ref.value.actions);
    expect(choice.value.step.state).toEqual(ref.value.state);
    expect(choice.value.step.outcome).toEqual(ref.value.outcome);
    expect(choice.value.step.strategyProfiles).toEqual(ref.value.strategyProfiles);
    // Fold-of-one: the aggregated utilities are the single pair's breakdowns.
    expect(choice.value.aggregatedUtilities['a']).toEqual(ref.value.utilities['a']);
    expect(choice.value.aggregatedUtilities['b']).toEqual(ref.value.utilities['b']);
  });

  it('N = 2 reduction oracle holds over a 5-round endogenous chain', () => {
    let refState = asKernelConflictStateV1(makeStateN(2));
    let nState = makeStateN(2);
    const protocolN = buildTrustExchangeProtocolNV1(mustSet(nState.players));

    for (let round = 0; round < 5; round++) {
      const ref = resolveProtocolStep(refState, createTrustExchangeProtocol(['a', 'b']));
      const choice = resolveConflictNChoiceStepV1({ state: nState, protocol: protocolN });
      if (ref.ok === false || choice.ok === false) throw new Error('expected both steps ok');
      expect(choice.value.chosenActions).toEqual(ref.value.actions);
      refState = ref.value.state;
      nState = choice.value.step.state;
    }

    expect(nState).toEqual(refState);
    expect(nState.tick).toBe(5);
  });

  it('N = 3: aggregation is the hand-rolled component-wise mean and choice is replicator→dominant over it', () => {
    const stateN = makeStateN(3);
    const protocol = buildTrustExchangeProtocolNV1(mustSet(stateN.players));
    const choice = resolveConflictNChoiceStepV1({ state: makeStateN(3), protocol });
    if (choice.ok === false) throw new Error('expected choice ok');

    for (const playerId of ['a', 'b', 'c']) {
      const targets = ['a', 'b', 'c'].filter((targetId) => targetId !== playerId);
      const perTarget = targets.map((targetId) => perTargetUtilities(stateN, playerId, targetId));

      // Independent mean over the two targets, field by field.
      const aggregated = choice.value.aggregatedUtilities[playerId];
      expect(aggregated.map((entry) => entry.actionId)).toEqual([...protocol.actionOrder]);
      for (const actionId of protocol.actionOrder) {
        const folded = aggregated.find((entry) => entry.actionId === actionId);
        const first = perTarget[0].find((entry) => entry.actionId === actionId);
        const second = perTarget[1].find((entry) => entry.actionId === actionId);
        if (!folded || !first || !second) throw new Error('expected a breakdown per action');
        for (const key of ['U', 'baseU', 'learnedQ', 'expectedResponse', 'G', 'R', 'S', 'C'] as const) {
          expect(folded[key]).toBeCloseTo((first[key] + second[key]) / 2, 12);
        }
      }

      // Choice composition contract: replicator over the aggregated utilities,
      // then dominant action; the step's learn-mode profiles must agree.
      const expectedProfile = updateStrategyProfileReplicator(
        {
          playerId,
          probabilities: normalizeActionProbabilities({ trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 }, protocol.actionOrder),
        },
        aggregated,
        protocol.actionOrder,
      );
      expect(choice.value.step.strategyProfiles[playerId]).toEqual(expectedProfile);
      expect(choice.value.chosenActions[playerId]).toBe(selectDominantAction(expectedProfile, protocol.actionOrder));
    }

    // The transition is the pairwise N-step for the chosen joint action.
    expect(choice.value.step.actions).toEqual(choice.value.chosenActions);
    expect(choice.value.step.state.history).toHaveLength(1);
  });

  it('N = 3 choice non-interference: mutating the c→b relation does not change a’s aggregated utilities or chosen action', () => {
    const run = (patchCB: boolean) => {
      const base = makeStateN(3);
      const stateN: ConflictStateNV1 = patchCB
        ? {
          ...base,
          relations: {
            ...base.relations,
            c: { ...base.relations['c'], b: { ...base.relations['c']['b'], trust: 0.95, bond: 0.9, conflict: 0.02 } },
          },
        }
        : base;
      const res = resolveConflictNChoiceStepV1({
        state: stateN,
        protocol: buildTrustExchangeProtocolNV1(mustSet(stateN.players)),
      });
      if (res.ok === false) throw new Error('expected choice ok');
      return res.value;
    };

    const baseline = run(false);
    const mutated = run(true);

    expect(mutated.aggregatedUtilities['a']).toEqual(baseline.aggregatedUtilities['a']);
    expect(mutated.chosenActions['a']).toBe(baseline.chosenActions['a']);
    // The mutation is visible where it should be: c's scoring of b changes.
    expect(mutated.aggregatedUtilities['c']).not.toEqual(baseline.aggregatedUtilities['c']);
  });

  it('is deterministic, does not mutate the input, and fails closed on bad participants/protocol', () => {
    const stateN = makeStateN(3);
    const snapshot = JSON.parse(JSON.stringify(stateN));
    const protocol = buildTrustExchangeProtocolNV1(mustSet(stateN.players));

    const first = resolveConflictNChoiceStepV1({ state: stateN, protocol });
    const second = resolveConflictNChoiceStepV1({ state: stateN, protocol });
    if (first.ok === false || second.ok === false) throw new Error('expected both runs ok');
    expect(first.value).toEqual(second.value);
    expect(stateN).toEqual(snapshot);

    const duplicate = resolveConflictNChoiceStepV1({
      state: { ...makeStateN(2), players: ['a', 'b', 'a'] },
      protocol: buildTrustExchangeProtocolNV1(mustSet(['a', 'b'])),
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok === false) expect(duplicate.error.code).toBe('invalid_participants');

    const uncovered = resolveConflictNChoiceStepV1({
      state: makeStateN(3),
      protocol: buildTrustExchangeProtocolNV1(mustSet(['a', 'b'])),
    });
    expect(uncovered.ok).toBe(false);
    if (uncovered.ok === false) expect(uncovered.error.code).toBe('invalid_protocol');

    const badActionOrder = resolveConflictNChoiceStepV1({
      state: makeStateN(3),
      protocol: { ...protocol, actionOrder: ['trust', 'betray', 'withhold'] },
    });
    expect(badActionOrder.ok).toBe(false);
    if (badActionOrder.ok === false) expect(badActionOrder.error.code).toBe('invalid_protocol');
  });
});
