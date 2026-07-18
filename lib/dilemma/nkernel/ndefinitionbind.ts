// NKERNEL-FOUNDATION-0 §6.4 conflict-ndefinition-bind-v1: binds the R7
// conflict-definition-v3 declarative target modes (`none | self | counterparty
// | participant | all_others`) to concrete, executable participant ids — the N
// analog of what the dyadic projectLegalActions does implicitly by always
// resolving to `[observation.otherId]` (lib/dilemma/definition/projection.ts).
// Pure domain and additive: nothing imports this module at runtime, the barrel
// lib/dilemma/index.ts is not extended, and conflictDefinitionV3.ts is not
// touched — this module only reads its declared types.
//
// A deliberately new, narrower row type (ConflictActionProjectionRowNV1) is
// used instead of the existing ConflictActionProjectionRow
// (lib/dilemma/definition/types.ts): that type's protocolId/kernelActionId
// fields are pinned to the kernel's literal unions ConflictProtocolId/
// ConflictActionId, which conflict-definition-v3 deliberately decoupled from
// via plain `string` so an N-player definition with custom ids stays
// expressible without a bound kernel (see conflictDefinitionV3.ts header).
// Reusing the narrow type here would silently reintroduce that coupling.

import type { ConflictActionTargetV3, ConflictDefinitionV3 } from '../definition/conflictDefinitionV3';
import type { Result } from '../dynamics/types';

export const CONFLICT_NDEFINITION_BIND_SCHEMA_VERSION = 'conflict-ndefinition-bind-v1' as const;

export interface ConflictActionProjectionRowNV1 {
  readonly protocolId: string;
  readonly phaseId: string;
  readonly actorRoleId: string;
  readonly actorId: string;
  readonly actionId: string;
  readonly targetIds: readonly string[];
}

export type ConflictTargetResolutionErrorV1 =
  | { readonly code: 'unknown_actor'; readonly actorId: string; readonly message: string }
  | { readonly code: 'counterparty_requires_dyad'; readonly participantCount: number; readonly message: string }
  | { readonly code: 'unknown_target_participant'; readonly participantId: string; readonly message: string };

export type ConflictNDefinitionBindErrorV1 =
  | ConflictTargetResolutionErrorV1
  | { readonly code: 'unknown_phase'; readonly phaseId: string; readonly message: string }
  | { readonly code: 'unknown_actor_role'; readonly actorRoleId: string; readonly message: string }
  | {
    readonly code: 'target_resolution_failed';
    readonly actionId: string;
    readonly cause: ConflictTargetResolutionErrorV1;
    readonly message: string;
  };

/**
 * Fail-closed target-mode resolver, independent of any upstream v3 validation
 * (defense in depth, matching how dyadicPairProjectionV1 re-checks player
 * membership rather than trusting its caller). `counterparty` is legal only at
 * exactly two participants (R7 §5.2) and, once legal, resolves identically to
 * `all_others` — for a dyad "everyone else" and "the counterparty" are the
 * same single id (the same fold-of-one the dyad already gets from `all_others`
 * in trustExchangeDefinitionNV1).
 */
export function resolveConflictActionTargetIdsV1(
  target: ConflictActionTargetV3,
  actorId: string,
  participantIds: readonly string[],
): Result<readonly string[], ConflictTargetResolutionErrorV1> {
  if (!participantIds.includes(actorId)) {
    return { ok: false, error: { code: 'unknown_actor', actorId, message: `actor ${actorId} is not a known participant` } };
  }

  switch (target.mode) {
    case 'none':
      return { ok: true, value: [] };
    case 'self':
      return { ok: true, value: [actorId] };
    case 'participant':
      if (!participantIds.includes(target.participantId)) {
        return {
          ok: false,
          error: { code: 'unknown_target_participant', participantId: target.participantId, message: `target participant ${target.participantId} is not a known participant` },
        };
      }
      return { ok: true, value: [target.participantId] };
    case 'counterparty':
      if (participantIds.length !== 2) {
        return {
          ok: false,
          error: { code: 'counterparty_requires_dyad', participantCount: participantIds.length, message: `'counterparty' target requires exactly 2 participants, got ${participantIds.length}` },
        };
      }
      return { ok: true, value: participantIds.filter((id) => id !== actorId) };
    case 'all_others':
      return { ok: true, value: participantIds.filter((id) => id !== actorId) };
  }
}

/**
 * Projects a v3 definition's legal actions for one (actorRoleId, phaseId) into
 * executable rows with resolved targetIds, in the definition's declared
 * legalActions order. A role that simply has no legal actions in the given
 * phase yields an empty row list, not an error; only an unknown role/phase id
 * or an unresolvable target fails closed.
 */
export function projectConflictDefinitionV3ActionsV1(
  definition: ConflictDefinitionV3,
  actorRoleId: string,
  phaseId: string,
): Result<readonly ConflictActionProjectionRowNV1[], ConflictNDefinitionBindErrorV1> {
  const role = definition.roles.find((candidate) => candidate.id === actorRoleId);
  if (!role) {
    return { ok: false, error: { code: 'unknown_actor_role', actorRoleId, message: `role ${actorRoleId} is not declared in this definition` } };
  }
  if (!definition.phases.some((phase) => phase.id === phaseId)) {
    return { ok: false, error: { code: 'unknown_phase', phaseId, message: `phase ${phaseId} is not declared in this definition` } };
  }

  const actorId = role.playerId;
  const participantIds = definition.roles.map((candidate) => candidate.playerId);

  const rows: ConflictActionProjectionRowNV1[] = [];
  for (const action of definition.legalActions) {
    if (action.phaseId !== phaseId || action.actorRoleId !== actorRoleId) continue;

    const targets = resolveConflictActionTargetIdsV1(action.target, actorId, participantIds);
    if (targets.ok === false) {
      return {
        ok: false,
        error: {
          code: 'target_resolution_failed',
          actionId: action.id,
          cause: targets.error,
          message: `action ${action.id} target could not be resolved: ${targets.error.message}`,
        },
      };
    }

    rows.push({
      protocolId: definition.protocolId,
      phaseId: action.phaseId,
      actorRoleId: action.actorRoleId,
      actorId,
      actionId: action.id,
      targetIds: targets.value,
    });
  }

  return { ok: true, value: rows };
}
