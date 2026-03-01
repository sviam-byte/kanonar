/**
 * AtomIndex: O(1) atom lookup by id, O(k) prefix scan.
 *
 * Replaces the pervasive atoms.find(a => a.id === id) pattern which is O(n)
 * and causes O(n²) behavior in S7-S8 where atoms can be 2000+.
 *
 * USAGE:
 *   const idx = AtomIndex.from(atoms);
 *   idx.get('ctx:danger:agent_001')       // O(1), returns ContextAtom | undefined
 *   idx.mag('ctx:danger:agent_001', 0)    // O(1), returns magnitude or fallback
 *   idx.magAny([id1, id2], 0)             // O(k), first match wins
 *   idx.byPrefix('goal:domain:')          // O(map_size), returns ContextAtom[]
 *   idx.has('ctx:danger:agent_001')       // O(1)
 *
 * AtomIndex is immutable after construction. Use .merge(added) for new index.
 */

import type { ContextAtom } from '../context/v2/types';

export class AtomIndex {
  private readonly _byId: Map<string, ContextAtom>;
  private readonly _atoms: ContextAtom[];

  private constructor(atoms: ContextAtom[]) {
    this._atoms = atoms;
    this._byId = new Map();
    for (const a of atoms) {
      const id = (a as any)?.id;
      if (typeof id === 'string' && id) {
        // First-write-wins: in mergeAtomsPreferNewer, added atoms come first,
        // so the first occurrence in the array is the "newest" version.
        if (!this._byId.has(id)) {
          this._byId.set(id, a);
        }
      }
    }
  }

  /** Create an AtomIndex from an atom array. Single pass, no copies. */
  static from(atoms: ContextAtom[] | AtomIndex): AtomIndex {
    if (atoms instanceof AtomIndex) return atoms;
    return new AtomIndex(Array.isArray(atoms) ? atoms : []);
  }

  /** Number of unique atoms (by id). */
  get size(): number {
    return this._byId.size;
  }

  /** Total atom count (including potential id duplicates in source array). */
  get length(): number {
    return this._atoms.length;
  }

  /** The underlying atom array (readonly). */
  get atoms(): readonly ContextAtom[] {
    return this._atoms;
  }

  /** O(1) lookup by exact id. */
  get(id: string): ContextAtom | undefined {
    return this._byId.get(id);
  }

  /** O(1) existence check. */
  has(id: string): boolean {
    return this._byId.has(id);
  }

  /** O(1) magnitude by exact id with fallback. */
  mag(id: string, fallback = 0): number {
    const a = this._byId.get(id) as any;
    if (!a) return fallback;
    const m = Number(a.magnitude);
    return Number.isFinite(m) ? m : fallback;
  }

  /** O(k) magnitude from first matching id. */
  magAny(ids: string[], fallback = 0): number {
    for (const id of ids) {
      const a = this._byId.get(id) as any;
      if (!a) continue;
      const m = Number(a.magnitude);
      if (Number.isFinite(m)) return m;
    }
    return fallback;
  }

  /** Scan atoms with a given id prefix. O(map_size). */
  byPrefix(prefix: string): ContextAtom[] {
    const out: ContextAtom[] = [];
    for (const [id, atom] of this._byId) {
      if (id.startsWith(prefix)) out.push(atom);
    }
    return out;
  }

  /** Collect all ids matching a prefix. */
  idsByPrefix(prefix: string): string[] {
    const out: string[] = [];
    for (const id of this._byId.keys()) {
      if (id.startsWith(prefix)) out.push(id);
    }
    return out;
  }

  /** New AtomIndex with additional atoms merged (newer wins on id collision). */
  merge(added: ContextAtom[]): AtomIndex {
    const overridden = new Set(added.map(a => (a as any)?.id).filter(Boolean));
    const kept = this._atoms.filter(a => !overridden.has((a as any)?.id));
    return new AtomIndex([...added, ...kept]);
  }

  /** Return raw atom array for backward compat. Zero-copy. */
  toArray(): ContextAtom[] {
    return this._atoms;
  }
}
