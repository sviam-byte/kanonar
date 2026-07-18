// R7-FOUNDATION-0 §3.4 conflict-definition-v3: the N-participant generalization
// of the declarative ConflictDefinitionV2, per the author ADR decisions of
// 2026-07-17 — §5.2 MINIMAL target set (none | self | counterparty | participant
// | all_others; counterparty is a validated alias legal only at playerCount === 2;
// role/subset deferred to an additive v3.1), §5.3 contract-first pure domain,
// §5.4 separate module with v2 kept frozen and liftConflictDefinitionV2ToV3
// proving v2 is the N = 2/counterparty special case (the same bridge pattern as
// participantSetFromConflictRolesV1). Pure domain: nothing imports this module
// at runtime; kernel execution stays dyadic per spec §0/§4.
//
// protocolId and action ids are plain strings, deliberately decoupled from the
// kernel literals ConflictProtocolId/ConflictActionId — an N-player definition
// must be expressible without a bound kernel; lift stays type-sound because the
// v2 literals widen to string.

import { participantSetFromConflictRolesV1 } from './participantSet';
import type { ParticipantSetErrorV1 } from './participantSet';
import type { ConflictDefinitionTermination, ConflictDefinitionV2, ConflictDefinitionV2Role } from './types';

export const CONFLICT_DEFINITION_V3_SCHEMA_VERSION = 'conflict-definition-v3' as const;

// Same member shape as v2 by design: the participant-set bridge consumes it directly.
export type ConflictDefinitionV3Role = ConflictDefinitionV2Role;

// Identical to v2's phase observation enum today; declared locally so v3 can
// refine 'role_limited' in v3.1 without touching the frozen v2 module. Stays
// purely declarative in this slice, as in v2.
export type ConflictPhaseObservationV3 = 'public_state' | 'private_state' | 'role_limited';

export interface ConflictDefinitionV3Phase {
  readonly id: string;
  readonly actorRoleIds: readonly string[];
  readonly observation: ConflictPhaseObservationV3;
}

// §5.2 MINIMAL set. 'participant' addresses a participant (a role's playerId),
// NOT a role id — consistent with the participant-set bridge re-labeling and
// the projection row's targetIds.
export type ConflictActionTargetV3 =
  | { readonly mode: 'none' }
  | { readonly mode: 'self' }
  | { readonly mode: 'counterparty' }
  | { readonly mode: 'participant'; readonly participantId: string }
  | { readonly mode: 'all_others' };

export interface ConflictDefinitionV3Action {
  readonly id: string;
  readonly phaseId: string;
  readonly actorRoleId: string;
  readonly target: ConflictActionTargetV3;
}

export interface ConflictDefinitionV3 {
  readonly schemaVersion: typeof CONFLICT_DEFINITION_V3_SCHEMA_VERSION;
  readonly protocolId: string;
  // Explicit N as a first-class contract field (like ParticipantSetV1's
  // participantCount); must equal roles.length, N >= 2 via the role bridge.
  readonly playerCount: number;
  readonly roles: readonly ConflictDefinitionV3Role[];
  readonly phases: readonly ConflictDefinitionV3Phase[];
  readonly legalActions: readonly ConflictDefinitionV3Action[];
  readonly termination: ConflictDefinitionTermination;
}

export type ConflictDefinitionV3Error =
  | { readonly code: 'player_count_mismatch'; readonly playerCount: number; readonly roleCount: number; readonly message: string }
  | { readonly code: 'invalid_roles'; readonly causeCode: ParticipantSetErrorV1['code']; readonly message: string }
  | { readonly code: 'empty_phases'; readonly message: string }
  | { readonly code: 'empty_phase_id'; readonly index: number; readonly message: string }
  | { readonly code: 'duplicate_phase_id'; readonly phaseId: string; readonly message: string }
  | { readonly code: 'empty_phase_actors'; readonly phaseId: string; readonly message: string }
  | { readonly code: 'unknown_phase_actor'; readonly phaseId: string; readonly roleId: string; readonly message: string }
  | { readonly code: 'empty_legal_actions'; readonly message: string }
  | { readonly code: 'empty_action_id'; readonly index: number; readonly message: string }
  | { readonly code: 'duplicate_action'; readonly phaseId: string; readonly actorRoleId: string; readonly actionId: string; readonly message: string }
  | { readonly code: 'unknown_action_phase'; readonly actionId: string; readonly phaseId: string; readonly message: string }
  | { readonly code: 'unknown_action_role'; readonly actionId: string; readonly actorRoleId: string; readonly message: string }
  | { readonly code: 'inactive_action_actor'; readonly actionId: string; readonly phaseId: string; readonly actorRoleId: string; readonly message: string }
  | { readonly code: 'counterparty_requires_dyad'; readonly actionId: string; readonly playerCount: number; readonly message: string }
  | { readonly code: 'unknown_target_participant'; readonly actionId: string; readonly participantId: string; readonly message: string };

export type ConflictDefinitionV3Validation =
  | { readonly ok: true; readonly value: ConflictDefinitionV3 }
  | { readonly ok: false; readonly errors: readonly ConflictDefinitionV3Error[] };

/**
 * Fail-closed validation of the N-participant declarative contract. Collects
 * every violation before failing. Checks everything the type system cannot
 * express: counts, uniqueness, cross-references, and target legality.
 * schemaVersion, termination.kind and phase.observation are compile-time
 * literals and are deliberately not re-checked (matching v2). Action ids are
 * NOT required to be unique — the canonical v2 instance shares ids across
 * roles; uniqueness is enforced on the (phaseId, actorRoleId, id) triple.
 * A 'participant' target naming the actor's own playerId is legal (it is
 * 'self' spelled explicitly); normalization is a future concern.
 */
export function validateConflictDefinitionV3(
  definition: ConflictDefinitionV3,
): ConflictDefinitionV3Validation {
  const errors: ConflictDefinitionV3Error[] = [];

  if (definition.playerCount !== definition.roles.length) {
    errors.push({
      code: 'player_count_mismatch',
      playerCount: definition.playerCount,
      roleCount: definition.roles.length,
      message: `playerCount ${definition.playerCount} does not match ${definition.roles.length} roles`,
    });
  }

  // Role uniqueness/N >= 2 is the participant-set contract, reused, not
  // re-implemented. Note this is stricter than v2: duplicate playerIds fail.
  const bridged = participantSetFromConflictRolesV1(definition.roles);
  if (bridged.ok === false) {
    for (const cause of bridged.errors) {
      errors.push({ code: 'invalid_roles', causeCode: cause.code, message: cause.message });
    }
  }

  // Reference sets come straight from the declared roles so cross-reference
  // checks still run even when the bridge failed.
  const roleIds = new Set(definition.roles.map((role) => role.id));
  const playerIds = new Set(definition.roles.map((role) => role.playerId));

  if (definition.phases.length === 0) {
    errors.push({ code: 'empty_phases', message: 'phases must be non-empty' });
  }
  const phaseIds = new Set<string>();
  const phaseActorIds = new Map<string, ReadonlySet<string>>();
  definition.phases.forEach((phase, index) => {
    if (phase.id.length === 0) {
      errors.push({ code: 'empty_phase_id', index, message: `phases[${index}] has an empty id` });
    } else if (phaseIds.has(phase.id)) {
      errors.push({ code: 'duplicate_phase_id', phaseId: phase.id, message: `duplicate phase ${phase.id}` });
    } else {
      phaseIds.add(phase.id);
    }
    if (phase.actorRoleIds.length === 0) {
      errors.push({ code: 'empty_phase_actors', phaseId: phase.id, message: `phase ${phase.id} has no actor roles` });
    }
    for (const roleId of phase.actorRoleIds) {
      if (!roleIds.has(roleId)) {
        errors.push({ code: 'unknown_phase_actor', phaseId: phase.id, roleId, message: `phase ${phase.id} references unknown role ${roleId}` });
      }
    }
    if (phase.id.length > 0 && !phaseActorIds.has(phase.id)) {
      phaseActorIds.set(phase.id, new Set(phase.actorRoleIds));
    }
  });

  if (definition.legalActions.length === 0) {
    errors.push({ code: 'empty_legal_actions', message: 'legal actions must be non-empty' });
  }
  const seenTriples = new Set<string>();
  definition.legalActions.forEach((action, index) => {
    if (action.id.length === 0) {
      errors.push({ code: 'empty_action_id', index, message: `legalActions[${index}] has an empty id` });
    }
    const triple = `${action.phaseId}\u0000${action.actorRoleId}\u0000${action.id}`;
    if (seenTriples.has(triple)) {
      errors.push({
        code: 'duplicate_action',
        phaseId: action.phaseId,
        actorRoleId: action.actorRoleId,
        actionId: action.id,
        message: `duplicate legal action (${action.phaseId}, ${action.actorRoleId}, ${action.id})`,
      });
    } else {
      seenTriples.add(triple);
    }
    if (!phaseIds.has(action.phaseId)) {
      errors.push({ code: 'unknown_action_phase', actionId: action.id, phaseId: action.phaseId, message: `action ${action.id} references unknown phase ${action.phaseId}` });
    }
    if (!roleIds.has(action.actorRoleId)) {
      errors.push({ code: 'unknown_action_role', actionId: action.id, actorRoleId: action.actorRoleId, message: `action ${action.id} references unknown role ${action.actorRoleId}` });
    } else if (phaseActorIds.has(action.phaseId) && !phaseActorIds.get(action.phaseId)?.has(action.actorRoleId)) {
      errors.push({
        code: 'inactive_action_actor',
        actionId: action.id,
        phaseId: action.phaseId,
        actorRoleId: action.actorRoleId,
        message: `action ${action.id} is assigned to role ${action.actorRoleId}, which is inactive in phase ${action.phaseId}`,
      });
    }
    if (action.target.mode === 'counterparty' && definition.playerCount !== 2) {
      errors.push({
        code: 'counterparty_requires_dyad',
        actionId: action.id,
        playerCount: definition.playerCount,
        message: `action ${action.id} targets 'counterparty' but playerCount is ${definition.playerCount}`,
      });
    }
    if (action.target.mode === 'participant' && !playerIds.has(action.target.participantId)) {
      errors.push({
        code: 'unknown_target_participant',
        actionId: action.id,
        participantId: action.target.participantId,
        message: `action ${action.id} targets unknown participant ${action.target.participantId}`,
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: definition };
}

/**
 * Lifts the frozen dyadic v2 contract into v3, proving v2 is the
 * N = 2/counterparty special case. Pure re-labeling over fresh objects; the
 * result is re-validated, so the lift of a valid v2 is a valid v3 by
 * construction. validateConflictDefinitionV2 is deliberately not run first:
 * for lifted values the v3 validator subsumes every v2 check (exactly-two
 * falls out of player_count_mismatch + counterparty_requires_dyad) and is
 * strictly harder on duplicate playerIds.
 */
export function liftConflictDefinitionV2ToV3(
  definition: ConflictDefinitionV2,
): ConflictDefinitionV3Validation {
  const lifted: ConflictDefinitionV3 = {
    schemaVersion: CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
    protocolId: definition.protocolId,
    playerCount: definition.playerCount,
    roles: definition.roles.map((role) => ({ id: role.id, playerId: role.playerId })),
    phases: definition.phases.map((phase) => ({
      id: phase.id,
      actorRoleIds: [...phase.actorRoleIds],
      observation: phase.observation,
    })),
    legalActions: definition.legalActions.map((action) => ({
      id: action.id,
      phaseId: action.phaseId,
      actorRoleId: action.actorRoleId,
      target: action.target === 'counterparty' ? { mode: 'counterparty' } : { mode: 'none' },
    })),
    termination: { kind: definition.termination.kind, note: definition.termination.note },
  };
  return validateConflictDefinitionV3(lifted);
}
