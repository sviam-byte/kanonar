import { TRUST_EXCHANGE_DEFINITION } from './trustExchangeDefinition';
import type { ConflictDefinition } from './types';

export interface TrustExchangeConstructorInput {
  readonly playerIds: readonly [string, string];
  readonly totalRounds: number;
}

export type TrustExchangeConstruction =
  | { readonly ok: true; readonly value: { readonly definition: ConflictDefinition; readonly players: readonly [string, string]; readonly totalRounds: number } }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Constrained R6 constructor: it can only create the executable dyadic kernel. */
export function constructTrustExchange(input: TrustExchangeConstructorInput): TrustExchangeConstruction {
  const errors: string[] = [];
  const [first, second] = input.playerIds;
  if (!first || !second || first === second) errors.push('playerIds must contain two distinct non-empty ids');
  if (!Number.isInteger(input.totalRounds) || input.totalRounds < 1) errors.push('totalRounds must be a positive integer');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { definition: TRUST_EXCHANGE_DEFINITION, players: [first, second], totalRounds: input.totalRounds } };
}
