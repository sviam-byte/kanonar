// NKERNEL-FOUNDATION-0 §3.1/§3.3: conflict-nstate-v1 + conflict-nstep-v1
// contracts. Pure domain and additive: nothing imports this module at runtime,
// the barrel lib/dilemma/index.ts is not extended, and the dyadic kernel stays
// untouched. ConflictStateNV1 deliberately carries NO extra fields — the
// dyadic instance must remain structurally equal to the kernel ConflictState
// so the N = 2 reduction oracle can compare states directly.

import type { ParticipantSetErrorV1 } from '../definition/participantSet';
import type {
  ActionUtilityBreakdown,
  ConflictAction,
  ConflictActionId,
  ConflictObservation,
  ConflictOutcome,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictState,
  ConflictValidationError,
  ForcedActionStrategyMode,
  StrategyProfile,
} from '../dynamics/types';

export const CONFLICT_NSTATE_SCHEMA_VERSION = 'conflict-nstate-v1' as const;
export const CONFLICT_NSTEP_SCHEMA_VERSION = 'conflict-nstep-v1' as const;

// Structurally ConflictState with the dyadic players tuple widened to an
// ordered N-array (author-declared order, preserved). The kernel state is
// assignable to this type, and every reused kernel helper iterates players
// generically (NKERNEL_FOUNDATION_0 §1.1), which is what makes the single
// adapter in nstate.ts runtime-sound.
export type ConflictStateNV1 = Omit<ConflictState, 'players'> & {
  readonly players: readonly ConflictPlayerId[];
};

export type ConflictNStepErrorV1 =
  // Kernel validation errors pass through verbatim (invalid_player,
  // duplicate_player, missing_player, invalid_action, invalid_protocol,
  // invalid_state).
  | ConflictValidationError
  // Participant strictness reused from participant-set-v1 (unique ids, N >= 2);
  // causeCode carries the first underlying cause, message aggregates all.
  | { code: 'invalid_participants'; causeCode: ParticipantSetErrorV1['code']; message: string }
  // ADR §5.2: learn_from_utility at N > 2 is fail-closed until the utility
  // aggregation ADR of NKERNEL-CHOICE-0 is signed.
  | { code: 'unsupported_strategy_mode_for_n'; playerCount: number; message: string }
  | {
    code: 'pair_step_failed';
    pair: readonly [ConflictPlayerId, ConflictPlayerId];
    cause: ConflictValidationError;
    message: string;
  };

export interface ConflictNStepInputV1 {
  readonly state: ConflictStateNV1;
  readonly protocol: ConflictProtocol;
  // v1 is the forced-joint-action slice (NKERNEL_FOUNDATION_0 §1.3):
  // endogenous choice is NKERNEL-CHOICE-0.
  readonly forcedJointActions: readonly ConflictAction[];
  readonly forcedActionStrategyMode?: ForcedActionStrategyMode;
}

// Per-pair provenance: the exact dyadic outcome each unordered pair resolved
// to, in declared pair order — the folded outcome is derived from these and
// per-pair tags/payoffs stay auditable (ADR §5.4).
export interface ConflictNStepPairV1 {
  readonly pair: readonly [ConflictPlayerId, ConflictPlayerId];
  readonly outcome: ConflictOutcome;
}

export interface ConflictNStepResultV1 {
  readonly schemaVersion: typeof CONFLICT_NSTEP_SCHEMA_VERSION;
  readonly state: ConflictStateNV1;
  readonly actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>;
  // Folded player-level outcome, kernel-shaped (ADR §5.1/§5.4); at N = 2 it
  // equals the single pair outcome verbatim (fold-of-one).
  readonly outcome: ConflictOutcome;
  readonly pairwise: readonly ConflictNStepPairV1[];
  // Pairwise maps: observations[playerId][targetId] is what playerId saw of
  // targetId in their pair run (the kernel observation stays dyadic per pair).
  readonly observations: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictObservation>>>>;
  readonly utilities: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>>>;
  readonly strategyProfiles: Readonly<Record<ConflictPlayerId, StrategyProfile>>;
}

export type ConflictNStepResultOrErrorV1 =
  | { readonly ok: true; readonly value: ConflictNStepResultV1 }
  | { readonly ok: false; readonly error: ConflictNStepErrorV1 };
