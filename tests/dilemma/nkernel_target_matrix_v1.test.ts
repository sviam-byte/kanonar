import { describe, expect, it } from 'vitest';
import { validateJointAction } from '../../lib/dilemma/dynamics/engine';
import { createTrustExchangeProtocol, TRUST_EXCHANGE_ACTION_ORDER } from '../../lib/dilemma/dynamics/trustExchange';
import { asKernelConflictStateV1 } from '../../lib/dilemma/nkernel/nstate';
import {
  CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION,
  buildConflictDirectedActionMatrixV1,
  conflictDirectedActionCellsV1,
  conflictDirectedActionMatrixToDyadicJointActionsV1,
  validateConflictDirectedActionMatrixV1,
} from '../../lib/dilemma/nkernel/ntargetmatrix';
import { makeStateN } from './nkernelFixtures';

function matrix3(): Record<string, Record<string, string>> {
  return {
    c: { b: 'betray', a: 'withhold' },
    a: { c: 'withhold', b: 'trust' },
    b: { c: 'trust', a: 'betray' },
  };
}

function errorCodes(result: ReturnType<typeof buildConflictDirectedActionMatrixV1>): readonly string[] {
  if (result.ok === true) throw new Error('expected matrix validation failure');
  return result.errors.map((error) => error.code);
}

describe('NKERNEL-TARGET-MATRIX-TYPES-0 conflict-directed-action-matrix-v1', () => {
  it('canonically rebuilds exactly N*(N-1) cells in participant order', () => {
    const result = buildConflictDirectedActionMatrixV1(['a', 'b', 'c'], matrix3());
    if (result.ok === false) throw new Error('expected valid matrix');

    expect(result.value.schemaVersion).toBe(CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION);
    expect(result.value.participantIds).toEqual(['a', 'b', 'c']);
    expect(Object.keys(result.value.actionsByActorTarget)).toEqual(['a', 'b', 'c']);
    expect(Object.keys(result.value.actionsByActorTarget.a)).toEqual(['b', 'c']);
    expect(Object.keys(result.value.actionsByActorTarget.b)).toEqual(['a', 'c']);
    expect(Object.keys(result.value.actionsByActorTarget.c)).toEqual(['a', 'b']);
    expect(conflictDirectedActionCellsV1(result.value)).toEqual([
      { actorId: 'a', targetId: 'b', actionId: 'trust' },
      { actorId: 'a', targetId: 'c', actionId: 'withhold' },
      { actorId: 'b', targetId: 'a', actionId: 'betray' },
      { actorId: 'b', targetId: 'c', actionId: 'trust' },
      { actorId: 'c', targetId: 'a', actionId: 'withhold' },
      { actorId: 'c', targetId: 'b', actionId: 'betray' },
    ]);
  });

  it('fails closed on malformed schema, participant binding, actors, targets, rows, and actions', () => {
    const valid = {
      schemaVersion: CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION,
      participantIds: ['a', 'b', 'c'],
      actionsByActorTarget: matrix3(),
    };

    const cases: readonly [unknown, readonly string[]][] = [
      [null, ['invalid_shape']],
      [{ ...valid, schemaVersion: 'wrong' }, ['invalid_schema_version']],
      [{ ...valid, participantIds: ['a'] }, ['invalid_participants']],
      [{ ...valid, actionsByActorTarget: { a: valid.actionsByActorTarget.a, b: valid.actionsByActorTarget.b } }, ['missing_actor']],
      [{ ...valid, actionsByActorTarget: { ...valid.actionsByActorTarget, z: { a: 'trust' } } }, ['unknown_actor']],
      [{ ...valid, actionsByActorTarget: { ...valid.actionsByActorTarget, a: null } }, ['invalid_actor_row']],
      [{ ...valid, actionsByActorTarget: { ...valid.actionsByActorTarget, a: { b: 'trust' } } }, ['missing_target']],
      [{ ...valid, actionsByActorTarget: { ...valid.actionsByActorTarget, a: { b: 'trust', c: 'withhold', z: 'betray' } } }, ['unknown_target']],
      [{ ...valid, actionsByActorTarget: { ...valid.actionsByActorTarget, a: { a: 'trust', b: 'trust', c: 'withhold' } } }, ['self_target']],
      [{ ...valid, actionsByActorTarget: { ...valid.actionsByActorTarget, a: { b: 'cooperate', c: 'withhold' } } }, ['invalid_action']],
      [Object.create(valid), ['invalid_schema_version', 'invalid_shape']],
    ];

    for (const [input, expectedCodes] of cases) {
      const result = validateConflictDirectedActionMatrixV1(input);
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        for (const code of expectedCodes) expect(result.errors.map((error) => error.code)).toContain(code);
      }
    }

    const mismatched = validateConflictDirectedActionMatrixV1(valid, ['b', 'a', 'c']);
    expect(mismatched.ok).toBe(false);
    if (mismatched.ok === false) expect(mismatched.errors.some((error) => error.code === 'participant_set_mismatch')).toBe(true);
  });

  it('rejects prototype-sensitive participant/actor ids without prototype pollution', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    for (const unsafeId of ['__proto__', 'constructor', 'toString']) {
      const actions = Object.create(null) as Record<string, Record<string, string>>;
      actions[unsafeId] = { safe: 'trust' };
      actions.safe = Object.create(null) as Record<string, string>;
      actions.safe[unsafeId] = 'withhold';
      const result = buildConflictDirectedActionMatrixV1([unsafeId, 'safe'], actions);
      expect(result.ok).toBe(false);
      expect(errorCodes(result)).toContain('invalid_participants');
    }

    const extraActor = Object.create(null) as Record<string, Record<string, string>>;
    extraActor.a = { b: 'trust' };
    extraActor.b = { a: 'withhold' };
    extraActor.__proto__ = { a: 'betray' };
    const extraResult = buildConflictDirectedActionMatrixV1(['a', 'b'], extraActor);
    expect(extraResult.ok).toBe(false);
    expect(errorCodes(extraResult)).toContain('unknown_actor');
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps delimiter-collision ids distinct and does not depend on composite string keys', () => {
    const participantIds = ['a:b,c', 'a,b:c', 'plain'];
    const actions = {
      'a:b,c': { 'a,b:c': 'trust', plain: 'withhold' },
      'a,b:c': { 'a:b,c': 'betray', plain: 'trust' },
      plain: { 'a:b,c': 'withhold', 'a,b:c': 'betray' },
    };
    const result = buildConflictDirectedActionMatrixV1(participantIds, actions);
    if (result.ok === false) throw new Error('expected delimiter ids to be valid');

    expect(result.value.actionsByActorTarget['a:b,c']['a,b:c']).toBe('trust');
    expect(result.value.actionsByActorTarget['a,b:c']['a:b,c']).toBe('betray');
    expect(conflictDirectedActionCellsV1(result.value)).toHaveLength(6);
  });

  it('returns independent copies and revalidates a previously accepted but later tampered matrix', () => {
    const input = matrix3();
    const first = buildConflictDirectedActionMatrixV1(['a', 'b', 'c'], input);
    if (first.ok === false) throw new Error('expected valid matrix');

    input.a.b = 'betray';
    expect(first.value.actionsByActorTarget.a.b).toBe('trust');

    const tampered = first.value as unknown as {
      actionsByActorTarget: Record<string, Record<string, string>>;
    };
    tampered.actionsByActorTarget.a.b = 'not-an-action';
    expect(input.a.b).toBe('betray');

    const revalidated = validateConflictDirectedActionMatrixV1(tampered, ['a', 'b', 'c']);
    expect(revalidated.ok).toBe(false);
    if (revalidated.ok === false) expect(revalidated.errors.some((error) => error.code === 'invalid_action')).toBe(true);
  });

  it('N=2 adapter is a fold-of-one for all nine canonical joint actions', () => {
    const state = asKernelConflictStateV1(makeStateN(2));
    const protocol = createTrustExchangeProtocol(['a', 'b']);

    for (const aAction of TRUST_EXCHANGE_ACTION_ORDER) {
      for (const bAction of TRUST_EXCHANGE_ACTION_ORDER) {
        const matrix = buildConflictDirectedActionMatrixV1(['a', 'b'], {
          a: { b: aAction },
          b: { a: bAction },
        });
        if (matrix.ok === false) throw new Error('expected valid dyadic matrix');

        const adapted = conflictDirectedActionMatrixToDyadicJointActionsV1(matrix.value, ['a', 'b']);
        if (adapted.ok === false) throw new Error('expected dyadic adapter success');
        expect(adapted.value).toEqual([
          { playerId: 'a', actionId: aAction },
          { playerId: 'b', actionId: bAction },
        ]);

        const validated = validateJointAction(state, protocol, adapted.value);
        expect(validated).toEqual({ ok: true, value: { a: aAction, b: bAction } });
      }
    }
  });

  it('dyadic adapter revalidates input and rejects N>2 instead of choosing a target', () => {
    const matrix = buildConflictDirectedActionMatrixV1(['a', 'b', 'c'], matrix3());
    if (matrix.ok === false) throw new Error('expected valid matrix');
    const result = conflictDirectedActionMatrixToDyadicJointActionsV1(matrix.value);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error.code).toBe('matrix_requires_dyad');

    const invalid = conflictDirectedActionMatrixToDyadicJointActionsV1({
      ...matrix.value,
      actionsByActorTarget: { ...matrix.value.actionsByActorTarget, a: { b: 'invalid', c: 'trust' } },
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok === false) expect(invalid.error.code).toBe('invalid_matrix');
  });
});
