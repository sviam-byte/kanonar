// NKERNEL-DEFINITION-BIND-0 regression. Pins the N = 2 reduction oracle (the
// v3 `all_others` binding for trustExchangeDefinitionNV1 must reproduce the
// dyadic projectLegalActions targetIds byte-for-byte), every v3 target mode's
// resolution at N = 3, non-error "no actions in this phase" semantics,
// fail-closed defense-in-depth independent of validateConflictDefinitionV3,
// and determinism/input immutability. No runtime wiring; the dyadic
// projectLegalActions stays the reference.

import { describe, expect, it } from 'vitest';

import { TRUST_EXCHANGE_DEFINITION, projectLegalActions } from '../../lib/dilemma/definition';
import {
  CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
  type ConflictDefinitionV3,
} from '../../lib/dilemma/definition/conflictDefinitionV3';
import type { ParticipantSetV1 } from '../../lib/dilemma/definition/participantSet';
import {
  projectConflictDefinitionV3ActionsV1,
  resolveConflictActionTargetIdsV1,
} from '../../lib/dilemma/nkernel/ndefinitionbind';
import {
  asKernelConflictStateV1,
  participantSetFromConflictPlayersV1,
  trustExchangeDefinitionNV1,
} from '../../lib/dilemma/nkernel/nstate';

import { makeStateN } from './nkernelFixtures';

function mustSet(players: readonly string[]): ParticipantSetV1 {
  const res = participantSetFromConflictPlayersV1(players);
  if (res.ok === false) throw new Error('expected participant set ok');
  return res.value;
}

function makeSmallDefinition(): ConflictDefinitionV3 {
  return {
    schemaVersion: CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
    protocolId: 'small_protocol',
    playerCount: 3,
    roles: [
      { id: 'role-a', playerId: 'a' },
      { id: 'role-b', playerId: 'b' },
      { id: 'role-c', playerId: 'c' },
    ],
    phases: [{ id: 'phase-1', actorRoleIds: ['role-a', 'role-b', 'role-c'], observation: 'public_state' }],
    legalActions: [
      { id: 'act-self', phaseId: 'phase-1', actorRoleId: 'role-a', target: { mode: 'self' } },
      { id: 'act-none', phaseId: 'phase-1', actorRoleId: 'role-a', target: { mode: 'none' } },
      { id: 'act-participant', phaseId: 'phase-1', actorRoleId: 'role-a', target: { mode: 'participant', participantId: 'c' } },
      { id: 'act-all-others', phaseId: 'phase-1', actorRoleId: 'role-a', target: { mode: 'all_others' } },
    ],
    termination: { kind: 'external_round_budget', note: 'test fixture' },
  };
}

describe('NKERNEL-DEFINITION-BIND-0 conflict-ndefinition-bind-v1', () => {
  it('N = 2 reduction oracle: all_others binding reproduces dyadic projectLegalActions targetIds byte-for-byte', () => {
    const set = mustSet(['a', 'b']);
    const definition = trustExchangeDefinitionNV1(set);
    if (definition.ok === false) throw new Error('expected v3 definition ok');

    const dyadicState = asKernelConflictStateV1(makeStateN(2));
    const dyadicProtocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['a', 'b']);

    for (const [roleId, actorId] of [['participant-0', 'a'], ['participant-1', 'b']] as const) {
      const rowsN = projectConflictDefinitionV3ActionsV1(definition.value, roleId, 'simultaneous_choice');
      const dyadic = projectLegalActions(TRUST_EXCHANGE_DEFINITION, dyadicState, dyadicProtocol, actorId);
      if (rowsN.ok === false || dyadic.ok === false) throw new Error('expected both projections ok');

      expect(rowsN.value.map((row) => row.actionId)).toEqual(dyadic.value.map((row) => row.kernelActionId));
      expect(rowsN.value.map((row) => row.targetIds)).toEqual(dyadic.value.map((row) => row.targetIds));
      for (const row of rowsN.value) {
        expect(row.protocolId).toBe('trust_exchange');
        expect(row.phaseId).toBe('simultaneous_choice');
        expect(row.actorId).toBe(actorId);
      }
    }
  });

  it('N = 3..5 all_others resolves to every other participant in participant-set order', () => {
    for (let n = 3; n <= 5; n++) {
      const players = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));
      const set = mustSet(players);
      for (const member of set.members) {
        const resolved = resolveConflictActionTargetIdsV1({ mode: 'all_others' }, member.participantId, players);
        if (resolved.ok === false) throw new Error('expected all_others resolution ok');
        expect(resolved.value).toEqual(players.filter((id) => id !== member.participantId));
      }
    }
  });

  it('resolves self / none / participant on a hand-built N = 3 definition', () => {
    const definition = makeSmallDefinition();
    const rows = projectConflictDefinitionV3ActionsV1(definition, 'role-a', 'phase-1');
    if (rows.ok === false) throw new Error('expected projection ok');

    const byId = Object.fromEntries(rows.value.map((row) => [row.actionId, row]));
    expect(byId['act-self'].targetIds).toEqual(['a']);
    expect(byId['act-none'].targetIds).toEqual([]);
    expect(byId['act-participant'].targetIds).toEqual(['c']);
    expect(byId['act-all-others'].targetIds).toEqual(['b', 'c']);
    expect(rows.value.map((row) => row.actionId)).toEqual(['act-self', 'act-none', 'act-participant', 'act-all-others']);
  });

  it('a role with no legal actions in the given phase projects to an empty row list, not an error', () => {
    const definition = makeSmallDefinition();
    const rows = projectConflictDefinitionV3ActionsV1(definition, 'role-b', 'phase-1');
    if (rows.ok === false) throw new Error('expected projection ok');
    expect(rows.value).toEqual([]);
  });

  it('counterparty resolves identically to all_others at exactly N = 2 (the dyad fold-of-one)', () => {
    const resolved = resolveConflictActionTargetIdsV1({ mode: 'counterparty' }, 'a', ['a', 'b']);
    if (resolved.ok === false) throw new Error('expected counterparty resolution ok');
    expect(resolved.value).toEqual(['b']);
  });

  it('fails closed independent of validateConflictDefinitionV3, on each error path', () => {
    // counterparty_requires_dyad: fails at N != 2, direct resolver call.
    const counterpartyAtN3 = resolveConflictActionTargetIdsV1({ mode: 'counterparty' }, 'a', ['a', 'b', 'c']);
    expect(counterpartyAtN3.ok).toBe(false);
    if (counterpartyAtN3.ok === false) expect(counterpartyAtN3.error.code).toBe('counterparty_requires_dyad');

    // unknown_target_participant: direct resolver call.
    const unknownParticipant = resolveConflictActionTargetIdsV1({ mode: 'participant', participantId: 'zzz' }, 'a', ['a', 'b', 'c']);
    expect(unknownParticipant.ok).toBe(false);
    if (unknownParticipant.ok === false) expect(unknownParticipant.error.code).toBe('unknown_target_participant');

    // unknown_actor: direct resolver call.
    const unknownActor = resolveConflictActionTargetIdsV1({ mode: 'self' }, 'zzz', ['a', 'b', 'c']);
    expect(unknownActor.ok).toBe(false);
    if (unknownActor.ok === false) expect(unknownActor.error.code).toBe('unknown_actor');

    // unknown_actor_role / unknown_phase: projection-level, on a structurally
    // valid (but not necessarily validateConflictDefinitionV3-checked) definition.
    const definition = makeSmallDefinition();
    const unknownRole = projectConflictDefinitionV3ActionsV1(definition, 'role-x', 'phase-1');
    expect(unknownRole.ok).toBe(false);
    if (unknownRole.ok === false) expect(unknownRole.error.code).toBe('unknown_actor_role');

    const unknownPhase = projectConflictDefinitionV3ActionsV1(definition, 'role-a', 'phase-x');
    expect(unknownPhase.ok).toBe(false);
    if (unknownPhase.ok === false) expect(unknownPhase.error.code).toBe('unknown_phase');

    // target_resolution_failed: the projection is defense-in-depth even when
    // the definition itself was never run through validateConflictDefinitionV3
    // (which would have rejected this at construction time).
    const malformed: ConflictDefinitionV3 = {
      ...definition,
      legalActions: [{ id: 'act-bad', phaseId: 'phase-1', actorRoleId: 'role-a', target: { mode: 'participant', participantId: 'zzz' } }],
    };
    const badProjection = projectConflictDefinitionV3ActionsV1(malformed, 'role-a', 'phase-1');
    expect(badProjection.ok).toBe(false);
    if (badProjection.ok === false) {
      expect(badProjection.error.code).toBe('target_resolution_failed');
      if (badProjection.error.code === 'target_resolution_failed') {
        expect(badProjection.error.actionId).toBe('act-bad');
        expect(badProjection.error.cause.code).toBe('unknown_target_participant');
      }
    }
  });

  it('is deterministic and does not mutate its inputs', () => {
    const definition = makeSmallDefinition();
    const snapshot = JSON.parse(JSON.stringify(definition));

    const first = projectConflictDefinitionV3ActionsV1(definition, 'role-a', 'phase-1');
    const second = projectConflictDefinitionV3ActionsV1(definition, 'role-a', 'phase-1');
    if (first.ok === false || second.ok === false) throw new Error('expected both projections ok');

    expect(first.value).toEqual(second.value);
    expect(definition).toEqual(snapshot);

    const participantIds = ['a', 'b', 'c'];
    const idsSnapshot = [...participantIds];
    resolveConflictActionTargetIdsV1({ mode: 'all_others' }, 'a', participantIds);
    expect(participantIds).toEqual(idsSnapshot);
  });
});
