
// lib/scene/applyPreset.ts
import { ScenePreset, SceneSnapshot } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

export function applyScenePresetToSnapshot(preset: ScenePreset, snapshot: SceneSnapshot): SceneSnapshot {
  // Map globalInjections to world atoms
  const worldInj = (preset.globalInjections || []).map(a => 
    normalizeAtom({ 
      ...a, 
      source: 'scene', 
      origin: 'world',
      // Ensure required ContextAtom fields are present or compatible
      kind: a.kind as any,
      timestamp: 0 
    } as unknown as ContextAtom)
  );

  // We don't have explicit belief injections in ScenePreset currently
  const beliefInj: ContextAtom[] = [];

  return {
    ...snapshot,
    presetId: preset.presetId,
    activeWorldInjections: worldInj,
    activeBeliefInjections: beliefInj
  };
}

export function getSceneInjections(snapshot?: SceneSnapshot): { worldAtoms: ContextAtom[]; beliefAtoms: ContextAtom[] } {
  return {
    worldAtoms: (snapshot?.activeWorldInjections || []).map(normalizeAtom),
    beliefAtoms: (snapshot?.activeBeliefInjections || []).map(normalizeAtom),
  };
}
