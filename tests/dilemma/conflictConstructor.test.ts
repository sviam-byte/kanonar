import { describe, expect, it } from 'vitest';
import { CONFLICT_SCENARIO_INVENTORY, TRUST_EXCHANGE_DEFINITION, TRUST_EXCHANGE_DEFINITION_V2, constructTrustExchange, constructorInventory, validateConflictDefinition, validateConflictDefinitionV2 } from '../../lib/dilemma';

describe('R6 constrained conflict constructor', () => {
  it('constructs only the deterministic dyadic trust_exchange definition', () => {
    const result = constructTrustExchange({ playerIds: ['a', 'b'], totalRounds: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ definition: TRUST_EXCHANGE_DEFINITION, players: ['a', 'b'], totalRounds: 3 });
  });

  it('fails closed for malformed dyads and rounds', () => {
    const result = constructTrustExchange({ playerIds: ['a', 'a'], totalRounds: 0 });
    expect(result).toEqual({ ok: false, errors: ['playerIds must contain two distinct non-empty ids', 'totalRounds must be a positive integer'] });
  });

  it('exposes only the canonical kernel to the constructor', () => {
    expect(constructorInventory()).toEqual([CONFLICT_SCENARIO_INVENTORY[0]]);
    expect(CONFLICT_SCENARIO_INVENTORY.every((entry) => entry.kind === 'canonical_mechanic' || entry.visibleInConstructor === false)).toBe(true);
  });

  it('validates the executable definition before construction boundaries consume it', () => {
    expect(validateConflictDefinition(TRUST_EXCHANGE_DEFINITION)).toEqual({ ok: true, value: TRUST_EXCHANGE_DEFINITION });
    const malformed = { ...TRUST_EXCHANGE_DEFINITION, roles: ['participant', 'participant'] } as typeof TRUST_EXCHANGE_DEFINITION;
    expect(validateConflictDefinition(malformed)).toEqual({
      ok: false,
      errors: [{ field: 'roles', message: 'roles must be a non-empty unique set' }],
    });
  });

  it('keeps v2 roles, phase knowledge and action targets explicit and valid', () => {
    expect(validateConflictDefinitionV2(TRUST_EXCHANGE_DEFINITION_V2)).toEqual({ ok: true, value: TRUST_EXCHANGE_DEFINITION_V2 });
    const malformed = { ...TRUST_EXCHANGE_DEFINITION_V2, legalActions: [{ id: 'trust', phaseId: 'missing', actorRoleId: 'participant-a', target: 'counterparty' }] } as typeof TRUST_EXCHANGE_DEFINITION_V2;
    expect(validateConflictDefinitionV2(malformed).ok).toBe(false);
  });
});
