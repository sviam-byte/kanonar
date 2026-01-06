import type { ContextAtom } from '../context/v2/types';

type RelEdge = {
  a: string;
  b: string;
  tags: string[];
  strength: number;
  trustPrior?: number;
  threatPrior?: number;
  updatedAtTick?: number;
  sources?: Array<{ kind: string; ref?: string; weight?: number }>;

  // Social biography
  bioAspects?: Record<string, number>;
  bioVector?: Record<string, number>; // raw signed [-1..+1]
};

type RelGraph = {
  schemaVersion: number;
  edges: RelEdge[];
};

export function buildRelGraphFromAtoms(atoms: ContextAtom[]): RelGraph {
  const map = new Map<string, RelEdge>();

  const key = (a: string, b: string) => `${a}→${b}`;
  const ensure = (a: string, b: string) => {
    const k = key(a, b);
    const prev = map.get(k);
    if (prev) return prev;
    const e: RelEdge = { a, b, tags: ['rel'], strength: 0 };
    map.set(k, e);
    return e;
  };

  const uniq = (xs: string[]) => Array.from(new Set((Array.isArray(xs) ? xs : []).map(String).filter(Boolean)));

  for (const atom of Array.isArray(atoms) ? atoms : []) {
    const id = String((atom as any)?.id ?? '');
    const parts = id.split(':');
    if (parts.length < 4) continue;
    if (parts[0] !== 'rel') continue;

    const kind = parts[1];

    if (kind === 'label') {
      // rel:label:self:other
      const selfId = parts[2];
      const otherId = parts[3];
      const edge = ensure(selfId, otherId);

      const strength = Number((atom as any)?.magnitude ?? (atom as any)?.m ?? 0);
      if (Number.isFinite(strength)) edge.strength = strength;

      const tagsFromAtom = Array.isArray((atom as any)?.tags) ? (atom as any).tags.map(String) : [];
      const label = String((atom as any)?.meta?.label ?? (atom as any)?.label ?? 'acquaintance');
      edge.tags = uniq([...(edge.tags || []), ...tagsFromAtom, label].filter(Boolean));

      const u = (atom as any)?.meta?.updatedAtTick;
      if (typeof u === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, u);
      const sources = (atom as any)?.meta?.sources;
      if (Array.isArray(sources)) edge.sources = sources as any;
      continue;
    }

    if (kind === 'prior') {
      // rel:prior:self:other:(trust|threat)
      if (parts.length < 5) continue;
      const selfId = parts[2];
      const otherId = parts[3];
      const which = parts[4];
      const edge = ensure(selfId, otherId);

      const v = Number((atom as any)?.magnitude ?? 0);
      if (which === 'trust' && Number.isFinite(v)) edge.trustPrior = v;
      if (which === 'threat' && Number.isFinite(v)) edge.threatPrior = v;

      const u = (atom as any)?.meta?.updatedAtTick;
      if (typeof u === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, u);
      const sources = (atom as any)?.meta?.sources;
      if (Array.isArray(sources)) edge.sources = sources as any;
      continue;
    }

    if (kind === 'bio') {
      // rel:bio:<aspect>:self:other
      if (parts.length < 5) continue;
      const aspect = parts[2];
      const selfId = parts[3];
      const otherId = parts[4];
      const edge = ensure(selfId, otherId);

      const v = Number((atom as any)?.magnitude ?? 0);
      if (!edge.bioAspects) edge.bioAspects = {};
      if (Number.isFinite(v)) edge.bioAspects[aspect] = v;

      const u = (atom as any)?.meta?.updatedAtTick;
      if (typeof u === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, u);
      const sources = (atom as any)?.meta?.sources;
      if (Array.isArray(sources)) edge.sources = sources as any;
      continue;
    }

    if (kind === 'vec') {
      // rel:vec:<dim>:self:other
      if (parts.length < 5) continue;
      const dim = parts[2];
      const selfId = parts[3];
      const otherId = parts[4];
      const edge = ensure(selfId, otherId);

      const raw = Number((atom as any)?.meta?.raw);
      if (!edge.bioVector) edge.bioVector = {};
      if (Number.isFinite(raw)) edge.bioVector[dim] = raw;

      const u = (atom as any)?.meta?.updatedAtTick;
      if (typeof u === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, u);
      const sources = (atom as any)?.meta?.sources;
      if (Array.isArray(sources)) edge.sources = sources as any;
      continue;
    }
  }

  return { schemaVersion: 1, edges: Array.from(map.values()) };
}
