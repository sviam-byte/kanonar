// lib/engine/applyChosenAction.ts
import type { WorldState, DomainEvent } from '../../types';

type DecisionLike = {
  best?: {
    allowed?: boolean;
    score?: number;
    p?: {
      id: string;
      label?: string;
      magnitude?: number;
      targetId?: string | null;
    };
  } | null;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function inferTags(actionId: string): string[] {
  const id = String(actionId || '').toLowerCase();
  const tags: string[] = [];

  // Pro-social (support/care).
  if (id.includes('help') || id.includes('aid') || id.includes('offer_help')) tags.push('help');
  if (id.includes('save')) tags.push('help');
  if (id.includes('reassure') || id.includes('comfort')) tags.push('help');

  // Aggressive / harm.
  if (id.includes('attack') || id.includes('harm') || id.includes('hurt')) tags.push('attack');
  if (id.includes('intimidate') || id.includes('threaten')) tags.push('attack');
  if (id.includes('blame') || id.includes('accuse')) tags.push('attack');

  // Deception / betrayal.
  if (id.includes('deceive') || id.includes('lie')) tags.push('lie');
  if (id.includes('gossip') || id.includes('rumor')) tags.push('lie');
  if (id.includes('betray')) tags.push('betrayal');

  // Cooperation / bonding.
  if (id.includes('share_secret') || id.includes('secret')) tags.push('shared_secret');
  if (id.includes('apologize')) tags.push('apology');
  if (id.includes('thank')) tags.push('gratitude');
  if (id.includes('forgive')) tags.push('forgive');
  if (id.includes('reconcile')) tags.push('reconcile');
  if (id.includes('set_boundary')) tags.push('boundary');
  if (id.includes('request_help')) tags.push('request_help');

  // Misc.
  if (id.includes('escape') || id.includes('exit')) tags.push('escape');
  if (id.includes('hide') || id.includes('sneak')) tags.push('hide');
  if (id.includes('self_talk') || id.includes('monologue')) tags.push('self_talk');

  if (!tags.length) tags.push(id.split(':')[0] || 'action');
  return tags.slice(0, 6);
}

function inferPolarity(tags: string[]): number {
  if (tags.includes('help')) return 1;
  if (tags.includes('attack')) return -1;
  return 0;
}

export function applyChosenActionToWorld(args: {
  world: WorldState;
  selfId: string;
  decision: DecisionLike | null | undefined;
  tickNow: number;
  dt: number;
}): DomainEvent | null {
  const { world, selfId, decision, tickNow, dt } = args;

  const best = decision?.best || null;
  const p = best?.p || null;
  if (!best || !p || !p.id) return null;
  if (best.allowed === false) return null;

  const actionId = String(p.id);
  const atTick = Number(tickNow + (Number.isFinite(dt) ? dt : 1)); // действие фиксируем на следующем тике

  const tags = inferTags(actionId);
  const polarity = inferPolarity(tags);

  const intensity = clamp01(
    typeof p.magnitude === 'number'
      ? p.magnitude
      : typeof best.score === 'number'
        ? (best.score + 1) / 2
        : 0.5
  );

  const evId = `act:${atTick}:${selfId}:${actionId}`;

  // ensure eventLog exists
  (world as any).eventLog = (world as any).eventLog || { schemaVersion: 1, events: [] };
  const events: DomainEvent[] = Array.isArray((world as any).eventLog.events) ? (world as any).eventLog.events : [];

  if (events.some(e => e?.id === evId)) return null;

  // best-effort location
  const agent =
    (world as any).agents?.find((a: any) => a?.entityId === selfId) ||
    (world as any).entities?.find((e: any) => e?.entityId === selfId) ||
    null;

  const locationId =
    agent?.locationId ||
    agent?.locId ||
    (world as any)?.locationId ||
    null;

  const ev: DomainEvent = {
    id: evId,
    t: atTick,
    domain: 'action',
    tags,
    actorId: selfId,
    targetId: (p as any)?.targetId ?? null,
    actionId,
    intensity,
    polarity,
    locationId,
    meta: {
      label: p.label || null,
      score: typeof best.score === 'number' ? best.score : null,
      scheduledFromTick: tickNow,
    },
  };

  events.push(ev);
  (world as any).eventLog.events = events;
  return ev;
}
