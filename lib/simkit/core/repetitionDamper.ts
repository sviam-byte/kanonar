// lib/simkit/core/repetitionDamper.ts
// Deterministic anti-loop scoring helpers.
//
// Goal:
// - reduce endless repetition (e.g. help/help/help)
// - preserve semantic variation (same family, different target is less bad)
// - keep behavior interpretable via simple, logged history in world.facts

import type { ActionOffer, SimWorld } from './types';
import { FCS } from '../../config/formulaConfigSim';
import { recordBehaviorMemory, summarizeBehaviorPattern } from './behaviorMemory';

function key(agentId: string): string {
  return `actionHistory:${agentId}`;
}

type ActionHistoryItem = { kind: string; targetId?: string | null; tick: number };
type ActionHistory = ActionHistoryItem[];

function getHistory(facts: any, agentId: string): ActionHistory {
  const raw = facts?.[key(agentId)];
  return Array.isArray(raw) ? raw : [];
}

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
  recordBehaviorMemory(facts, agentId, kind, targetId, tick);
}

function exactPenaltyForStreak(streak: number): number {
  const penalties = FCS.behaviorVariety.repetitionPenalties;
  if (streak < 2) return 0;
  if (streak === 2) return Number(penalties.streak2 ?? 0);
  if (streak === 3) return Number(penalties.streak3 ?? 0);
  if (streak === 4) return Number(penalties.streak4 ?? 0);
  return Number(penalties.streak5Plus ?? 0);
}

export function applyRepetitionDamping(world: SimWorld, offers: ActionOffer[], agentId: string): ActionOffer[] {
  return offers.map((offer) => {
    if (offer.actorId !== agentId) return offer;

    const pattern = summarizeBehaviorPattern(world.facts as any, agentId, offer.kind, offer.targetId ?? null);
    const exactPenalty = exactPenaltyForStreak(pattern.exactStreak + 1);
    const familyPenalty = Math.min(
      Number(FCS.behaviorVariety.familyRepeatCap ?? 0.18),
      Math.max(0, pattern.familyStreak) * Number(FCS.behaviorVariety.familyRepeatPenalty ?? 0.06),
    );
    const novelTargetBonus = offer.targetId && pattern.familyStreak > 0 && !pattern.seenTargetInFamily
      ? Number(FCS.behaviorVariety.novelTargetBonus ?? 0.04)
      : 0;

    const nextScore = Number(offer.score ?? 0) - exactPenalty - familyPenalty + novelTargetBonus;
    return {
      ...offer,
      score: nextScore,
      meta: {
        ...(offer as any).meta,
        behaviorVariety: {
          exactStreak: pattern.exactStreak,
          familyStreak: pattern.familyStreak,
          exactPenalty,
          familyPenalty,
          novelTargetBonus,
          family: pattern.family,
        },
      },
    };
  });
}

export function boostNovelActions(world: SimWorld, offers: ActionOffer[], agentId: string): ActionOffer[] {
  return offers.map((offer) => {
    if (offer.actorId !== agentId) return offer;
    const pattern = summarizeBehaviorPattern(world.facts as any, agentId, offer.kind, offer.targetId ?? null);
    const bonus = pattern.familyStreak === 0
      ? Number(FCS.behaviorVariety.noveltyBonus ?? 0.03)
      : (offer.targetId && !pattern.seenTargetInFamily ? Number(FCS.behaviorVariety.novelTargetBonus ?? 0.04) : 0);
    if (!bonus) return offer;
    return {
      ...offer,
      score: Number(offer.score ?? 0) + bonus,
      meta: {
        ...(offer as any).meta,
        behaviorVariety: {
          ...((offer as any).meta?.behaviorVariety || {}),
          noveltyBonus: bonus,
          family: pattern.family,
        },
      },
    };
  });
}
