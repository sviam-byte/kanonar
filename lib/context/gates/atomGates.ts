import type { ContextAtom } from '../v2/types';

export type AtomGate = {
  allOf?: string[];
  anyOf?: string[];
  noneOf?: string[];
  anyPrefix?: string[];
};

export function hasId(atoms: ContextAtom[], id: string) {
  return atoms.some(a => a?.id === id);
}

export function hasPrefix(atoms: ContextAtom[], p: string) {
  return atoms.some(a => typeof a?.id === 'string' && (a.id as string).startsWith(p));
}

export function gateOK(atoms: ContextAtom[], g: AtomGate): boolean {
  if (g.allOf && g.allOf.some(id => !hasId(atoms, id))) return false;
  if (g.noneOf && g.noneOf.some(id => hasId(atoms, id))) return false;
  if (g.anyOf && g.anyOf.length > 0 && !g.anyOf.some(id => hasId(atoms, id))) return false;
  if (g.anyPrefix && g.anyPrefix.length > 0 && !g.anyPrefix.some(p => hasPrefix(atoms, p))) return false;
  return true;
}
