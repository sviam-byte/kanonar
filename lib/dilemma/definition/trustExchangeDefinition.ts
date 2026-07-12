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
import { CONFLICT_DEFINITION_SCHEMA_VERSION, type ConflictDefinition } from './types';

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
