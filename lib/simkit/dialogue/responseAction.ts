// lib/simkit/dialogue/responseAction.ts
// Dialogue response offers + apply helper (accept/reject/counter).

import type { ActionOffer, SimWorld } from '../core/types';
import { getPendingForAgent, getDialogueState, recordDialogueEntry } from './dialogueState';
import type { DialogueEntry } from './types';
import { clamp01 } from '../../util/math';

export type ResponseOffer = ActionOffer & {
  payload: { exchangeId: string; responseAct: 'accept' | 'reject' | 'counter' };
};

/**
 * Build response offers for pending exchanges targeting actorId.
 */
export function enumerateResponseOffers(world: SimWorld, actorId: string): ResponseOffer[] {
  const pending = getPendingForAgent(world, actorId);
  if (!pending.length) return [];

  const facts: any = world.facts || {};
  const offers: ResponseOffer[] = [];

  for (const ex of pending) {
    const trust = clamp01(Number(
      facts[`rel:trust:${actorId}:${ex.initiatorId}`]
      ?? facts?.relations?.[actorId]?.[ex.initiatorId]?.trust
      ?? 0.5,
    ));

    offers.push({
      kind: 'respond',
      actorId,
      targetId: ex.initiatorId,
      score: 0.3 + trust * 0.3,
      payload: { exchangeId: ex.id, responseAct: 'accept' },
    });

    offers.push({
      kind: 'respond',
      actorId,
      targetId: ex.initiatorId,
      score: 0.2 + (1 - trust) * 0.2,
      payload: { exchangeId: ex.id, responseAct: 'reject' },
    });

    const negotiation = clamp01(Number((world.characters[actorId]?.entity as any)?.traits?.experience ?? 0.3));
    offers.push({
      kind: 'respond',
      actorId,
      targetId: ex.initiatorId,
      score: 0.15 + negotiation * 0.2,
      payload: { exchangeId: ex.id, responseAct: 'counter' },
    });
  }

  return offers;
}

/**
 * Apply chosen dialogue response and return synthetic speech payload for observers.
 */
export function applyResponse(
  world: SimWorld,
  actorId: string,
  exchangeId: string,
  responseAct: 'accept' | 'reject' | 'counter',
): { notes: string[]; speechPayload: any } {
  const notes: string[] = [];

  const state = getDialogueState(world);
  const exchange = (state.exchanges || []).find((e) => e.id === exchangeId);
  const targetId = exchange?.initiatorId || '';

  const entry: DialogueEntry = {
    tick: world.tickIndex,
    speakerId: actorId,
    targetId,
    act: responseAct,
    intent: 'truthful',
    volume: 'normal',
    topic: `response:${responseAct}`,
    atoms: [],
    text: responseAct === 'accept' ? 'соглашается' : responseAct === 'reject' ? 'отказывает' : 'предлагает альтернативу',
    recipients: [],
    respondingTo: exchangeId,
  };

  recordDialogueEntry(world, entry);
  notes.push(`${actorId} ${responseAct} exchange ${exchangeId}`);

  return {
    notes,
    speechPayload: {
      schema: 'SpeechEventV1',
      actorId,
      targetId,
      act: responseAct === 'counter' ? 'negotiate' : 'inform',
      volume: 'normal',
      topic: entry.topic,
      text: entry.text,
      atoms: [],
    },
  };
}
