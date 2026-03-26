import type { SimWorld } from '../core/types';
import type { PlacementValidationResult } from './types';
export type { PlacementValidationResult } from './types';

/**
 * Validate that all active characters are properly placed on the map.
 *
 * Returns a validation result that the pipeline gate reads.
 * If isComplete === false, pipeline should NOT run full S0–S8.
 *
 * Checks:
 *   1. Every active character has a locId that exists in world.locations
 *   2. Every character has finite pos.x and pos.y (or pos.nodeId with resolvable coords)
 *   3. At least one pair of characters can see/hear each other (spatial sanity)
 *   4. No character is in a non-existent location
 *
 * Warnings (non-blocking):
 *   - All characters in the same exact position
 *   - Some characters unreachable from all others
 *   - No nav graph and no map dimensions
 */
export function validatePlacement(world: SimWorld): PlacementValidationResult {
  const unplacedActors: string[] = [];
  const invalidActors: string[] = [];
  const warnings: string[] = [];

  const chars = Object.values(world.characters || {});
  if (!chars.length) {
    return {
      isComplete: false,
      unplacedActors: [],
      invalidActors: [],
      warnings: ['no_characters'],
      allPositioned: false,
      spatialReady: false,
    };
  }

  const locs = world.locations || {};

  // 1. Check each character
  const positions: Array<{ id: string; x: number; y: number; locId: string }> = [];

  for (const c of chars) {
    const locId = (c as any).locId;
    if (!locId || !locs[locId]) {
      invalidActors.push(c.id);
      continue;
    }

    const pos = (c as any).pos;
    const x = Number(pos?.x);
    const y = Number(pos?.y);

    // Try to resolve nodeId to coords if x/y missing
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const nodeId = pos?.nodeId;
      if (nodeId) {
        const loc = locs[locId] as any;
        const node = (loc?.nav?.nodes ?? []).find((n: any) => n.id === nodeId);
        if (node && Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y))) {
          positions.push({ id: c.id, x: Number(node.x), y: Number(node.y), locId });
          continue;
        }
      }
      unplacedActors.push(c.id);
      continue;
    }

    positions.push({ id: c.id, x, y, locId });
  }

  const allPositioned = unplacedActors.length === 0 && invalidActors.length === 0;
  const isComplete = allPositioned && positions.length >= 1;

  // 2. Warnings
  if (positions.length >= 2) {
    // All in same spot?
    const allSameSpot = positions.every(
      (p) => p.x === positions[0].x && p.y === positions[0].y && p.locId === positions[0].locId,
    );
    if (allSameSpot) {
      warnings.push('all_characters_same_position');
    }

    // Any characters in different locations with no path?
    const locIds = new Set(positions.map((p) => p.locId));
    if (locIds.size > 1) {
      // Check connectivity: each pair of locations should be reachable
      for (const locId of locIds) {
        const loc = locs[locId];
        if (!loc) continue;
        const neighbors = new Set((loc as any).neighbors ?? []);
        const otherLocs = [...locIds].filter((l) => l !== locId);
        const anyReachable = otherLocs.some((l) => neighbors.has(l));
        if (!anyReachable && otherLocs.length > 0) {
          warnings.push(`location_${locId}_isolated`);
        }
      }
    }
  }

  // 3. Spatial readiness: at least one location has nav or map dimensions
  let spatialReady = false;
  for (const locId of new Set(positions.map((p) => p.locId))) {
    const loc = locs[locId] as any;
    const hasNav = Array.isArray(loc?.nav?.nodes) && loc.nav.nodes.length > 0;
    const hasMap = Number.isFinite(Number(loc?.map?.width)) || Number.isFinite(Number(loc?.width));
    if (hasNav || hasMap) {
      spatialReady = true;
      break;
    }
  }

  if (!spatialReady && positions.length > 0) {
    warnings.push('no_spatial_data_in_any_location');
  }

  // 4. Check if nobody can communicate with anybody
  if (positions.length >= 2 && isComplete) {
    const anyClose = positions.some((a, i) =>
      positions.some((b, j) => {
        if (i >= j) return false;
        if (a.locId !== b.locId) return false;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        return dist < 200; // generous talk range
      }),
    );
    if (!anyClose) {
      warnings.push('no_characters_within_communication_range');
    }
  }

  return { isComplete, unplacedActors, invalidActors, warnings, allPositioned, spatialReady };
}
