
import { RelationEdge, RelationMemory, RelationTag } from './types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function ensureEdge(mem: RelationMemory, otherId: string): RelationEdge {
  mem.edges = mem.edges || {};
  if (!mem.edges[otherId]) {
    mem.edges[otherId] = {
      otherId,
      closeness: 0.1,
      loyalty: 0.1,
      hostility: 0.0,
      dependency: 0.05,
      authority: 0.50,
      tags: [],
      sources: []
    };
  }
  return mem.edges[otherId];
}

function addTag(edge: RelationEdge, t: RelationTag) {
  if (!edge.tags.includes(t)) edge.tags.push(t);
}

export function extractRelBaseFromCharacter(args: {
  selfId: string;
  character: any;
  tick?: number;
}): RelationMemory {
  const mem: RelationMemory = { schemaVersion: 1, edges: {} };
  const c = args.character || {};
  const tick = args.tick ?? 0;

  // 1) explicit relationship block if exists (legacy Relationship objects)
  const rels = c.relationships || c.relations || c.social || {};
  // Handle if rels is the map directly or wrapped
  const explicit = (rels.edges || rels.links || rels.byId) ? (rels.edges || rels.links || rels.byId) : rels;

  if (explicit && typeof explicit === 'object') {
    for (const otherId of Object.keys(explicit)) {
      // skip internal keys if any
      if (otherId === 'graph') continue;
      
      const src = explicit[otherId];
      if (!src) continue;
      
      const e = ensureEdge(mem, otherId);

      // Direct mapping
      if (typeof src.closeness === 'number') e.closeness = clamp01(src.closeness);
      else if (typeof src.bond === 'number') e.closeness = clamp01(src.bond);

      if (typeof src.loyalty === 'number') e.loyalty = clamp01(src.loyalty);
      else if (typeof src.trust === 'number') e.loyalty = clamp01(src.trust * 0.8); // Trust is a proxy

      if (typeof src.hostility === 'number') e.hostility = clamp01(src.hostility);
      else if (typeof src.conflict === 'number') e.hostility = clamp01(src.conflict);

      if (typeof src.dependency === 'number') e.dependency = clamp01(src.dependency);
      
      if (typeof src.authority === 'number') e.authority = clamp01(src.authority);
      else if (typeof src.respect === 'number') e.authority = clamp01(src.respect * 0.6); // Respect as proxy for authority

      // Map legacy/string tags
      const rawTags: any[] = src.tags || src.kinds || [];
      for (const tVal of rawTags) {
          const t = String(tVal).toLowerCase();
          if (t === 'friend') addTag(e, 'friend');
          if (t === 'ally') addTag(e, 'ally');
          if (t === 'lover') addTag(e, 'lover');
          if (t === 'family') addTag(e, 'family');
          if (t === 'enemy') addTag(e, 'enemy');
          if (t === 'rival') addTag(e, 'rival');
          if (t === 'mentor') addTag(e, 'mentor');
          if (t === 'student') addTag(e, 'student');
          if (t === 'subordinate') addTag(e, 'subordinate');
          if (t === 'superior') addTag(e, 'superior');
          if (t === 'oathbound') addTag(e, 'oathbound');
          if (t === 'protected') addTag(e, 'protected');
          if (t === 'protector') addTag(e, 'protector');
      }

      e.sources.push({ type: 'biography', ref: 'relationships', weight: 1 });
      e.lastUpdatedTick = tick;
    }
  }

  // 2) oaths / commitments (directional)
  const oaths = c.oaths || c.identity?.oaths || c.commitments || [];
  if (Array.isArray(oaths)) {
    for (const o of oaths) {
      const to = o?.to || o?.targetId || o?.beneficiaryId;
      if (!to) continue;
      const otherId = String(to);
      const e = ensureEdge(mem, otherId);

      addTag(e, 'oathbound');
      // oath usually increases loyalty + dependency, reduces hostility
      e.loyalty = clamp01(Math.max(e.loyalty, 0.7));
      e.dependency = clamp01(Math.max(e.dependency, 0.4));
      e.hostility = clamp01(Math.min(e.hostility, 0.1));

      // authority if oath is "I obey"
      const text = String(o?.type || o?.kind || o?.description || o?.key || '').toLowerCase();
      if (text.includes('obey') || text.includes('serve') || text.includes('vow') || text.includes('lord')) {
        e.authority = clamp01(Math.max(e.authority, 0.6));
        addTag(e, 'superior'); // they are superior relative to me
        // I am subordinate
      }
      
      if (text.includes('protect')) {
          addTag(e, 'protected');
      }

      e.sources.push({ type: 'oath', ref: o?.id || o?.type || 'oath', weight: 1 });
      e.lastUpdatedTick = tick;
    }
  }

  // 3) biography hints (structured, not NLP)
  const bio = c.biography || c.bio || null;
  if (bio && typeof bio === 'object') {
    const bonds = bio.bonds || bio.importantPeople || bio.relationships || [];
    if (Array.isArray(bonds)) {
      for (const b of bonds) {
        const otherId = b?.id || b?.entityId || b?.targetId;
        if (!otherId) continue;
        const e = ensureEdge(mem, String(otherId));

        const kind = String(b?.kind || b?.type || '').toLowerCase();
        if (kind.includes('friend')) addTag(e, 'friend');
        if (kind.includes('lover')) addTag(e, 'lover');
        if (kind.includes('enemy')) addTag(e, 'enemy');
        if (kind.includes('ally')) addTag(e, 'ally');
        if (kind.includes('family')) addTag(e, 'family');

        if (typeof b?.closeness === 'number') e.closeness = clamp01(Math.max(e.closeness, b.closeness));
        if (typeof b?.loyalty === 'number') e.loyalty = clamp01(Math.max(e.loyalty, b.loyalty));
        if (typeof b?.hostility === 'number') e.hostility = clamp01(Math.max(e.hostility, b.hostility));

        e.sources.push({ type: 'biography', ref: b?.ref || b?.kind || 'bio_bond', weight: 0.8 });
        e.lastUpdatedTick = tick;
      }
    }
  }

  // 4) Roles → relationship priors
  const roles = c.roles || {};
  const roleRels = Array.isArray(roles.relations) ? roles.relations : [];
  for (const rr of roleRels) {
    const otherId = rr?.other_id || rr?.otherId || rr?.targetId;
    if (!otherId) continue;
    const role = String(rr?.role || rr?.kind || '').toLowerCase();
    const e = ensureEdge(mem, String(otherId));
    switch (role) {
      case 'ward_of':
        addTag(e, 'protected');
        addTag(e, 'subordinate');
        e.closeness = clamp01(Math.max(e.closeness, 0.30));
        e.loyalty = clamp01(Math.max(e.loyalty, 0.60));
        e.dependency = clamp01(Math.max(e.dependency, 0.55));
        e.authority = clamp01(Math.max(e.authority, 0.85));
        e.hostility = clamp01(Math.min(e.hostility, 0.10));
        break;
      case 'caretaker_of':
      case 'protector_of':
        addTag(e, 'protector');
        e.authority = clamp01(Math.min(e.authority, 0.25));
        e.closeness = clamp01(Math.max(e.closeness, 0.25));
        e.loyalty = clamp01(Math.max(e.loyalty, 0.45));
        e.dependency = clamp01(Math.max(e.dependency, 0.20));
        e.hostility = clamp01(Math.min(e.hostility, 0.10));
        break;
    }
    e.sources.push({ type: 'biography', ref: 'roles.relations', weight: 0.7 });
  }

  return mem;
}
