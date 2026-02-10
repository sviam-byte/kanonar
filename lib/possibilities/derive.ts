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

  // Safety net: avoid hard-deadlocks where no possibilities are produced.
  // This keeps the decision stack functional even when all rules are below their thresholds.
  if (!out.length) {
    out.push({
      id: `cog:wait:${args.selfId}`,
      kind: "cog",
      label: "Wait",
      magnitude: 0.05,
      confidence: 0.35,
      subjectId: args.selfId,
      trace: { usedAtomIds: [], notes: ["fallback: no possibilities met thresholds"] },
      meta: { fallback: true },
    });
  }

  return out;
}
