
import { GoalEcology, GoalState } from "../../types";
import type { ContextualGoalScore } from "../context/v2/locationGoals";
import type { TomGoalContextScore } from "../context/v2/tomGoals";

/**
 * Матрица резонанса между целями.
 * Значения: -1.0 (сильно мешает) ... +1.0 (сильно помогает).
 */
const GOAL_INTERACTIONS: Record<string, Record<string, number>> = {
  socialize: {
    drink: 0.5,
    eat: 0.2,
    work: -0.8,
  },
  survival_fear: {
    hide: 1.5,
    socialize: -2.0,
    eat: -0.5,
  },
};

/**
 * Посчитать вклад графа целей в скоринг конкретной цели.
 * Используем список "активных" целей как контекст резонанса.
 */
export function calculateGraphInfluence(
  targetGoalId: string,
  activeGoals: string[]
): number {
  if (!activeGoals.length) return 0;

  let influence = 0;

  for (const activeId of activeGoals) {
    const interaction = GOAL_INTERACTIONS[activeId]?.[targetGoalId];
    if (interaction) {
      influence += interaction;
    }
  }

  return influence;
}

/**
 * Применить контекст локации (ContextualGoalScore[]) к GoalEcology.
 * Предполагается, что ContextualGoalScore уже посчитан для данного агента и локации.
 */
export function applyLocationContextToEcology(
  ecology: GoalEcology,
  scores: ContextualGoalScore[]
): GoalEcology {
  if (!scores.length) return ecology;

  const byId = new Map<string, ContextualGoalScore>(
    scores.map((s) => [s.goalId, s])
  );

  return {
    ...ecology,
    execute: applyToGoalList(ecology.execute, byId) as any,
    latent: applyToGoalList(ecology.latent, byId),
    queue: applyToGoalList(ecology.queue, byId),
    drop: applyToGoalList(ecology.drop, byId),
  };
}

/**
 * Применить ToM-контекст (TomGoalContextScore[]) к GoalEcology.
 * Логика такая же, как для локаций: заменяем вес на finalWeight,
 * аккумулируем источники.
 */
export function applyTomContextToEcology(
  ecology: GoalEcology,
  scores: TomGoalContextScore[]
): GoalEcology {
  if (!scores.length) return ecology;

  const byId = new Map<string, TomGoalContextScore>(
    scores.map((s) => [s.goalId, s])
  );

  return {
    ...ecology,
    execute: applyToGoalList(ecology.execute, byId) as any,
    latent: applyToGoalList(ecology.latent, byId),
    queue: applyToGoalList(ecology.queue, byId),
    drop: applyToGoalList(ecology.drop, byId),
  };
}

function applyToGoalList(goals: GoalState[], scoresMap: Map<string, { contextDelta: number, sources: string[], baseWeight?: number, finalWeight?: number }>): GoalState[] {
    return goals.map((g) => {
      const score = scoresMap.get(g.id);
      if (!score) return g;

      // Logic: apply additive delta to existing priority
      // baseWeight tracks original priority
      const base = g.baseWeight ?? g.priority;
      const final = Math.max(0, base + score.contextDelta); // Ensure non-negative

      return {
        ...g,
        baseWeight: base,
        priority: final, 
        weight: final,   
        contextSources: [
          ...(g.contextSources ?? []),
          ...score.sources,
        ],
      };
    });
}
