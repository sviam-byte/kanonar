
import { ContextAtom } from '../context/v2/types';
import { Possibility } from '../possibilities/catalog';

function hasAtom(atoms: ContextAtom[], id: string) {
  return atoms.some(a => a.id === id);
}

export type GateResult = {
  allowed: boolean;
  blockedBy: string[];
};

export function gatePossibility(args: {
  atoms: ContextAtom[];
  p: Possibility;
}): GateResult {
  const blockedBy = (args.p.blockedBy || []).filter(id => hasAtom(args.atoms, id));
  return { allowed: blockedBy.length === 0, blockedBy };
}
