// NKERNEL-TARGET-ACTION-MATRIX-ADR-0 / TYPES-0: additive pure-domain
// contract for one canonical trust_exchange action per directed participant
// pair. It does not alter conflict-nstep-v1 and is not wired into decision,
// session, or UI paths.

import {
  buildParticipantSetV1,
  type ParticipantSetErrorV1,
} from '../definition/participantSet';
import { TRUST_EXCHANGE_ACTION_ORDER } from '../dynamics/trustExchange';
import type {
  ConflictAction,
  ConflictActionId,
  ConflictPlayerId,
  Result,
} from '../dynamics/types';

export const CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION = 'conflict-directed-action-matrix-v1' as const;

export interface ConflictDirectedActionMatrixV1 {
  readonly schemaVersion: typeof CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION;
  readonly participantIds: readonly ConflictPlayerId[];
  readonly actionsByActorTarget: Readonly<
    Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictActionId>>>
  >;
}

export interface ConflictDirectedActionCellV1 {
  readonly actorId: ConflictPlayerId;
  readonly targetId: ConflictPlayerId;
  readonly actionId: ConflictActionId;
}

export type ConflictDirectedActionMatrixErrorV1 =
  | { readonly code: 'invalid_shape'; readonly field: string; readonly message: string }
  | { readonly code: 'invalid_schema_version'; readonly actual: unknown; readonly message: string }
  | {
    readonly code: 'invalid_participants';
    readonly causeCode: ParticipantSetErrorV1['code'];
    readonly message: string;
  }
  | {
    readonly code: 'participant_set_mismatch';
    readonly expected: readonly ConflictPlayerId[];
    readonly actual: readonly ConflictPlayerId[];
    readonly message: string;
  }
  | { readonly code: 'missing_actor'; readonly actorId: ConflictPlayerId; readonly message: string }
  | { readonly code: 'unknown_actor'; readonly actorId: string; readonly message: string }
  | { readonly code: 'invalid_actor_row'; readonly actorId: ConflictPlayerId; readonly message: string }
  | {
    readonly code: 'missing_target';
    readonly actorId: ConflictPlayerId;
    readonly targetId: ConflictPlayerId;
    readonly message: string;
  }
  | {
    readonly code: 'unknown_target';
    readonly actorId: ConflictPlayerId;
    readonly targetId: string;
    readonly message: string;
  }
  | { readonly code: 'self_target'; readonly actorId: ConflictPlayerId; readonly message: string }
  | {
    readonly code: 'invalid_action';
    readonly actorId: ConflictPlayerId;
    readonly targetId: ConflictPlayerId;
    readonly actionId: unknown;
    readonly message: string;
  };

export type ConflictDirectedActionMatrixValidationV1 =
  | { readonly ok: true; readonly value: ConflictDirectedActionMatrixV1 }
  | { readonly ok: false; readonly errors: readonly ConflictDirectedActionMatrixErrorV1[] };

export type ConflictDirectedActionMatrixDyadErrorV1 =
  | {
    readonly code: 'invalid_matrix';
    readonly errors: readonly ConflictDirectedActionMatrixErrorV1[];
    readonly message: string;
  }
  | { readonly code: 'matrix_requires_dyad'; readonly participantCount: number; readonly message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function sameOrderedValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function validateParticipants(
  participantIds: readonly ConflictPlayerId[],
): readonly ConflictDirectedActionMatrixErrorV1[] {
  const built = buildParticipantSetV1(
    participantIds.map((participantId, index) => ({ participantId, roleId: `matrix-role-${index}` })),
  );
  if (built.ok === true) return [];
  return built.errors.map((error) => ({
    code: 'invalid_participants' as const,
    causeCode: error.code,
    message: error.message,
  }));
}

/**
 * Decode and canonically rebuild a directed action matrix. The decoder trusts
 * neither object-key insertion order nor a caller's previous validation. It
 * returns a fresh actor-major/target-major Record graph in participant order.
 */
export function validateConflictDirectedActionMatrixV1(
  input: unknown,
  expectedParticipantIds?: readonly ConflictPlayerId[],
): ConflictDirectedActionMatrixValidationV1 {
  if (!isRecord(input)) {
    return { ok: false, errors: [{ code: 'invalid_shape', field: '$', message: 'directed action matrix must be an object' }] };
  }

  const errors: ConflictDirectedActionMatrixErrorV1[] = [];
  if (!hasOwn(input, 'schemaVersion') || input.schemaVersion !== CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION) {
    errors.push({
      code: 'invalid_schema_version',
      actual: input.schemaVersion,
      message: `expected ${CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION}`,
    });
  }

  if (!hasOwn(input, 'participantIds') || !Array.isArray(input.participantIds) || input.participantIds.some((id) => typeof id !== 'string')) {
    errors.push({ code: 'invalid_shape', field: 'participantIds', message: 'participantIds must be an array of strings' });
    return { ok: false, errors };
  }
  const participantIds = input.participantIds.map(String);
  const participantErrors = validateParticipants(participantIds);
  errors.push(...participantErrors);

  if (expectedParticipantIds) {
    const expectedErrors = validateParticipants(expectedParticipantIds);
    errors.push(...expectedErrors);
    if (expectedErrors.length === 0 && !sameOrderedValues(participantIds, expectedParticipantIds)) {
      errors.push({
        code: 'participant_set_mismatch',
        expected: [...expectedParticipantIds],
        actual: [...participantIds],
        message: 'matrix participantIds do not exactly match the expected participant order',
      });
    }
  }

  if (participantErrors.length > 0) return { ok: false, errors };
  if (!hasOwn(input, 'actionsByActorTarget') || !isRecord(input.actionsByActorTarget)) {
    errors.push({
      code: 'invalid_shape',
      field: 'actionsByActorTarget',
      message: 'actionsByActorTarget must be an object',
    });
    return { ok: false, errors };
  }

  const rawMatrix = input.actionsByActorTarget;
  const participantSet = new Set(participantIds);
  for (const actorId of Object.keys(rawMatrix)) {
    if (!participantSet.has(actorId)) {
      errors.push({ code: 'unknown_actor', actorId, message: `matrix contains unknown actor ${actorId}` });
    }
  }

  const canonical: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictActionId>> = {};
  for (const actorId of participantIds) {
    if (!hasOwn(rawMatrix, actorId)) {
      errors.push({ code: 'missing_actor', actorId, message: `matrix is missing actor ${actorId}` });
      continue;
    }
    const rawRow = rawMatrix[actorId];
    if (!isRecord(rawRow)) {
      errors.push({ code: 'invalid_actor_row', actorId, message: `matrix row for ${actorId} must be an object` });
      continue;
    }

    for (const targetId of Object.keys(rawRow)) {
      if (targetId === actorId) {
        errors.push({ code: 'self_target', actorId, message: `matrix row for ${actorId} must not contain a self target` });
      } else if (!participantSet.has(targetId)) {
        errors.push({
          code: 'unknown_target',
          actorId,
          targetId,
          message: `matrix row for ${actorId} contains unknown target ${targetId}`,
        });
      }
    }

    const canonicalRow: Record<ConflictPlayerId, ConflictActionId> = {};
    for (const targetId of participantIds) {
      if (targetId === actorId) continue;
      if (!hasOwn(rawRow, targetId)) {
        errors.push({
          code: 'missing_target',
          actorId,
          targetId,
          message: `matrix row for ${actorId} is missing target ${targetId}`,
        });
        continue;
      }
      const actionId = rawRow[targetId];
      if (typeof actionId !== 'string' || !TRUST_EXCHANGE_ACTION_ORDER.includes(actionId as ConflictActionId)) {
        errors.push({
          code: 'invalid_action',
          actorId,
          targetId,
          actionId,
          message: `matrix action ${String(actionId)} for ${actorId} -> ${targetId} is outside canonical trust_exchange vocabulary`,
        });
        continue;
      }
      canonicalRow[targetId] = actionId as ConflictActionId;
    }
    canonical[actorId] = canonicalRow;
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION,
      participantIds: [...participantIds],
      actionsByActorTarget: canonical,
    },
  };
}

/** Build a canonical matrix from a participant list and an untrusted Record. */
export function buildConflictDirectedActionMatrixV1(
  participantIds: readonly ConflictPlayerId[],
  actionsByActorTarget: unknown,
): ConflictDirectedActionMatrixValidationV1 {
  return validateConflictDirectedActionMatrixV1({
    schemaVersion: CONFLICT_DIRECTED_ACTION_MATRIX_SCHEMA_VERSION,
    participantIds,
    actionsByActorTarget,
  }, participantIds);
}

/** Actor-major/target-major cell view; never depends on object key order. */
export function conflictDirectedActionCellsV1(
  matrix: ConflictDirectedActionMatrixV1,
): readonly ConflictDirectedActionCellV1[] {
  const cells: ConflictDirectedActionCellV1[] = [];
  for (const actorId of matrix.participantIds) {
    for (const targetId of matrix.participantIds) {
      if (actorId === targetId) continue;
      cells.push({ actorId, targetId, actionId: matrix.actionsByActorTarget[actorId][targetId] });
    }
  }
  return cells;
}

/**
 * Fold-of-one bridge for the first reduction oracle. It revalidates its input
 * and returns the existing dyadic forced-joint-action shape in participant
 * order; N > 2 fails closed rather than selecting an arbitrary target.
 */
export function conflictDirectedActionMatrixToDyadicJointActionsV1(
  input: unknown,
  expectedParticipantIds?: readonly ConflictPlayerId[],
): Result<readonly [ConflictAction, ConflictAction], ConflictDirectedActionMatrixDyadErrorV1> {
  const validated = validateConflictDirectedActionMatrixV1(input, expectedParticipantIds);
  if (validated.ok === false) {
    return {
      ok: false,
      error: { code: 'invalid_matrix', errors: validated.errors, message: 'directed action matrix is invalid' },
    };
  }
  const matrix = validated.value;
  if (matrix.participantIds.length !== 2) {
    return {
      ok: false,
      error: {
        code: 'matrix_requires_dyad',
        participantCount: matrix.participantIds.length,
        message: `dyadic matrix adapter requires exactly 2 participants, got ${matrix.participantIds.length}`,
      },
    };
  }
  const [a, b] = matrix.participantIds;
  return {
    ok: true,
    value: [
      { playerId: a, actionId: matrix.actionsByActorTarget[a][b] },
      { playerId: b, actionId: matrix.actionsByActorTarget[b][a] },
    ],
  };
}
