/**
 * Placement types for scene setup validation.
 *
 * Hard principle: scene is INVALID until all characters are placed on the map.
 * Without placement, everything downstream is fake:
 *   appraisal, goals, intents, dialogue, movement.
 */

export type AutoPlacementMode =
  | 'clustered'
  | 'split_by_role'
  | 'near_points_of_interest'
  | 'socially_weighted'
  | 'random_valid'
  | 'scenario_preset';

/**
 * Per-actor placement constraints.
 * Used by auto-placement strategies and validated by placementValidation.
 */
export interface PlacementSpec {
  actorId: string;
  required: boolean;

  preferredZones?: string[];
  forbiddenZones?: string[];

  preferredNearActors?: string[];
  preferredFarActors?: string[];

  preferredNearPOI?: string[];
  preferredFarPOI?: string[];

  minDistanceToOthers?: number;
  maxDistanceToOthers?: number;

  mustBeCommunicableWith?: string[];
  mustBeReachableTo?: string[];

  roleTags?: string[];
}

export interface PlacementValidationResult {
  isComplete: boolean;
  unplacedActors: string[];
  invalidActors: string[];
  warnings: string[];
  /** All actors have valid pos + locId. */
  allPositioned: boolean;
  /** Spatial metrics can be computed. */
  spatialReady: boolean;
}
