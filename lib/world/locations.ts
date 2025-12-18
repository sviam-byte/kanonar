
import {
  LocationEntity,
  CharacterEntity,
  AgentState,
  WorldState,
  LocationGoalProfile,
  LocationMapCell,
  LocationConnection
} from '../../types';
import { hydrateLocation } from '../adapters/rich-location';
import { validateLocation } from '../location/validate';
import { Location } from '../location/types';

/**
 * Найти локацию по id в произвольном списке локаций.
 */
export function findLocation(
  locations: LocationEntity[],
  locationId: string | undefined | null
): LocationEntity | undefined {
  if (!locationId) return undefined;
  return locations.find((loc) => loc.entityId === locationId);
}

/**
 * Канонический способ получить "богатую" локацию из мира.
 * 1) ищет LocationEntity;
 * 2) гидрирует в Location;
 * 3) в dev-режиме прогоняет через validateLocation и пишет ворнинги.
 */
export function getHydratedLocation(
  world: WorldState,
  id: string
): Location | null {
  // Use generic location access
  const locations = (world as any).locations as LocationEntity[] || [];
  const entity = findLocation(locations, id);
  if (!entity) return null;

  const loc = hydrateLocation(entity);

  if (process.env.NODE_ENV !== "production") {
    const result = validateLocation(loc);
    if (!result.ok) {
      // мягкий рантайм-контроль: не ломаем симуляцию, но сигналим в консоль
      console.warn("[location-validation] Location", id, "has issues:", {
        issues: result.issues,
      });
    }
  }

  return loc;
}

export function getLocationForAgent(world: WorldState, agentId: string): LocationEntity | undefined {
  const agent = world.agents.find(a => a.entityId === agentId);
  if (!agent?.locationId) return undefined;
  // Use any cast if world.locations type is loose or array access needed
  return (world as any).locations?.find((l: any) => l.entityId === agent.locationId);
}

export function getLocationMapCell(
  loc: LocationEntity,
  x: number,
  y: number
): LocationMapCell | undefined {
  const map = loc.map;
  if (!map) return undefined;
  return map.cells.find(c => c.x === x && c.y === y);
}

/**
 * Получить координаты клетки агента из его позиции.
 */
export function getAgentMapCell(agent: { pos: { x: number; y: number } }) {
  return {
    cx: Math.round(agent.pos.x),
    cy: Math.round(agent.pos.y),
  };
}

// агрегированные метрики по окрестности клетки
export function getLocalMapMetrics(
  loc: LocationEntity,
  cx: number,
  cy: number,
  radius: number = 1
): { avgDanger: number; avgCover: number; obstacles: number } {
  if (!loc.map) return { avgDanger: 0, avgCover: 0, obstacles: 0 };

  let dangerSum = 0;
  let coverSum = 0;
  let obstacleCount = 0;
  let count = 0;

  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const cell = getLocationMapCell(loc, x, y);
      if (!cell) continue;
      count++;
      dangerSum += cell.danger ?? 0;
      coverSum += cell.cover ?? 0;
      if (!cell.walkable) obstacleCount++;
    }
  }

  if (count === 0) return { avgDanger: 0, avgCover: 0, obstacles: 0 };

  return {
    avgDanger: dangerSum / count,
    avgCover: coverSum / count,
    obstacles: obstacleCount / count,
  };
}


/**
 * Базовая проверка "может ли персонаж физически и по правам попасть в локацию".
 * НЕ изменяет мир, чистая функция.
 */
export function canCharacterEnterLocation(
  location: LocationEntity,
  character: CharacterEntity,
  tick: number = 0 // Default to 0 if not provided, assuming check ignores time-sensitive grants
): boolean {
  const access = location.access;
  
  // 0. Owner Override
  // If the character is a direct owner, they can always enter regardless of mode or locks.
  if (location.ownerIds?.includes(character.entityId)) {
      return true;
  }
  
  // 1. Dynamic Grants (Keys) Check
  // Check if user has a valid, non-expired grant
  if (access?.grants) {
      const validGrant = access.grants.find(g => 
          g.granteeId === character.entityId && 
          (g.expiresAt === undefined || g.expiresAt > tick)
      );
      if (validGrant) {
          // TODO: Check grant specific conditions (e.g. onlyWhenOwnerPresent) if needed
          return true;
      }
  }

  // 2. Sealed Mode
  // Если локация "запечатана" — доступ только если явно разрешён выше (owner or grant)
  // Или если есть VERY EXPLICIT whitelist overrides below.
  // Обычно sealed блокирует всё, кроме owner/grant/explicit whitelist.
  if (access?.mode === 'sealed') {
    const hasExplicitAllow =
      (access.baseAllowedRoles && access.baseAllowedRoles.length > 0) ||
      (access.baseAllowedFactions && access.baseAllowedFactions.length > 0) ||
      (access.baseAllowedCharacterIds && access.baseAllowedCharacterIds.length > 0) ||
      (access.allowedCharacterIds && access.allowedCharacterIds.length > 0); // Legacy compat
    
    if (!hasExplicitAllow) return false;
  }

  // 3. Locked State
  // Если локация закрыта (State override) и режим не 'open'
  // Owners and Grant holders already passed above.
  if (location.state?.locked && access?.mode !== 'open') {
    // Physical lock blocks non-keyholders unless explicitly whitelisted by ID (a "keyholder" list)
    const explicitChar = 
        access?.baseAllowedCharacterIds?.includes(character.entityId) ||
        access?.allowedCharacterIds?.includes(character.entityId); // Legacy
        
    if (!explicitChar) return false;
  }

  // 4. Capacity Check
  const cap = location.geometry?.capacity;
  if (typeof cap === 'number' && cap >= 0 && (location as any).occupantsCount != null) {
    const occ = (location as any).occupantsCount as number;
    if (occ >= cap) return false;
  }

  // 5. Base Rules (Whitelist)
  
  // ID Whitelist
  if (access?.baseAllowedCharacterIds?.includes(character.entityId)) return true;
  if (access?.allowedCharacterIds?.includes(character.entityId)) return true; // Legacy

  // Roles
  if (access?.baseAllowedRoles && character.roles?.global) {
    const hasRole = access.baseAllowedRoles.some((role) =>
      character.roles!.global!.includes(role)
    );
    if (hasRole) return true;
  }
  if (access?.allowedRoles && character.roles?.global) { // Legacy
     const hasRole = access.allowedRoles.some((role) => character.roles!.global!.includes(role));
     if (hasRole) return true;
  }

  // Factions
  if ((access?.baseAllowedFactions || access?.allowedFactions) && (character as any).context?.faction) {
    const faction = (character as any).context.faction as string;
    const allowedFactions = [...(access?.baseAllowedFactions || []), ...(access?.allowedFactions || [])];
    if (allowedFactions.includes(faction)) return true;
  }

  // 6. Default Mode 'Open'
  if (access?.mode === 'open') {
    return true;
  }

  // Otherwise denied
  return false;
}

export function canAgentEnterLocation(world: WorldState, locationId: string): boolean {
  const loc = (world as any).locations?.find((l: any) => l.entityId === locationId);
  if (!loc) return false;

  const capacity = loc.geometry?.capacity;
  if (capacity == null) return true;

  const current = world.agents.filter((a: any) => a.locationId === locationId).length;
  return current < capacity;
}

/**
 * Helper to grant temporary access to a location.
 * Returns a modified LocationEntity (immutable update).
 */
export function grantAccess(
    location: LocationEntity,
    granterId: string,
    granteeId: string,
    durationTicks: number = 1000
): LocationEntity {
    // Verify granter has rights (simple check: is owner)
    if (!location.ownerIds?.includes(granterId)) {
        // In a real system, we might check if granter has 'admin' grant. 
        // For now, only owners can share keys.
        console.warn(`Agent ${granterId} tried to grant access to ${location.entityId} but is not an owner.`);
        return location;
    }

    const newGrant = {
        id: `grant-${Date.now()}-${Math.random()}`,
        granteeId,
        granterId,
        expiresAt: Date.now() + durationTicks, // Mock tick using timestamp for now if world tick not passed
        scope: 'act' as const
    };

    return {
        ...location,
        access: {
            ...location.access!,
            grants: [...(location.access?.grants || []), newGrant]
        }
    };
}

/**
 * Получить список агентов, находящихся в конкретной локации.
 */
export function getAgentsInLocation(
  world: WorldState,
  locationId: string
): AgentState[] {
  return world.agents.filter(
    (agent: any) => agent.locationId === locationId
  );
}

/**
 * Иммутабельное перемещение агента в локацию.
 * Возвращает НОВЫЙ WorldState (shallow copy + обновлённый агент).
 * Ничего не делает, если:
 *  - нет агента,
 *  - нет локации,
 *  - canCharacterEnterLocation вернул false.
 */
export function moveAgentToLocation(
  world: WorldState,
  agentId: string,
  targetLocationId: string
): WorldState {
  const agentIndex = world.agents.findIndex((a) => a.entityId === agentId);
  if (agentIndex === -1) return world;

  // Ищём локацию среди всех сущностей мира, если они там есть,
  // иначе — ожидаем отдельный реестр локаций.
  let location: LocationEntity | undefined;
  if ((world as any).locations && Array.isArray((world as any).locations)) {
    location = (world as any).locations.find(
      (loc: LocationEntity) => loc.entityId === targetLocationId
    );
  }

  if (!location) {
    // Если нет world.locations — просто переключаем locationId, без проверки вместимости.
    const nextAgents = world.agents.map((a, idx) =>
      idx === agentIndex
        ? ({
            ...a,
            locationId: targetLocationId,
          } as AgentState)
        : a
    );
    return { ...world, agents: nextAgents };
  }

  const characterView = world.agents[agentIndex] as CharacterEntity;
  // Pass world.tick to access check
  if (!canCharacterEnterLocation(location, characterView, world.tick)) {
    return world;
  }
  
  if (!canAgentEnterLocation(world, targetLocationId)) {
      return world;
  }

  const nextAgents = world.agents.map((a, idx) =>
    idx === agentIndex
      ? ({
          ...a,
          locationId: targetLocationId,
        } as AgentState)
      : a
  );

  return { ...world, agents: nextAgents };
}

/**
 * Простейший обход графа локаций по connections.
 * Возвращает список id всех достижимых локаций с учётом максимальной сложности пути.
 */
export function getReachableLocations(
  origin: LocationEntity,
  allLocations: LocationEntity[],
  maxDifficulty: number = Infinity
): string[] {
  const result = new Set<string>();
  const queue: string[] = [origin.entityId];

  const byId = new Map<string, LocationEntity>();
  for (const loc of allLocations) byId.set(loc.entityId, loc);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (result.has(currentId)) continue;
    result.add(currentId);

    const current = byId.get(currentId);
    if (!current || !current.connections) continue;

    for (const [nextId, edge] of Object.entries(current.connections)) {
      const conn = edge as LocationConnection;
      if (conn.difficulty != null && conn.difficulty > maxDifficulty) continue;
      if (!result.has(nextId)) queue.push(nextId);
    }
  }

  return Array.from(result);
}

// Legacy helpers export for compatibility
export const moveCharacterToLocation = (params: { characters: CharacterEntity[], locations: LocationEntity[], characterId: string, locationId: string }) => {
    const { characters, locations, characterId, locationId } = params;
    const updatedCharacters = characters.map(ch => 
        ch.entityId === characterId ? { ...ch, locationId } : ch
    );
    return { characters: updatedCharacters, locations };
};
export const checkAccess = (char: CharacterEntity, loc: LocationEntity) => canCharacterEnterLocation(loc, char);
