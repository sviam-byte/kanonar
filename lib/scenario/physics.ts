
import { WorldState, ScenarioDef, SceneMetrics } from '../../types';

export interface JointActions {
  [agentId: string]: string; // actionId
}

/**
 * Чистая функция: считает новые SceneMetrics,
 * исходя из текущих метрик и описания сценария.
 *
 * Важно: она НЕ знает про ActionSystem и не применяет actionEffects.
 * Предполагается, что:
 *   - либо ActionSystem уже обновил world.scene.metrics,
 *   - либо jointActions используются только для дополнительной логики,
 *     если захочешь её сюда добавить.
 */
export function calculateNextMetrics(
  currentMetrics: SceneMetrics,
  scenario: ScenarioDef,
  _jointActions: JointActions
): SceneMetrics {
  const nextMetrics: any = { ...currentMetrics };

  // Тик по сцене
  nextMetrics.tick = (nextMetrics.tick || 0) + 1;

  // Клампы по min/max из ScenarioDef.metrics
  if (scenario.metrics) {
    for (const [key, defAny] of Object.entries(scenario.metrics)) {
      const def = defAny as any;
      const min = typeof def.min === 'number' ? def.min : -Infinity;
      const max = typeof def.max === 'number' ? def.max : +Infinity;
      const value = nextMetrics[key];

      if (typeof value === 'number') {
        let v = value;
        if (Number.isFinite(min)) v = Math.max(min, v);
        if (Number.isFinite(max)) v = Math.min(max, v);
        nextMetrics[key] = v;
      }
    }
  }

  return nextMetrics as SceneMetrics;
}

/**
 * Утилита для “чистого” апдейта мира с учётом calculateNextMetrics.
 * Можно вызывать из симуляционного цикла, если нужно.
 */
export function applyScenarioPhysics(
  world: WorldState,
  jointActions: JointActions
): WorldState {
  if (!world.scenario || !world.scene) return world;

  const nextMetrics = calculateNextMetrics(
    world.scene.metrics,
    world.scenario,
    jointActions
  );

  return {
    ...world,
    tick: world.tick + 1,
    scene: {
      ...world.scene,
      metrics: nextMetrics,
    },
  };
}

// Export alias for compatibility with planner-v4
export const scenarioStep = applyScenarioPhysics;
