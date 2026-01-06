import { RelationMemory } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { arr } from '../utils/arr';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function signedToUnit(x: number) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0.5;
  return clamp01((n + 1) / 2);
}

function atomizeRelWithPrefix(prefix: 'rel:base' | 'rel:ctx', selfId: string, rel: RelationMemory, otherIds?: string[]): ContextAtom[] {
  const out: ContextAtom[] = [];
  const edges = rel?.edges || {};

  // iterate requested dyads first, then explicit edges
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };
  for (const id of arr(otherIds)) push(String(id));
  for (const id of Object.keys(edges)) push(String(id));

  const defaultEdge = () => ({
    closeness: 0.10,
    loyalty: 0.08,
    hostility: 0.02,
    dependency: 0.05,
    authority: 0.50,
    tags: [],
    sources: [{ type: 'default', ref: 'seed' }]
  });

  const deriveHierarchy = (e: any) => clamp01(e.authority ?? 0.50); // neutral=0.5
  const deriveIntimacy = (e: any) => {
    const c = clamp01(e.closeness ?? 0.10);
    const base = 0.05 + 0.90 * Math.pow(c, 1.15);
    const tags = new Set(arr(e.tags).map(String));
    const bonus =
      (tags.has('lover') ? 0.25 : 0) +
      (tags.has('family') ? 0.18 : 0) +
      (tags.has('friend') ? 0.10 : 0) +
      (tags.has('protector') ? 0.05 : 0);
    return clamp01(base + bonus);
  };

  for (const otherId of ordered) {
    const e = (edges as any)[otherId] || defaultEdge();
    const used = arr(e.sources).map(s => `src:${s.type}:${s.ref || ''}`).slice(0, 6);
    const hasRealSource = arr(e.sources).some((s: any) => s?.type && s.type !== 'default');
    const confidence = hasRealSource ? 1 : 0.35;

    const emit = (name: string, v: number) => out.push(normalizeAtom({
      id: `${prefix}:${selfId}:${otherId}:${name}`,
      ns: 'rel',
      kind: (prefix === 'rel:base' ? 'relation_base' : 'relation_ctx') as any,
      origin: (prefix === 'rel:base' ? 'world' : 'derived') as any,
      source: (prefix === 'rel:base' ? 'rel_base' : 'rel_ctx'),
      magnitude: clamp01(v),
      confidence,
      subject: selfId,
      target: otherId,
      tags: ['rel', (prefix === 'rel:base' ? 'base' : 'ctx'), name, ...arr(e.tags)],
      label: `rel.${name}=${Math.round(clamp01(v) * 100)}%`,
      trace: { usedAtomIds: used, notes: [prefix === 'rel:base' ? 'from rel_base' : 'from rel_ctx'], parts: { tags: e.tags, lastUpdatedTick: e.lastUpdatedTick } }
    } as any));

    emit('closeness', e.closeness ?? 0.1);
    emit('loyalty', e.loyalty ?? 0.1);
    emit('hostility', e.hostility ?? 0.0);
    emit('dependency', e.dependency ?? 0.0);
    emit('authority', e.authority ?? 0.0);
    emit('hierarchy', deriveHierarchy(e));
    emit('intimacy', deriveIntimacy(e));

    // also emit tag flags for fast gates (0/1) — keep same rel:tag namespace
    for (const t of arr(e.tags)) {
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

    // Social biography atoms (available regardless of prefix)
    const aspects = e?.bio?.aspects;
    if (aspects && typeof aspects === 'object') {
      for (const [k, v] of Object.entries(aspects)) {
        const mag = clamp01(Number(v));
        out.push(normalizeAtom({
          id: `rel:bio:${k}:${selfId}:${otherId}`,
          ns: 'rel' as any,
          kind: 'rel_bio' as any,
          origin: 'profile' as any,
          source: 'rel_bio',
          magnitude: mag,
          confidence: 1,
          subject: selfId,
          target: otherId,
          tags: ['rel', 'bio', k, ...arr(e.tags)],
          label: `bio.${k}=${Math.round(mag * 100)}%`,
          trace: { usedAtomIds: used, notes: ['from RelationMemory.edge.bio.aspects'], parts: { lastUpdatedTick: e.lastUpdatedTick } }
        } as any));
      }
    }

    const vec = e?.bio?.vector;
    if (vec && typeof vec === 'object') {
      for (const [dim, raw] of Object.entries(vec)) {
        const rawN = Number(raw);
        const mag01 = signedToUnit(rawN);
        out.push(normalizeAtom({
          id: `rel:vec:${dim}:${selfId}:${otherId}`,
          ns: 'rel' as any,
          kind: 'rel_vec' as any,
          origin: 'profile' as any,
          source: 'rel_bio',
          magnitude: mag01,
          confidence: 1,
          subject: selfId,
          target: otherId,
          tags: ['rel', 'vec', dim, ...arr(e.tags)],
          label: `vec.${dim}=${Number.isFinite(rawN) ? rawN.toFixed(2) : '0.00'}`,
          meta: { raw: Number.isFinite(rawN) ? rawN : 0 },
          trace: { usedAtomIds: used, notes: ['from RelationMemory.edge.bio.vector'], parts: { lastUpdatedTick: e.lastUpdatedTick } }
        } as any));
      }
    }
  }

  return out;
}

export function atomizeRelBase(selfId: string, rel: RelationMemory, otherIds?: string[]): ContextAtom[] {
  return atomizeRelWithPrefix('rel:base', selfId, rel, otherIds);
}

export function atomizeRelCtx(selfId: string, rel: RelationMemory, otherIds?: string[]): ContextAtom[] {
  return atomizeRelWithPrefix('rel:ctx', selfId, rel, otherIds);
}
