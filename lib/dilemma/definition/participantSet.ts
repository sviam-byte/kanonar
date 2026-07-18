// R7-FOUNDATION-0 §3.1 participant-set-v1: an explicit ORDERED participant set
// with role binding, generalizing ConflictDefinitionV2Role[] from exactly 2 to
// N ≥ 2. Pure domain and additive: nothing imports it at runtime, and the
// dyadic instance is the N = 2 special case (participantSetFromConflictRolesV1
// folds v2 roles losslessly). Member order is author-declared and preserved —
// the set is ordered by contract, not sorted; both participant ids and role ids
// stay unique, matching the v2 validator's "uniquely identified roles" rule.

import type { ConflictDefinitionV2Role } from './types';

export const PARTICIPANT_SET_SCHEMA_VERSION = 'participant-set-v1' as const;

/**
 * Conflict ids become keys in plain Record objects throughout the kernel.
 * Reject prototype-sensitive names and control characters before any such
 * object is built; punctuation such as ':' and '/' remains valid.
 */
export function isSafeConflictIdV1(id: string): boolean {
  return id.length > 0
    && id.trim().length > 0
    && id !== 'prototype'
    && !Object.prototype.hasOwnProperty.call(Object.prototype, id)
    && !/[\u0000-\u001f\u007f]/.test(id);
}

export interface ParticipantSetV1Member {
  readonly participantId: string;
  readonly roleId: string;
}

export interface ParticipantSetV1 {
  readonly schemaVersion: typeof PARTICIPANT_SET_SCHEMA_VERSION;
  // Always === members.length; kept explicit so N is a first-class contract
  // field the way playerCount is in ConflictDefinitionV2.
  readonly participantCount: number;
  // Author-declared order, preserved verbatim.
  readonly members: readonly ParticipantSetV1Member[];
}

export type ParticipantSetErrorV1 =
  | { readonly code: 'too_few_participants'; readonly count: number; readonly message: string }
  | { readonly code: 'empty_participant_id'; readonly index: number; readonly message: string }
  | { readonly code: 'empty_role_id'; readonly index: number; readonly message: string }
  | { readonly code: 'unsafe_participant_id'; readonly index: number; readonly participantId: string; readonly message: string }
  | { readonly code: 'unsafe_role_id'; readonly index: number; readonly roleId: string; readonly message: string }
  | { readonly code: 'duplicate_participant'; readonly participantId: string; readonly message: string }
  | { readonly code: 'duplicate_role'; readonly roleId: string; readonly message: string };

export type ParticipantSetConstructionV1 =
  | { readonly ok: true; readonly value: ParticipantSetV1 }
  | { readonly ok: false; readonly errors: readonly ParticipantSetErrorV1[] };

/**
 * Fail-closed constructor. Fails on fewer than two members, an empty
 * participant or role id, a duplicate participant id, or a duplicate role id.
 * Order is preserved, never normalized, so the same member list always yields
 * an identical set and two different orders yield two different sets.
 */
export function buildParticipantSetV1(
  members: readonly ParticipantSetV1Member[],
): ParticipantSetConstructionV1 {
  const errors: ParticipantSetErrorV1[] = [];

  if (members.length < 2) {
    errors.push({
      code: 'too_few_participants',
      count: members.length,
      message: `participant set requires N >= 2, got ${members.length}`,
    });
  }

  const participantIds = new Set<string>();
  const roleIds = new Set<string>();
  members.forEach((member, index) => {
    if (member.participantId.length === 0) {
      errors.push({ code: 'empty_participant_id', index, message: `members[${index}] has an empty participantId` });
    } else if (!isSafeConflictIdV1(member.participantId)) {
      errors.push({ code: 'unsafe_participant_id', index, participantId: member.participantId, message: `members[${index}] has an unsafe participantId` });
    } else if (participantIds.has(member.participantId)) {
      errors.push({ code: 'duplicate_participant', participantId: member.participantId, message: `duplicate participant ${member.participantId}` });
    } else {
      participantIds.add(member.participantId);
    }
    if (member.roleId.length === 0) {
      errors.push({ code: 'empty_role_id', index, message: `members[${index}] has an empty roleId` });
    } else if (!isSafeConflictIdV1(member.roleId)) {
      errors.push({ code: 'unsafe_role_id', index, roleId: member.roleId, message: `members[${index}] has an unsafe roleId` });
    } else if (roleIds.has(member.roleId)) {
      errors.push({ code: 'duplicate_role', roleId: member.roleId, message: `duplicate role ${member.roleId}` });
    } else {
      roleIds.add(member.roleId);
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: PARTICIPANT_SET_SCHEMA_VERSION,
      participantCount: members.length,
      members: members.map((member) => ({ participantId: member.participantId, roleId: member.roleId })),
    },
  };
}

/** Participant ids in declared order — the shape buildBeliefGraphV1 consumes. */
export function participantIdsV1(set: ParticipantSetV1): readonly string[] {
  return set.members.map((member) => member.participantId);
}

/**
 * Dyadic bridge: folds ConflictDefinitionV2Role[] into a participant set,
 * proving the v2 role list is the N = 2 special case of this contract. Purely
 * a re-labeling (role.playerId → participantId, role.id → roleId); the same
 * fail-closed rules apply, so an invalid v2 role list stays invalid here.
 */
export function participantSetFromConflictRolesV1(
  roles: readonly ConflictDefinitionV2Role[],
): ParticipantSetConstructionV1 {
  return buildParticipantSetV1(
    roles.map((role) => ({ participantId: role.playerId, roleId: role.id })),
  );
}
