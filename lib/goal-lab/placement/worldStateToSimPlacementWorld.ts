import type { WorldState } from '../../../types';
import type { SimWorld } from '../../simkit/core/types';
import { arr } from '../../utils/arr';

function num(x: any, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalizes GoalLab WorldState into a SimWorld shape used by placement validators/strategies.
 */
export function buildSimPlacementWorldFromWorldState(world: WorldState): SimWorld {
  const agents = arr((world as any)?.agents);
  const locations = arr((world as any)?.locations ?? (world as any)?.worldLocations);

  const chars: SimWorld['characters'] = {};
  for (const a of agents) {
    const id = String((a as any)?.entityId || '');
    if (!id) continue;
    const p = (a as any)?.position;
    chars[id] = {
      id,
      name: String((a as any)?.title || (a as any)?.name || id),
      title: String((a as any)?.title || ''),
      locId: String((a as any)?.locationId || ''),
      pos: {
        nodeId: (p as any)?.nodeId ?? null,
        x: Number.isFinite(Number((p as any)?.x)) ? Number((p as any)?.x) : undefined,
        y: Number.isFinite(Number((p as any)?.y)) ? Number((p as any)?.y) : undefined,
      },
      stress: num((a as any)?.stress, 0),
      health: num((a as any)?.hp ?? (a as any)?.health, 1),
      energy: 1 - Math.max(0, Math.min(1, num((a as any)?.fatigue, 0))),
      tags: Array.isArray((a as any)?.tags) ? (a as any).tags.map(String) : [],
      entity: a,
    };
  }

  const locs: SimWorld['locations'] = {};
  for (const l of locations) {
    const id = String((l as any)?.entityId || (l as any)?.id || '');
    if (!id) continue;
    locs[id] = {
      id,
      name: String((l as any)?.title || (l as any)?.name || id),
      title: String((l as any)?.title || ''),
      neighbors: Array.isArray((l as any)?.neighbors) ? (l as any).neighbors.map(String) : [],
      hazards: (l as any)?.hazards || {},
      norms: (l as any)?.norms || {},
      tags: Array.isArray((l as any)?.tags) ? (l as any).tags.map(String) : [],
      map: (l as any)?.map ?? null,
      nav: (l as any)?.nav ?? undefined,
      features: Array.isArray((l as any)?.features) ? (l as any).features : [],
      entity: l,
    };
  }

  return {
    tickIndex: num((world as any)?.tick, 0),
    seed: num((world as any)?.rngSeed ?? (world as any)?.seed, 0),
    characters: chars,
    locations: locs,
    facts: ((world as any)?.facts || {}) as any,
    events: arr((world as any)?.eventLog?.events) as any,
  };
}
