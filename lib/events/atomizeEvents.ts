
// lib/events/atomizeEvents.ts
import { WorldEvent } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function atomizeEventsForAgent(args: {
  selfId: string;
  events: WorldEvent[];
  maxLookbackTicks?: number;
  nowTick: number;
}): ContextAtom[] {
  const { selfId, events, nowTick } = args;
  const lookback = args.maxLookbackTicks ?? 60;

  const out: ContextAtom[] = [];
  for (const ev of events || []) {
    if (nowTick - ev.tick > lookback) continue;

    // relevance: actor==self or target==self (MVP). Позже: seen-by, witnesses, etc.
    const relevant = ev.actorId === selfId || ev.targetId === selfId;
    if (!relevant) continue;

    const mag = clamp01(ev.magnitude ?? 0.7);
    const conf = 1; // event log = world fact; если надо, можно сделать obs-event отдельно

    const id = `event:${ev.kind}:${ev.id}`;
    out.push(normalizeAtom({
      id,
      kind: 'event_recent', // Using event_recent which maps to event-evidence semantics
      ns: 'event',
      origin: 'world',
      source: 'life', // mapped from 'eventlog' concept
      magnitude: mag,
      confidence: conf,
      subject: ev.actorId,
      target: ev.targetId,
      tags: ['event', ev.kind],
      label: `${ev.kind} (${Math.round(mag * 100)}%)`,
      trace: { usedAtomIds: [], notes: ['from world event log'], parts: { tick: ev.tick } },
      meta: { event: ev }
    } as any));
  }

  return out;
}
