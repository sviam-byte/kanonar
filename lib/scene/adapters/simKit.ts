import type { SimWorld } from '../../simkit/core/types';
import type { ObservationResolutionV1, ResolvedSceneInputV1 } from '../observation/types';

export type SimKitSceneProjectionV1 = {
  schemaVersion: 1;
  sceneId: string;
  seed: number;
  tickIndex: number;
  placements: ResolvedSceneInputV1['placements'];
  facts: {
    'scene:id': string;
    'scene:schemaVersion': 1;
    'scene:observations:v1': ObservationResolutionV1['observationsByCharacterId'];
    'scene:relationResolution:v1': ObservationResolutionV1['relationResolution'];
  };
};

export function adaptResolvedSceneToSimKitV1(scene: ResolvedSceneInputV1, resolution: ObservationResolutionV1): SimKitSceneProjectionV1 {
  if (scene.sceneId !== resolution.sceneId || scene.tick !== resolution.tick) throw new Error('simkit_scene_resolution_mismatch');
  return {
    schemaVersion: 1, sceneId: scene.sceneId, seed: scene.seed, tickIndex: scene.tick,
    placements: scene.placements,
    facts: {
      'scene:id': scene.sceneId,
      'scene:schemaVersion': 1,
      'scene:observations:v1': resolution.observationsByCharacterId,
      'scene:relationResolution:v1': resolution.relationResolution,
    },
  };
}

export function applySimKitSceneProjectionV1(world: SimWorld, projection: SimKitSceneProjectionV1): SimWorld {
  const characters = Object.fromEntries(Object.entries(world.characters).map(([id, character]) => [id, { ...character, pos: character.pos ? { ...character.pos } : undefined }]));
  for (const placement of projection.placements) {
    const character = characters[placement.agentId];
    if (!character) throw new Error(`simkit_scene_unknown_character:${placement.agentId}`);
    if (!world.locations[placement.locationId]) throw new Error(`simkit_scene_unknown_location:${placement.locationId}`);
    character.locId = placement.locationId;
    character.pos = { nodeId: placement.nodeId ?? null, x: placement.x, y: placement.y };
  }
  return { ...world, tickIndex: projection.tickIndex, seed: projection.seed, characters, facts: { ...world.facts, ...projection.facts }, events: [...world.events] };
}
