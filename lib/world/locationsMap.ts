



import {
  WorldState,
  LocationEntity,
  LocationMap,
  ScenarioLayout,
  ScenarioZone,
  LocationConnection
} from '../../types';

// --- Базовые утилиты по локациям / карте ---

export function findLocation(
  world: WorldState,
  locationId: string
): LocationEntity | undefined {
  return world.locations.find((loc) => loc.entityId === locationId);
}

export function findMap(
  world: WorldState,
  mapId: string
): LocationMap | undefined {
  return world.maps?.find((m) => m.id === mapId);
}

export function findScenarioLayout(
  world: WorldState,
  scenarioId: string
): ScenarioLayout | undefined {
  return world.scenarioLayouts?.find((sl) => sl.scenarioId === scenarioId);
}

export function findZone(
  layout: ScenarioLayout,
  zoneId: string
): ScenarioZone | undefined {
  return layout.zones.find((z) => z.id === zoneId);
}

// --- Поиск пути между локациями (BFS по connections) ---

interface QueueItem {
  id: string;
  prev?: string;
}

/**
 * Найти кратчайший путь (по количеству шагов) между локациями.
 * Возвращает список id локаций от from до to включительно, либо [].
 */
export function findPathBetweenLocations(
  world: WorldState,
  fromLocationId: string,
  toLocationId: string,
  maxDifficulty: number = Infinity
): string[] {
  if (fromLocationId === toLocationId) return [fromLocationId];

  const byId = new Map<string, LocationEntity>();
  for (const loc of world.locations) {
    byId.set(loc.entityId, loc);
  }

  const queue: QueueItem[] = [{ id: fromLocationId }];
  const visited = new Set<string>([fromLocationId]);
  const prev = new Map<string, string | undefined>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const loc = byId.get(current.id);
    if (!loc || !loc.connections) continue;

    for (const [nextId, edge] of Object.entries(loc.connections)) {
      if (visited.has(nextId)) continue;
      const conn = edge as LocationConnection;
      if (conn.difficulty != null && conn.difficulty > maxDifficulty) continue;

      visited.add(nextId);
      prev.set(nextId, current.id);

      if (nextId === toLocationId) {
        // восстановление пути
        const path: string[] = [];
        let cur: string | undefined = nextId;
        while (cur) {
          path.push(cur);
          cur = prev.get(cur);
        }
        path.reverse();
        return path;
      }

      queue.push({ id: nextId });
    }
  }

  return [];
}

/**
 * Получить все локации, принадлежащие зоне сценария.
 */
export function getZoneLocations(
  world: WorldState,
  scenarioId: string,
  zoneId: string
): LocationEntity[] {
  const layout = findScenarioLayout(world, scenarioId);
  if (!layout) return [];
  const zone = findZone(layout, zoneId);
  if (!zone) return [];

  const ids = new Set(zone.locationIds);
  return world.locations.filter((loc) => ids.has(loc.entityId));
}
