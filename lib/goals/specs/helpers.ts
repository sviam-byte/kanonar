import type { CharacterGoalDef, CharacterGoalId } from '../../../types';
import type { GoalSpecV1 } from './types';
import { GOAL_SPECS_V1 } from './registry';

const FAMILY_TO_LEGACY_KIND: Record<GoalSpecV1['family'], string> = {
  survival: 'self',
  epistemic: 'epistemic',
  social: 'social',
  procedural: 'mission',
  identity: 'identity',
  affect: 'affect',
  resource: 'mission',
  concealment: 'self',
};

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function specToLegacyGoalDef(spec: GoalSpecV1): CharacterGoalDef {
  return {
    id: spec.id as CharacterGoalId,
    label_ru: spec.label,
    kind: FAMILY_TO_LEGACY_KIND[spec.family] ?? 'other',
    donatable: spec.targeting !== 'self',
    leaderBias: 0,
    // Временный compatibility-bridge:
    // пока intents ещё не вынесены в отдельный registry, используем compatibleIntents
    // как суррогат старого allowedActions.
    allowedActions: uniq([...(spec.compatibleIntents ?? [])]),
    domains: uniq([spec.family, ...(spec.tags ?? [])]),
  };
}

export function getGoalSpecById(goalId: string): GoalSpecV1 | undefined {
  return GOAL_SPECS_V1.find((spec) => spec.id === goalId);
}

export function buildLegacyGoalDefsFromSpecs(
  specs: GoalSpecV1[] = GOAL_SPECS_V1,
): Record<CharacterGoalId, CharacterGoalDef> {
  const out = {} as Record<CharacterGoalId, CharacterGoalDef>;
  for (const spec of specs) {
    out[spec.id as CharacterGoalId] = specToLegacyGoalDef(spec);
  }
  return out;
}
