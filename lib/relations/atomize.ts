
import { RelationMemory } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function atomizeRelBase(selfId: string, rel: RelationMemory): ContextAtom[] {
  const out: ContextAtom[] = [];
  if (!rel?.edges) return out;

  for (const otherId of Object.keys(rel.edges)) {
    const e = rel.edges[otherId];
    const used = (e.sources || []).map(s => `src:${s.type}:${s.ref || ''}`).slice(0, 6);

    const emit = (name: string, v: number) => out.push(normalizeAtom({
      id: `rel:base:${selfId}:${otherId}:${name}`,
      ns: 'rel',
      kind: 'relation_base' as any,
      origin: 'world',
      source: 'rel_base',
      magnitude: clamp01(v),
      confidence: 1,
      subject: selfId,
      target: otherId,
      tags: ['rel', 'base', name, ...(e.tags || [])],
      label: `rel.${name}=${Math.round(clamp01(v) * 100)}%`,
      trace: { usedAtomIds: used, notes: ['from rel_base'], parts: { tags: e.tags, lastUpdatedTick: e.lastUpdatedTick } }
    } as any));

    emit('closeness', e.closeness ?? 0.1);
    emit('loyalty', e.loyalty ?? 0.1);
    emit('hostility', e.hostility ?? 0.0);
    emit('dependency', e.dependency ?? 0.0);
    emit('authority', e.authority ?? 0.0);

    // also emit tag flags for fast gates (0/1)
    for (const t of (e.tags || [])) {
      out.push(normalizeAtom({
        id: `rel:tag:${selfId}:${otherId}:${t}`,
        ns: 'rel',
        kind: 'relation_tag' as any,
        origin: 'world',
        source: 'rel_base',
        magnitude: 1,
        confidence: 1,
        subject: selfId,
        target: otherId,
        tags: ['rel', 'tag', t],
        label: `tag:${t}`,
        trace: { usedAtomIds: used, notes: ['relation tag'], parts: {} }
      } as any));
    }
  }

  return out;
}
