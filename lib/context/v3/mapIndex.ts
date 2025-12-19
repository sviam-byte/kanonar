
import type { WorldState, AgentState } from "../../types";

export interface LocationMapCell {
  x: number;
  y: number;
  walkable: boolean;
  danger?: number;
  cover?: number;
  elevation?: number;
}

export interface LocationWithMap {
  id: string;
  name?: string;
  title?: string;
  tags?: string[];
  riskReward?: {
    riskIndex?: number;
    rewardIndex?: number;
  };
  state?: {
    alert_level?: number;
  };
  properties?: {
    privacy?: string;
    control_level?: number;
    visibility?: number;
    noise?: number;
  };
  map?: {
    id: string;
    width: number;
    height: number;
    cells: LocationMapCell[];
  };
}

/**
 * Get current focus location with map data from world state.
 */
export function getCurrentLocation(world: WorldState): LocationWithMap | null {
  // Prefer explicit scene focus location (GoalLab / ScenarioEngine)
  const focusId = (world.scene as any)?.locationId as string | undefined;
  if (focusId) {
    const focus = (world.locations || []).find(
      (l: any) => l.entityId === focusId && l.map && Array.isArray(l.map.cells)
    ) as any;
    if (focus) return focus as LocationWithMap;
  }

  // Fallback: first location that actually has a map
  const loc = (world.locations || []).find(
    (l: any) => l && l.map && Array.isArray(l.map.cells)
  ) as any;
  if (!loc) return null;
  return loc as LocationWithMap;
}

/**
 * Finds location for specific agent via locationId, fallback to world focus.
 */
export function getLocationForAgent(world: WorldState, agent: AgentState): LocationWithMap | null {
  const locId = (agent as any).locationId as string | undefined;
  if (locId) {
    const loc = (world.locations || []).find(
      (l: any) => l.entityId === locId && l.map && Array.isArray(l.map.cells)
    ) as any;
    if (loc) return loc as LocationWithMap;
  }
  return getCurrentLocation(world);
}

export function indexLocationMapCells(loc: LocationWithMap): Map<string, LocationMapCell> {
  const map = new Map<string, LocationMapCell>();
  const cells = loc.map?.cells ?? [];
  for (const cell of cells as any[]) {
    if (!cell) continue;
    if (!Number.isFinite(cell.x) || !Number.isFinite(cell.y)) continue;
    map.set(`${cell.x},${cell.y}`, cell);
  }
  return map;
}

export function getCellAt(
  cells: Map<string, LocationMapCell>,
  x?: number | null,
  y?: number | null
): LocationMapCell | null {
  if (x == null || y == null) return null;
  return cells.get(`${x},${y}`) ?? null;
}
