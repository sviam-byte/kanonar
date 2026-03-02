
// lib/context/validate/beliefDivergence.ts
import type { ContextAtom } from '../v2/types';
import { getMag } from '../../util/atoms';

export type Divergence = {
  worldId: string;
  beliefId: string;
  worldMagnitude: number;
  beliefMagnitude: number;
  delta: number;
};

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
