// lib/simkit/actions/respondSpec.ts
// ActionSpec for dialogue responses (accept/reject/counter).

import type { SimEvent } from '../core/types';
import { getChar } from '../core/world';
import { applyResponse as applyDialogueResponse } from '../dialogue/responseAction';
import type { ActionSpec } from './specs';

function mkActionEvent(world: any, type: string, payload: any): SimEvent {
  return {
    id: `evt:${type}:${world.tickIndex}:${String(payload?.actorId ?? 'sys')}`,
    type,
    payload,
  };
}

export const RespondSpec: ActionSpec = {
  kind: 'respond',

  // Offers are generated in rules.ts via enumerateResponseOffers.
  enumerate: () => [],

  validateV1: ({ world, offer }) => {
    try {
      getChar(world, offer.actorId);
      const exchangeId = String((offer as any)?.payload?.exchangeId ?? '');
      if (!exchangeId) return { ...offer, blocked: true, reason: 'v1:no-exchange-id', score: 0 };
      return offer;
    } catch {
      return { ...offer, blocked: true, reason: 'v1:invalid', score: 0 };
    }
  },

  validateV2: ({ offer }) => offer,
  classifyV3: () => 'single',

  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];

    const exchangeId = String((action as any).payload?.exchangeId ?? '');
    const responseAct = String((action as any).payload?.responseAct ?? 'reject') as 'accept' | 'reject' | 'counter';

    if (!exchangeId) {
      notes.push(`respond: no exchangeId for ${action.actorId}`);
      return { world, events, notes };
    }

    const result = applyDialogueResponse(world, action.actorId, exchangeId, responseAct);
    notes.push(...result.notes);

    if (result.speechPayload) {
      events.push(mkActionEvent(world, 'speech:v1', result.speechPayload));
    }

    return { world, events, notes };
  },
};
