
import { ContextAtom } from '../context/v2/types';
import { DEFAULT_POSSIBILITY_DEFS } from './defs';
import { makeHelpers, Possibility, PossibilityDef } from './catalog';

export function derivePossibilitiesRegistry(args: {
  selfId: string;
  atoms: ContextAtom[];
  defs?: PossibilityDef[];
}): Possibility[] {
  const defs = args.defs || DEFAULT_POSSIBILITY_DEFS;
  const helpers = makeHelpers(args.atoms);
  const out: Possibility[] = [];

  for (const d of defs) {
    const p = d.build({ selfId: args.selfId, atoms: args.atoms, helpers });
    if (p) out.push(p);
  }

  return out;
}
