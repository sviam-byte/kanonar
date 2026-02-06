
// lib/context/v2/infer.ts

import { AtomNamespace, AtomOrigin, ContextAtom, ContextSource } from './types';
import { matchAtomSpec } from '../catalog/atomCatalog';
import { resolveAtomSpec } from '../catalog/atomSpecs';

let __inferAtomCounter = 0;

function codeFromResolvedSpec(specId: string, params: Record<string, string>): string {
  // “кварк” = стабильный код смысла (не уникальный), удобный для законов/молекул позже
  switch (specId) {
    case 'world.tick':
      return 'world.tick';
    case 'world.location.ref':
      return 'world.location';
    case 'ctx.axis':
      return `ctx.axis.${params.axis}`;
    case 'ctx.source':
      return `ctx.src.${params.name}`;
    case 'ctx.source.scoped':
      return `ctx.src.${params.group}.${params.name}`;
    case 'world.loc.metric':
      return `world.loc.${params.metric}`;
    case 'world.map.metric':
      return `world.map.${params.metric}`;
    case 'world.map.hazardMax':
      return `world.map.hazardMax`;
    case 'world.env.hazard':
      return 'world.env.hazard';
    case 'tom.dyad.threat':
      return 'tom.dyad.threat';
    case 'tom.dyad.metric':
      return `tom.dyad.${params.metric}`;
    case 'tom.effective.dyad.metric':
      return `tom.effective.dyad.${params.metric}`;
    case 'rel.tag':
      return 'rel.tag';
    case 'rel.base.metric':
      return `rel.base.${params.metric}`;
    case 'rel.state.metric':
      return `rel.state.${params.metric}`;
    case 'rel.prior.metric':
      return `rel.prior.${params.metric}`;
    case 'rel.label':
      return 'rel.label';
    case 'cap.metric':
      return `cap.${params.key}`;
    case 'feat.metric':
      return `feat.${params.scope}.${params.key}`;
    case 'obs.nearby':
      return 'obs.nearby';
    case 'obs.generic':
      return `obs.${params.channel}`;
    // appraisals/emotions (canonical)
    case 'appraisal.metric':
      return `app.${params.key}`;
    case 'emotion.core':
      return `emo.${params.key}`;
    case 'emotion.axis':
      return `emo.${params.key}`;
    case 'emotion.axis.valence':
      return `emo.valence`;
    case 'emotion.dyad':
      return `emo.dyad.${params.key}`;
    // mind/lens/trace
    case 'mind.metric':
      return `mind.metric.${params.key}`;
    case 'lens.suspicion':
      return `lens.suspicion`;
    case 'trace.metric':
      return `trace.${params.key}`;
    // legacy fallback (old snapshots)
    case 'app.generic':
      return `app.${params.channel}`;
    case 'emo.generic':
      return `emo.${params.channel}`;
    default:
      // tom.dyad.* / threat.* / emotion.* etc: specId уже достаточно “кварковый”
      return specId;
  }
}

function fallbackCodeFromId(ns: AtomNamespace, kind: string, id: string): string {
  const parts = id.split(':');
  if (parts[0] === 'world' && parts[1] === 'loc' && parts[2]) return `world.loc.${parts[2]}`;
  if (parts[0] === 'world' && parts[1] === 'map' && parts[2]) return `world.map.${parts[2]}`;
  if (parts[0] === 'ctx' && parts[1]) return `ctx.${parts[1]}`;
  if (parts[0] === 'obs' && parts[1]) return `obs.${parts[1]}`;
  if (parts[0] === 'emo' && parts[1]) return `emo.${parts[1]}`;
  if (parts[0] === 'app' && parts[1]) return `app.${parts[1]}`;
  if (parts[0] === 'mind' && parts[1]) return `mind.${parts[1]}`;
  if (parts[0] === 'tom' && parts[1]) return `tom.${parts[1]}`;
  return `${ns}.${kind || 'atom'}`;
}

export function inferAtomNamespace(atom: Pick<ContextAtom, 'kind' | 'id' | 'source' | 'tags'>): AtomNamespace {
  const m = matchAtomSpec(atom as any);
  if (m?.spec?.ns) return m.spec.ns;

  const k = atom.kind;
  const id = atom.id || '';
  const s = atom.source;
  const tags = atom.tags || [];

  if (tags.includes('obs')) return 'obs';
  if (tags.includes('social')) return 'soc';
  if (tags.includes('map')) return 'map';
  if (tags.includes('scene')) return 'scene';
  if (tags.includes('norm')) return 'norm';
  if (tags.includes('tom')) return 'tom';
  if (tags.includes('rel')) return 'rel'; // Check for rel tag
  if (tags.includes('threat')) return 'threat';
  if (tags.includes('affect') || tags.includes('emo')) return 'emo';
  if (tags.includes('goal')) return 'goal';
  if (tags.includes('util')) return 'util';

  if (k.startsWith('tom_') || k === 'tom_belief') return 'tom';
  if (k.startsWith('rel_') || k === 'relationship_label') return 'rel';
  if (k.startsWith('afford_')) return 'aff';
  if (k.startsWith('proximity_') || k.startsWith('soc_')) return 'soc';
  if (k.startsWith('nav_') || k.startsWith('cell_') || k.startsWith('map_') || k.startsWith('hazard_')) return 'map';
  if (k.startsWith('env_') || k.startsWith('loc_') || k === 'location' || k === 'location_tag') return 'scene';
  if (k.startsWith('self_') || k.startsWith('body_')) return 'self';
  if (k === 'emotion' || k === 'affect') return 'emo';
  if (k === 'threat' || k.startsWith('threat_') || k === 'enemy_threat') return 'threat';

  if (id.startsWith('manual:') || s === 'manual') return 'misc';
  if (id.startsWith('emotion:')) return 'emo';
  if (id.startsWith('target_presence:')) return 'obs';
  if (id.startsWith('ctx:')) return 'ctx';
  if (id.startsWith('util:')) return 'util';
  if (id.startsWith('rel:')) return 'rel';
  if (id.startsWith('prox:')) return 'soc';
  if (id.startsWith('cap:')) return 'cap';
  if (id.startsWith('access:')) return 'access';
  if (id.startsWith('con:')) return 'con';
  if (id.startsWith('off:')) return 'off';
  if (id.startsWith('cost:')) return 'cost';
  if (id.startsWith('feat:')) return 'feat';

  if (s === 'map') return 'map';
  if (s === 'where') return 'scene';
  if (s === 'who') return 'obs';
  if (s === 'proximity' || s === 'social_proximity' || s === 'socialProximity' || s === 'social') return 'soc';
  if (s === 'event' || s === 'timeline' || s === 'timeline_process') return 'scene';
  if (s === 'tom') return 'tom';
  if (s === 'body') return 'self';
  if (s === 'relations') return 'rel'; // Source relations maps to rel namespace
  if (s === 'derived' || s === 'threat') return 'ctx';

  return 'misc';
}

export function inferAtomOrigin(source: ContextSource, id: string): AtomOrigin {
  // catalog origin is optional but if present - take it
  const m = matchAtomSpec({ id, kind: '' as any, tags: [] as any, ns: undefined } as any);
  if (m?.spec?.defaultOrigin) return m.spec.defaultOrigin;

  if (id.startsWith('manual:') || source === 'manual') return 'override';
  if (source === 'body') return 'self';
  if (source === 'tom' || source === 'history' || source === 'life') return 'profile';
  if (source === 'event' || source === 'timeline' || source === 'timeline_process') return 'scene';
  if (source === 'map' || source === 'where' || source === 'location' || source === 'location_base' || source === 'location_scenario') return 'world';
  if (source === 'who' || source === 'what' || source === 'proximity' || source === 'social_proximity' || source === 'target') return 'obs';
  if (source === 'derived' || source === 'threat' || source === 'social' || source === 'why' || source === 'how') return 'derived';
  if (source === 'relations') return 'memory'; // Relations come from memory
  return 'world';
}

export function normalizeAtom<T extends ContextAtom>(atom: T): T;
export function normalizeAtom(atom: Partial<ContextAtom>): ContextAtom;
export function normalizeAtom(atom: Partial<ContextAtom>): ContextAtom {
  // Normalize minimal shape for callers that pass partial atoms.
  const seedId = atom.id ?? `atom:${(__inferAtomCounter++).toString(36)}`;
  const seedSource = atom.source ?? 'event';
  const seedKind = atom.kind ?? 'ctx';
  const seedMag = typeof atom.magnitude === 'number' ? atom.magnitude : 1;
  const seedConf = typeof atom.confidence === 'number' ? atom.confidence : 0.5;

  const ns = atom.ns ?? inferAtomNamespace({ ...atom, id: String(seedId), kind: seedKind, source: seedSource });
  const origin = atom.origin ?? inferAtomOrigin(seedSource, String(seedId));
  const out: any = {
    ...atom,
    id: String(seedId),
    source: seedSource,
    kind: seedKind,
    magnitude: seedMag,
    confidence: seedConf,
    ns,
    origin,
  };
  const id = String(out.id || '');

  // ---- AtomSpec resolve -> quark codex fields ----
  // Единственный источник правды: atomSpecs.ts (через resolveAtomSpec)
  const resolved = resolveAtomSpec(id);
  if (resolved) {
    out.specId = out.specId ?? resolved.spec.specId;
    out.params = out.params ?? resolved.params;
    out.code = out.code ?? codeFromResolvedSpec(resolved.spec.specId, resolved.params);
  }
  if (!out.code) {
    out.code = fallbackCodeFromId(ns, String(out.kind || ''), id);
  }

  // Ensure trace exists with sensible defaults (prevents “empty air” in Debug Area)
  if (!out.trace) {
    out.trace = {
      usedAtomIds: [],
      notes: ['trace:auto (missing in producer)'],
      parts: {},
    };
  } else {
    if (!Array.isArray(out.trace.usedAtomIds)) out.trace.usedAtomIds = [];
    if (!Array.isArray(out.trace.notes)) out.trace.notes = [];
    if (!out.trace.parts || typeof out.trace.parts !== 'object') out.trace.parts = {};
  }

  // Heuristic: infer subject from the trailing segment of the id if not provided
  if (!out.subject && id.split(':').length >= 2) {
    const tail = id.split(':')[id.split(':').length - 1];
    if (tail && tail.length >= 3) out.subject = out.subject || tail;
  }

  return out as ContextAtom;
}
