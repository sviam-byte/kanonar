
// lib/events/atomizeEvents.ts
import { WorldEvent } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function expDecay(age: number, halfLife: number) {
  // age>=0 ; halfLife>0
  if (!Number.isFinite(age) || age < 0) return 1;
  if (!Number.isFinite(halfLife) || halfLife <= 0) return 0;
  return Math.pow(0.5, age / halfLife);
}

function isHarmKind(kind: string) {
  const k = String(kind || '').toLowerCase();
  return k.includes('attack') || k.includes('harm') || k.includes('insult') || k.includes('threat') || k.includes('steal') || k.includes('betray');
}

function isHelpKind(kind: string) {
  const k = String(kind || '').toLowerCase();
  return k.includes('help') || k.includes('assist') || k.includes('heal') || k.includes('protect') || k.includes('save') || k.includes('comfort');
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
  // Aggregate: actor->self by kind, with decay.
  const byActorKind = new Map<string, number>(); // key = actor|kind
  const anyKind = new Map<string, number>(); // key = kind
  const harmByActor = new Map<string, number>(); // actor -> harm magnitude
  const helpByActor = new Map<string, number>(); // actor -> help magnitude

  for (const ev of events || []) {
    if (nowTick - ev.tick > lookback) continue;

    // relevance: actor==self or target==self (MVP). Позже: seen-by, witnesses, etc.
    const relevant = ev.actorId === selfId || ev.targetId === selfId;
    if (!relevant) continue;

    const age = Math.max(0, nowTick - (ev.tick ?? nowTick));
    const baseMag = clamp01(ev.magnitude ?? 0.7);
    const mag = clamp01(baseMag * expDecay(age, 12)); // half-life ~12 ticks (tunable).
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

    // Build "didTo" only for events where target is self (он сделал МНЕ).
    if (ev.targetId === selfId && ev.actorId && ev.actorId !== selfId) {
      const kind = String(ev.kind || 'unknown');
      const key = `${ev.actorId}|${kind}`;
      byActorKind.set(key, clamp01((byActorKind.get(key) || 0) + mag));
      anyKind.set(kind, clamp01((anyKind.get(kind) || 0) + mag));

      if (isHarmKind(kind)) {
        harmByActor.set(ev.actorId, clamp01((harmByActor.get(ev.actorId) || 0) + mag));
      }
      if (isHelpKind(kind)) {
        helpByActor.set(ev.actorId, clamp01((helpByActor.get(ev.actorId) || 0) + mag));
      }
    }
  }

  // Emit aggregated atoms: event:didTo:<actor>:<self>:<kind>
  for (const [k, v] of byActorKind.entries()) {
    const [actorId, kind] = k.split('|');
    const id = `event:didTo:${actorId}:${selfId}:${kind}`;
    out.push(normalizeAtom({
      id,
      ns: 'event',
      kind: 'event_didTo',
      origin: 'derived',
      source: 'event_aggregate',
      subject: actorId,
      target: selfId,
      magnitude: clamp01(v),
      confidence: 0.9,
      tags: ['event', 'didTo', kind],
      label: `didTo:${kind} ${actorId}→${selfId}`,
      trace: { usedAtomIds: [], notes: ['aggregated from recent events'], parts: { actorId, selfId, kind, v: clamp01(v) } }
    } as any));
  }

  // Emit per-kind "someone did to me".
  for (const [kind, v] of anyKind.entries()) {
    const id = `event:didToAny:${selfId}:${kind}`;
    out.push(normalizeAtom({
      id,
      ns: 'event',
      kind: 'event_didTo_any',
      origin: 'derived',
      source: 'event_aggregate',
      subject: selfId,
      magnitude: clamp01(v),
      confidence: 0.85,
      tags: ['event', 'didToAny', kind],
      label: `didToAny:${kind}→${selfId}`,
      trace: { usedAtomIds: [], notes: ['aggregated from recent events'], parts: { selfId, kind, v: clamp01(v) } }
    } as any));
  }

  // Bridges for social/decision layers.
  for (const [actorId, v] of harmByActor.entries()) {
    out.push(normalizeAtom({
      id: `soc:recentHarmBy:${actorId}:${selfId}`,
      ns: 'soc' as any,
      kind: 'soc_recent_harm' as any,
      origin: 'derived',
      source: 'event_aggregate',
      subject: actorId,
      target: selfId,
      magnitude: clamp01(v),
      confidence: 0.85,
      tags: ['soc', 'eventBridge', 'harm'],
      label: `recentHarmBy:${actorId}→${selfId}`,
      trace: { usedAtomIds: [], notes: ['bridge from event:didTo'], parts: { actorId, selfId, v: clamp01(v) } }
    } as any));
  }
  for (const [actorId, v] of helpByActor.entries()) {
    out.push(normalizeAtom({
      id: `soc:recentHelpBy:${actorId}:${selfId}`,
      ns: 'soc' as any,
      kind: 'soc_recent_help' as any,
      origin: 'derived',
      source: 'event_aggregate',
      subject: actorId,
      target: selfId,
      magnitude: clamp01(v),
      confidence: 0.85,
      tags: ['soc', 'eventBridge', 'help'],
      label: `recentHelpBy:${actorId}→${selfId}`,
      trace: { usedAtomIds: [], notes: ['bridge from event:didTo'], parts: { actorId, selfId, v: clamp01(v) } }
    } as any));
  }

  return out;
}
