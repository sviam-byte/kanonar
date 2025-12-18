
// lib/context/v2/infer.ts

import { AtomNamespace, AtomOrigin, ContextAtom, ContextSource } from './types';
import { matchAtomSpec } from '../catalog/atomCatalog';

export function inferAtomNamespace(atom: Pick<ContextAtom, 'kind' | 'id' | 'source' | 'tags'>): AtomNamespace {
  const m = matchAtomSpec(atom as any);
  if (m?.spec?.ns) return m.spec.ns;

  const k = atom.kind;
  const id = atom.id || '';
  const s = atom.source;
  const tags = atom.tags || [];

  if (tags.includes('obs')) return 'obs';
  if (tags.includes('map')) return 'map';
  if (tags.includes('scene')) return 'scene';
  if (tags.includes('norm')) return 'norm';
  if (tags.includes('tom')) return 'tom';
  if (tags.includes('rel')) return 'rel'; // Check for rel tag
  if (tags.includes('threat')) return 'threat';
  if (tags.includes('affect') || tags.includes('emo')) return 'emo';
  if (tags.includes('goal')) return 'goal';

  if (k.startsWith('tom_') || k === 'tom_belief') return 'tom';
  if (k.startsWith('rel_') || k === 'relationship_label') return 'rel';
  if (k.startsWith('afford_')) return 'aff';
  if (k.startsWith('nav_') || k.startsWith('cell_') || k.startsWith('map_') || k.startsWith('hazard_')) return 'map';
  if (k.startsWith('env_') || k.startsWith('soc_') || k.startsWith('loc_') || k === 'location' || k === 'location_tag') return 'scene';
  if (k.startsWith('self_') || k.startsWith('body_')) return 'self';
  if (k === 'emotion' || k === 'affect') return 'emo';
  if (k === 'threat' || k.startsWith('threat_') || k === 'enemy_threat') return 'threat';

  if (id.startsWith('manual:') || s === 'manual') return 'misc';
  if (id.startsWith('emotion:')) return 'emo';
  if (id.startsWith('target_presence:')) return 'obs';
  if (id.startsWith('ctx:')) return 'ctx';
  if (id.startsWith('rel:')) return 'rel';

  if (s === 'map') return 'map';
  if (s === 'where') return 'scene';
  if (s === 'who' || s === 'proximity' || s === 'social_proximity') return 'obs';
  if (s === 'event' || s === 'timeline' || s === 'timeline_process') return 'scene';
  if (s === 'tom') return 'tom';
  if (s === 'body') return 'self';
  if (s === 'relations') return 'rel'; // Source relations maps to rel namespace
  if (s === 'derived' || s === 'threat' || s === 'social') return 'ctx';

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

export function normalizeAtom<T extends ContextAtom>(atom: T): T {
  const ns = atom.ns ?? inferAtomNamespace(atom);
  const origin = atom.origin ?? inferAtomOrigin(atom.source, atom.id);
  return { ...atom, ns, origin };
}
