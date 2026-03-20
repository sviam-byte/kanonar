// lib/simkit/core/repetitionDamper.ts
// Deterministic anti-loop scoring helpers.
//
// Goal:
// - reduce endless repetition (e.g. help/help/help)
// - keep behavior interpretable via simple, logged history in world.facts

import type { ActionOffer, SimWorld } from './types';
import { FCS } from '../../config/formulaConfigSim';

type ActionHistoryItem = { kind: string; targetId?: string | null; tick: number };
type ActionHistory = ActionHistoryItem[];

function key(agentId: string): string {
  return `actionHistory:${agentId}`;
}

/** Read recent action history from world.facts; always returns JSON-safe array. */
function getHistory(facts: any, agentId: string): ActionHistory {
  const raw = facts?.[key(agentId)];
  return Array.isArray(raw) ? raw : [];
}

/** Persist action that was actually applied. */
export function recordAction(
  facts: any,
  agentId: string,
  kind: string,
  targetId: string | null | undefined,
  tick: number,
): void {
  const history = getHistory(facts, agentId);
  history.push({ kind, targetId: targetId ?? null, tick });

  const keep = Number(FCS.behaviorVariety.historyWindow ?? 10);
  if (history.length > keep) history.splice(0, history.length - keep);

  facts[key(agentId)] = history;
}

/** Count consecutive same (kind,targetId) actions from tail of history. */
function consecutiveCount(history: ActionHistory, kind: string, targetId?: string | null): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (h.kind === kind && (h.targetId ?? null) === (targetId ?? null)) n += 1;
    else break;
  }
  return n;
}

/** Escalating penalty when actor repeats exact same action too many ticks in a row. */
export function applyRepetitionDamping(world: SimWorld, offers: ActionOffer[], agentId: string): ActionOffer[] {
  const history = getHistory(world.facts as any, agentId);
  if (!history.length) return offers;

  const penalties = FCS.behaviorVariety.repetitionPenalties;

  return offers.map((offer) => {
    if (offer.actorId !== agentId) return offer;

    const streak = consecutiveCount(history, offer.kind, offer.targetId);
    if (streak < 2) return offer;

    const penalty = streak === 2
      ? penalties.streak2
      : streak === 3
        ? penalties.streak3
        : streak === 4
          ? penalties.streak4
          : penalties.streak5Plus;

    return { ...offer, score: Number(offer.score ?? 0) - Number(penalty) };
  });
}

/** Slightly boost actions that were not used in recent window (novelty pressure). */
export function boostNovelActions(world: SimWorld, offers: ActionOffer[], agentId: string): ActionOffer[] {
  const history = getHistory(world.facts as any, agentId);
  if (!history.length) return offers;

  const noveltyWindow = Number(FCS.behaviorVariety.noveltyWindow ?? 5);
  const recentKinds = new Set(history.slice(-noveltyWindow).map((h) => h.kind));
  const bonus = Number(FCS.behaviorVariety.noveltyBonus ?? 0.03);

  return offers.map((offer) => {
    if (offer.actorId !== agentId) return offer;
    if (recentKinds.has(offer.kind)) return offer;
    return { ...offer, score: Number(offer.score ?? 0) + bonus };
  });
}
