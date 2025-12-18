
// lib/context/validate/beliefDivergence.ts
import { ContextAtom } from '../v2/types';

export type Divergence = {
  worldId: string;
  beliefId: string;
  worldMagnitude: number;
  beliefMagnitude: number;
  delta: number;
};

function getMag(atoms: ContextAtom[], id: string): number | null {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  if (typeof m !== 'number' || !Number.isFinite(m)) return null;
  return m;
}

export function findBeliefDivergences(atoms: ContextAtom[], opts?: { minDelta?: number }) {
  const minDelta = opts?.minDelta ?? 0.35;

  const divergences: Divergence[] = [];

  const beliefAtoms = atoms.filter(a => a.id.startsWith('belief:'));
  for (const b of beliefAtoms) {
    const tail = b.id.replace('belief:', ''); // e.g. "norm:surveillance"
    const worldId = tail;

    const bm = getMag(atoms, b.id);
    const wm = getMag(atoms, worldId);
    if (bm === null || wm === null) continue;

    const delta = Math.abs(bm - wm);
    if (delta >= minDelta) {
      divergences.push({
        worldId,
        beliefId: b.id,
        worldMagnitude: wm,
        beliefMagnitude: bm,
        delta
      });
    }
  }

  divergences.sort((a, b) => b.delta - a.delta);
  return divergences;
}
