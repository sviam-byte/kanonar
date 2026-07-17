// R7-FOUNDATION-0 §3.4/§6.4 conflict-definition-v3 regression. Pins the
// N-participant declarative contract under the 2026-07-17 ADR decisions: the
// §5.2 MINIMAL target set (counterparty legal only at N = 2, participant
// addresses a playerId), the lift theorem (v2 is the N = 2/counterparty special
// case; lift output is re-validated), the deliberate absence of action-id
// uniqueness, and every fail-closed path. No runtime wiring.

import { describe, expect, it } from 'vitest';

import {
  CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
  liftConflictDefinitionV2ToV3,
  validateConflictDefinitionV3,
} from '../../lib/dilemma/definition/conflictDefinitionV3';
import type {
  ConflictDefinitionV3,
  ConflictDefinitionV3Action,
} from '../../lib/dilemma/definition/conflictDefinitionV3';
import { TRUST_EXCHANGE_DEFINITION_V2 } from '../../lib/dilemma/definition/trustExchangeDefinition';
import type { ConflictDefinitionV2 } from '../../lib/dilemma/definition/types';
import { validateConflictDefinitionV2 } from '../../lib/dilemma/definition/validation';

// Public-goods-shaped N-player dummy: every contributor either contributes to
// all others or free-rides.
function makeV3(n: number): ConflictDefinitionV3 {
  const roles = Array.from({ length: n }, (_, i) => ({ id: `contributor-${i}`, playerId: `P${i}` }));
  const legalActions: ConflictDefinitionV3Action[] = roles.flatMap((role) => [
    { id: 'contribute', phaseId: 'contribution', actorRoleId: role.id, target: { mode: 'all_others' as const } },
    { id: 'free_ride', phaseId: 'contribution', actorRoleId: role.id, target: { mode: 'none' as const } },
  ]);
  return {
    schemaVersion: CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
    protocolId: 'public_goods_dummy',
    playerCount: n,
    roles,
    phases: [{ id: 'contribution', actorRoleIds: roles.map((role) => role.id), observation: 'public_state' }],
    legalActions,
    termination: { kind: 'external_round_budget', note: 'test dummy' },
  };
}

describe('R7 conflict-definition-v3', () => {
  it('lifts the canonical trust_exchange v2 with field-level equivalence', () => {
    const res = liftConflictDefinitionV2ToV3(TRUST_EXCHANGE_DEFINITION_V2);
    if (res.ok) {
      expect(res.value.schemaVersion).toBe(CONFLICT_DEFINITION_V3_SCHEMA_VERSION);
      expect(res.value.protocolId).toBe(TRUST_EXCHANGE_DEFINITION_V2.protocolId);
      expect(res.value.playerCount).toBe(2);
      expect(res.value.roles).toEqual(TRUST_EXCHANGE_DEFINITION_V2.roles);
      expect(res.value.phases).toEqual(TRUST_EXCHANGE_DEFINITION_V2.phases);
      expect(res.value.termination).toEqual(TRUST_EXCHANGE_DEFINITION_V2.termination);
      res.value.legalActions.forEach((action, index) => {
        const source = TRUST_EXCHANGE_DEFINITION_V2.legalActions[index];
        expect([action.id, action.phaseId, action.actorRoleId]).toEqual([source.id, source.phaseId, source.actorRoleId]);
        expect(action.target).toEqual({ mode: 'counterparty' });
      });
      // Deliberate: action ids repeat across roles in the canonical instance
      // and stay valid — uniqueness lives on the (phase, role, id) triple.
      expect(res.value.legalActions.filter((action) => action.id === 'trust')).toHaveLength(2);
      // Lift theorem: the lifted value re-validates.
      expect(validateConflictDefinitionV3(res.value).ok).toBe(true);
    } else {
      throw new Error('expected the canonical v2 lift to be ok');
    }
  });

  it('maps both v2 target kinds', () => {
    const v2: ConflictDefinitionV2 = {
      ...TRUST_EXCHANGE_DEFINITION_V2,
      legalActions: [
        { id: 'trust', phaseId: 'simultaneous_choice', actorRoleId: 'participant-a', target: 'counterparty' },
        { id: 'withhold', phaseId: 'simultaneous_choice', actorRoleId: 'participant-b', target: 'none' },
      ],
    };
    const res = liftConflictDefinitionV2ToV3(v2);
    if (res.ok) {
      expect(res.value.legalActions.map((action) => action.target)).toEqual([
        { mode: 'counterparty' },
        { mode: 'none' },
      ]);
    } else {
      throw new Error('expected ok');
    }
  });

  it('accepts synthetic N = 3..5 definitions with same-reference passthrough', () => {
    for (const n of [3, 4, 5]) {
      const definition = makeV3(n);
      const res = validateConflictDefinitionV3(definition);
      if (res.ok) {
        expect(res.value).toBe(definition);
      } else {
        throw new Error(`expected ok for N=${n}`);
      }
    }
  });

  it('accepts a counterparty target at N = 2 built directly, not via lift', () => {
    const base = makeV3(2);
    const definition: ConflictDefinitionV3 = {
      ...base,
      legalActions: [
        ...base.legalActions,
        { id: 'confront', phaseId: 'contribution', actorRoleId: 'contributor-0', target: { mode: 'counterparty' } },
      ],
    };
    expect(validateConflictDefinitionV3(definition).ok).toBe(true);
  });

  it('rejects a counterparty target at N > 2', () => {
    const base = makeV3(3);
    const definition: ConflictDefinitionV3 = {
      ...base,
      legalActions: [
        ...base.legalActions,
        { id: 'confront', phaseId: 'contribution', actorRoleId: 'contributor-0', target: { mode: 'counterparty' } },
      ],
    };
    const res = validateConflictDefinitionV3(definition);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'counterparty_requires_dyad' && e.actionId === 'confront')).toBe(true);
    }
  });

  it('participant targets address playerIds, not role ids', () => {
    const base = makeV3(3);
    const byPlayerId: ConflictDefinitionV3 = {
      ...base,
      legalActions: [
        ...base.legalActions,
        { id: 'accuse', phaseId: 'contribution', actorRoleId: 'contributor-0', target: { mode: 'participant', participantId: 'P1' } },
      ],
    };
    expect(validateConflictDefinitionV3(byPlayerId).ok).toBe(true);

    const byRoleId: ConflictDefinitionV3 = {
      ...base,
      legalActions: [
        ...base.legalActions,
        { id: 'accuse', phaseId: 'contribution', actorRoleId: 'contributor-0', target: { mode: 'participant', participantId: 'contributor-1' } },
      ],
    };
    const res = validateConflictDefinitionV3(byRoleId);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'unknown_target_participant' && e.participantId === 'contributor-1')).toBe(true);
    }
  });

  it('rejects an unknown participant target', () => {
    const base = makeV3(3);
    const definition: ConflictDefinitionV3 = {
      ...base,
      legalActions: [
        ...base.legalActions,
        { id: 'accuse', phaseId: 'contribution', actorRoleId: 'contributor-0', target: { mode: 'participant', participantId: 'ZZZ' } },
      ],
    };
    const res = validateConflictDefinitionV3(definition);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'unknown_target_participant' && e.participantId === 'ZZZ')).toBe(true);
    }
  });

  it('rejects a playerCount/roles mismatch in both directions', () => {
    for (const [playerCount, n] of [[3, 2], [2, 3]] as const) {
      const res = validateConflictDefinitionV3({ ...makeV3(n), playerCount });
      expect(res.ok).toBe(false);
      if (res.ok === false) {
        expect(res.errors.some((e) => e.code === 'player_count_mismatch' && e.playerCount === playerCount && e.roleCount === n)).toBe(true);
      }
    }
  });

  it('rejects N < 2 through the participant-set bridge', () => {
    const base = makeV3(2);
    const res = validateConflictDefinitionV3({
      ...base,
      playerCount: 1,
      roles: [{ id: 'contributor-0', playerId: 'P0' }],
    });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'invalid_roles' && e.causeCode === 'too_few_participants')).toBe(true);
    }
  });

  it('rejects duplicate role ids and duplicate participant ids via the bridge', () => {
    const base = makeV3(3);
    const res = validateConflictDefinitionV3({
      ...base,
      roles: [
        { id: 'contributor-0', playerId: 'P0' },
        { id: 'contributor-0', playerId: 'P1' },
        { id: 'contributor-2', playerId: 'P0' },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'invalid_roles' && e.causeCode === 'duplicate_role')).toBe(true);
      expect(res.errors.some((e) => e.code === 'invalid_roles' && e.causeCode === 'duplicate_participant')).toBe(true);
    }
  });

  it('rejects empty role and participant ids via the bridge', () => {
    const base = makeV3(2);
    const res = validateConflictDefinitionV3({
      ...base,
      roles: [
        { id: '', playerId: 'P0' },
        { id: 'contributor-1', playerId: '' },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'invalid_roles' && e.causeCode === 'empty_role_id')).toBe(true);
      expect(res.errors.some((e) => e.code === 'invalid_roles' && e.causeCode === 'empty_participant_id')).toBe(true);
    }
  });

  it('rejects malformed phases', () => {
    const empty = validateConflictDefinitionV3({ ...makeV3(2), phases: [] });
    expect(empty.ok).toBe(false);
    if (empty.ok === false) {
      expect(empty.errors.some((e) => e.code === 'empty_phases')).toBe(true);
    }

    const base = makeV3(2);
    const combined = validateConflictDefinitionV3({
      ...base,
      phases: [
        base.phases[0],
        { id: '', actorRoleIds: ['contributor-0'], observation: 'public_state' },
        { id: 'contribution', actorRoleIds: ['contributor-0'], observation: 'public_state' },
        { id: 'reveal', actorRoleIds: [], observation: 'public_state' },
        { id: 'vote', actorRoleIds: ['ghost'], observation: 'public_state' },
      ],
    });
    expect(combined.ok).toBe(false);
    if (combined.ok === false) {
      const codes = combined.errors.map((e) => e.code);
      expect(codes).toEqual(expect.arrayContaining([
        'empty_phase_id', 'duplicate_phase_id', 'empty_phase_actors', 'unknown_phase_actor',
      ]));
    }
  });

  it('rejects malformed legal actions', () => {
    const empty = validateConflictDefinitionV3({ ...makeV3(2), legalActions: [] });
    expect(empty.ok).toBe(false);
    if (empty.ok === false) {
      expect(empty.errors.some((e) => e.code === 'empty_legal_actions')).toBe(true);
    }

    const base = makeV3(2);
    const combined = validateConflictDefinitionV3({
      ...base,
      legalActions: [
        ...base.legalActions,
        { id: '', phaseId: 'contribution', actorRoleId: 'contributor-0', target: { mode: 'none' } },
        { id: 'ghost_phase', phaseId: 'missing', actorRoleId: 'contributor-0', target: { mode: 'none' } },
        { id: 'ghost_role', phaseId: 'contribution', actorRoleId: 'ghost', target: { mode: 'none' } },
        { id: 'contribute', phaseId: 'contribution', actorRoleId: 'contributor-0', target: { mode: 'all_others' } },
      ],
    });
    expect(combined.ok).toBe(false);
    if (combined.ok === false) {
      const codes = combined.errors.map((e) => e.code);
      expect(codes).toEqual(expect.arrayContaining([
        'empty_action_id', 'unknown_action_phase', 'unknown_action_role', 'duplicate_action',
      ]));
    }
  });

  it('collects every violation in a single pass', () => {
    const base = makeV3(3);
    const res = validateConflictDefinitionV3({
      ...base,
      playerCount: 4,
      phases: [{ id: 'contribution', actorRoleIds: ['ghost'], observation: 'public_state' }],
      legalActions: [
        { id: 'confront', phaseId: 'contribution', actorRoleId: 'contributor-0', target: { mode: 'counterparty' } },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      const codes = res.errors.map((e) => e.code);
      expect(codes).toEqual(expect.arrayContaining([
        'player_count_mismatch', 'unknown_phase_actor', 'counterparty_requires_dyad',
      ]));
    }
  });

  it('is stricter than v2: duplicate playerIds pass v2 validation but fail the lift', () => {
    const v2: ConflictDefinitionV2 = {
      ...TRUST_EXCHANGE_DEFINITION_V2,
      roles: [{ id: 'a', playerId: 'X' }, { id: 'b', playerId: 'X' }],
      phases: [{ id: 'simultaneous_choice', actorRoleIds: ['a', 'b'], observation: 'public_state' }],
      legalActions: [
        { id: 'trust', phaseId: 'simultaneous_choice', actorRoleId: 'a', target: 'counterparty' },
        { id: 'trust', phaseId: 'simultaneous_choice', actorRoleId: 'b', target: 'counterparty' },
      ],
    };
    // Pins the current (untouched) v2 behavior: duplicate playerIds slip through.
    expect(validateConflictDefinitionV2(v2).ok).toBe(true);
    const lifted = liftConflictDefinitionV2ToV3(v2);
    expect(lifted.ok).toBe(false);
    if (lifted.ok === false) {
      expect(lifted.errors.some((e) => e.code === 'invalid_roles' && e.causeCode === 'duplicate_participant')).toBe(true);
    }
  });
});
