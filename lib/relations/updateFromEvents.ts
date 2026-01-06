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
    a,
    b,
    tags: ['neutral'],
    strength: 0.5,
    trustPrior: 0.5,
    threatPrior: 0.3,
    exclusivity: 0,
    sources: [],
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

// classic priors/tags deltas (MVP)
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

// Social biography: event -> aspect deltas + signed vector impact
function bioDeltas(kind: string, mag: number): {
  aspects: Partial<Record<string, number>>;
  vector?: Record<string, number>;
} {
  const m = clamp01(mag);
  switch (kind) {
    case 'saved':
    case 'helped':
      return {
        aspects: { rescue_actor: +0.35 * m, devotion: +0.10 * m },
        vector: { Agency: +0.40 * m, Heroism: +0.40 * m, Trust: +0.15 * m },
      };
    case 'obeyed':
      return {
        aspects: { submission: +0.35 * m },
        vector: { Discipline: +0.45 * m, Formalism: +0.35 * m, Self: -0.20 * m },
      };
    case 'controlled_by':
    case 'commanded':
      return { aspects: { controlled_by: +0.30 * m }, vector: { Order: +0.35 * m, Autonomy: -0.25 * m } };
    case 'shared_trauma':
      return { aspects: { shared_trauma: +0.40 * m }, vector: { Bond: +0.45 * m, Cohesion: +0.35 * m } };
    case 'betrayed':
      return { aspects: { betrayed_by: +0.40 * m }, vector: { Paranoia: +0.45 * m, Trust: -0.40 * m, Isolation: +0.20 * m } };
    case 'humiliated_by':
      return { aspects: { humiliated_by: +0.35 * m }, vector: { Shame: +0.45 * m, Revenge: +0.25 * m, Submission: +0.20 * m } };
    case 'care_from':
      return { aspects: { care_from: +0.30 * m }, vector: { Trust: +0.30 * m, Anxiety: -0.25 * m } };
    case 'approval_deprivation':
      return { aspects: { approval_deprivation: +0.25 * m }, vector: { Isolation: +0.20 * m, Self: -0.20 * m } };
    case 'romance':
      return { aspects: { romance: +0.35 * m }, vector: { Care: +0.35 * m, Trust: +0.25 * m, Autonomy: -0.20 * m } };
    case 'friendship':
      return { aspects: { friendship: +0.30 * m }, vector: { Reciprocity: +0.35 * m, Trust: +0.20 * m } };
    case 'attacked':
    case 'hurt':
      return { aspects: { harmed: +0.35 * m }, vector: { Fear: +0.25 * m, Trust: -0.20 * m } };
    case 'kept_oath':
      return { aspects: { devotion: +0.35 * m }, vector: { Loyalty: +0.45 * m, Order: +0.30 * m, Self: -0.15 * m } };
    default:
      return { aspects: {} };
  }
}

function applyBio(edge: RelationshipEdge, delta: ReturnType<typeof bioDeltas>, decay: number) {
  if (!edge.bio) edge.bio = {};
  if (!edge.bio.aspects) edge.bio.aspects = {};
  const aspects = edge.bio.aspects;

  // decay existing aspects
  for (const k of Object.keys(aspects)) {
    const v = clamp01(Number((aspects as any)[k] ?? 0));
    (aspects as any)[k] = clamp01(v * (1 - decay));
  }
  // apply deltas
  for (const [k, dv] of Object.entries(delta.aspects || {})) {
    const prev = clamp01(Number((aspects as any)[k] ?? 0));
    (aspects as any)[k] = clamp01(prev + clamp01(Number(dv)));
  }

  // vector: signed leaky integrator [-1..+1]
  if (delta.vector) {
    if (!edge.bio.vector) edge.bio.vector = {};
    for (const [dim, dRaw] of Object.entries(delta.vector)) {
      const prev = Number((edge.bio.vector as any)[dim] ?? 0);
      const prevN = Number.isFinite(prev) ? prev : 0;
      const next = prevN * (1 - decay) + Number(dRaw);
      (edge.bio.vector as any)[dim] = Math.max(-1, Math.min(1, next));
    }
  }
}

export function updateRelationshipGraphFromEvents(input: {
  graph: RelationshipGraph | null | undefined;
  selfId: string;
  events: WorldEvent[];
  nowTick: number;
  maxLookbackTicks?: number;
  decayPerTick?: number;
}): { graph: RelationshipGraph; changes: Array<{ a: string; b: string; kind: string; tick: number; note: string }> } {
  const base: RelationshipGraph =
    input.graph && input.graph.schemaVersion ? input.graph : { schemaVersion: 1, edges: [] };

  const map = new Map<string, RelationshipEdge>();
  for (const e of base.edges || []) {
    map.set(edgeKey(e.a, e.b), { ...e, tags: [...(e.tags || [])], sources: [...(e.sources || [])] });
  }

  const changes: Array<{ a: string; b: string; kind: string; tick: number; note: string }> = [];
  const lookback = input.maxLookbackTicks ?? 60;
  const decay = input.decayPerTick ?? 0.002;

  // decay outgoing edges
  for (const e of map.values()) {
    if (e.a !== input.selfId) continue;

    e.trustPrior = clamp01((e.trustPrior ?? 0.5) * (1 - decay) + 0.5 * decay);
    e.threatPrior = clamp01((e.threatPrior ?? 0.3) * (1 - decay) + 0.3 * decay);
    e.strength = clamp01((e.strength ?? 0.5) * (1 - decay) + 0.5 * decay);

    // bio decays even slower
    if (e.bio) applyBio(e, { aspects: {} }, Math.min(decay, 0.001));
  }

  for (const ev of input.events || []) {
    if (input.nowTick - ev.tick > lookback) continue;

    const involvesSelf = ev.actorId === input.selfId || ev.targetId === input.selfId;
    if (!involvesSelf) continue;

    const otherId = ev.actorId === input.selfId ? ev.targetId : ev.actorId;
    if (!otherId) continue;

    const edge = ensureEdge(map, input.selfId, otherId);

    const mag = clamp01(ev.magnitude ?? 0.7);
    const d = eventDeltas(ev.kind, mag);
    const b = bioDeltas(ev.kind, mag);

    const beforeT = clamp01(edge.trustPrior ?? 0.5);
    const beforeH = clamp01(edge.threatPrior ?? 0.3);

    edge.trustPrior = clamp01(beforeT + d.dTrust);
    edge.threatPrior = clamp01(beforeH + d.dThreat);
    edge.strength = clamp01((edge.strength ?? 0.5) + d.dStrength);
    edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, ev.tick);

    if (Object.keys(b.aspects || {}).length > 0 || b.vector) {
      applyBio(edge, b, 0.001);
    }

    const lastSource = edge.sources?.[edge.sources.length - 1];
    if (lastSource?.kind !== 'event' || lastSource.ref !== ev.id) {
      edge.sources = [...(edge.sources || []), { kind: 'event', ref: ev.id, weight: mag }];
    }

    for (const tag of d.add) addTag(edge, tag);
    canonicalizeTags(edge);

    changes.push({
      a: edge.a,
      b: edge.b,
      kind: ev.kind,
      tick: ev.tick,
      note: `trust ${Math.round(beforeT * 100)}→${Math.round((edge.trustPrior ?? 0) * 100)}, threat ${Math.round(beforeH * 100)}→${Math.round((edge.threatPrior ?? 0) * 100)}`,
    });
  }

  return { graph: { schemaVersion: 1, edges: Array.from(map.values()) }, changes };
}

function canonicalizeTags(edge: RelationshipEdge) {
  const t = clamp01(edge.trustPrior ?? 0.5);
  const h = clamp01(edge.threatPrior ?? 0.3);

  if (h > 0.7) {
    addTag(edge, 'enemy');
    removeTag(edge, 'friend');
    removeTag(edge, 'lover');
    removeTag(edge, 'ally');
    return;
  }
  if (t > 0.8 && h < 0.25) {
    addTag(edge, 'friend');
    removeTag(edge, 'enemy');
    removeTag(edge, 'rival');
    return;
  }
  if (t > 0.65 && h < 0.35) {
    addTag(edge, 'ally');
    removeTag(edge, 'enemy');
    return;
  }
  if (h > 0.45) addTag(edge, 'rival');
  if (t < 0.35 && h < 0.45) addTag(edge, 'neutral');
}
