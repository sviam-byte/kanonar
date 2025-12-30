import { socialActions } from '../../data/actions-social';
import { allLocations } from '../../data/locations';
import type { LocationEntity } from '../types';

export type LintSeverity = 'error' | 'warn';

export interface LintIssue {
  severity: LintSeverity;
  kind: 'unknown_action_token' | 'empty_allowlist' | 'forbid_with_allowlist_mismatch';
  locationId: string;
  path: string;
  token?: string;
  message: string;
}

function buildKnownSets() {
  const knownActionIds = new Set<string>();
  const knownTags = new Set<string>();

  for (const a of socialActions) {
    knownActionIds.add(a.id);
    for (const t of a.tags ?? []) knownTags.add(t);
  }
  return { knownActionIds, knownTags };
}

function isKnownToken(token: string, knownActionIds: Set<string>, knownTags: Set<string>) {
  return knownActionIds.has(token) || knownTags.has(token);
}

function lintLocation(
  loc: LocationEntity,
  knownActionIds: Set<string>,
  knownTags: Set<string>
): LintIssue[] {
  const issues: LintIssue[] = [];
  const aff = (loc as any).affordances;
  if (!aff) return issues;

  const allowed = (aff.allowedActions ?? []) as string[];
  const forbidden = (aff.forbiddenActions ?? []) as string[];

  // optional: allowlist present but empty (common “forgot to fill”)
  if (Array.isArray(aff.allowedActions) && allowed.length === 0) {
    issues.push({
      severity: 'warn',
      kind: 'empty_allowlist',
      locationId: loc.entityId,
      path: `${loc.entityId}.affordances.allowedActions`,
      message:
        'allowedActions is present but empty (will effectively block most actions if you use allowlist semantics).',
    });
  }

  for (const token of allowed) {
    if (!isKnownToken(token, knownActionIds, knownTags)) {
      issues.push({
        severity: 'error',
        kind: 'unknown_action_token',
        locationId: loc.entityId,
        path: `${loc.entityId}.affordances.allowedActions`,
        token,
        message:
          'Unknown action token (must be actionId from socialActions, or a tag from socialActions.tags).',
      });
    }
  }

  for (const token of forbidden) {
    if (!isKnownToken(token, knownActionIds, knownTags)) {
      issues.push({
        severity: 'error',
        kind: 'unknown_action_token',
        locationId: loc.entityId,
        path: `${loc.entityId}.affordances.forbiddenActions`,
        token,
        message:
          'Unknown action token (must be actionId from socialActions, or a tag from socialActions.tags).',
      });
    }
  }

  // optional sanity: token appears in both allow & forbid (by literal token)
  if (allowed.length > 0 && forbidden.length > 0) {
    const allowSet = new Set(allowed);
    for (const t of forbidden) {
      if (allowSet.has(t)) {
        issues.push({
          severity: 'warn',
          kind: 'forbid_with_allowlist_mismatch',
          locationId: loc.entityId,
          path: `${loc.entityId}.affordances`,
          token: t,
          message: 'Token appears in both allowedActions and forbiddenActions (likely a mistake).',
        });
      }
    }
  }

  return issues;
}

export function lintActionsAndLocations(): {
  issues: LintIssue[];
  stats: {
    locations: number;
    locationsWithAffordances: number;
    errors: number;
    warnings: number;
    knownActionIds: number;
    knownTags: number;
  };
} {
  const { knownActionIds, knownTags } = buildKnownSets();

  const issues: LintIssue[] = [];
  let withAff = 0;

  for (const loc of allLocations) {
    if ((loc as any).affordances) withAff++;
    issues.push(...lintLocation(loc, knownActionIds, knownTags));
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warn').length;

  return {
    issues,
    stats: {
      locations: allLocations.length,
      locationsWithAffordances: withAff,
      errors,
      warnings,
      knownActionIds: knownActionIds.size,
      knownTags: knownTags.size,
    },
  };
}
