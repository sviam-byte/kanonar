
// lib/relations/updateFromEvents.ts
import { RelationshipGraph, RelationshipEdge, RelationTag } from './types';
import { WorldEvent } from '../events/types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function edgeKey(a: string, b: string) {
  return `${a}→${b}`;
}

function ensureEdge(map: Map<string, RelationshipEdge>, a: string, b: string): RelationshipEdge {
  const k = edgeKey(a, b);
  const prev = map.get(k);
  if (prev) return prev;

  const e: RelationshipEdge = {
    a, b,
    tags: ['neutral'],
    strength: 0.5,
    trustPrior: 0.5,
    threatPrior: 0.3,
    exclusivity: 0,
    sources: []
  };
  map.set(k, e);
  return e;
}

function addTag(e: RelationshipEdge, tag: RelationTag) {
  if (!e.tags) e.tags = [];
  if (!e.tags.includes(tag)) e.tags.push(tag);
}

function removeTag(e: RelationshipEdge, tag: RelationTag) {
  e.tags = (e.tags || []).filter(t => t !== tag);
}

// mapping events to deltas (MVP; можно потом вынести в tuning)
function eventDeltas(kind: string, mag: number) {
  const m = clamp01(mag);
  switch (kind) {
    case 'helped':
    case 'saved':
      return { dTrust: +0.20 * m, dThreat: -0.10 * m, dStrength: +0.10 * m, add: ['friend'] as RelationTag[] };
    case 'shared_secret':
      return { dTrust: +0.15 * m, dThreat: -0.05 * m, dStrength: +0.08 * m, add: ['ally'] as RelationTag[] };
    case 'hurt':
    case 'attacked':
      return { dTrust: -0.25 * m, dThreat: +0.25 * m, dStrength: +0.10 * m, add: ['enemy'] as RelationTag[] };
    case 'betrayed':
      return { dTrust: -0.40 * m, dThreat: +0.35 * m, dStrength: +0.15 * m, add: ['enemy'] as RelationTag[] };
    case 'lied':
      return { dTrust: -0.20 * m, dThreat: +0.10 * m, dStrength: +0.05 * m, add: ['rival'] as RelationTag[] };
    case 'kept_oath':
      return { dTrust: +0.20 * m, dThreat: -0.05 * m, dStrength: +0.10 * m, add: ['ally'] as RelationTag[] };
    case 'broke_oath':
      return { dTrust: -0.35 * m, dThreat: +0.20 * m, dStrength: +0.10 * m, add: ['enemy'] as RelationTag[] };
    default:
      return { dTrust: 0, dThreat: 0, dStrength: 0, add: [] as RelationTag[] };
  }
}

export function updateRelationshipGraphFromEvents(input: {
  graph: RelationshipGraph | null | undefined;
  selfId: string;
  events: WorldEvent[];  // world events (not atoms)
  nowTick: number;
  maxLookbackTicks?: number;
  decayPerTick?: number; // slow decay towards neutral
}): { graph: RelationshipGraph; changes: Array<{ a: string; b: string; kind: string; tick: number; note: string }> } {
  const base: RelationshipGraph = input.graph && input.graph.schemaVersion ? input.graph : { schemaVersion: 1, edges: [] };
  const map = new Map<string, RelationshipEdge>();
  for (const e of base.edges || []) map.set(edgeKey(e.a, e.b), { ...e, tags: [...(e.tags || [])], sources: [...(e.sources || [])] });

  const changes: Array<{ a: string; b: string; kind: string; tick: number; note: string }> = [];
  const lookback = input.maxLookbackTicks ?? 60;
  const decay = input.decayPerTick ?? 0.002;

  // 0) decay all outgoing edges selfId -> * towards neutral slowly
  for (const [k, e] of map.entries()) {
    if (e.a !== input.selfId) continue;

    // move priors slightly toward neutral
    e.trustPrior = clamp01((e.trustPrior ?? 0.5) * (1 - decay) + 0.5 * decay);
    e.threatPrior = clamp01((e.threatPrior ?? 0.3) * (1 - decay) + 0.3 * decay);
    e.strength = clamp01((e.strength ?? 0.5) * (1 - decay) + 0.5 * decay);
  }

  // 1) apply event evidence
  for (const ev of input.events || []) {
    if (input.nowTick - ev.tick > lookback) continue;

    const involvesSelf = ev.actorId === input.selfId || ev.targetId === input.selfId;
    if (!involvesSelf) continue;

    // Update relation from self perspective:
    // - if self is actor: relation self -> target
    // - if self is target: relation self -> actor (because that's "my relation to them")
    const otherId = ev.actorId === input.selfId ? ev.targetId : ev.actorId;
    if (!otherId) continue;

    const edge = ensureEdge(map, input.selfId, otherId);

    const mag = clamp01(ev.magnitude ?? 0.7);
    const d = eventDeltas(ev.kind, mag);

    const beforeT = clamp01(edge.trustPrior ?? 0.5);
    const beforeH = clamp01(edge.threatPrior ?? 0.3);

    edge.trustPrior = clamp01(beforeT + d.dTrust);
    edge.threatPrior = clamp01(beforeH + d.dThreat);
    edge.strength = clamp01((edge.strength ?? 0.5) + d.dStrength);
    edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, ev.tick);
    
    // Add source if not redundant (simple check)
    const lastSource = edge.sources?.[edge.sources.length - 1];
    if (lastSource?.kind !== 'event' || lastSource.ref !== ev.id) {
        edge.sources = [...(edge.sources || []), { kind: 'event', ref: ev.id, weight: mag }];
    }

    for (const tag of d.add) addTag(edge, tag);

    // Canonicalize top label by priors (MVP rule)
    canonicalizeTags(edge);

    changes.push({
      a: edge.a,
      b: edge.b,
      kind: ev.kind,
      tick: ev.tick,
      note: `trust ${Math.round(beforeT * 100)}→${Math.round((edge.trustPrior ?? 0) * 100)}, threat ${Math.round(beforeH * 100)}→${Math.round((edge.threatPrior ?? 0) * 100)}`
    });
  }

  return { graph: { schemaVersion: 1, edges: Array.from(map.values()) }, changes };
}

function canonicalizeTags(edge: RelationshipEdge) {
  const t = clamp01(edge.trustPrior ?? 0.5);
  const h = clamp01(edge.threatPrior ?? 0.3);

  // Remove mutually exclusive high-level tags first
  if (h > 0.7) {
    addTag(edge, 'enemy');
    removeTag(edge, 'friend'); removeTag(edge, 'lover'); removeTag(edge, 'ally');
    return;
  }
  if (t > 0.8 && h < 0.25) {
    addTag(edge, 'friend');
    removeTag(edge, 'enemy'); removeTag(edge, 'rival');
    return;
  }
  if (t > 0.65 && h < 0.35) {
    addTag(edge, 'ally');
    removeTag(edge, 'enemy');
    return;
  }
  // default neutral/rival depending on threat
  if (h > 0.45) addTag(edge, 'rival');
  if (t < 0.35 && h < 0.45) addTag(edge, 'neutral');
}
