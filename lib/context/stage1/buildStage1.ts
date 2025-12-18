import { AtomBag } from '../../atoms/atomBag';
import { deriveCtxAxes } from './ctxAxes';

export function applyStage1Ctx(bag: AtomBag, agentId: string) {
  const resolved = bag.resolve();
  const ctxAtoms = deriveCtxAxes(agentId, resolved);
  bag.addMany(ctxAtoms);
  return bag;
}
