// lib/events/adaptToWorldEvents.ts
// GoalLab currently has multiple event shapes in-flight.
// This helper normalizes any of them into a conservative WorldEvent[].

import type { DomainEvent, WorldEvent } from '../../types';

function clamp01(x: any, fb = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fb;
  return Math.max(0, Math.min(1, n));
}

function pickKindFromDomainEvent(ev: DomainEvent): string {
  const tags = Array.isArray(ev.tags) ? ev.tags.map(String) : [];
  if (tags.includes('help')) return 'helped';
  if (tags.includes('attack')) return 'attacked';
  if (tags.includes('betrayal')) return 'betrayed';
  if (tags.includes('lie')) return 'lied';
  if (tags.includes('shared_secret')) return 'shared_secret';
  if (tags.length > 0) return String(tags[0]);
  return String(ev.domain || ev.actionId || 'event');
}

function asWorldEventFromDomain(ev: DomainEvent): WorldEvent {
  return {
    id: String(ev.id),
    tick: Number(ev.t ?? 0),
    kind: pickKindFromDomainEvent(ev),
    actorId: String(ev.actorId),
    targetId: ev.targetId ? String(ev.targetId) : undefined,
    magnitude: clamp01(ev.intensity ?? 0.7, 0.7),
    context: { locationId: String(ev.locationId ?? ev.ctx?.locationId ?? '') || undefined }
  };
}

function isWorldEventLike(x: any): x is WorldEvent {
  return !!x && typeof x === 'object' && typeof x.id === 'string' && (typeof x.tick === 'number' || typeof x.kind === 'string');
}

// Very loose support for lib/events/types.ts canonical Event.
function asWorldEventFromCanonicalEvent(ev: any, fallbackTick: number): WorldEvent {
  const actors = Array.isArray(ev.actors) ? ev.actors : [];
  const targets = Array.isArray(ev.targets) ? ev.targets : [];
  const actorId = actors[0] ? String(actors[0]) : '';
  const targetId = targets[0] ? String(targets[0]) : undefined;

  return {
    id: String(ev.id ?? `ev_${fallbackTick}_${Math.random().toString(16).slice(2)}`),
    tick: Number(ev.tick ?? ev.t ?? fallbackTick),
    kind: String(ev.kind ?? ev.domain ?? 'event'),
    actorId,
    targetId,
    magnitude: clamp01(ev.magnitude ?? ev.importance ?? ev.intensity ?? 0.7, 0.7),
    context: {
      locationId: String(ev.locationId ?? ev.ctx?.locationId ?? '') || undefined
    }
  };
}

export function adaptToWorldEvents(input: {
  events: any[];
  fallbackTick: number;
}): WorldEvent[] {
  const { events, fallbackTick } = input;
  const out: WorldEvent[] = [];

  for (const ev of Array.isArray(events) ? events : []) {
    if (!ev || typeof ev !== 'object') continue;

    if (isWorldEventLike(ev) && typeof (ev as any).tick === 'number' && typeof (ev as any).kind === 'string') {
      const we = ev as WorldEvent;
      out.push({
        id: String(we.id),
        tick: Number(we.tick ?? fallbackTick),
        kind: String((we as any).kind ?? 'event'),
        actorId: String((we as any).actorId ?? ''),
        targetId: (we as any).targetId ? String((we as any).targetId) : undefined,
        magnitude: clamp01((we as any).magnitude ?? 0.7, 0.7),
        context: (we as any).context
      });
      continue;
    }

    if (typeof (ev as any).t === 'number' && typeof (ev as any).actorId === 'string' && typeof (ev as any).domain === 'string') {
      out.push(asWorldEventFromDomain(ev as DomainEvent));
      continue;
    }

    if (typeof (ev as any).kind === 'string' && Array.isArray((ev as any).actors)) {
      out.push(asWorldEventFromCanonicalEvent(ev, fallbackTick));
      continue;
    }

    out.push(asWorldEventFromCanonicalEvent(ev, fallbackTick));
  }

  return out;
}
