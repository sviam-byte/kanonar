
import {
  WorldState,
  ScenarioState,
  RelationsGraph,
} from '../../types';

/**
 * Получить список id агентов, которые считаются "участниками" сценария.
 * Пока — просто все агенты, у которых есть locationId в карте сценария.
 * Потом можно это уточнить (roleSlots, tags и т.д.).
 */
export function getScenarioParticipantIds(world: WorldState): string[] {
  const scenario = world.scenario;
  if (!scenario) return [];

  const layout = world.scenarioLayouts?.find((sl) => sl.scenarioId === scenario.id);
  if (!layout) return [];

  const locSet = new Set(layout.zones.flatMap((z) => z.locationIds));

  return world.agents
    .filter((a: any) => a.locationId && locSet.has(a.locationId))
    .map((a) => a.entityId);
}

/**
 * Проецировать RelationsGraph участников в SceneMetrics:
 * - средняя когезия (cohesion)
 * - средний конфликт (conflict)
 * - условная "легитимность лидера", если захочешь
 */
export function projectRelationsToSceneMetrics(
  world: WorldState,
  scene: ScenarioState
): void {
  const participants = new Set(getScenarioParticipantIds(world));
  
  // If no specific participants found via location, fallback to all agents in world (legacy mode)
  if (participants.size === 0 && world.agents.length > 0) {
      world.agents.forEach(a => participants.add(a.entityId));
  }
  
  if (participants.size === 0) return;

  const graph: RelationsGraph | undefined = world.relations;
  if (!graph) return;

  let sumBond = 0;
  let sumConflict = 0;
  let count = 0;

  for (const e of graph.edges) {
    if (!participants.has(e.fromId) || !participants.has(e.toId)) continue;
    sumBond += e.bond ?? 0;
    sumConflict += e.conflict ?? 0;
    count += 1;
  }

  if (count === 0) return;

  const avgBond = sumBond / count;
  const avgConflict = sumConflict / count;

  // Нормируем в [0,1] и пишем в метрики сцены, если они есть
  const metrics: any = scene.metrics;
  if (metrics.cohesion != null) {
    // простая эвристика: когезия ~ avgBond * (1 - avgConflict)
    // Scale up to 0-100 if metric is large scale
    const cohesionVal = Math.max(0, Math.min(1, avgBond * (1 - avgConflict)));
    // Heuristic check if cohesion uses 0-100 range based on current value
    const scale = metrics.cohesion > 1 ? 100 : 1;
    metrics.cohesion = cohesionVal * scale;
  }

  if (metrics.conflict != null) {
    const conflictVal = Math.max(0, Math.min(1, avgConflict));
    const scale = metrics.conflict > 1 ? 100 : 1;
    metrics.conflict = conflictVal * scale;
  }
}
