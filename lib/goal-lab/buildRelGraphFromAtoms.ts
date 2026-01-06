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

  // from rel:base/rel:ctx
  base?: Record<string, number>;
  ctx?: Record<string, number>;

  // Social biography
  bioAspects?: Record<string, number>;
  bioVector?: Record<string, number>; // raw signed [-1..+1]
};

type RelGraph = {
  schemaVersion: number;
  edges: RelEdge[];
};

function clamp01(x: unknown, fallback = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function uniq(xs: string[]) {
  return Array.from(new Set((Array.isArray(xs) ? xs : []).map(String).filter(Boolean)));
}

function pickUpdatedAtTick(atom: ContextAtom): number | undefined {
  const metaTick = (atom as any)?.meta?.updatedAtTick;
  if (typeof metaTick === 'number') return metaTick;

  const traceTick = (atom as any)?.trace?.parts?.lastUpdatedTick ?? (atom as any)?.trace?.parts?.updatedAtTick;
  if (typeof traceTick === 'number') return traceTick;

  return undefined;
}

function inferStrength(edge: RelEdge): number {
  // Prefer ctx intimacy if present, else ctx closeness/loyalty, else base.
  const ctx = edge.ctx || {};
  const base = edge.base || {};

  const intimacy = clamp01(ctx.intimacy, NaN);
  if (Number.isFinite(intimacy)) return intimacy;

  const closeness = clamp01(ctx.closeness, NaN);
  const loyalty = clamp01(ctx.loyalty, NaN);
  if (Number.isFinite(closeness) || Number.isFinite(loyalty)) {
    return clamp01(0.65 * (Number.isFinite(closeness) ? closeness : 0) + 0.35 * (Number.isFinite(loyalty) ? loyalty : 0));
  }

  const baseIntimacy = clamp01(base.intimacy, NaN);
  if (Number.isFinite(baseIntimacy)) return baseIntimacy;

  const baseCloseness = clamp01(base.closeness, NaN);
  const baseLoyalty = clamp01(base.loyalty, NaN);
  if (Number.isFinite(baseCloseness) || Number.isFinite(baseLoyalty)) {
    return clamp01(0.70 * (Number.isFinite(baseCloseness) ? baseCloseness : 0) + 0.30 * (Number.isFinite(baseLoyalty) ? baseLoyalty : 0));
  }

  return 0;
}

function inferTrustThreat(edge: RelEdge) {
  // If rel:prior exists it will overwrite these later; otherwise infer from ctx/base.
  const ctx = edge.ctx || {};
  const base = edge.base || {};

  const loyalty = Number.isFinite(ctx.loyalty) ? clamp01(ctx.loyalty) : (Number.isFinite(base.loyalty) ? clamp01(base.loyalty) : 0.5);
  const closeness = Number.isFinite(ctx.closeness) ? clamp01(ctx.closeness) : (Number.isFinite(base.closeness) ? clamp01(base.closeness) : 0.1);
  const hostility = Number.isFinite(ctx.hostility) ? clamp01(ctx.hostility) : (Number.isFinite(base.hostility) ? clamp01(base.hostility) : 0.0);
  const dependency = Number.isFinite(ctx.dependency) ? clamp01(ctx.dependency) : (Number.isFinite(base.dependency) ? clamp01(base.dependency) : 0.05);

  // heuristic: trust grows with loyalty/closeness, small bonus for dependency (bond), threat grows with hostility
  const trust = clamp01(0.55 * loyalty + 0.35 * closeness + 0.10 * dependency, 0.5);
  const threat = clamp01(0.85 * hostility + 0.15 * (1 - trust), 0.3);

  edge.trustPrior = edge.trustPrior ?? trust;
  edge.threatPrior = edge.threatPrior ?? threat;
}

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

  for (const atom of Array.isArray(atoms) ? atoms : []) {
    const id = String((atom as any)?.id ?? '');
    const parts = id.split(':');
    if (parts.length < 3) continue;

    // --- rel:label/self/other (graph label atoms)
    if (parts[0] === 'rel' && parts[1] === 'label' && parts.length >= 4) {
      const selfId = parts[2];
      const otherId = parts[3];
      const edge = ensure(selfId, otherId);

      const strength = Number((atom as any)?.magnitude ?? (atom as any)?.m ?? 0);
      if (Number.isFinite(strength)) edge.strength = clamp01(strength);

      const tagsFromAtom = Array.isArray((atom as any)?.tags) ? (atom as any).tags.map(String) : [];
      const label = String((atom as any)?.meta?.label ?? (atom as any)?.label ?? 'acquaintance');
      edge.tags = uniq([...(edge.tags || []), ...tagsFromAtom, label]);

      const updatedAt = pickUpdatedAtTick(atom as ContextAtom);
      if (typeof updatedAt === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, updatedAt);

      const sources = (atom as any)?.meta?.sources;
      if (Array.isArray(sources)) edge.sources = sources as any;

      continue;
    }

    // --- rel:prior:self:other:(trust|threat)
    if (parts[0] === 'rel' && parts[1] === 'prior' && parts.length >= 5) {
      const selfId = parts[2];
      const otherId = parts[3];
      const which = parts[4];
      const edge = ensure(selfId, otherId);

      const v = Number((atom as any)?.magnitude ?? 0);
      if (which === 'trust' && Number.isFinite(v)) edge.trustPrior = clamp01(v);
      if (which === 'threat' && Number.isFinite(v)) edge.threatPrior = clamp01(v);

      const updatedAt = pickUpdatedAtTick(atom as ContextAtom);
      if (typeof updatedAt === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, updatedAt);

      const sources = (atom as any)?.meta?.sources;
      if (Array.isArray(sources)) edge.sources = sources as any;

      continue;
    }

    // --- rel:bio:<aspect>:self:other
    if (parts[0] === 'rel' && parts[1] === 'bio' && parts.length >= 5) {
      const aspect = parts[2];
      const selfId = parts[3];
      const otherId = parts[4];
      const edge = ensure(selfId, otherId);

      const v = Number((atom as any)?.magnitude ?? 0);
      if (!edge.bioAspects) edge.bioAspects = {};
      if (Number.isFinite(v)) edge.bioAspects[aspect] = clamp01(v);

      const updatedAt = pickUpdatedAtTick(atom as ContextAtom);
      if (typeof updatedAt === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, updatedAt);

      const sources = (atom as any)?.meta?.sources;
      if (Array.isArray(sources)) edge.sources = sources as any;

      continue;
    }

    // --- rel:vec:<dim>:self:other  (raw signed stored in meta.raw)
    if (parts[0] === 'rel' && parts[1] === 'vec' && parts.length >= 5) {
      const dim = parts[2];
      const selfId = parts[3];
      const otherId = parts[4];
      const edge = ensure(selfId, otherId);

      const raw = Number((atom as any)?.meta?.raw);
      if (!edge.bioVector) edge.bioVector = {};
      if (Number.isFinite(raw)) edge.bioVector[dim] = Math.max(-1, Math.min(1, raw));

      const updatedAt = pickUpdatedAtTick(atom as ContextAtom);
      if (typeof updatedAt === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, updatedAt);

      const sources = (atom as any)?.meta?.sources;
      if (Array.isArray(sources)) edge.sources = sources as any;

      continue;
    }

    // ==========================
    // Accept existing relation atoms
    // rel:base:self:other:<name>
    // rel:ctx:self:other:<name>
    // rel:tag:self:other:<tag>
    // ==========================
    if (parts[0] === 'rel' && (parts[1] === 'base' || parts[1] === 'ctx') && parts.length >= 5) {
      const layer = parts[1]; // base/ctx
      const selfId = parts[2];
      const otherId = parts[3];
      const name = parts[4];
      const edge = ensure(selfId, otherId);

      const v = Number((atom as any)?.magnitude ?? (atom as any)?.m ?? 0);
      if (Number.isFinite(v)) {
        if (layer === 'base') {
          edge.base = edge.base || {};
          edge.base[name] = clamp01(v);
        } else {
          edge.ctx = edge.ctx || {};
          edge.ctx[name] = clamp01(v);
        }
      }

      // pull tags from atom.tags too
      const tagsFromAtom = Array.isArray((atom as any)?.tags) ? (atom as any).tags.map(String) : [];
      edge.tags = uniq([...(edge.tags || []), ...tagsFromAtom]);

      const updatedAt = pickUpdatedAtTick(atom as ContextAtom);
      if (typeof updatedAt === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, updatedAt);

      continue;
    }

    if (parts[0] === 'rel' && parts[1] === 'tag' && parts.length >= 5) {
      const selfId = parts[2];
      const otherId = parts[3];
      const tag = parts[4];
      const edge = ensure(selfId, otherId);

      edge.tags = uniq([...(edge.tags || []), tag]);

      const updatedAt = pickUpdatedAtTick(atom as ContextAtom);
      if (typeof updatedAt === 'number') edge.updatedAtTick = Math.max(edge.updatedAtTick ?? 0, updatedAt);

      continue;
    }
  }

  // finalize
  for (const e of map.values()) {
    if (!Number.isFinite(e.strength) || e.strength <= 0) e.strength = inferStrength(e);
    inferTrustThreat(e);

    // keep tags tidy
    e.tags = uniq([...(e.tags || []), 'rel']);
  }

  return { schemaVersion: 1, edges: Array.from(map.values()) };
}
