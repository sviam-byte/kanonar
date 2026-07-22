// Pure pair-specific reference policy for the directed target matrix. Each
// actor-target cell observes and scores its own dyadic projection, applies the
// existing replicator + dominant-action rule, then the complete matrix is
// executed by the canonical target-matrix transition.

import { getObservationForPlayer, selectDominantAction, updateStrategyProfileReplicator } from '../dynamics/engine';
import { createTrustExchangeProtocol, evaluateTrustExchangeUtilities } from '../dynamics/trustExchange';
import type { ActionUtilityBreakdown, ConflictActionId, ConflictPlayerId, ConflictProtocol, Result } from '../dynamics/types';
import { dyadicPairProjectionV1, normalizeConflictStateNV1 } from './nstate';
import { validateCanonicalTrustProtocolNV1 } from './nstep';
import { buildConflictDirectedActionMatrixV1, type ConflictDirectedActionMatrixV1 } from './ntargetmatrix';
import {
  resolveConflictTargetMatrixStepV1,
  type ConflictTargetMatrixStateV1,
  type ConflictTargetMatrixStepErrorV1,
  type ConflictTargetMatrixStepResultV1,
} from './ntargetstep';
import type { ConflictStateNV1 } from './types';

export const CONFLICT_TARGET_MATRIX_CHOICE_SCHEMA_VERSION = 'conflict-target-matrix-choice-v1' as const;

export interface ConflictTargetMatrixChoiceInputV1 {
  readonly state: ConflictTargetMatrixStateV1;
  readonly protocol: ConflictProtocol;
}

export interface ConflictTargetMatrixChoiceResultV1 {
  readonly schemaVersion: typeof CONFLICT_TARGET_MATRIX_CHOICE_SCHEMA_VERSION;
  readonly chosenActionMatrix: ConflictDirectedActionMatrixV1;
  readonly utilitiesByActorTarget: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>>>;
  readonly step: ConflictTargetMatrixStepResultV1;
}

export type ConflictTargetMatrixChoiceErrorV1 =
  | ConflictTargetMatrixStepErrorV1
  | { readonly code: 'reference_matrix_invalid'; readonly message: string };

export function resolveConflictTargetMatrixChoiceStepV1(
  input: ConflictTargetMatrixChoiceInputV1,
): Result<ConflictTargetMatrixChoiceResultV1, ConflictTargetMatrixChoiceErrorV1> {
  const normalized = normalizeConflictStateNV1(input.state as unknown as ConflictStateNV1);
  if (normalized.ok === false) return normalized;
  const state = normalized.value;
  const protocolError = validateCanonicalTrustProtocolNV1(state.players, input.protocol);
  if (protocolError) return { ok: false, error: protocolError };

  const actions: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictActionId>> = {};
  const utilities: Record<ConflictPlayerId, Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>> = {};
  for (const actorId of state.players) {
    actions[actorId] = {};
    utilities[actorId] = {};
    for (const targetId of state.players) {
      if (targetId === actorId) continue;
      const projection = dyadicPairProjectionV1(state, actorId, targetId);
      if (projection.ok === false) return projection;
      const pairProtocol = createTrustExchangeProtocol([actorId, targetId]);
      const observation = getObservationForPlayer(projection.value, pairProtocol, actorId);
      if (observation.ok === false) {
        return {
          ok: false,
          error: {
            code: 'pair_step_failed',
            pair: [actorId, targetId],
            cause: observation.error,
            message: `Pair (${actorId}, ${targetId}) observation failed: ${observation.error.message}`,
          },
        };
      }
      const cellUtilities = [...evaluateTrustExchangeUtilities(observation.value)];
      const nextProfile = updateStrategyProfileReplicator(
        state.strategyProfiles[actorId],
        cellUtilities,
        input.protocol.actionOrder,
      );
      utilities[actorId][targetId] = cellUtilities;
      actions[actorId][targetId] = selectDominantAction(nextProfile, input.protocol.actionOrder);
    }
  }

  const matrix = buildConflictDirectedActionMatrixV1(state.players, actions);
  if (matrix.ok === false) {
    return { ok: false, error: { code: 'reference_matrix_invalid', message: matrix.errors.map((error) => error.message).join('; ') } };
  }
  const step = resolveConflictTargetMatrixStepV1({
    state: input.state,
    protocol: input.protocol,
    actionMatrix: matrix.value,
    forcedActionStrategyMode: 'learn_from_utility',
  });
  if (step.ok === false) return step;
  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_TARGET_MATRIX_CHOICE_SCHEMA_VERSION,
      chosenActionMatrix: matrix.value,
      utilitiesByActorTarget: utilities,
      step: step.value,
    },
  };
}
