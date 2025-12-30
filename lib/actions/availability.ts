import type { Action, LocationEntity } from '../types';
import { getActionCatalog, resolveActionTokenToIds } from './catalog';

export interface ComputeAvailableActionsInput {
  roleId?: string | null;
  location?: LocationEntity | null;
  allowedActionTags?: string[] | null;
  bannedActionTags?: string[] | null;
  alwaysAllowIds?: string[] | null;
}

function actionAllowedForRole(action: Action, roleId?: string | null): boolean {
  const allowedFor = action.allowedFor ?? ['any'];
  if (allowedFor.includes('any')) return true;
  if (!roleId) return false;
  return allowedFor.includes(roleId);
}

function passesTagFilters(
  action: Action,
  allowedTags?: string[] | null,
  bannedTags?: string[] | null
): boolean {
  const tags = action.tags ?? [];

  if (bannedTags && bannedTags.length > 0) {
    if (tags.some((t) => bannedTags.includes(t))) return false;
  }

  if (allowedTags && allowedTags.length > 0) {
    // if allowlist is set: action must match at least one allowed tag
    // except for a small set of safe always-allowed actions handled outside.
    if (!tags.some((t) => allowedTags.includes(t))) return false;
  }

  return true;
}

function applyLocationTrim(ids: string[], location?: LocationEntity | null): string[] {
  if (!location || !(location as any).affordances) return ids;
  const aff = (location as any).affordances;

  const allowedTokens = (aff.allowedActions ?? []) as string[];
  const forbiddenTokens = (aff.forbiddenActions ?? []) as string[];

  let out = ids;

  // Whitelist: if present, only allow those.
  if (allowedTokens.length > 0) {
    const allowIds = new Set<string>();
    for (const token of allowedTokens) {
      for (const id of resolveActionTokenToIds(token)) allowIds.add(id);
    }
    out = out.filter((id) => allowIds.has(id));
  }

  if (forbiddenTokens.length > 0) {
    const forbidIds = new Set<string>();
    for (const token of forbiddenTokens) {
      for (const id of resolveActionTokenToIds(token)) forbidIds.add(id);
    }
    out = out.filter((id) => !forbidIds.has(id));
  }

  return out;
}

/**
 * Canonical action-space builder.
 *
 * - Starts from full action catalog.
 * - Applies role filter.
 * - Applies phase tag filters.
 * - Applies location affordances (whitelist/blacklist).
 */
export function computeAvailableActionIds(input: ComputeAvailableActionsInput): string[] {
  const { all, byId } = getActionCatalog();
  const roleId = input.roleId ?? null;
  const allowedTags = input.allowedActionTags ?? null;
  const bannedTags = input.bannedActionTags ?? null;

  const alwaysAllow = new Set<string>(input.alwaysAllowIds ?? ['wait', 'observe']);

  // Role + phase filters
  const base = all
    .filter((a) => actionAllowedForRole(a, roleId))
    .filter((a) => {
      if (alwaysAllow.has(a.id)) return true;
      return passesTagFilters(a, allowedTags, bannedTags);
    })
    .map((a) => a.id);

  // Location trimming
  const trimmed = applyLocationTrim(base, input.location ?? null);

  // Ensure alwaysAllow are included (appended, stable)
  const out: string[] = [...trimmed];
  for (const id of alwaysAllow) {
    if (byId[id] && !out.includes(id)) out.push(id);
  }

  return out;
}
