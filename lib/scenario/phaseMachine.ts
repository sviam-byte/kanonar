
import {
  ScenarioContextState,
  ScenarioPhaseRule,
  ScenarioPhaseState,
  StoryTime,
  WorldState,
} from '../../types';

/**
 * Выбрать фазу по набору правил и значениям sceneMetrics.
 * Берётся первая подходящая фаза (по порядку rules).
 */
function pickPhaseIdByRules(
  ctx: ScenarioContextState,
  rules: ScenarioPhaseRule[]
): ScenarioPhaseRule | undefined {
  const metrics = ctx.sceneMetrics || {};

  for (const rule of rules) {
    const value = metrics[rule.metric];
    if (typeof value !== 'number') continue;

    const min = rule.min ?? -Infinity;
    const max = rule.max ?? +Infinity;

    if (value >= min && value < max) {
      return rule;
    }
  }

  return undefined;
}

/**
 * Обновить активную фазу на основе правил.
 * Если подходящая фаза не найдена — остаёмся в текущей.
 */
export function applyPhaseRules(
  ctx: ScenarioContextState,
  world: WorldState,
  rules: ScenarioPhaseRule[]
): ScenarioContextState {
  if (rules.length === 0) return ctx;

  const now: StoryTime = world.tick;
  const current = ctx.activePhase;
  const rule = pickPhaseIdByRules(ctx, rules);

  if (!rule) {
    return ctx;
  }

  if (current && current.id === rule.id) {
    // фаза не меняется, просто возвращаем исходный контекст
    return ctx;
  }

  const nextPhase: ScenarioPhaseState = {
    id: rule.id,
    label: rule.label ?? rule.id,
    enteredAt: now,
    goalWeights: rule.goalWeights ?? {},
    actionMultipliers: rule.actionMultipliers,
    normOverrides: rule.normOverrides,
  };

  const newHistory = current
    ? [...ctx.phaseHistory, current]
    : ctx.phaseHistory;

  // Apply Norm Overrides
  let norms = ctx.norms;
  if (rule.normOverrides) {
      // Append or replace? Simple merge: append new norms.
      // In a real system we might replace based on ID or merge.
      norms = [...norms, ...rule.normOverrides];
  }

  return {
    ...ctx,
    activePhase: nextPhase,
    phaseHistory: newHistory,
    norms
  };
}
