import { describe, expect, it } from 'vitest';
import {
  createTrustExchangeProtocol,
  defaultConflictAgentState,
  defaultConflictRelationState,
  getAvailableActions,
  getObservationForPlayer,
  resolveProtocolStep,
  validateJointAction,
  type ConflictState,
  type StrategyProfile,
} from '../../lib/dilemma';
import {
  TRUST_EXCHANGE_ACTION_ORDER,
  evaluateTrustExchangeUtilities,
  resolveTrustExchangeOutcome,
} from '../../lib/dilemma/dynamics/trustExchange';
import {
  CONFLICT_DEFINITION_SCHEMA_VERSION,
  TRUST_EXCHANGE_DEFINITION,
} from '../../lib/dilemma/definition';

function makeState(patch?: Partial<ConflictState>): ConflictState {
  const players = ['a', 'b'] as const;
  const strategyProfiles: Record<string, StrategyProfile> = {
    a: { playerId: 'a', probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 } },
    b: { playerId: 'b', probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 } },
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

function walkFrozen(value: unknown, path: string, out: string[]): void {
  if (value === null || typeof value !== 'object') return;
  if (!Object.isFrozen(value)) out.push(path);
  for (const key of Object.getOwnPropertyNames(value)) {
    walkFrozen((value as Record<string, unknown>)[key], `${path}.${key}`, out);
  }
}

describe('CONFLICT-DEFINITION-0 — immutable trust_exchange contract', () => {
  it('declares the frozen contract surface', () => {
    const def = TRUST_EXCHANGE_DEFINITION;
    expect(def.schemaVersion).toBe(CONFLICT_DEFINITION_SCHEMA_VERSION);
    expect(def.protocolId).toBe('trust_exchange');
    expect(def.playerCount).toBe(2);
    expect(def.roles).toEqual(['participant']);
    expect(def.phases).toEqual(['simultaneous_choice', 'resolution']);
    expect(def.actionIds).toEqual([...TRUST_EXCHANGE_ACTION_ORDER]);
    expect(def.termination.kind).toBe('external_round_budget');
  });

  it('is deeply frozen (data fields cannot be mutated)', () => {
    const notFrozen: string[] = [];
    walkFrozen(TRUST_EXCHANGE_DEFINITION, 'definition', notFrozen);
    expect(notFrozen).toEqual([]);
    expect(() => {
      (TRUST_EXCHANGE_DEFINITION as { protocolId: string }).protocolId = 'other';
    }).toThrow(TypeError);
  });

  it('binds to the kernel without re-implementation: observe/legal/validate parity', () => {
    const state = makeState();
    const protocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['a', 'b']);
    expect(protocol).toEqual(createTrustExchangeProtocol(['a', 'b']));

    const viaDef = TRUST_EXCHANGE_DEFINITION.observe(state, protocol, 'a');
    const viaKernel = getObservationForPlayer(state, protocol, 'a');
    expect(viaDef).toEqual(viaKernel);
    if (viaDef.ok === false) throw new Error('observation failed');

    expect(TRUST_EXCHANGE_DEFINITION.legalActions(protocol, viaDef.value))
      .toEqual(getAvailableActions(protocol, viaDef.value));
    expect(TRUST_EXCHANGE_DEFINITION.referenceUtilities(viaDef.value))
      .toEqual(evaluateTrustExchangeUtilities(viaDef.value));

    const joint = [
      { playerId: 'a', actionId: 'trust' as const },
      { playerId: 'b', actionId: 'betray' as const },
    ];
    expect(TRUST_EXCHANGE_DEFINITION.validateJointAction(state, protocol, joint))
      .toEqual(validateJointAction(state, protocol, joint));
    const validated = validateJointAction(state, protocol, joint);
    if (validated.ok === false) throw new Error('joint action invalid');
    expect(TRUST_EXCHANGE_DEFINITION.resolveOutcome(state, validated.value))
      .toEqual(resolveTrustExchangeOutcome(state, validated.value));
  });

  it('rejects malformed joint actions through the definition boundary', () => {
    const state = makeState();
    const protocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['a', 'b']);
    const cases: { joint: { playerId: string; actionId: string }[]; code: string }[] = [
      { joint: [{ playerId: 'a', actionId: 'trust' }], code: 'missing_player' },
      {
        joint: [
          { playerId: 'a', actionId: 'trust' },
          { playerId: 'a', actionId: 'betray' },
        ],
        code: 'duplicate_player',
      },
      {
        joint: [
          { playerId: 'a', actionId: 'cooperate' },
          { playerId: 'b', actionId: 'trust' },
        ],
        code: 'invalid_action',
      },
      {
        joint: [
          { playerId: 'zzz', actionId: 'trust' },
          { playerId: 'b', actionId: 'trust' },
        ],
        code: 'invalid_player',
      },
    ];
    for (const testCase of cases) {
      const result = TRUST_EXCHANGE_DEFINITION.validateJointAction(
        state,
        protocol,
        testCase.joint as Parameters<typeof validateJointAction>[2],
      );
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.error.code).toBe(testCase.code);
    }
  });

  it('step is a non-interfering wrapper over resolveProtocolStep (internal and forced)', () => {
    const state = makeState();
    const protocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['a', 'b']);

    const internalDef = TRUST_EXCHANGE_DEFINITION.step(state, protocol);
    const internalKernel = resolveProtocolStep(state, protocol);
    expect(JSON.stringify(internalDef)).toBe(JSON.stringify(internalKernel));

    const forced = [
      { playerId: 'a', actionId: 'withhold' as const },
      { playerId: 'b', actionId: 'trust' as const },
    ];
    for (const mode of ['freeze', 'learn_from_utility'] as const) {
      const viaDef = TRUST_EXCHANGE_DEFINITION.step(state, protocol, {
        forcedJointActions: forced,
        forcedActionStrategyMode: mode,
      });
      const viaKernel = resolveProtocolStep(state, protocol, {
        forcedJointActions: forced,
        forcedActionStrategyMode: mode,
      });
      expect(JSON.stringify(viaDef)).toBe(JSON.stringify(viaKernel));
      if (viaDef.ok === false) throw new Error('forced step failed');
      expect(viaDef.value.actions).toEqual({ a: 'withhold', b: 'trust' });
      expect(viaDef.value.intervention?.forced).toBe(true);
    }
  });

  it('does not mutate the input state', () => {
    const state = makeState();
    const before = JSON.stringify(state);
    const protocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['a', 'b']);
    const stepped = TRUST_EXCHANGE_DEFINITION.step(state, protocol, [
      { playerId: 'a', actionId: 'trust' },
      { playerId: 'b', actionId: 'trust' },
    ]);
    expect(stepped.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });
});
