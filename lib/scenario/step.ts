
import {
  WorldState,
  ScenarioDef,
  ScenarioState,
  DomainEvent,
  SceneMetrics,
} from '../../types';
import { getScenarioEventsForCurrentTick } from './events';
import { scenarioTick } from './engine';          // твой существующий модуль
import { projectRelationsToSceneMetrics } from './relationsToScene';

export interface ScenarioStepInput {
  world: WorldState;
  allDomainEvents: DomainEvent[];
}

function applyScenarioEventsToMetrics(
  scene: ScenarioState,
  events: DomainEvent[]
) {
  if (!scene.metrics) return;
  for (const ev of events) {
    const eff = ev.effects?.scene;
    if (!eff?.delta) continue;
    for (const [k, dv] of Object.entries(eff.delta)) {
      const key = k as keyof SceneMetrics;
      const prev = (scene.metrics as any)[key] ?? 0;
      // Using any cast to assign to partial metric type safely in this generic handler
      (scene.metrics as any)[key] = prev + (dv as number);
    }
  }
}

/**
 * Единый шаг сценария:
 * - извлекает события для текущего сценария/тика;
 * - агрегирует эффекты событий в SceneMetrics;
 * - применяет фазу/исход (applyScenarioTick);
 * - обновляет метрики сцены с учётом отношений.
 */
export function scenarioStep(input: ScenarioStepInput): WorldState {
  const { world, allDomainEvents } = input;

  if (!world.scenario || !world.scene) return world;

  // 1. События текущего тика для сценария
  const events = getScenarioEventsForCurrentTick(allDomainEvents, world, true);

  // 2. Применяем их к SceneMetrics (через scene.delta)
  applyScenarioEventsToMetrics(world.scene, events);

  // 3. Обновить фазы/исход через твой движок
  scenarioTick({
    world,
    actionsExecuted: events.map((ev) => ({
      actorId: ev.actorId,
      actionId: ev.actionId,
    })),
  });

  // 4. Проецировать отношения участников в SceneMetrics
  projectRelationsToSceneMetrics(world, world.scene!);

  return world;
}
