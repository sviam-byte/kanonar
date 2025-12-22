import { AtomBag } from '../../atoms/atomBag';
import { deriveAppraisalAndEmotionAtoms } from './emotionAtoms';

export function applyStage2Emotions(bag: AtomBag, agentId: string) {
  const resolved = bag.resolve();
  const atoms = deriveAppraisalAndEmotionAtoms(agentId, resolved);
  bag.addMany(atoms);
  return bag;
}
