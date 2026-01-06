// lib/relations/atomizeRelations.ts
import { RelationshipGraph } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function uniq(xs: string[]) {
  return Array.from(new Set((Array.isArray(xs) ? xs : []).map(String).filter(Boolean)));
}

function signedToUnit(x: number) {
  // map [-1..+1] → [0..1]
  const n = Number(x);
  if (!Number.isFinite(n)) return 0.5;
  return clamp01((n + 1) / 2);
}

export function atomizeRelations(graph: RelationshipGraph, selfId: string): ContextAtom[] {
  const out: ContextAtom[] = [];

  for (const e of graph.edges || []) {
    if (e.a !== selfId) continue;

    const topTag = (e.tags || [])[0] || 'neutral';
    const strength = clamp01(e.strength ?? 0);
    const trustPrior = clamp01(e.trustPrior ?? 0.5);
    const threatPrior = clamp01(e.threatPrior ?? 0.3);
    const updatedAtTick = typeof e.updatedAtTick === 'number' ? e.updatedAtTick : undefined;
    const sources = Array.isArray(e.sources) ? e.sources : [];

    const tags = uniq(['rel', topTag, ...(e.tags || [])]);

    // rel:label
    out.push(
      normalizeAtom({
        id: `rel:label:${selfId}:${e.b}`,
        kind: 'rel_label',
        ns: 'rel',
        origin: 'memory',
        source: 'relations',
        magnitude: strength,
        confidence: 1,
        subject: selfId,
        target: e.b,
        tags,
        label: `${topTag} (${Math.round(strength * 100)}%)`,
        trace: {
          usedAtomIds: [],
          notes: ['relationship edge from graph'],
          parts: { tags: e.tags, strength, updatedAtTick },
        },
        meta: { label: topTag, sources, updatedAtTick },
      } as any),
    );

    // rel:prior:* (ToM priors)
    out.push(
      normalizeAtom({
        id: `rel:prior:${selfId}:${e.b}:trust`,
        kind: 'tom_belief',
        ns: 'rel',
        origin: 'memory',
        source: 'relations',
        magnitude: trustPrior,
        confidence: 1,
        subject: selfId,
        target: e.b,
        tags: ['rel', 'prior', 'trust'],
        label: `trustPrior:${Math.round(trustPrior * 100)}%`,
        trace: { usedAtomIds: [], notes: ['trust prior from relationship'], parts: { trustPrior, updatedAtTick } },
        meta: { sources, updatedAtTick },
      } as any),
    );

    out.push(
      normalizeAtom({
        id: `rel:prior:${selfId}:${e.b}:threat`,
        kind: 'tom_belief',
        ns: 'rel',
        origin: 'memory',
        source: 'relations',
        magnitude: threatPrior,
        confidence: 1,
        subject: selfId,
        target: e.b,
        tags: ['rel', 'prior', 'threat'],
        label: `threatPrior:${Math.round(threatPrior * 100)}%`,
        trace: { usedAtomIds: [], notes: ['threat prior from relationship'], parts: { threatPrior, updatedAtTick } },
        meta: { sources, updatedAtTick },
      } as any),
    );

    // Social biography aspects (0..1)
    const aspects = (e as any)?.bio?.aspects as Record<string, number> | undefined;
    if (aspects && typeof aspects === 'object') {
      for (const [k, v] of Object.entries(aspects)) {
        const mag = clamp01(Number(v));
        out.push(
          normalizeAtom({
            id: `rel:bio:${k}:${selfId}:${e.b}`,
            kind: 'rel_bio',
            ns: 'rel',
            origin: 'memory',
            source: 'relations',
            magnitude: mag,
            confidence: 1,
            subject: selfId,
            target: e.b,
            tags: ['rel', 'bio', k],
            label: `${k}:${Math.round(mag * 100)}%`,
            trace: { usedAtomIds: [], notes: ['bio aspect from relationship'], parts: { aspect: k, value: mag, updatedAtTick } },
            meta: { sources, updatedAtTick },
          } as any),
        );
      }
    }

    // Social biography vector (signed raw in meta.raw; magnitude is mapped 0..1)
    const vec = (e as any)?.bio?.vector as Record<string, number> | undefined;
    if (vec && typeof vec === 'object') {
      for (const [dim, raw] of Object.entries(vec)) {
        const rawN = Number(raw);
        const mag = signedToUnit(rawN);
        out.push(
          normalizeAtom({
            id: `rel:vec:${dim}:${selfId}:${e.b}`,
            kind: 'rel_vec',
            ns: 'rel',
            origin: 'memory',
            source: 'relations',
            magnitude: mag,
            confidence: 1,
            subject: selfId,
            target: e.b,
            tags: ['rel', 'vec', dim],
            label: `${dim}:${Number.isFinite(rawN) ? rawN.toFixed(2) : '0.00'}`,
            trace: {
              usedAtomIds: [],
              notes: ['bio vector from relationship'],
              parts: { dim, raw: rawN, mapped01: mag, updatedAtTick },
            },
            meta: { raw: rawN, sources, updatedAtTick },
          } as any),
        );
      }
    }
  }

  return out;
}
