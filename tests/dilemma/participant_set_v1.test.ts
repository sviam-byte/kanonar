// R7-FOUNDATION-0 §3.1 participant-set-v1 regression. Pins the ordered
// participant set contract: N ≥ 2 with unique participant and role ids, the
// dyadic v2-role bridge as the N = 2 special case, order preservation, the four
// fail-closed paths, and composition into the belief graph. No runtime wiring.

import { describe, expect, it } from 'vitest';

import {
  PARTICIPANT_SET_SCHEMA_VERSION,
  buildParticipantSetV1,
  participantIdsV1,
  participantSetFromConflictRolesV1,
} from '../../lib/dilemma/definition/participantSet';
import type { ConflictDefinitionV2Role } from '../../lib/dilemma/definition/types';
import { conflictMemoryKey } from '../../lib/dilemma/learningMemory';
import { buildBeliefGraphV1, maxDirectedEdgesV1 } from '../../lib/tom/opponentBelief/beliefGraph';
import { makeNeutralOpponentBeliefPriorV1 } from '../../lib/tom/opponentBelief/builder';
import type { OpponentBeliefV1 } from '../../lib/tom/opponentBelief/types';

const member = (participantId: string, roleId: string) => ({ participantId, roleId });

describe('R7 participant-set-v1', () => {
  it('accepts the dyadic instance and the v2-role bridge folds to the same set', () => {
    const roles: ConflictDefinitionV2Role[] = [
      { id: 'initiator', playerId: 'A' },
      { id: 'responder', playerId: 'B' },
    ];
    const direct = buildParticipantSetV1([member('A', 'initiator'), member('B', 'responder')]);
    const bridged = participantSetFromConflictRolesV1(roles);
    if (direct.ok && bridged.ok) {
      expect(bridged.value).toEqual(direct.value);
      expect(bridged.value.schemaVersion).toBe(PARTICIPANT_SET_SCHEMA_VERSION);
      expect(bridged.value.participantCount).toBe(2);
    } else {
      throw new Error('expected both dyadic constructions to be ok');
    }
  });

  it('generalizes to N = 3..5 with participantCount === members.length', () => {
    for (const n of [3, 4, 5]) {
      const members = Array.from({ length: n }, (_, i) => member(`P${i}`, `role${i}`));
      const res = buildParticipantSetV1(members);
      if (res.ok) {
        expect(res.value.participantCount).toBe(n);
        expect(res.value.members).toHaveLength(n);
      } else {
        throw new Error(`expected ok for N=${n}`);
      }
    }
  });

  it('preserves author-declared member order verbatim', () => {
    const members = [member('C', 'witness'), member('A', 'guard'), member('B', 'envoy')];
    const res = buildParticipantSetV1(members);
    const replay = buildParticipantSetV1(members);
    if (res.ok && replay.ok) {
      expect(participantIdsV1(res.value)).toEqual(['C', 'A', 'B']); // not sorted
      expect(replay.value).toEqual(res.value);
    } else {
      throw new Error('expected ok');
    }
  });

  it('fails closed on fewer than two participants', () => {
    for (const members of [[], [member('A', 'solo')]]) {
      const res = buildParticipantSetV1(members);
      expect(res.ok).toBe(false);
      if (res.ok === false) {
        expect(res.errors.some((e) => e.code === 'too_few_participants')).toBe(true);
      }
    }
  });

  it('fails closed on empty participant or role ids', () => {
    const res = buildParticipantSetV1([member('', 'guard'), member('B', '')]);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'empty_participant_id')).toBe(true);
      expect(res.errors.some((e) => e.code === 'empty_role_id')).toBe(true);
    }
  });

  it('rejects prototype-sensitive, control-character, and whitespace-only ids', () => {
    const prototypeKeysBefore = Object.getOwnPropertyNames(Object.prototype);
    const res = buildParticipantSetV1([
      member('__proto__', 'guard'),
      member('B', 'constructor'),
      member('C\u0000hidden', 'witness'),
      member('   ', 'observer'),
      member('D', 'toString'),
    ]);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'unsafe_participant_id' && e.participantId === '__proto__')).toBe(true);
      expect(res.errors.some((e) => e.code === 'unsafe_role_id' && e.roleId === 'constructor')).toBe(true);
      expect(res.errors.some((e) => e.code === 'unsafe_role_id' && e.roleId === 'toString')).toBe(true);
      expect(res.errors.filter((e) => e.code === 'unsafe_participant_id')).toHaveLength(3);
    }
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(prototypeKeysBefore);
  });

  it('tuple-encodes directed memory keys without delimiter collisions', () => {
    expect(conflictMemoryKey('a', 'a->a')).not.toBe(conflictMemoryKey('a->a', 'a'));
  });

  it('fails closed on duplicate participant ids and duplicate role ids', () => {
    const res = buildParticipantSetV1([
      member('A', 'guard'),
      member('A', 'envoy'),
      member('B', 'guard'),
    ]);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'duplicate_participant' && e.participantId === 'A')).toBe(true);
      expect(res.errors.some((e) => e.code === 'duplicate_role' && e.roleId === 'guard')).toBe(true);
    }
  });

  it('composes into the belief graph: participant ids bound a fully connected N = 3 graph', () => {
    const set = buildParticipantSetV1([member('A', 'guard'), member('B', 'envoy'), member('C', 'witness')]);
    if (set.ok === false) throw new Error('expected participant set ok');

    const ids = participantIdsV1(set.value);
    const beliefs: OpponentBeliefV1[] = [];
    for (const o of ids) for (const t of ids) if (o !== t) {
      beliefs.push(makeNeutralOpponentBeliefPriorV1({ observerId: o, targetId: t, tick: 0 }));
    }
    const graph = buildBeliefGraphV1({ participants: ids, beliefs });
    if (graph.ok) {
      expect(graph.value.directed).toHaveLength(maxDirectedEdgesV1(set.value.participantCount));
    } else {
      throw new Error('expected belief graph ok');
    }
  });
});
