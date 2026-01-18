// lib/simkit/core/subjective.ts
// Subjective (bounded-rational) scoring modifiers for ActionOffers.
//
// Design goals:
// - Deterministic (no RNG) so replays are stable.
// - Cheap: O(#offers for actor + small neighborhood lookups).
// - JSON-friendly: any persistent traces stored in world.facts must be serializable.

import type { ActionOffer, SimAction, SimWorld } from './types';
import { getDyadTrust } from './trust';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const clamp = (x: number, a: number, b: number) => (Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : a);

type ActionTag =
  | 'Aggressive'
  | 'Diplomatic'
  | 'Social'
  | 'Explore'
  | 'Rest'
  | 'Navigate'
  | 'Observe'
  | 'Work'
  | 'Risky';

export function actionTags(kind: ActionOffer['kind'], offer: ActionOffer): ActionTag[] {
  const tags: ActionTag[] = [];
  if (kind === 'attack') tags.push('Aggressive', 'Risky');
  if (kind === 'talk' || kind === 'question_about' || kind === 'negotiate') tags.push('Social');
  if (kind === 'negotiate') tags.push('Diplomatic');
  if (kind === 'observe') tags.push('Observe', 'Explore');
  if (kind === 'move' || kind === 'move_xy') tags.push('Navigate');
  if (kind === 'rest') tags.push('Rest');
  if (kind === 'inspect_feature' || kind === 'repair_feature' || kind === 'scavenge_feature') tags.push('Work');
  if (kind === 'start_intent' || kind === 'continue_intent') {
    const sid = String((offer as any)?.meta?.scriptId ?? (offer as any)?.payload?.intentScript?.id ?? '').toLowerCase();
    if (sid.includes('sleep') || sid.includes('rest')) tags.push('Rest');
    if (sid.includes('patrol') || sid.includes('follow') || sid.includes('move')) tags.push('Navigate');
    if (sid.includes('intimid') || sid.includes('insult') || sid.includes('threat')) tags.push('Aggressive', 'Social');
    if (sid.includes('negot') || sid.includes('offer') || sid.includes('request')) tags.push('Diplomatic', 'Social');
  }
  const extra = (offer as any)?.meta?.tags;
  if (Array.isArray(extra)) {
    for (const t of extra) if (typeof t === 'string') tags.push(t as ActionTag);
  }
  return tags;
}

function getDanger(world: SimWorld, actorId: string): number {
  const v = Number((world.facts as any)?.[`ctx:danger:${actorId}`]);
  return clamp01(v);
}

function getPrivacy(world: SimWorld, actorId: string): number {
  const v = Number((world.facts as any)?.[`ctx:privacy:${actorId}`]);
  return clamp01(v);
}

function getLastAction(world: SimWorld, actorId: string): { kind: string; tick: number; targetId?: string | null } | null {
  const x: any = (world.facts as any)?.[`lastAction:${actorId}`];
  if (!x || typeof x !== 'object') return null;
  const kind = String(x.kind ?? '');
  const tick = Number(x.tick ?? -1);
  if (!kind || !Number.isFinite(tick)) return null;
  return { kind, tick, targetId: x.targetId ?? null };
}

function countPeersDoingSame(world: SimWorld, actorId: string, kind: string): number {
  const me: any = world.characters?.[actorId];
  if (!me) return 0;
  const locId = me.locId;
  let n = 0;
  for (const other of Object.values(world.characters)) {
    if (other.id === actorId) continue;
    if ((other as any).locId !== locId) continue;
    const la = getLastAction(world, (other as any).id);
    if (la && la.kind === kind) n += 1;
  }
  return n;
}

function intentLengthPenalty(offer: ActionOffer): number {
  const script = (offer as any)?.payload?.intentScript;
  const stages = Array.isArray(script?.stages) ? script.stages.length : 0;
  if (!stages) return 0;
  return 0.015 * clamp(stages, 0, 12);
}

export function scoreOfferSubjective(world: SimWorld, offer: ActionOffer): number {
  const c: any = world.characters?.[offer.actorId];
  if (!c) return offer.score;

  let s = Number(offer.score ?? 0);
  if (!Number.isFinite(s)) s = 0;

  const stress = clamp01(Number(c.stress ?? 0));
  const energy = clamp01(Number(c.energy ?? 0));
  const health = clamp01(Number(c.health ?? 0));
  const danger = getDanger(world, c.id);
  const privacy = getPrivacy(world, c.id);

  const tags = actionTags(offer.kind, offer);

  // Emotional lens.
  if (danger > 0.55) {
    const risky = tags.includes('Risky') || tags.includes('Navigate');
    if (risky && !tags.includes('Aggressive')) s -= 0.1 * (danger - 0.55) * 2;
    if (tags.includes('Observe')) s += 0.05 * (danger - 0.55);
    if (tags.includes('Rest')) s -= 0.06 * (danger - 0.55);
    if (tags.includes('Diplomatic')) s -= 0.03 * (danger - 0.55);
  }

  if (stress > 0.7) {
    if (tags.includes('Social')) s -= 0.06 * (stress - 0.7) * 3;
    if (tags.includes('Rest')) s += 0.05 * (stress - 0.7) * 2;
    if (tags.includes('Observe')) s += 0.02 * (stress - 0.7);
  }

  if (health < 0.35) {
    if (tags.includes('Aggressive')) s -= 0.1 * (0.35 - health) * 3;
    if (tags.includes('Rest')) s += 0.04 * (0.35 - health) * 2;
  }

  if (energy < 0.4 && tags.includes('Rest')) s += 0.08 * (0.4 - energy) * 2;
  if (privacy < 0.35 && tags.includes('Social')) s -= 0.05 * (0.35 - privacy) * 2;

  // Social lens.
  if (tags.includes('Social') && offer.targetId) {
    const trust = getDyadTrust(world, c.id, String(offer.targetId));
    s += 0.06 * (trust - 0.5);
    const socialKind = String((offer as any)?.meta?.social ?? '').toLowerCase();
    if ((socialKind === 'insult' || socialKind === 'intimidate') && trust < 0.45) {
      s += 0.03 * (0.45 - trust) * 2;
      s += 0.02 * stress;
    }
  }

  // Inertia + switch cost.
  const last = getLastAction(world, c.id);
  if (last && Number.isFinite(last.tick)) {
    if (last.kind === offer.kind) s += 0.03;
    else s -= 0.02;
  }

  // Sunk cost / coherence for intents.
  const curIntent: any = (world.facts as any)?.[`intent:${c.id}`];
  if (curIntent && typeof curIntent === 'object') {
    if (offer.kind === 'continue_intent') s += 0.25;
    else if (offer.kind === 'start_intent') s -= 0.1;
    else s -= 0.06;
  }

  // Social contagion.
  const peers = countPeersDoingSame(world, c.id, String(offer.kind));
  if (peers > 0) s += clamp(peers, 0, 3) * 0.02;

  // Cognitive miser.
  if (offer.kind === 'start_intent') s -= intentLengthPenalty(offer);

  return s;
}

export function rememberLastAction(world: SimWorld, action: SimAction) {
  (world.facts as any)[`lastAction:${action.actorId}`] = {
    kind: action.kind,
    targetId: action.targetId ?? null,
    tick: world.tickIndex,
  };
}
