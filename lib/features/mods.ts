
// lib/features/mods.ts
import { Features, ModsLayer, ModsStore } from './types';
import { clamp01, num } from './scale';

export function ensureModsStore(world: any): ModsStore {
  world.mods = world.mods || { schemaVersion: 1, characters: {}, locations: {}, scenes: {} };
  return world.mods as ModsStore;
}

export function getModsLayer(world: any, kind: 'characters'|'locations'|'scenes', id: string): ModsLayer | null {
  const store = ensureModsStore(world);
  const layer = (store as any)[kind]?.[id] || null;
  return layer;
}

export function applyMods(features: Features, mods: ModsLayer | null): Features {
  if (!mods) return features;

  const values = { ...features.values };

  // 1) overrides
  for (const k of Object.keys(mods.overrides || {})) {
    const v = mods.overrides[k];
    if (v === null) delete values[k];
    else values[k] = clamp01(num(v, values[k] ?? 0));
  }

  // 2) deltas
  for (const k of Object.keys(mods.deltas || {})) {
    if (values[k] == null) continue;
    values[k] = clamp01(values[k] + num((mods.deltas as any)[k], 0));
  }

  // 3) mults
  for (const k of Object.keys(mods.mults || {})) {
    if (values[k] == null) continue;
    values[k] = clamp01(values[k] * num((mods.mults as any)[k], 1));
  }

  return { ...features, values };
}
