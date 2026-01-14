// lib/simkit/core/runOneTick.ts
// Single-tick simulation runner for live/interactive playback.

import type { SimWorld, SimEvent, SimAction } from './types';
import { ensureCharacterPos } from './world';
import { enumerateActionOffers, applyActionViaSpec } from '../actions/specs';
import { decideAction } from '../../decision/decide';
import type { Possibility } from '../../possibilities/catalog';
import { applyEvent } from './rules';

type TickRecord = {
  tickIndex: number;
  chosen: Array<{ actorId: string; action: SimAction; score?: number; p?: number; reason?: string }>;
  events: SimEvent[];
  notes: string[];
};

export function runOneTick(world: SimWorld, opts?: { temperature?: number }): { world: SimWorld; record: TickRecord } {
  const notes: string[] = [];
  const events: SimEvent[] = [];

  // 0) ensure positions
  for (const id of Object.keys(world.characters || {})) ensureCharacterPos(world, id);

  // 1) enumerate offers (в идеале — после GoalLab-пайплайна; пока берём simkit offers)
  const offers = enumerateActionOffers(world);

  // 2) choose per actor
  const chosen: TickRecord['chosen'] = [];
  const actorIds = Object.keys(world.characters || {}).sort();
  for (const actorId of actorIds) {
    const actorOffers = offers.filter((o) => o.actorId === actorId);
    if (!actorOffers.length) continue;

    const possibilities = actorOffers.map((o): Possibility => ({
      id: `offer:${o.kind}:${actorId}:${String(o.targetId ?? '')}`,
      kind: 'off',
      label: `${o.kind}${o.targetId ? `→${o.targetId}` : ''}`,
      magnitude: typeof o.score === 'number' ? o.score : 0,
      confidence: 1,
      subjectId: actorId,
      targetId: o.targetId ?? undefined,
      meta: { offer: o },
      actionKey: o.kind,
    } as any));

    const decision = decideAction({ selfId: actorId, atoms: [], possibilities, topK: 10 });
    const pick = decision.best;
    if (!pick?.p) continue;

    const offer = (pick.p as any)?.meta?.offer ?? null;
    if (!offer) continue;

    // build action (minimal)
    const a: SimAction = {
      id: `act:${world.tickIndex}:${offer.actorId}:${offer.kind}:${String(offer.targetId ?? '')}`,
      kind: offer.kind,
      actorId: offer.actorId,
      targetId: offer.targetId ?? null,
      payload: offer.payload ?? null,
      meta: (offer as any).meta ?? null,
    };

    chosen.push({
      actorId,
      action: a,
      score: pick.score,
      p: undefined,
      reason: pick.why?.blockedBy?.length ? `blocked:${pick.why.blockedBy.join(',')}` : undefined,
    });
  }

  // 3) apply actions sequentially (важно для “самодельт” и для наблюдений)
  for (const ch of chosen) {
    const before = snapChar(world, ch.actorId);
    const r = applyActionViaSpec(world, ch.action);
    world = r.world;
    const after = snapChar(world, ch.actorId);
    const selfDelta = delta(before, after);

    // annotate events
    for (const ev of r.events) {
      if (ev?.type?.startsWith('action:') && (ev as any).payload?.actorId === ch.actorId) {
        (ev as any).payload = { ...(ev as any).payload, selfDelta };
      }
    }

    events.push(...r.events);
    notes.push(...r.notes);
  }

  // 4) apply events
  for (const e of events) {
    const r = applyEvent(world, e);
    world = r.world;
    notes.push(...r.notes);
  }

  // 5) advance tick
  const record: TickRecord = { tickIndex: world.tickIndex, chosen, events, notes };
  world.tickIndex = (world.tickIndex ?? 0) + 1;
  (world as any).time = ((world as any).time ?? 0) + 1;

  return { world, record };
}

function snapChar(world: SimWorld, id: string) {
  const c: any = world.characters?.[id];
  return c ? { health: Number(c.health ?? 0), stress: Number(c.stress ?? 0), energy: Number(c.energy ?? 0) } : null;
}

function delta(a: any, b: any) {
  if (!a || !b) return null;
  return { dHealth: b.health - a.health, dStress: b.stress - a.stress, dEnergy: b.energy - a.energy };
}
