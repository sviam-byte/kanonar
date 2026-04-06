// lib/simkit/core/reactiveDecision.ts
// System 1 reactive shortcut: emotion-driven action selection without full pipeline,
// but with a short explainable shortlist instead of "first matching offer".

import type { SimWorld, SimAction, ActionOffer } from './types';
import { clamp01 } from '../../util/math';
import { FCS } from '../../config/formulaConfigSim';
import { getDyadTrust } from './trust';
import { readCtxSignal, type ContextSignalRead } from './contextSignals';

export type ReactiveShortlistEntry = {
  kind: string;
  targetId?: string | null;
  score: number;
  baseScore: number;
  reasons: string[];
};

export type ReactiveResult = {
  action: SimAction | null;
  reason: string;
  emotion: string;
  emotionValue: number;
  shortlist: ReactiveShortlistEntry[];
  trigger: {
    rule: 'fear' | 'anger' | 'shame' | 'care' | 'habit';
    threshold?: number;
  } | null;
  context: {
    danger: number;
    dangerSource: ContextSignalRead['source'];
    privacy: number;
    privacySource: ContextSignalRead['source'];
  };
};

function readEmo(facts: any, key: string, agentId: string): number {
  const v = Number(facts?.[`emo:${key}:${agentId}`]);
  return Number.isFinite(v) ? clamp01(v) : 0;
}

function getLastActionKind(facts: any, actorId: string): string | null {
  const la: any = facts?.[`lastAction:${actorId}`];
  return la?.kind ? String(la.kind) : null;
}

function isHabitSafeRepeat(kind: string | null): boolean {
  if (!kind) return false;
  return /^(wait|rest|observe|move|move_xy|move_cell|hide|escape|avoid|attack)$/.test(kind);
}

function findAllyInDanger(world: SimWorld, actorId: string): string | null {
  const facts: any = world.facts || {};
  const chars = Object.keys(world.characters || {}).sort();
  const myLoc = (world.characters[actorId] as any)?.locId;
  for (const id of chars) {
    if (id === actorId) continue;
    const c = world.characters[id];
    if ((c as any)?.locId !== myLoc) continue;
    const trust = Number(facts?.[`rel:trust:${actorId}:${id}`] ?? facts?.relations?.[actorId]?.[id]?.trust ?? 0.5);
    if (trust < 0.5) continue;
    if ((c.health ?? 1) < 0.5 || (c.stress ?? 0) > 0.7) return id;
  }
  return null;
}

function offerToAction(offer: ActionOffer, tickIndex: number, meta?: any): SimAction {
  return {
    id: `act:reactive:${offer.kind}:${tickIndex}:${offer.actorId}`,
    kind: offer.kind,
    actorId: offer.actorId,
    targetId: offer.targetId ?? null,
    meta: { source: 'reactive', offer: { kind: offer.kind, score: offer.score }, ...(meta || {}) },
  };
}

function candidateOffers(offers: ActionOffer[], actorId: string, kinds: string[]): ActionOffer[] {
  const allow = new Set(kinds);
  return offers.filter((o) => o.actorId === actorId && !o.blocked && allow.has(String(o.kind)));
}

function scoreFearOffer(offer: ActionOffer, emotionValue: number, danger: number, privacy: number): ReactiveShortlistEntry {
  let score = Number(offer.score ?? 0);
  const reasons = [`base:${score.toFixed(3)}`];
  const kind = String(offer.kind);
  const bonuses: Record<string, number> = { escape: 0.90, hide: 0.82, avoid: 0.70, move_cell: 0.48, move: 0.40, observe: 0.14 };
  const kindBonus = bonuses[kind] ?? 0;
  score += kindBonus;
  if (kindBonus) reasons.push(`kind:+${kindBonus.toFixed(3)}`);
  const dangerBonus = (kind === 'escape' || kind === 'hide' || kind === 'avoid') ? 0.30 * danger : 0.10 * danger;
  score += dangerBonus;
  if (dangerBonus) reasons.push(`danger:+${dangerBonus.toFixed(3)}`);
  const privacyAdj = kind === 'hide' ? 0.22 * privacy : kind === 'escape' ? 0.12 * (1 - privacy) : 0;
  score += privacyAdj;
  if (privacyAdj) reasons.push(`privacy:${privacyAdj >= 0 ? '+' : ''}${privacyAdj.toFixed(3)}`);
  const emoBonus = 0.25 * emotionValue;
  score += emoBonus;
  reasons.push(`fear:+${emoBonus.toFixed(3)}`);
  return { kind, targetId: offer.targetId ?? null, baseScore: Number(offer.score ?? 0), score: Number(score.toFixed(6)), reasons };
}

function scoreAngerOffer(world: SimWorld, actorId: string, offer: ActionOffer, emotionValue: number): ReactiveShortlistEntry {
  let score = Number(offer.score ?? 0);
  const reasons = [`base:${score.toFixed(3)}`];
  const kind = String(offer.kind);
  const targetId = offer.targetId ?? null;
  const trust = targetId ? getDyadTrust(world, actorId, String(targetId)) : 0.5;
  const kindBonus = kind === 'attack' ? 0.78 : kind === 'threaten' ? 0.58 : 0.42;
  const distrustBonus = 0.42 * (1 - trust);
  const emoBonus = 0.24 * emotionValue;
  score += kindBonus + distrustBonus + emoBonus;
  reasons.push(`kind:+${kindBonus.toFixed(3)}`, `distrust:+${distrustBonus.toFixed(3)}`, `anger:+${emoBonus.toFixed(3)}`);
  return { kind, targetId, baseScore: Number(offer.score ?? 0), score: Number(score.toFixed(6)), reasons };
}

function scoreShameOffer(offer: ActionOffer, emotionValue: number, privacy: number): ReactiveShortlistEntry {
  let score = Number(offer.score ?? 0);
  const reasons = [`base:${score.toFixed(3)}`];
  const kind = String(offer.kind);
  const kindBonus = kind === 'hide' ? 0.72 : kind === 'avoid' ? 0.64 : kind === 'submit' ? 0.56 : 0.28;
  const privacyBonus = kind === 'hide' || kind === 'submit' ? 0.18 * privacy : 0.08 * privacy;
  const emoBonus = 0.20 * emotionValue;
  score += kindBonus + privacyBonus + emoBonus;
  reasons.push(`kind:+${kindBonus.toFixed(3)}`, `privacy:+${privacyBonus.toFixed(3)}`, `shame:+${emoBonus.toFixed(3)}`);
  return { kind, targetId: offer.targetId ?? null, baseScore: Number(offer.score ?? 0), score: Number(score.toFixed(6)), reasons };
}

function scoreCareOffer(world: SimWorld, actorId: string, offer: ActionOffer, emotionValue: number, allyId: string | null): ReactiveShortlistEntry {
  let score = Number(offer.score ?? 0);
  const reasons = [`base:${score.toFixed(3)}`];
  const kind = String(offer.kind);
  const targetId = offer.targetId ?? null;
  const trust = targetId ? getDyadTrust(world, actorId, String(targetId)) : 0.5;
  const kindBonus = kind === 'treat' ? 0.80 : kind === 'help' ? 0.68 : 0.52;
  const allyBonus = allyId && targetId === allyId ? 0.45 : targetId ? 0.10 : 0;
  const trustBonus = 0.20 * trust;
  const emoBonus = 0.22 * emotionValue;
  score += kindBonus + allyBonus + trustBonus + emoBonus;
  reasons.push(`kind:+${kindBonus.toFixed(3)}`, `ally:+${allyBonus.toFixed(3)}`, `trust:+${trustBonus.toFixed(3)}`, `care:+${emoBonus.toFixed(3)}`);
  return { kind, targetId, baseScore: Number(offer.score ?? 0), score: Number(score.toFixed(6)), reasons };
}

function scoreHabitOffer(offer: ActionOffer, lastKind: string | null): ReactiveShortlistEntry {
  let score = Number(offer.score ?? 0);
  const reasons = [`base:${score.toFixed(3)}`];
  const kind = String(offer.kind);
  const inertia = lastKind && kind === lastKind ? FCS.dualProcess.reactiveShortcut.inertiaBonus : 0;
  const fallbackBonus = /^(wait|rest|observe)$/.test(kind) ? 0.05 : 0;
  score += inertia + fallbackBonus;
  if (inertia) reasons.push(`inertia:+${inertia.toFixed(3)}`);
  if (fallbackBonus) reasons.push(`fallback:+${fallbackBonus.toFixed(3)}`);
  return { kind, targetId: offer.targetId ?? null, baseScore: Number(offer.score ?? 0), score: Number(score.toFixed(6)), reasons };
}

function chooseTop(shortlist: ReactiveShortlistEntry[], limit = 3): ReactiveShortlistEntry[] {
  return shortlist
    .slice()
    .sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind) || String(a.targetId || '').localeCompare(String(b.targetId || '')))
    .slice(0, limit);
}

export function reactiveDecision(
  world: SimWorld,
  agentId: string,
  offers: ActionOffer[],
  tickIndex: number,
): ReactiveResult {
  const facts: any = world.facts || {};
  const cfg = FCS.dualProcess.reactiveShortcut;
  const dangerRead = readCtxSignal(facts, agentId, 'danger', 0);
  const privacyRead = readCtxSignal(facts, agentId, 'privacy', 0);

  const fear = readEmo(facts, 'fear', agentId);
  const anger = readEmo(facts, 'anger', agentId);
  const shame = readEmo(facts, 'shame', agentId);
  const care = readEmo(facts, 'care', agentId);
  const context = {
    danger: dangerRead.value,
    dangerSource: dangerRead.source,
    privacy: privacyRead.value,
    privacySource: privacyRead.source,
  } as const;

  if (fear > cfg.fearThreshold) {
    const fearOffers = candidateOffers(offers, agentId, ['escape', 'hide', 'move', 'move_cell', 'avoid', 'observe']);
    const ranked = chooseTop(fearOffers.map((o) => scoreFearOffer(o, fear, dangerRead.value, privacyRead.value)));
    const best = ranked[0];
    if (best) {
      const actionOffer = fearOffers.find((o) => String(o.kind) === best.kind && String(o.targetId ?? '') === String(best.targetId ?? '')) || fearOffers[0];
      if (actionOffer) {
        return {
          action: offerToAction(actionOffer, tickIndex, { reactiveShortlist: ranked, reactiveTrigger: 'fear', reactiveContext: context }),
          reason: `fear shortlist → ${best.kind}`,
          emotion: 'fear',
          emotionValue: fear,
          shortlist: ranked,
          trigger: { rule: 'fear', threshold: cfg.fearThreshold },
          context,
        };
      }
    }
  }

  if (anger > cfg.angerThreshold) {
    const angerOffers = candidateOffers(offers, agentId, ['confront', 'attack', 'threaten']).filter((o) => Boolean(o.targetId));
    const ranked = chooseTop(angerOffers.map((o) => scoreAngerOffer(world, agentId, o, anger)));
    const best = ranked[0];
    if (best) {
      const actionOffer = angerOffers.find((o) => String(o.kind) === best.kind && String(o.targetId ?? '') === String(best.targetId ?? ''));
      if (actionOffer) {
        return {
          action: offerToAction(actionOffer, tickIndex, { reactiveShortlist: ranked, reactiveTrigger: 'anger', reactiveContext: context }),
          reason: `anger shortlist → ${best.kind}${best.targetId ? `:${best.targetId}` : ''}`,
          emotion: 'anger',
          emotionValue: anger,
          shortlist: ranked,
          trigger: { rule: 'anger', threshold: cfg.angerThreshold },
          context,
        };
      }
    }
  }

  if (shame > cfg.shameThreshold) {
    const shameOffers = candidateOffers(offers, agentId, ['avoid', 'submit', 'hide', 'wait']);
    const ranked = chooseTop(shameOffers.map((o) => scoreShameOffer(o, shame, privacyRead.value)));
    const best = ranked[0];
    if (best) {
      const actionOffer = shameOffers.find((o) => String(o.kind) === best.kind && String(o.targetId ?? '') === String(best.targetId ?? '')) || shameOffers[0];
      if (actionOffer) {
        return {
          action: offerToAction(actionOffer, tickIndex, { reactiveShortlist: ranked, reactiveTrigger: 'shame', reactiveContext: context }),
          reason: `shame shortlist → ${best.kind}`,
          emotion: 'shame',
          emotionValue: shame,
          shortlist: ranked,
          trigger: { rule: 'shame', threshold: cfg.shameThreshold },
          context,
        };
      }
    }
  }

  if (care > cfg.careThreshold) {
    const ally = findAllyInDanger(world, agentId);
    const careOffers = candidateOffers(offers, agentId, ['help', 'treat', 'comfort']);
    const ranked = chooseTop(careOffers.map((o) => scoreCareOffer(world, agentId, o, care, ally)));
    const best = ranked[0];
    if (best) {
      const actionOffer = careOffers.find((o) => String(o.kind) === best.kind && String(o.targetId ?? '') === String(best.targetId ?? '')) || careOffers[0];
      if (actionOffer) {
        return {
          action: offerToAction(actionOffer, tickIndex, { reactiveShortlist: ranked, reactiveTrigger: 'care', reactiveContext: context }),
          reason: `care shortlist → ${best.kind}${best.targetId ? `:${best.targetId}` : ''}`,
          emotion: 'care',
          emotionValue: care,
          shortlist: ranked,
          trigger: { rule: 'care', threshold: cfg.careThreshold },
          context,
        };
      }
    }
  }

  const lastKind = getLastActionKind(facts, agentId);
  const habitKinds = isHabitSafeRepeat(lastKind) ? [String(lastKind), 'wait', 'rest', 'observe'] : ['wait', 'rest', 'observe'];
  const habitOffers = candidateOffers(offers, agentId, habitKinds);
  const ranked = chooseTop(habitOffers.map((o) => scoreHabitOffer(o, lastKind)));
  const best = ranked[0];
  if (best) {
    const actionOffer = habitOffers.find((o) => String(o.kind) === best.kind && String(o.targetId ?? '') === String(best.targetId ?? '')) || habitOffers[0];
    if (actionOffer) {
      return {
        action: offerToAction(actionOffer, tickIndex, { reactiveShortlist: ranked, reactiveTrigger: 'habit', reactiveContext: context }),
        reason: best.kind === lastKind ? 'habit shortlist → repeat safe action' : `habit shortlist → ${best.kind}`,
        emotion: 'none',
        emotionValue: 0,
        shortlist: ranked,
        trigger: { rule: 'habit' },
        context,
      };
    }
  }

  return { action: null, reason: 'no offers', emotion: 'none', emotionValue: 0, shortlist: [], trigger: null, context };
}
