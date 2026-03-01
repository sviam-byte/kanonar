import type { ContextAtom } from '../context/v2/types';
import { AtomIndex } from './AtomIndex';

/**
 * WeakMap cache to avoid rebuilding AtomIndex repeatedly for the same atoms array.
 *
 * Note: the cache key is array identity, which is intentional because most pipeline
 * stages operate on immutable arrays and create a new array when content changes.
 */
const atomIndexCache = new WeakMap<readonly ContextAtom[], AtomIndex>();

function getIndex(atoms: readonly ContextAtom[]): AtomIndex {
  let index = atomIndexCache.get(atoms);
  if (!index) {
    index = AtomIndex.from(atoms as ContextAtom[]);
    atomIndexCache.set(atoms, index);
  }
  return index;
}

/**
 * O(1) magnitude lookup by exact id.
 */
export function getMag(atoms: readonly ContextAtom[], id: string, fallback = 0): number {
  return getIndex(atoms).mag(id, fallback);
}

/**
 * O(1) atom lookup by exact id.
 */
export function getAtom(atoms: readonly ContextAtom[], id: string): ContextAtom | undefined {
  return getIndex(atoms).get(id);
}

/**
 * O(1) existence check by exact id.
 */
export function hasAtom(atoms: readonly ContextAtom[], id: string): boolean {
  return getIndex(atoms).has(id);
}

/**
 * O(k) first-match magnitude lookup across multiple ids.
 */
export function getMagAny(atoms: readonly ContextAtom[], ids: string[], fallback = 0): number {
  return getIndex(atoms).magAny(ids, fallback);
}

/**
 * Prefix scan helper. Useful for namespace queries.
 */
export function getAtomsByPrefix(atoms: readonly ContextAtom[], prefix: string): ContextAtom[] {
  return getIndex(atoms).byPrefix(prefix);
}

/** Backward-compatible alias used by some modules. */
export const getMagById = getMag;
