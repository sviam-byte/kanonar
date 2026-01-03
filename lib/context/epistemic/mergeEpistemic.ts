
// lib/context/epistemic/mergeEpistemic.ts
import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

export type EpistemicLayer = 'world' | 'obs' | 'belief' | 'override' | 'derived';

export type LayeredAtoms = {
  world: ContextAtom[];
  obs: ContextAtom[];
  belief: ContextAtom[];
  override: ContextAtom[];
  derived?: ContextAtom[];
};

export type MergeResult = {
  merged: ContextAtom[];
  byId: Map<string, ContextAtom>;
  provenance: Map<string, EpistemicLayer>; // winning layer for each atom ID
};

// Priority (low -> high): World < Obs < Belief < Derived < Override
// Override atoms must beat derived ones so manual emo/app overrides win over computed values.
const PRIORITY: EpistemicLayer[] = ['world', 'obs', 'belief', 'derived', 'override'];

function layerRank(layer: EpistemicLayer) {
  return PRIORITY.indexOf(layer);
}

function splitByOrigin(atoms: ContextAtom[]): LayeredAtoms {
  const out: LayeredAtoms = { world: [], obs: [], belief: [], override: [], derived: [] };
  for (const a of atoms || []) {
    const origin = (a as any)?.origin;
    if (origin === 'override') out.override.push(a);
    else if (origin === 'belief' || origin === 'memory') out.belief.push(a);
    else if (origin === 'obs') out.obs.push(a);
    else if (origin === 'derived') (out.derived as ContextAtom[]).push(a);
    else out.world.push(a);
  }
  return out;
}

/**
 * Merge helper that preserves manual overrides across subsequent pipeline merges.
 * Use this instead of treating previous merged atoms as "world".
 */
export function mergeKeepingOverrides(base: ContextAtom[], derived: ContextAtom[]): MergeResult {
  const baseLayers = splitByOrigin(base);
  return mergeEpistemicAtoms({
    world: baseLayers.world,
    obs: baseLayers.obs,
    belief: baseLayers.belief,
    override: baseLayers.override,
    derived: [...(baseLayers.derived || []), ...(derived || [])],
  });
}

export function mergeEpistemicAtoms(layers: LayeredAtoms): MergeResult {
  const all: Array<{ a: ContextAtom; layer: EpistemicLayer }> = [];

  for (const a of layers.world) all.push({ a, layer: 'world' });
  for (const a of layers.obs) all.push({ a, layer: 'obs' });
  for (const a of layers.belief) all.push({ a, layer: 'belief' });
  for (const a of layers.override) all.push({ a, layer: 'override' });
  for (const a of (layers.derived || [])) all.push({ a, layer: 'derived' });

  const byId = new Map<string, ContextAtom>();
  const prov = new Map<string, EpistemicLayer>();

  for (const item of all) {
    const id = item.a.id;
    if (!id) continue;

    const prevLayer = prov.get(id);
    
    // If not present or current layer has higher (or equal) rank, overwrite
    if (!prevLayer || layerRank(item.layer) >= layerRank(prevLayer)) {
      byId.set(id, normalizeAtom(item.a as any));
      prov.set(id, item.layer);
    }
  }

  return { merged: Array.from(byId.values()), byId, provenance: prov };
}
