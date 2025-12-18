
import { GOAL_CATALOG, GoalCatalogEntry } from '../../data/goals/catalog';
import { CharacterGoalId } from '../../types';

export const GOAL_CATALOG_MAP: Record<string, GoalCatalogEntry> = Object.fromEntries(
  GOAL_CATALOG.map((g) => [g.id, g])
);

export function describeGoal(id: string): GoalCatalogEntry | null {
  return GOAL_CATALOG_MAP[id] ?? null;
}
