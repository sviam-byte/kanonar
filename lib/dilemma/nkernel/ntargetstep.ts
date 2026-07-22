// NKERNEL-TARGET-MATRIX-STEP-0: pure directed action-matrix execution over the
// shared N pair fold and shared transition-application core. Existing
// conflict-nstep-v1 broadcast semantics and all decision/session entrypoints
// remain unchanged.

import { applyConflictTransitionCoreV1 } from '../dynamics/engine';
import type {
  ActionUtilityBreakdown,
  ConflictActionId,
  ConflictHistoryEvent,
  ConflictObservation,
  ConflictOutcome,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictRegimeState,
  ConflictTrajectoryFrame,
  ForcedActionStrategyMode,
  Result,
  StrategyProfile,
} from '../dynamics/types';
import type { ConflictLearningMemory } from '../learningMemory';
import { normalizeConflictStateNV1, type CanonicalConflictStateNV1 } from './nstate';
import { resolveConflictNPairFoldV1 } from './npairfold';
import { validateCanonicalTrustProtocolNV1 } from './nstep';
import {
  conflictDirectedActionMatrixToDyadicJointActionsV1,
  validateConflictDirectedActionMatrixV1,
  type ConflictDirectedActionMatrixErrorV1,
  type ConflictDirectedActionMatrixDyadErrorV1,
  type ConflictDirectedActionMatrixV1,
} from './ntargetmatrix';
import type { ConflictNStepErrorV1, ConflictNStepPairV1, ConflictStateNV1 } from './types';

export const CONFLICT_DIRECTED_OUTCOME_SCHEMA_VERSION = 'conflict-directed-outcome-v1' as const;
export const CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION = 'conflict-directed-history-event-v1' as const;
export const CONFLICT_TARGET_MATRIX_STEP_SCHEMA_VERSION = 'conflict-target-matrix-step-v1' as const;

export interface ConflictDirectedOutcomeV1 {
  readonly schemaVersion: typeof CONFLICT_DIRECTED_OUTCOME_SCHEMA_VERSION;
  readonly protocolId: ConflictOutcome['protocolId'];
  readonly outcomeTag: string;
  readonly directedActions: ConflictDirectedActionMatrixV1;
  readonly payoffs: ConflictOutcome['payoffs'];
  readonly agentDeltas: ConflictOutcome['agentDeltas'];
  readonly relationDeltas: ConflictOutcome['relationDeltas'];
  readonly environmentDelta: ConflictOutcome['environmentDelta'];
  readonly eventTags: ConflictOutcome['eventTags'];
}

export interface ConflictDirectedHistoryEventV1 {
  readonly schemaVersion: typeof CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION;
  readonly tick: number;
  readonly protocolId: ConflictOutcome['protocolId'];
  readonly directedActions: ConflictDirectedActionMatrixV1;
  readonly outcomeTag: string;
  readonly payoffs: Readonly<Record<ConflictPlayerId, number>>;
}

export type ConflictTargetMatrixHistoryEventV1 = ConflictHistoryEvent | ConflictDirectedHistoryEventV1;

export type ConflictTargetMatrixStateV1 = Omit<ConflictStateNV1, 'history'> & {
  readonly history: readonly ConflictTargetMatrixHistoryEventV1[];
};

type CanonicalConflictTargetMatrixStateV1 = ConflictTargetMatrixStateV1 & {
  readonly memories: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictLearningMemory>>>>;
  readonly regimes: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictRegimeState>>>>;
  readonly trace: readonly ConflictTrajectoryFrame[];
};

export type ConflictTargetMatrixStepErrorV1 =
  | ConflictNStepErrorV1
  | {
    readonly code: 'invalid_action_matrix';
    readonly errors: readonly ConflictDirectedActionMatrixErrorV1[];
    readonly message: string;
  }
  | { readonly code: 'invalid_directed_history_event'; readonly field: string; readonly message: string }
  | { readonly code: 'directed_history_requires_n_gt_2'; readonly participantCount: number; readonly message: string }
  | { readonly code: 'history_event_mismatch'; readonly message: string };

export interface ConflictTargetMatrixStepInputV1 {
  readonly state: ConflictTargetMatrixStateV1;
  readonly protocol: ConflictProtocol;
  readonly actionMatrix: unknown;
  readonly forcedActionStrategyMode?: ForcedActionStrategyMode;
}

export interface ConflictTargetMatrixStepResultV1 {
  readonly schemaVersion: typeof CONFLICT_TARGET_MATRIX_STEP_SCHEMA_VERSION;
  readonly state: ConflictTargetMatrixStateV1;
  readonly actionMatrix: ConflictDirectedActionMatrixV1;
  readonly outcome: ConflictDirectedOutcomeV1;
  readonly pairwise: readonly ConflictNStepPairV1[];
  readonly observations: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictObservation>>>>;
  readonly utilities: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>>>;
  readonly strategyProfiles: Readonly<Record<ConflictPlayerId, StrategyProfile>>;
}

export type ConflictTargetMatrixStepResultOrErrorV1 = Result<
  ConflictTargetMatrixStepResultV1,
  ConflictTargetMatrixStepErrorV1
>;

export function resolveConflictTargetMatrixStepV1(
  input: ConflictTargetMatrixStepInputV1,
): ConflictTargetMatrixStepResultOrErrorV1 {
  const normalized = normalizeConflictStateNV1(input.state as unknown as ConflictStateNV1);
  if (normalized.ok === false) return normalized;
  const canonical = normalized.value as unknown as CanonicalConflictTargetMatrixStateV1;
  const players = canonical.players;
  const protocolError = validateCanonicalTrustProtocolNV1(players, input.protocol);
  if (protocolError) return { ok: false, error: protocolError };

  const validatedMatrix = validateConflictDirectedActionMatrixV1(input.actionMatrix, players);
  if (validatedMatrix.ok === false) {
    return {
      ok: false,
      error: {
        code: 'invalid_action_matrix',
        errors: validatedMatrix.errors,
        message: 'directed action matrix is invalid for the target-matrix step',
      },
    };
  }
  const actionMatrix = validatedMatrix.value;
  const mode: ForcedActionStrategyMode = input.forcedActionStrategyMode ?? 'freeze';
  const fold = resolveConflictNPairFoldV1({
    // Pair projection/kernel code treats history as opaque and reads only its
    // length. The projected pair history is discarded after harvesting the
    // new frames; directed event decoding remains at this matrix boundary.
    state: canonical as unknown as CanonicalConflictStateNV1,
    protocol: input.protocol,
    forcedActionStrategyMode: mode,
    actionsForPair: (a, b) => [
      actionMatrix.actionsByActorTarget[a][b],
      actionMatrix.actionsByActorTarget[b][a],
    ],
  });
  if (fold.ok === false) return fold;

  const folded = fold.value;
  const outcome: ConflictDirectedOutcomeV1 = {
    schemaVersion: CONFLICT_DIRECTED_OUTCOME_SCHEMA_VERSION,
    protocolId: folded.outcome.protocolId,
    outcomeTag: folded.outcome.outcomeTag,
    directedActions: actionMatrix,
    payoffs: folded.outcome.payoffs,
    agentDeltas: folded.outcome.agentDeltas,
    relationDeltas: folded.outcome.relationDeltas,
    environmentDelta: folded.outcome.environmentDelta,
    eventTags: folded.outcome.eventTags,
  };

  const historyEvent = buildHistoryEvent(canonical.tick, outcome);
  if (historyEvent.ok === false) return historyEvent;
  const nextState = applyConflictTransitionCoreV1({
    state: canonical,
    effects: outcome,
    historyEvent: historyEvent.value,
    strategyProfiles: folded.strategyProfiles,
    memories: folded.memories,
    regimes: folded.regimes,
    frames: folded.frames,
  });

  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_TARGET_MATRIX_STEP_SCHEMA_VERSION,
      state: nextState,
      actionMatrix,
      outcome,
      pairwise: folded.pairwise,
      observations: folded.observations,
      utilities: folded.utilities,
      strategyProfiles: folded.strategyProfiles,
    },
  };
}

/** Fold-of-one projection used by the exact N=2 outcome reduction oracle. */
export function conflictDirectedOutcomeToDyadicV1(
  outcome: ConflictDirectedOutcomeV1,
): Result<ConflictOutcome, ConflictDirectedActionMatrixDyadErrorV1> {
  const actions = conflictDirectedActionMatrixToDyadicJointActionsV1(
    outcome.directedActions,
    outcome.directedActions.participantIds,
  );
  if (actions.ok === false) return actions;
  const actionRecord: Record<ConflictPlayerId, ConflictActionId> = {};
  for (const action of actions.value) actionRecord[action.playerId] = action.actionId;
  return {
    ok: true,
    value: {
      protocolId: outcome.protocolId,
      outcomeTag: outcome.outcomeTag,
      actions: actionRecord,
      payoffs: outcome.payoffs,
      agentDeltas: outcome.agentDeltas,
      relationDeltas: outcome.relationDeltas,
      environmentDelta: outcome.environmentDelta,
      eventTags: outcome.eventTags,
    },
  };
}

/**
 * Replay one persisted directed event and verify its semantic result. The
 * event is decoded and canonically rebuilt before execution; stale/tampered
 * outcome fields fail closed instead of being silently replaced.
 */
export function replayConflictDirectedHistoryEventV1(args: {
  readonly state: ConflictTargetMatrixStateV1;
  readonly protocol: ConflictProtocol;
  readonly event: unknown;
  readonly forcedActionStrategyMode?: ForcedActionStrategyMode;
}): ConflictTargetMatrixStepResultOrErrorV1 {
  const decoded = validateConflictDirectedHistoryEventV1(args.event, args.state.players);
  if (decoded.ok === false) return decoded;
  if (args.state.players.length <= 2) {
    return {
      ok: false,
      error: {
        code: 'directed_history_requires_n_gt_2',
        participantCount: args.state.players.length,
        message: 'N=2 matrix steps persist the legacy ConflictHistoryEvent for exact reduction',
      },
    };
  }
  if (decoded.value.tick !== args.state.tick || decoded.value.protocolId !== args.protocol.id) {
    return {
      ok: false,
      error: {
        code: 'invalid_directed_history_event',
        field: decoded.value.tick !== args.state.tick ? 'tick' : 'protocolId',
        message: 'directed history event does not match the replay state/protocol boundary',
      },
    };
  }
  const replayed = resolveConflictTargetMatrixStepV1({
    state: args.state,
    protocol: args.protocol,
    actionMatrix: decoded.value.directedActions,
    forcedActionStrategyMode: args.forcedActionStrategyMode,
  });
  if (replayed.ok === false) return replayed;
  const actual = replayed.value.state.history[replayed.value.state.history.length - 1];
  if (!sameDirectedHistoryEvent(decoded.value, actual)) {
    return { ok: false, error: { code: 'history_event_mismatch', message: 'replayed outcome does not match the persisted directed history event' } };
  }
  return replayed;
}

export function validateConflictDirectedHistoryEventV1(
  input: unknown,
  expectedParticipantIds: readonly ConflictPlayerId[],
): Result<ConflictDirectedHistoryEventV1, ConflictTargetMatrixStepErrorV1> {
  if (!isRecord(input)) return invalidHistory('$', 'directed history event must be an object');
  if (!hasOwn(input, 'schemaVersion') || input.schemaVersion !== CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION) {
    return invalidHistory('schemaVersion', `expected ${CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION}`);
  }
  if (!hasOwn(input, 'tick') || !Number.isInteger(input.tick) || (input.tick as number) < 0) {
    return invalidHistory('tick', 'directed history tick must be a non-negative integer');
  }
  if (!hasOwn(input, 'protocolId') || input.protocolId !== 'trust_exchange') {
    return invalidHistory('protocolId', 'directed history protocolId must be trust_exchange');
  }
  if (!hasOwn(input, 'outcomeTag') || typeof input.outcomeTag !== 'string') {
    return invalidHistory('outcomeTag', 'directed history outcomeTag must be a string');
  }
  const matrix = validateConflictDirectedActionMatrixV1(input.directedActions, expectedParticipantIds);
  if (matrix.ok === false) {
    return {
      ok: false,
      error: { code: 'invalid_action_matrix', errors: matrix.errors, message: 'directed history action matrix is invalid' },
    };
  }
  if (!hasOwn(input, 'payoffs') || !isRecord(input.payoffs)) {
    return invalidHistory('payoffs', 'directed history payoffs must be an object');
  }
  const expected = new Set(expectedParticipantIds);
  if (Object.keys(input.payoffs).some((playerId) => !expected.has(playerId))) {
    return invalidHistory('payoffs', 'directed history payoffs contain an unknown participant');
  }
  const payoffs: Record<ConflictPlayerId, number> = {};
  for (const playerId of expectedParticipantIds) {
    const payoff = input.payoffs[playerId];
    if (!hasOwn(input.payoffs, playerId) || typeof payoff !== 'number' || !Number.isFinite(payoff)) {
      return invalidHistory(`payoffs.${playerId}`, 'directed history requires one finite payoff per participant');
    }
    payoffs[playerId] = payoff;
  }
  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION,
      tick: input.tick as number,
      protocolId: 'trust_exchange',
      directedActions: matrix.value,
      outcomeTag: input.outcomeTag,
      payoffs,
    },
  };
}

function buildHistoryEvent(
  tick: number,
  outcome: ConflictDirectedOutcomeV1,
): Result<ConflictTargetMatrixHistoryEventV1, ConflictTargetMatrixStepErrorV1> {
  if (outcome.directedActions.participantIds.length === 2) {
    const dyadic = conflictDirectedOutcomeToDyadicV1(outcome);
    if (dyadic.ok === false) {
      return {
        ok: false,
        error: { code: 'invalid_action_matrix', errors: dyadic.error.code === 'invalid_matrix' ? dyadic.error.errors : [], message: dyadic.error.message },
      };
    }
    return {
      ok: true,
      value: {
        tick,
        protocolId: dyadic.value.protocolId,
        actions: dyadic.value.actions,
        outcomeTag: dyadic.value.outcomeTag,
        payoffs: dyadic.value.payoffs,
      },
    };
  }
  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION,
      tick,
      protocolId: outcome.protocolId,
      directedActions: outcome.directedActions,
      outcomeTag: outcome.outcomeTag,
      payoffs: outcome.payoffs,
    },
  };
}

function sameDirectedHistoryEvent(
  expected: ConflictDirectedHistoryEventV1,
  actual: ConflictTargetMatrixHistoryEventV1,
): boolean {
  return isRecord(actual)
    && actual.schemaVersion === CONFLICT_DIRECTED_HISTORY_EVENT_SCHEMA_VERSION
    && JSON.stringify(actual) === JSON.stringify(expected);
}

function invalidHistory(
  field: string,
  message: string,
): Result<never, ConflictTargetMatrixStepErrorV1> {
  return { ok: false, error: { code: 'invalid_directed_history_event', field, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
