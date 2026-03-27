import type { WorldState } from '../../../types';
import { autoPlaceCharacters } from '../../simkit/placement/autoPlaceStrategies';
import type { AutoPlacementMode } from '../../simkit/placement/types';
import { buildSimPlacementWorldFromWorldState } from './worldStateToSimPlacementWorld';

/**
 * Applies simkit auto-placement over a WorldState adapter and returns finite XY placements.
 */
export function autoPlaceWorldState(
  world: WorldState,
  mode: AutoPlacementMode,
  seed = 0,
): Record<string, { x: number; y: number }> {
  const simWorld = buildSimPlacementWorldFromWorldState(world);
  autoPlaceCharacters(simWorld, mode, undefined, seed);

  const out: Record<string, { x: number; y: number }> = {};
  for (const c of Object.values(simWorld.characters || {})) {
    const x = Number((c as any)?.pos?.x);
    const y = Number((c as any)?.pos?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      out[String((c as any).id)] = { x, y };
    }
  }
  return out;
}
