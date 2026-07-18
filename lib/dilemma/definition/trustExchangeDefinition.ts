import {
  getAvailableActions,
  getObservationForPlayer,
  resolveProtocolStep,
  validateJointAction,
} from '../dynamics/engine';
import {
  TRUST_EXCHANGE_ACTION_ORDER,
  createTrustExchangeProtocol,
  evaluateTrustExchangeUtilities,
  resolveTrustExchangeOutcome,
} from '../dynamics/trustExchange';
import {
  CONFLICT_DEFINITION_SCHEMA_VERSION,
  CONFLICT_DEFINITION_V2_SCHEMA_VERSION,
  type ConflictDefinition,
  type ConflictDefinitionV2,
} from './types';

// Freezes the definition container and its data fields. Bound kernel
// functions are shared module exports and are left untouched.
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

export const TRUST_EXCHANGE_DEFINITION: ConflictDefinition = deepFreeze({
  schemaVersion: CONFLICT_DEFINITION_SCHEMA_VERSION,
  protocolId: 'trust_exchange',
  playerCount: 2,
  roles: ['participant'],
  phases: ['simultaneous_choice', 'resolution'],
  actionIds: TRUST_EXCHANGE_ACTION_ORDER,
  termination: {
    kind: 'external_round_budget',
    note: 'Kernel state has no terminal predicate in v1; the host owns the round budget.',
  },
  createProtocol: createTrustExchangeProtocol,
  observe: getObservationForPlayer,
  legalActions: getAvailableActions,
  validateJointAction,
  referenceUtilities: evaluateTrustExchangeUtilities,
  resolveOutcome: resolveTrustExchangeOutcome,
  step: resolveProtocolStep,
} satisfies ConflictDefinition);

/** Declarative companion for construction/validation; transition ownership remains the v1 kernel. */
export const TRUST_EXCHANGE_DEFINITION_V2: ConflictDefinitionV2 = deepFreeze({
  schemaVersion: CONFLICT_DEFINITION_V2_SCHEMA_VERSION,
  protocolId: 'trust_exchange',
  playerCount: 2,
  roles: [{ id: 'participant-a', playerId: 'A' }, { id: 'participant-b', playerId: 'B' }],
  phases: [{ id: 'simultaneous_choice', actorRoleIds: ['participant-a', 'participant-b'], observation: 'public_state' }],
  legalActions: TRUST_EXCHANGE_ACTION_ORDER.flatMap((id) => [
    { id, phaseId: 'simultaneous_choice', actorRoleId: 'participant-a', target: 'counterparty' },
    { id, phaseId: 'simultaneous_choice', actorRoleId: 'participant-b', target: 'counterparty' },
  ]),
  termination: { kind: 'external_round_budget', note: 'Kernel state has no terminal predicate in v1; the host owns the round budget.' },
} satisfies ConflictDefinitionV2);
