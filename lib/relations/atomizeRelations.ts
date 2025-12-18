
// lib/relations/atomizeRelations.ts
import { RelationshipGraph } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function atomizeRelations(graph: RelationshipGraph, selfId: string): ContextAtom[] {
  const out: ContextAtom[] = [];

  for (const e of graph.edges || []) {
    if (e.a !== selfId) continue;

    const topTag = (e.tags || [])[0] || 'neutral';
    const strength = clamp01(e.strength ?? 0);
    const trustPrior = clamp01(e.trustPrior ?? 0.5);
    const threatPrior = clamp01(e.threatPrior ?? 0.3);

    // label atom used by banners + UI
    out.push(normalizeAtom({
      id: `rel:label:${selfId}:${e.b}`,
      kind: 'rel_label',
      ns: 'rel',
      origin: 'memory',
      source: 'relations',
      magnitude: strength,
      confidence: 1,
      subject: selfId,
      target: e.b,
      tags: ['rel', topTag, ...(e.tags || [])],
      label: `${topTag} (${Math.round(strength * 100)}%)`,
      trace: { usedAtomIds: [], notes: ['relationship edge from graph'], parts: { tags: e.tags, strength } },
      meta: { sources: e.sources || [] }
    } as any));

    // priors (for ToM_base / effective)
    out.push(normalizeAtom({
      id: `rel:prior:${selfId}:${e.b}:trust`,
      kind: 'tom_belief', // Using generic kind for prior belief
      ns: 'rel',
      origin: 'memory',
      source: 'relations',
      magnitude: trustPrior,
      confidence: 1,
      subject: selfId,
      target: e.b,
      tags: ['rel', 'prior', 'trust'],
      label: `trustPrior:${Math.round(trustPrior * 100)}%`,
      trace: { usedAtomIds: [], notes: ['trust prior from relationship'], parts: { trustPrior } }
    } as any));

    out.push(normalizeAtom({
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
      trace: { usedAtomIds: [], notes: ['threat prior from relationship'], parts: { threatPrior } }
    } as any));
  }

  return out;
}
