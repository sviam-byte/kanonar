
// lib/relations/extractors.ts
import { RelationshipEdge, RelationshipGraph, RelationTag } from './types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function edgeKey(a: string, b: string) {
  return `${a}→${b}`;
}

function mergeEdges(base: RelationshipEdge[], add: RelationshipEdge[]) {
  const map = new Map<string, RelationshipEdge>();
  for (const e of base) map.set(edgeKey(e.a, e.b), { ...e, tags: uniq(e.tags) });
  for (const e of add) {
    const k = edgeKey(e.a, e.b);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...e, tags: uniq(e.tags), strength: clamp01(e.strength) });
    } else {
      map.set(k, {
        ...prev,
        tags: uniq([...(prev.tags || []), ...(e.tags || [])]),
        strength: clamp01(Math.max(prev.strength ?? 0, e.strength ?? 0)),
        trustPrior: e.trustPrior ?? prev.trustPrior,
        threatPrior: e.threatPrior ?? prev.threatPrior,
        exclusivity: e.exclusivity ?? prev.exclusivity,
        updatedAtTick: Math.max(prev.updatedAtTick ?? 0, e.updatedAtTick ?? 0),
        sources: [...(prev.sources || []), ...(e.sources || [])]
      });
    }
  }
  return Array.from(map.values());
}

function asObj(x: any): Record<string, any> | null {
  return x && typeof x === 'object' ? x : null;
}

function readLegacyRelationMap(agent: any): Record<string, any> | null {
  // Accept: agent.relationships | agent.relations | agent.social
  // plus wrapped shapes: { edges|links|byId: { ... } }
  const rels = agent?.relationships || agent?.relations || agent?.social || null;
  const o = asObj(rels);
  if (!o) return null;
  const inner = asObj((o as any).edges) || asObj((o as any).links) || asObj((o as any).byId);
  return (inner || o) as Record<string, any>;
}

function inferTagsFromLegacy(src: any): RelationTag[] {
  const tags: RelationTag[] = [];
  const raw = (src?.tags || src?.kinds || src?.kind || src?.role || []) as any;
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const tVal of arr) {
    const t = String(tVal || '').toLowerCase();
    if (!t) continue;
    if (t.includes('friend')) tags.push('friend');
    if (t.includes('ally')) tags.push('ally');
    if (t.includes('lover')) tags.push('lover');
    if (t.includes('family') || t.includes('kin')) tags.push('family');
    if (t.includes('enemy')) tags.push('enemy');
    if (t.includes('rival')) tags.push('rival');
    if (t.includes('mentor')) tags.push('mentor');
    if (t.includes('student') || t.includes('protege')) tags.push('protege');
    if (t.includes('subordinate')) tags.push('subordinate');
    if (t.includes('superior')) tags.push('superior');
    if (t.includes('oath')) tags.push('oathbound');
    if (t.includes('protected')) tags.push('protected');
    if (t.includes('protector') || t.includes('caretaker')) tags.push('protector');
  }
  return uniq(tags);
}

function legacyEdgeStrength(src: any): number {
  // Strength is a single coarse number for graph prioritization;
  // use max of available relationship scalars.
  const closeness = typeof src?.closeness === 'number' ? src.closeness
    : (typeof src?.bond === 'number' ? src.bond : 0);
  const loyalty = typeof src?.loyalty === 'number' ? src.loyalty
    : (typeof src?.trust === 'number' ? src.trust * 0.8 : 0);
  const hostility = typeof src?.hostility === 'number' ? src.hostility
    : (typeof src?.conflict === 'number' ? src.conflict : 0);
  const dep = typeof src?.dependency === 'number' ? src.dependency : 0;
  return clamp01(Math.max(closeness || 0, loyalty || 0, hostility || 0, dep || 0, 0.25));
}

function legacyTrustPrior(src: any, tags: RelationTag[]): number | undefined {
  if (typeof src?.trustPrior === 'number') return clamp01(src.trustPrior);
  if (typeof src?.loyalty === 'number') return clamp01(src.loyalty);
  if (typeof src?.trust === 'number') return clamp01(src.trust);
  // fall back to tag inference (later pass can also fill)
  if (tags.includes('lover')) return 0.9;
  if (tags.includes('family')) return 0.85;
  if (tags.includes('friend')) return 0.8;
  if (tags.includes('ally')) return 0.7;
  if (tags.includes('mentor') || tags.includes('protege')) return 0.75;
  if (tags.includes('enemy')) return 0.1;
  if (tags.includes('rival')) return 0.35;
  return undefined;
}

function legacyThreatPrior(src: any, tags: RelationTag[]): number | undefined {
  if (typeof src?.threatPrior === 'number') return clamp01(src.threatPrior);
  if (typeof src?.hostility === 'number') return clamp01(src.hostility);
  if (typeof src?.conflict === 'number') return clamp01(src.conflict);
  if (tags.includes('enemy')) return 0.85;
  if (tags.includes('rival')) return 0.55;
  if (tags.includes('superior')) return 0.35;
  if (tags.includes('subordinate')) return 0.15;
  if (tags.includes('ally') || tags.includes('friend') || tags.includes('lover') || tags.includes('family')) return 0.1;
  return undefined;
}

function legacyRelationshipEdges(agent: any, selfId: string, tick: number): RelationshipEdge[] {
  const m = readLegacyRelationMap(agent);
  if (!m) return [];

  const out: RelationshipEdge[] = [];
  for (const otherId of Object.keys(m)) {
    if (!otherId) continue;
    if (otherId === 'graph' || otherId === 'manual' || otherId === 'edges' || otherId === 'links' || otherId === 'byId') continue;
    const src = m[otherId];
    if (!src) continue;

    const tags = inferTagsFromLegacy(src);
    out.push({
      a: selfId,
      b: String(otherId),
      tags: tags.length ? tags : ['neutral'],
      strength: legacyEdgeStrength(src),
      trustPrior: legacyTrustPrior(src, tags),
      threatPrior: legacyThreatPrior(src, tags),
      exclusivity: typeof src?.exclusivity === 'number' ? clamp01(src.exclusivity) : undefined,
      updatedAtTick: tick,
      sources: [{ kind: 'legacy_relationships', ref: 'character.relationships|relations', weight: 0.9 }],
    });
  }
  return out;
}

/**
 * Expected (loose) inputs:
 * - agent.relations.graph: RelationshipGraph (optional runtime state)
 * - agent.identity.oaths: [{ to: "<id>", type: "fealty|protect|vengeance|..." }]
 * - agent.biography.relationshipHints: [{ targetId, tag, strength }]
 * - agent.relations.manual: RelationshipEdge[]
 */
export function buildRelationshipGraphFromAgent(agent: any, tick: number): RelationshipGraph {
  const selfId = agent?.entityId || agent?.id;
  
  // If graph already exists, use it as base and then overlay oaths/bio/manual.
  // This makes events the primary process and oaths/bio act as priors/bootstraps.
  const existing = agent?.relations?.graph;
  const base: RelationshipGraph = existing?.schemaVersion ? existing : { schemaVersion: 1, edges: [] };
  
  const edges: RelationshipEdge[] = [];

  // 1) Manual edges
  const manual: RelationshipEdge[] = agent?.relations?.manual || [];
  for (const e of manual) {
    if (!e.a) e.a = selfId;
    edges.push({ ...e, updatedAtTick: tick, sources: [...(e.sources || []), { kind: 'manual' }] });
  }

  // 1.5) Legacy per-character relationship maps (THIS IS WHAT YOU WERE MISSING)
  // Without this, only agents that already have relations.graph/manual/oaths/hints show up,
  // so pairs like Assi↔Gideon disappear from the global Relations Lab.
  edges.push(...legacyRelationshipEdges(agent, selfId, tick));

  // 2) Oaths -> relation tags + priors
  const oaths = agent?.identity?.oaths || [];
  for (const o of oaths) {
    const target = o?.targetId || o?.to;
    if (!target) continue;

    // minimal mapping (expand later)
    const { tags, trustPrior, threatPrior, strength } = oathToRelation(o);
    edges.push({
      a: selfId,
      b: target,
      tags,
      strength,
      trustPrior,
      threatPrior,
      updatedAtTick: tick,
      sources: [{ kind: 'oath', ref: o?.id || o?.type || o?.key, weight: 1 }]
    });
  }

  // 3) Biography hints (if any structured hints exist, usually derived via helper)
  const hints = agent?.biography?.relationshipHints || agent?.biography?.relations || [];
  for (const h of hints) {
    const target = h?.targetId || h?.to;
    const tag = h?.tag as RelationTag | undefined;
    if (!target || !tag) continue;
    edges.push({
      a: selfId,
      b: target,
      tags: [tag],
      strength: clamp01(h?.strength ?? 0.6),
      trustPrior: h?.trustPrior,
      threatPrior: h?.threatPrior,
      exclusivity: h?.exclusivity,
      updatedAtTick: tick,
      sources: [{ kind: 'bio', ref: h?.ref || tag, weight: h?.strength ?? 0.6 }]
    });
  }

  const merged = mergeEdges(base.edges, edges);

  // Normalize priors if absent: infer from tags
  const normalized = merged.map(e => ({
    ...e,
    strength: clamp01(e.strength ?? 0),
    trustPrior: e.trustPrior ?? inferTrustPrior(e.tags),
    threatPrior: e.threatPrior ?? inferThreatPrior(e.tags),
  }));

  return { schemaVersion: 1, edges: normalized };
}

function oathToRelation(o: any): { tags: RelationTag[]; trustPrior?: number; threatPrior?: number; strength: number } {
  const t = String(o?.type || o?.key || '').toLowerCase();
  if (t.includes('fealty') || t.includes('serve') || t.includes('liege')) {
    return { tags: ['subordinate'], trustPrior: 0.75, threatPrior: 0.05, strength: 0.8 };
  }
  if (t.includes('protect') || t.includes('guard')) {
    return { tags: ['ally'], trustPrior: 0.7, threatPrior: 0.1, strength: 0.75 };
  }
  if (t.includes('vengeance') || t.includes('kill') || t.includes('hate')) {
    return { tags: ['enemy'], trustPrior: 0.05, threatPrior: 0.85, strength: 0.85 };
  }
  return { tags: ['neutral'], trustPrior: 0.5, threatPrior: 0.3, strength: 0.5 };
}

function inferTrustPrior(tags: RelationTag[]) {
  if (tags.includes('lover')) return 0.9;
  if (tags.includes('family')) return 0.85;
  if (tags.includes('friend')) return 0.8;
  if (tags.includes('ally')) return 0.7;
  if (tags.includes('mentor') || tags.includes('protege')) return 0.75;
  if (tags.includes('enemy')) return 0.1;
  if (tags.includes('rival')) return 0.35;
  return 0.5;
}

function inferThreatPrior(tags: RelationTag[]) {
  if (tags.includes('enemy')) return 0.85;
  if (tags.includes('rival')) return 0.55;
  if (tags.includes('superior')) return 0.35; // authority pressure
  if (tags.includes('subordinate')) return 0.15;
  if (tags.includes('ally') || tags.includes('friend') || tags.includes('lover') || tags.includes('family')) return 0.1;
  return 0.3;
}
