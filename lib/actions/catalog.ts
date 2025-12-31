import { socialActions } from '../../data/actions-social';
import type { Action, LocationEntity } from '../types';
import { listify } from '../utils/listify';

export interface ActionCatalog {
  all: Action[];
  byId: Record<string, Action>;
  tagsToIds: Record<string, string[]>;
}

let _catalog: ActionCatalog | null = null;

export function getActionCatalog(): ActionCatalog {
  if (_catalog) return _catalog;

  const byId: Record<string, Action> = {};
  const tagsToIds: Record<string, string[]> = {};

  for (const a of socialActions) {
    byId[a.id] = a;
    for (const t of listify(a.tags)) {
      (tagsToIds[t] ??= []).push(a.id);
    }
  }

  _catalog = {
    all: socialActions,
    byId,
    tagsToIds,
  };

  return _catalog;
}

/**
 * Action token can be either an actionId or a tag.
 * Returns list of actionIds this token refers to.
 */
export function resolveActionTokenToIds(token: string): string[] {
  const { byId, tagsToIds } = getActionCatalog();
  if (byId[token]) return [token];
  const ids = tagsToIds[token];
  return ids ? [...ids] : [];
}

export function isKnownActionToken(token: string): boolean {
  const { byId, tagsToIds } = getActionCatalog();
  return Boolean(byId[token] || tagsToIds[token]);
}

export interface LocationAffordanceValidationIssue {
  path: string;
  token: string;
  message: string;
}

export function validateLocationAffordances(
  loc: LocationEntity
): LocationAffordanceValidationIssue[] {
  const issues: LocationAffordanceValidationIssue[] = [];
  const aff = (loc as any).affordances;
  if (!aff) return issues;

  const allowed = listify(aff.allowedActions) as string[];
  const forbidden = listify(aff.forbiddenActions) as string[];

  for (const token of allowed) {
    if (!isKnownActionToken(token)) {
      issues.push({
        path: `${loc.entityId}.affordances.allowedActions`,
        token,
        message: 'Unknown actionId/tag',
      });
    }
  }

  for (const token of forbidden) {
    if (!isKnownActionToken(token)) {
      issues.push({
        path: `${loc.entityId}.affordances.forbiddenActions`,
        token,
        message: 'Unknown actionId/tag',
      });
    }
  }

  return issues;
}
