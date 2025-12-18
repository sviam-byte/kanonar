
// lib/features/registry.ts
import { extractCharacterFeatures } from './extractCharacter';
import { extractLocationFeatures } from './extractLocation';
import { extractSceneFeatures } from './extractScene';
import { applyMods, getModsLayer } from './mods';
import { Features } from './types';

export function buildCharacterFeatures(world: any, selfId: string, character: any): Features {
  const base = extractCharacterFeatures({ character, selfId });
  const mods = getModsLayer(world, 'characters', selfId);
  return applyMods(base, mods);
}

export function buildLocationFeatures(world: any, locationId: string, location: any): Features {
  const base = extractLocationFeatures({ location, locationId });
  const mods = getModsLayer(world, 'locations', locationId);
  return applyMods(base, mods);
}

export function buildSceneFeatures(world: any, sceneId: string, sceneSnapshot: any): Features {
  const base = extractSceneFeatures({ sceneSnapshot, sceneId });
  const mods = getModsLayer(world, 'scenes', sceneId);
  return applyMods(base, mods);
}
