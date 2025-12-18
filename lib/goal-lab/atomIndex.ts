
import { ContextAtom } from '../context/v2/types';

export type AtomIndex = {
  byId: Map<string, ContextAtom>;
  byPrefix: (prefix: string) => ContextAtom[];
  byNs: (ns: string) => ContextAtom[];
};

export function buildAtomIndex(atoms: ContextAtom[]): AtomIndex {
  const byId = new Map<string, ContextAtom>();
  const list = atoms || [];
  for (const a of list) {
    if (a?.id) byId.set(a.id, a);
  }

  const byPrefix = (prefix: string) => list.filter(a => a.id?.startsWith(prefix));
  const byNs = (ns: string) => list.filter(a => (a as any).ns === ns || a.id?.startsWith(ns + ':'));

  return { byId, byPrefix, byNs };
}
