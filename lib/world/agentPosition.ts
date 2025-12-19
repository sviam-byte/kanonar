import { WorldState, AgentId, LocationId, LocationMapCell, LocationEntity } from "../types";

/**
 * Находим LocationEntity для агента (по его locationId).
 */
export function getAgentLocationEntity(
  world: WorldState,
  agentId: string
): LocationEntity | null {
  const agent = world.agents.find((c) => c.entityId === agentId);
  if (!agent) return null;

  const locationId = (agent as any).locationId ?? null;
  if (!locationId) return null;

  const entity = world.locations.find(
    (loc) => loc.entityId === locationId
  );
  return entity ?? null;
}

/**
 * Грубое положение агента на карте: ищем первую клетку карты,
 * где agentId содержится в agentIds / occupants.
 */
export function getAgentMapCell(
  world: WorldState,
  agentId: string
): { location: LocationEntity; cell: LocationMapCell } | null {
  const location = getAgentLocationEntity(world, agentId);
  if (!location || !location.map || !Array.isArray(location.map.cells)) {
    return null;
  }

  const cells = location.map.cells;
  for (const cell of cells) {
    if (!cell) continue;
    const occupants: string[] =
      ((cell as any).agentIds as string[]) ||
      ((cell as any).occupants as string[]) ||
      [];
    if (occupants.includes(agentId)) {
      return { location, cell };
    }
  }

  return null;
}

/**
 * Оценка расстояния по сетке (манхэттен) между двумя клетками.
 * Если локации разные — возвращаем средний уровень (как "далеко").
 */
export function estimateMapDistance(
  a: { locationId: string; cell: LocationMapCell } | null,
  b: { locationId: string; cell: LocationMapCell } | null
): number {
  if (!a || !b) return 1; // неизвестно = считаем далеко

  if (a.locationId !== b.locationId) {
    return 1; // разные локации = максимум
  }

  const dx = Math.abs(a.cell.x - b.cell.x);
  const dy = Math.abs(a.cell.y - b.cell.y);
  const d = dx + dy;

  // нормируем: 0 = рядом, 1 = далеко (огрублённо)
  const norm = d / 10; // 10 клеток манхэттена считаем "очень далеко"
  return Math.max(0, Math.min(1, norm));
}

/**
 * Локальная опасность клетки: учитываем danger, pit, cover и т.д.
 */
export function estimateCellHazard(cell: LocationMapCell): number {
  const danger = typeof cell.danger === "number" ? cell.danger : 0;
  const pit = (cell as any).pit ? 0.5 : 0;
  const isCover = (cell as any).cover ? -0.2 : 0;

  let raw = danger + pit + isCover;
  raw = Math.max(0, raw);
  return Math.max(0, Math.min(1, raw));
}
