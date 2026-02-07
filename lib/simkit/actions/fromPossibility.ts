// lib/simkit/actions/fromPossibility.ts
// Shared helpers: map GoalLab/Orchestrator possibilities into SimKit actions.

import type { Possibility } from '../../possibilities/catalog';
import type { SimAction } from '../core/types';

export function keyFromPossibilityId(id: string): string {
  const parts = String(id || '').split(':');
  return parts[1] || parts[0] || '';
}

/**
 * Convert a Possibility into a SimAction.
 * NOTE: This follows the current staged-intent convention used by orchestratorPlugin.
 */
export function toSimActionFromPossibility(p: Possibility, tickIndex: number, actorId: string): SimAction | null {
  const k = keyFromPossibilityId(p.id);
  const targetId = (p as any)?.targetId ?? null;
  const targetNodeId = (p as any)?.targetNodeId ?? null;
  const meta = (p as any)?.meta ?? null;

  // Stage3 mapping: REST/TALK/QUESTION/OBSERVE are INTENTS, not direct actions.
  if (k === 'rest' || k === 'talk' || k === 'question_about' || k === 'observe' || k === 'investigate' || k === 'ask_info') {
    const originalKind =
      k === 'investigate'
        ? 'question_about'
        : k === 'observe' || k === 'ask_info'
          ? 'question_about'
          : k;

    return {
      id: `act:start_intent:${tickIndex}:${actorId}:poss:${k}`,
      kind: 'start_intent',
      actorId,
      targetId: targetId || null,
      targetNodeId: targetNodeId || null,
      meta,
      payload: {
        intentId: `intent:${actorId}:${tickIndex}:${k}`,
        remainingTicks: k === 'rest' ? 8 : 2,
        intent: {
          kind: k,
          originalAction: {
            kind: originalKind,
            targetId: targetId || null,
            payload: null,
            meta: meta ?? null,
          },
        },
      },
    } as any;
  }

  const kindMap: Record<string, string> = {
    wait: 'wait',
    move: 'move',
    negotiate: 'negotiate',
    inspect_feature: 'inspect_feature',
    repair_feature: 'repair_feature',
    scavenge_feature: 'scavenge_feature',
    // legacy alias
    ask_info: 'question_about',
  };

  const kind = kindMap[k];
  if (!kind) return null;

  return {
    id: `act:${kind}:${tickIndex}:${actorId}:poss:${k}`,
    kind: kind as any,
    actorId,
    targetId: targetId || null,
    targetNodeId: targetNodeId || null,
    meta,
  } as any;
}
