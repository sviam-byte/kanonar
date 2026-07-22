import type { ConflictDefinition, ConflictDefinitionV2 } from './types';

export interface ConflictDefinitionValidationError {
  readonly field: 'playerCount' | 'roles' | 'phases' | 'actionIds' | 'termination';
  readonly message: string;
}

export type ConflictDefinitionValidation =
  | { readonly ok: true; readonly value: ConflictDefinition }
  | { readonly ok: false; readonly errors: readonly ConflictDefinitionValidationError[] };

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/** Validates the executable dyadic contract before any UI or runner consumes it. */
export function validateConflictDefinition(definition: ConflictDefinition): ConflictDefinitionValidation {
  const errors: ConflictDefinitionValidationError[] = [];
  if (definition.playerCount !== 2) errors.push({ field: 'playerCount', message: 'R6 constructor supports exactly two participants' });
  if (definition.roles.length === 0 || definition.roles.some((role) => role.length === 0) || hasDuplicates(definition.roles)) {
    errors.push({ field: 'roles', message: 'roles must be a non-empty unique set' });
  }
  if (definition.phases.length === 0 || definition.phases.some((phase) => phase.length === 0) || hasDuplicates(definition.phases)) {
    errors.push({ field: 'phases', message: 'phases must be a non-empty unique sequence' });
  }
  if (definition.actionIds.length === 0 || definition.actionIds.some((action) => action.length === 0) || hasDuplicates(definition.actionIds)) {
    errors.push({ field: 'actionIds', message: 'legal action ids must be a non-empty unique set' });
  }
  if (definition.termination.kind !== 'external_round_budget') {
    errors.push({ field: 'termination', message: 'unsupported termination rule' });
  }
  return errors.length === 0 ? { ok: true, value: definition } : { ok: false, errors };
}

export type ConflictDefinitionV2Validation =
  | { readonly ok: true; readonly value: ConflictDefinitionV2 }
  | { readonly ok: false; readonly errors: readonly ConflictDefinitionValidationError[] };

/** Pure fail-closed validation of role, phase, observation, target and legal-action references. */
export function validateConflictDefinitionV2(definition: ConflictDefinitionV2): ConflictDefinitionV2Validation {
  const errors: ConflictDefinitionValidationError[] = [];
  const roleIds = definition.roles.map((role) => role.id);
  const phaseIds = definition.phases.map((phase) => phase.id);
  if (definition.playerCount !== 2 || roleIds.length !== 2 || hasDuplicates(roleIds)) errors.push({ field: 'playerCount', message: 'v2 requires exactly two uniquely identified roles' });
  if (definition.roles.some((role) => role.id.length === 0 || role.playerId.length === 0)) errors.push({ field: 'roles', message: 'roles require ids and players' });
  if (phaseIds.length === 0 || hasDuplicates(phaseIds) || definition.phases.some((phase) => phase.actorRoleIds.length === 0 || phase.actorRoleIds.some((roleId) => !roleIds.includes(roleId)))) {
    errors.push({ field: 'phases', message: 'phases require known actors and an explicit observation model' });
  }
  if (definition.legalActions.length === 0 || definition.legalActions.some((action) => !phaseIds.includes(action.phaseId) || !roleIds.includes(action.actorRoleId))) {
    errors.push({ field: 'actionIds', message: 'legal actions must reference known phases and roles' });
  }
  return errors.length === 0 ? { ok: true, value: definition } : { ok: false, errors };
}
