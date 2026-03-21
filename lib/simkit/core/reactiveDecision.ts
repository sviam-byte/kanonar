// lib/simkit/core/reactiveDecision.ts
// System 1 reactive shortcut: emotion-driven action selection without pipeline.
//
// Rules (in priority order):
// 1. fear > θ → escape/hide (best available)
// 2. anger > θ AND target_visible → confront/attack(target)
// 3. shame > θ → withdraw/submit
// 4. care > θ AND ally_in_danger → help(ally)
// 5. else → repeat last action OR wait

import type { SimWorld, SimAction, ActionOffer } from './types';
import { clamp01 } from '../../util/math';
import { FCS } from '../../config/formulaConfigSim';

export type ReactiveResult = {
  action: SimAction | null;
  reason: string;
  emotion: string;
  emotionValue: number;
};

function readEmo(facts: any, key: string, agentId: string): number {
  const v = Number(facts?.[`emo:${key}:${agentId}`]);
  return Number.isFinite(v) ? clamp01(v) : 0;
}

function findBestOffer(offers: ActionOffer[], actorId: string, kinds: string[]): ActionOffer | null {
  const mine = offers.filter(o => o.actorId === actorId && !o.blocked);
  for (const k of kinds) {
    const hit = mine.find(o => o.kind === k);
    if (hit) return hit;
  }
  return null;
}

function findTargetedOffer(offers: ActionOffer[], actorId: string, kinds: string[]): ActionOffer | null {
  const mine = offers.filter(o => o.actorId === actorId && !o.blocked && o.targetId);
  for (const k of kinds) {
    const hit = mine.find(o => o.kind === k);
    if (hit) return hit;
  }
  return null;
}

function getLastActionKind(facts: any, actorId: string): string | null {
  const la: any = facts?.[`lastAction:${actorId}`];
  return la?.kind ? String(la.kind) : null;
}

function isHabitSafeRepeat(kind: string | null): boolean {
  if (!kind) return false;
  // Do not loop on social actions without a fresh trigger.
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
    // ally = trust > 0.5, in danger = health < 0.5 or stress > 0.7
    const trust = Number(facts?.[`rel:trust:${actorId}:${id}`] ?? facts?.relations?.[actorId]?.[id]?.trust ?? 0.5);
    if (trust < 0.5) continue;
    if ((c.health ?? 1) < 0.5 || (c.stress ?? 0) > 0.7) return id;
  }
  return null;
}

function offerToAction(offer: ActionOffer, tickIndex: number): SimAction {
  return {
    id: `act:reactive:${offer.kind}:${tickIndex}:${offer.actorId}`,
    kind: offer.kind,
    actorId: offer.actorId,
    targetId: offer.targetId ?? null,
    meta: { source: 'reactive', offer: { kind: offer.kind, score: offer.score } },
  };
}

export function reactiveDecision(
  world: SimWorld,
  agentId: string,
  offers: ActionOffer[],
  tickIndex: number,
): ReactiveResult {
  const facts: any = world.facts || {};
  const cfg = FCS.dualProcess.reactiveShortcut;

  const fear = readEmo(facts, 'fear', agentId);
  const anger = readEmo(facts, 'anger', agentId);
  const shame = readEmo(facts, 'shame', agentId);
  const care = readEmo(facts, 'care', agentId);

  // 1. Fear → escape/hide
  if (fear > cfg.fearThreshold) {
    const offer = findBestOffer(offers, agentId, ['escape', 'hide', 'move', 'avoid']);
    if (offer) {
      return { action: offerToAction(offer, tickIndex), reason: 'fear > θ', emotion: 'fear', emotionValue: fear };
    }
  }

  // 2. Anger → confront/attack
  if (anger > cfg.angerThreshold) {
    const offer = findTargetedOffer(offers, agentId, ['confront', 'attack', 'threaten']);
    if (offer) {
      return { action: offerToAction(offer, tickIndex), reason: 'anger > θ', emotion: 'anger', emotionValue: anger };
    }
  }

  // 3. Shame → withdraw/submit
  if (shame > cfg.shameThreshold) {
    const offer = findBestOffer(offers, agentId, ['avoid', 'submit', 'hide', 'wait']);
    if (offer) {
      return { action: offerToAction(offer, tickIndex), reason: 'shame > θ', emotion: 'shame', emotionValue: shame };
    }
  }

  // 4. Care → help ally
  if (care > cfg.careThreshold) {
    const ally = findAllyInDanger(world, agentId);
    if (ally) {
      const mine = offers.filter(o => o.actorId === agentId && !o.blocked);
      const helpOffer = mine.find(o => (o.kind === 'help' || o.kind === 'treat' || o.kind === 'comfort') && o.targetId === ally)
        || mine.find(o => o.kind === 'help' || o.kind === 'treat' || o.kind === 'comfort');
      if (helpOffer) {
        return { action: offerToAction(helpOffer, tickIndex), reason: 'care > θ + ally in danger', emotion: 'care', emotionValue: care };
      }
    }
  }

  // 5. Habitual: repeat last or wait
  const lastKind = getLastActionKind(facts, agentId);
  if (isHabitSafeRepeat(lastKind)) {
    const offer = findBestOffer(offers, agentId, [String(lastKind)]);
    if (offer) {
      return { action: offerToAction(offer, tickIndex), reason: 'habitual: repeat last safe action', emotion: 'none', emotionValue: 0 };
    }
  }

  const waitOffer = findBestOffer(offers, agentId, ['wait', 'rest', 'observe']);
  if (waitOffer) {
    return { action: offerToAction(waitOffer, tickIndex), reason: 'habitual: wait', emotion: 'none', emotionValue: 0 };
  }

  return { action: null, reason: 'no offers', emotion: 'none', emotionValue: 0 };
}
