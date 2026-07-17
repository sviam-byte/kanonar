// NKERNEL-FOUNDATION-0 §3.1/§3.2: conflict-nstate-v1 normalization, the dyadic
// pair projection, and the N constructors for the trust_exchange protocol and
// its declarative conflict-definition-v3 instance. Reuse, not re-implementation:
// participant strictness comes from participant-set-v1, state normalization
// from the pair-generic kernel normalizeConflictState, and the v3 instance is
// re-validated by validateConflictDefinitionV3.

import {
  CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
  validateConflictDefinitionV3,
  type ConflictDefinitionV3,
  type ConflictDefinitionV3Validation,
} from '../definition/conflictDefinitionV3';
import {
  buildParticipantSetV1,
  participantIdsV1,
  type ParticipantSetConstructionV1,
  type ParticipantSetV1,
} from '../definition/participantSet';
import { normalizeConflictState } from '../dynamics/state';
import { TRUST_EXCHANGE_ACTION_ORDER } from '../dynamics/trustExchange';
import type {
  ConflictPlayerId,
  ConflictProtocol,
  ConflictRelationState,
  ConflictRole,
  ConflictState,
  DirectedMemoryMap,
  DirectedRegimeMap,
  Result,
  StrategyProfile,
} from '../dynamics/types';
import type { ConflictNStepErrorV1, ConflictStateNV1 } from './types';

// The single type adapter of this slice (NKERNEL_FOUNDATION_0 §5, reuse
// boundary): ConflictStateNV1 differs from ConflictState only in players being
// an ordered array instead of the dyadic tuple, and every reused kernel helper
// (normalizeConflictState, validateJointAction, applyConflictTransition)
// iterates players generically (§1.1), so widening through this cast is
// runtime-sound. No other cast exists in nkernel.
export function asKernelConflictStateV1(state: ConflictStateNV1): ConflictState {
  return state as unknown as ConflictState;
}

// Canonical N-state: same guarantee set normalizeConflictState provides for
// the dyad — full directed maps, normalized profiles, materialized history and
// trace.
export type CanonicalConflictStateNV1 = ConflictStateNV1 & {
  readonly memories: DirectedMemoryMap;
  readonly regimes: DirectedRegimeMap;
  readonly trace: NonNullable<ConflictStateNV1['trace']>;
};

/**
 * Participant strictness for a raw players array: unique non-empty ids,
 * N >= 2 — reused from buildParticipantSetV1 with synthetic positional role
 * ids (a state carries no roles; `participant-<index>` keeps role uniqueness
 * out of the picture so only participant-side failures can surface).
 */
export function participantSetFromConflictPlayersV1(
  players: readonly ConflictPlayerId[],
): ParticipantSetConstructionV1 {
  return buildParticipantSetV1(
    players.map((playerId, index) => ({ participantId: playerId, roleId: `participant-${index}` })),
  );
}

/**
 * Fail-closed N-state normalization: participant strictness first, then the
 * pair-generic kernel normalization (full directed relation/memory/regime maps
 * over all ordered pairs, normalized strategy profiles).
 */
export function normalizeConflictStateNV1(
  state: ConflictStateNV1,
): Result<CanonicalConflictStateNV1, ConflictNStepErrorV1> {
  const set = participantSetFromConflictPlayersV1(state.players);
  if (set.ok === false) {
    return {
      ok: false,
      error: {
        code: 'invalid_participants',
        causeCode: set.errors[0].code,
        message: set.errors.map((error) => error.message).join('; '),
      },
    };
  }
  return { ok: true, value: normalizeConflictState(asKernelConflictStateV1(state)) };
}

/**
 * True dyad of the pair {a, b}: agents/relations/memories/regimes/profiles
 * restricted to the pair, shared environment/tick/history, and trace reset to
 * [] — the harvest invariant of resolveConflictNStepV1 (the pair result's
 * trace then contains exactly the new frames). At N = 2 the projection is
 * field-wise the state itself apart from the trace reset.
 */
export function dyadicPairProjectionV1(
  state: ConflictStateNV1,
  a: ConflictPlayerId,
  b: ConflictPlayerId,
): Result<ConflictState, ConflictNStepErrorV1> {
  if (a === b) {
    return { ok: false, error: { code: 'invalid_player', message: `Pair projection requires two distinct players, got ${a} twice` } };
  }
  if (!state.players.includes(a) || !state.players.includes(b)) {
    return { ok: false, error: { code: 'invalid_player', message: `Pair projection references a player outside the state: (${a}, ${b})` } };
  }

  const relations: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRelationState>> = { [a]: {}, [b]: {} };
  const relationAB = state.relations[a]?.[b];
  if (relationAB) relations[a][b] = relationAB;
  const relationBA = state.relations[b]?.[a];
  if (relationBA) relations[b][a] = relationBA;

  const strategyProfiles: Record<ConflictPlayerId, StrategyProfile> = {};
  if (state.strategyProfiles[a]) strategyProfiles[a] = state.strategyProfiles[a];
  if (state.strategyProfiles[b]) strategyProfiles[b] = state.strategyProfiles[b];

  const memories = state.memories ? restrictDirectedPair(state.memories, a, b) : undefined;
  const regimes = state.regimes ? restrictDirectedPair(state.regimes, a, b) : undefined;

  return {
    ok: true,
    value: {
      tick: state.tick,
      players: [a, b],
      agents: { [a]: state.agents[a], [b]: state.agents[b] },
      relations,
      environment: state.environment,
      history: state.history,
      strategyProfiles,
      ...(memories ? { memories } : {}),
      ...(regimes ? { regimes } : {}),
      trace: [],
    },
  };
}

function restrictDirectedPair<T>(
  map: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, T>>>>,
  a: ConflictPlayerId,
  b: ConflictPlayerId,
): Record<ConflictPlayerId, Record<ConflictPlayerId, T>> {
  const out: Record<ConflictPlayerId, Record<ConflictPlayerId, T>> = { [a]: {}, [b]: {} };
  const ab = map[a]?.[b];
  if (ab !== undefined) out[a][b] = ab;
  const ba = map[b]?.[a];
  if (ba !== undefined) out[b][a] = ba;
  return out;
}

/**
 * N-protocol constructor: ConflictProtocol is already N-generic (roles is a
 * Record) — only the kernel constructor is tuple-typed. For N = 2 the result
 * is content-equal to createTrustExchangeProtocol.
 */
export function buildTrustExchangeProtocolNV1(set: ParticipantSetV1): ConflictProtocol {
  const roles: Record<ConflictPlayerId, ConflictRole> = {};
  for (const participantId of participantIdsV1(set)) {
    roles[participantId] = 'participant';
  }
  return {
    id: 'trust_exchange',
    roles,
    phases: ['simultaneous_choice', 'resolution'],
    actionOrder: TRUST_EXCHANGE_ACTION_ORDER,
  };
}

/**
 * Declarative conflict-definition-v3 instance of the N trust_exchange —
 * the tie between the executable epic and the R7 v3 contract. Targets are
 * { mode: 'all_others' } because 'counterparty' is only legal at N = 2
 * (R7 §5.2); for the dyad all_others addresses the same single counterparty.
 * Action-major order mirrors TRUST_EXCHANGE_DEFINITION_V2.
 */
export function trustExchangeDefinitionNV1(set: ParticipantSetV1): ConflictDefinitionV3Validation {
  const definition: ConflictDefinitionV3 = {
    schemaVersion: CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
    protocolId: 'trust_exchange',
    playerCount: set.participantCount,
    roles: set.members.map((member) => ({ id: member.roleId, playerId: member.participantId })),
    phases: [{
      id: 'simultaneous_choice',
      actorRoleIds: set.members.map((member) => member.roleId),
      observation: 'public_state',
    }],
    legalActions: TRUST_EXCHANGE_ACTION_ORDER.flatMap((id) => set.members.map((member) => ({
      id,
      phaseId: 'simultaneous_choice',
      actorRoleId: member.roleId,
      target: { mode: 'all_others' as const },
    }))),
    termination: { kind: 'external_round_budget', note: 'Kernel state has no terminal predicate in v1; the host owns the round budget.' },
  };
  return validateConflictDefinitionV3(definition);
}
