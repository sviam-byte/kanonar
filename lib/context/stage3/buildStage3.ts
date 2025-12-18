import { AtomBag } from '../../atoms/atomBag';
import { deriveThreatStack } from './threatStack';

export function applyStage3Threat(
  bag: AtomBag,
  agentId: string,
  otherAgentIds: string[],
  tuning?: any,
) {
  const resolved = bag.resolve();
  const atoms = deriveThreatStack(
    agentId,
    resolved,
    otherAgentIds,
    tuning?.threatWeights,
    tuning?.threatParams,
  );
  bag.addMany(atoms);
  return bag;
}
