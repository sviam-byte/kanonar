import { Atom, AtomOrigin } from './types';

const ORIGIN_PRIORITY: AtomOrigin[] = ['override', 'obs', 'world', 'derived'];

export class AtomBag {
  private layers: Record<AtomOrigin, Map<string, Atom>> = {
    world: new Map(),
    obs: new Map(),
    override: new Map(),
    derived: new Map(),
  };

  add(atom: Atom) {
    this.layers[atom.o].set(atom.id, atom);
  }

  addMany(atoms: Atom[]) {
    atoms.forEach(a => this.add(a));
  }

  /** Resolves the final set of atoms based on layer priority */
  resolve(): Map<string, Atom> {
    const out = new Map<string, Atom>();

    for (const origin of ORIGIN_PRIORITY) {
      for (const [id, atom] of this.layers[origin]) {
        if (!out.has(id)) {
          out.set(id, atom);
        }
      }
    }
    return out;
  }

  getResolved(id: string): Atom | undefined {
    return this.resolve().get(id);
  }

  byOrigin(o: AtomOrigin): Atom[] {
    return Array.from(this.layers[o].values());
  }
}
