import type { DomainEvent, WorldState } from '../../types';

import { ensureAcquaintance, touchSeen } from './acquaintance';

const s = (x: unknown) => (typeof x === 'string' ? x : x == null ? '' : String(x));

export function applyAcquaintanceFromEvents(world: WorldState, events: DomainEvent[]): void {
  if (!events.length) return;

  const nowTick = world.tick ?? 0;

  for (const ev of events) {
    if (!ev || ev.domain !== 'action') continue;

    const actorId = String(ev.actorId ?? '');
    const targetId = String(ev.targetId ?? '');
    if (!actorId || !targetId || actorId === targetId) continue;

    const meta = (ev as { meta?: Record<string, unknown> })?.meta ?? {};
    const seenAsFromEvent = s((meta as any).seenAsLabel ?? (meta as any).seenAs ?? '');
    const recognizedAsFromEvent = s((meta as any).recognizedAsLabel ?? (meta as any).recognizedAs ?? '');

    const actor = world.agents.find(a => a.entityId === actorId);
    const target = world.agents.find(a => a.entityId === targetId);
    if (!actor || !target) continue;

    const actionId = String(ev.actionId ?? '').toLowerCase();

    // "Introduce" explicitly boosts identification strongly for both sides.
    if (actionId === 'introduce') {
      const e1 = ensureAcquaintance(actor, targetId);
      if (seenAsFromEvent) (e1 as any).seenAsLabel = seenAsFromEvent;
      if (recognizedAsFromEvent) (e1 as any).recognizedAsLabel = recognizedAsFromEvent;
      touchSeen(world, e1, { idBoost: 0.75, famBoost: 0.45 });

      const e2 = ensureAcquaintance(target, actorId);
      // For reverse direction: allow meta.seenAsLabelReverse / meta.recognizedAsLabelReverse.
      const seenAsRev = s((meta as any).seenAsLabelReverse ?? (meta as any).seenAsReverse ?? '');
      const recAsRev = s((meta as any).recognizedAsLabelReverse ?? (meta as any).recognizedAsReverse ?? '');
      if (seenAsRev) (e2 as any).seenAsLabel = seenAsRev;
      if (recAsRev) (e2 as any).recognizedAsLabel = recAsRev;

      touchSeen(world, e2, { idBoost: 0.75, famBoost: 0.45 });
      continue;
    }

    // Intensity-scaled recognition.
    const intensity = Number.isFinite((ev as any).intensity) ? (ev as any).intensity : 0.5;
    const baseId = 0.08 + 0.18 * intensity;
    const baseFam = 0.04 + 0.14 * intensity;

    // Repeated interaction within a short window => faster familiarity.
    const e1 = ensureAcquaintance(actor, targetId);
    // Keep perceptual/identity labels if the event carries them.
    if (seenAsFromEvent) (e1 as any).seenAsLabel = seenAsFromEvent;
    if (recognizedAsFromEvent) (e1 as any).recognizedAsLabel = recognizedAsFromEvent;

    const e2 = ensureAcquaintance(target, actorId);
    const seenAsRev = s((meta as any).seenAsLabelReverse ?? (meta as any).seenAsReverse ?? '');
    const recAsRev = s((meta as any).recognizedAsLabelReverse ?? (meta as any).recognizedAsReverse ?? '');
    if (seenAsRev) (e2 as any).seenAsLabel = seenAsRev;
    if (recAsRev) (e2 as any).recognizedAsLabel = recAsRev;

    const recent1 = typeof (e1 as any).lastSeenAt === 'number' ? nowTick - ((e1 as any).lastSeenAt as number) : 9999;
    const recent2 = typeof (e2 as any).lastSeenAt === 'number' ? nowTick - ((e2 as any).lastSeenAt as number) : 9999;

    const rep1 = recent1 <= 3 ? 1.6 : recent1 <= 10 ? 1.2 : 1.0;
    const rep2 = recent2 <= 3 ? 1.6 : recent2 <= 10 ? 1.2 : 1.0;

    touchSeen(world, e1, { idBoost: baseId * rep1, famBoost: baseFam * rep1 });
    touchSeen(world, e2, { idBoost: baseId * rep2, famBoost: baseFam * rep2 });
  }
}
