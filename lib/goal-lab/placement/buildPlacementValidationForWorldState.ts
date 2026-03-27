import type { WorldState } from '../../../types';
import { validatePlacement, type PlacementValidationResult } from '../../simkit/placement/validatePlacement';
import { buildSimPlacementWorldFromWorldState } from './worldStateToSimPlacementWorld';

/**
 * Safe world-state placement validation wrapper.
 * Returns null only when world itself is absent.
 */
export function buildPlacementValidationForWorldState(
  world: WorldState | null | undefined,
): PlacementValidationResult | null {
  if (!world) return null;
  try {
    return validatePlacement(buildSimPlacementWorldFromWorldState(world));
  } catch {
    return {
      isComplete: false,
      unplacedActors: [],
      invalidActors: [],
      warnings: ['validation_error'],
      allPositioned: false,
      spatialReady: false,
    };
  }
}
