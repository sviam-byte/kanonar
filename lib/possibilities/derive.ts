import { ContextAtom } from '../context/v2/types';
import { DEFAULT_POSSIBILITY_DEFS } from './defs';
import { makeHelpers, Possibility, PossibilityDef, PossibilityBuildResult } from './catalog';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

export function derivePossibilitiesRegistry(args: {
  selfId: string;
  atoms: any;
  defs?: PossibilityDef[];
}): Possibility[] {
  const defs = args.defs || DEFAULT_POSSIBILITY_DEFS;
  const atoms = arr<ContextAtom>(args.atoms);
  const helpers = makeHelpers(atoms);
  const out: Possibility[] = [];

  for (const d of defs) {
    const r: PossibilityBuildResult = d.build({ selfId: args.selfId, atoms, helpers });
    if (!r) continue;
    if (Array.isArray(r)) out.push(...r);
    else out.push(r);
  }

  return out;
}
