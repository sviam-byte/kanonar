
import { ContextAtom } from '../context/v2/types';
import { Possibility } from '../possibilities/catalog';
import { scorePossibility, ScoredAction } from './score';
import { arr } from '../utils/arr';

export type DecisionResult = {
  best: ScoredAction | null;
  ranked: ScoredAction[];
};

export function decideAction(args: {
  selfId: string;
  atoms: ContextAtom[];
  // Defensive: during iterative refactors a non-array may appear here.
  possibilities: Possibility[] | any;
  topK?: number;
}): DecisionResult {
  const poss = arr<Possibility>(args.possibilities);
  const ranked = poss
    .map(p => scorePossibility({ selfId: args.selfId, atoms: args.atoms, p }))
    .sort((a, b) => b.score - a.score);

  const topK = args.topK ?? 10;
  return { best: ranked[0] || null, ranked: ranked.slice(0, topK) };
}
