// lib/simkit/adapters/autoPlace.ts
// Auto-distribute characters across selected locations.
// Uses lightweight heuristics to provide a useful first draft for setup.

import type { CharacterEntity, LocationEntity } from '../../../types';

/**
 * Auto-place characters into locations.
 *
 * Strategy:
 *  1) Character-level default location hints (if present and selected)
 *  2) Authority-like characters to the most connected location
 *  3) Round-robin fallback for remaining characters
 */
export function autoPlaceCharacters(
  charIds: string[],
  locIds: string[],
  locations: LocationEntity[],
  characters: CharacterEntity[],
): Record<string, string> {
  if (!locIds.length || !charIds.length) return {};

  if (locIds.length === 1) {
    const out: Record<string, string> = {};
    for (const cid of charIds) out[cid] = locIds[0];
    return out;
  }

  const placements: Record<string, string> = {};
  const locationSet = new Set(locIds);
  const remaining = new Set(charIds);

  const locationsByConnectivity = [...locations]
    .filter((l) => locationSet.has(l.entityId))
    .sort((a, b) => {
      const connA = Object.keys(a.connections || {}).filter((n) => locationSet.has(n)).length;
      const connB = Object.keys(b.connections || {}).filter((n) => locationSet.has(n)).length;
      return connB - connA;
    });

  for (const cid of [...remaining]) {
    const ch = characters.find((c) => c.entityId === cid);
    if (!ch) continue;

    const hintedLocation =
      (ch as any).homeLocation
      || (ch as any).defaultLocation
      || (ch as any).context?.defaultLocation;

    if (hintedLocation && locationSet.has(hintedLocation)) {
      placements[cid] = hintedLocation;
      remaining.delete(cid);
    }
  }

  for (const cid of [...remaining]) {
    const ch = characters.find((c) => c.entityId === cid);
    if (!ch) continue;

    const tags = Array.isArray((ch as any).tags) ? (ch as any).tags : [];
    const isAuthority = tags.includes('authority') || tags.includes('leader') || String(ch.entityId).includes('tegan');

    if (isAuthority && locationsByConnectivity.length) {
      placements[cid] = locationsByConnectivity[0].entityId;
      remaining.delete(cid);
    }
  }

  const order = locationsByConnectivity.map((l) => l.entityId);
  let rrIndex = 0;
  for (const cid of [...remaining]) {
    placements[cid] = order[rrIndex % order.length];
    rrIndex += 1;
    remaining.delete(cid);
  }

  return placements;
}

/**
 * Find connected location groups.
 * Useful for optional UX hints in setup flows.
 */
export function findConnectedGroups(locations: LocationEntity[]): string[][] {
  const adjacency = new Map<string, Set<string>>();

  for (const l of locations) {
    adjacency.set(l.entityId, new Set(Object.keys(l.connections || {})));
  }

  const visited = new Set<string>();
  const groups: string[][] = [];

  for (const l of locations) {
    if (visited.has(l.entityId)) continue;

    const group: string[] = [];
    const queue = [l.entityId];

    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;

      visited.add(id);
      group.push(id);

      for (const neighbor of adjacency.get(id) || []) {
        if (!visited.has(neighbor) && adjacency.has(neighbor)) queue.push(neighbor);
      }
    }

    groups.push(group);
  }

  return groups;
}
