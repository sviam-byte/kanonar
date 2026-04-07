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
  const agents = arr(world.agents);
  const locations = arr(world.locations ?? (world as any)?.worldLocations);

  const chars: SimWorld['characters'] = {};
  for (const a of agents) {
    const id = String(a?.entityId || '');
    if (!id) continue;
    const p = a?.position;
    chars[id] = {
      id,
      name: String(a?.title || a?.name || id),
      title: String(a?.title || ''),
      locId: String(a?.locationId || ''),
      pos: {
        nodeId: p?.nodeId ?? null,
        x: Number.isFinite(Number(p?.x)) ? Number(p?.x) : undefined,
        y: Number.isFinite(Number(p?.y)) ? Number(p?.y) : undefined,
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
    const id = String(l?.entityId || (l as any)?.id || '');
    if (!id) continue;
    locs[id] = {
      id,
      name: String(l?.title || (l as any)?.name || id),
      title: String(l?.title || ''),
      neighbors: Array.isArray((l as any)?.neighbors) ? (l as any).neighbors.map(String) : [],
      hazards: (l as any)?.hazards || {},
      norms: (l as any)?.norms || {},
      tags: Array.isArray(l?.tags) ? (l as any).tags.map(String) : [],
      map: l?.map ?? null,
      nav: (l as any)?.nav ?? undefined,
      features: Array.isArray((l as any)?.features) ? (l as any).features : [],
      entity: l,
    };
  }

  return {
    tickIndex: num(world.tick, 0),
    seed: num((world as any)?.rngSeed ?? (world as any)?.seed, 0),
    characters: chars,
    locations: locs,
    facts: ((world as any)?.facts || {}) as any,
    events: arr(world.eventLog?.events) as any,
  };
}
