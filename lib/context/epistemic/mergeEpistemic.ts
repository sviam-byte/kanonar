
// lib/context/epistemic/mergeEpistemic.ts
import { ContextAtom } from '../v2/types';
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

// Priority: Derived > Override > Belief > Obs > World
// (Derived overrides everything as it's the final synthesis, Override handles manual injection, Belief overrides perception, Obs overrides static world data)
// Actually, usually: Override > Derived > Belief > Obs > World
// Let's stick to the prompt's implied priority which seems to be Override > Belief > Obs > World?
// The prompt said: "world -> obs -> belief -> override (and derived?)"
const PRIORITY: EpistemicLayer[] = ['world', 'obs', 'belief', 'override', 'derived'];

function layerRank(layer: EpistemicLayer) {
  return PRIORITY.indexOf(layer);
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
