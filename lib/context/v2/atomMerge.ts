import type { ContextAtom } from './types';
import { normalizeAtom } from './infer';

export type MergeAtomsDelta = {
  atoms: ContextAtom[];
  newIds: string[];
  overriddenIds: string[];
};

/**
 * Merge two atom lists by id.
 *
 * Semantics: atoms in `added` always win on id collision ("newer wins").
 * This is used as the stage barrier: earlier stages are treated as read-only.
 */
export function mergeAtomsPreferNewer(
  prev: ReadonlyArray<ContextAtom>,
  added: ReadonlyArray<ContextAtom>
): MergeAtomsDelta {
  const addedNorm = added.map((a) => normalizeAtom(a));
  const prevIds = new Set(prev.map((a) => a.id));

  const newIds: string[] = [];
  const overriddenIds: string[] = [];

  const overridden = new Set<string>();
  for (const a of addedNorm) {
    if (prevIds.has(a.id)) overriddenIds.push(a.id);
    else newIds.push(a.id);
    overridden.add(a.id);
  }

  // Newer wins: put `added` first, then keep `prev` atoms whose ids weren't overridden.
  const merged: ContextAtom[] = [...addedNorm, ...prev.filter((a) => !overridden.has(a.id))];
  return { atoms: merged, newIds, overriddenIds };
}
