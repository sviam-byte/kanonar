import type { ActionCandidate } from '../../decision/actionCandidate';
import type { SimAction } from '../core/types';

export function toSimAction(a: ActionCandidate, tick: number): SimAction {
  return {
    id: `act:${a.kind}:${tick}:${a.actorId}`,
    kind: a.kind as any,
    actorId: a.actorId,
    targetId: a.targetId ?? null,
    targetNodeId: a.targetNodeId ?? null,
    payload: a.payload ?? null,
  };
}
