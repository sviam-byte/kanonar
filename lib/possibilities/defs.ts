import { Possibility, PossibilityDef } from './catalog';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs.filter(Boolean)));
}

// Extract otherIds from rel:state:self:other:* atoms.
function inferOtherIds(selfId: string, atoms: any[]): string[] {
  const out: string[] = [];
  const prefix = `rel:state:${selfId}:`;
  for (const a of arr<any>(atoms)) {
    const id = String(a?.id || '');
    if (!id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length); // other:metric
    const other = rest.split(':')[0];
    if (other && other !== selfId) out.push(other);
  }
  return uniq(out);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: any[], id: string, fb = 0): number {
  const a = arr<any>(atoms).find(x => x?.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function getPrior(atoms: any[], selfId: string, otherId: string, act: string, fb = 0.35): { id: string | null; v: number } {
  const id = `act:prior:${selfId}:${otherId}:${act}`;
  const a = arr<any>(atoms).find(x => x?.id === id);
  const v = (typeof a?.magnitude === 'number' && Number.isFinite(a.magnitude)) ? a.magnitude : fb;
  return { id: a ? id : null, v: clamp01(v) };
}

function mk(p: Possibility): Possibility {
  return {
    ...p,
    magnitude: clamp01(p.magnitude),
    confidence: clamp01(p.confidence),
    trace: p.trace ? { usedAtomIds: uniq(p.trace.usedAtomIds || []), notes: p.trace.notes, parts: p.trace.parts } : undefined,
    blockedBy: uniq(p.blockedBy || []),
    requires: uniq(p.requires || []),
  };
}

function proto(helpers: any, key: string): string | null {
  return helpers.findPrefix(`con:protocol:${key}`)[0]?.id || null;
}

export const DEFAULT_POSSIBILITY_DEFS: PossibilityDef[] = [
  // --- HIDE ---
  {
    key: 'hide',
    kind: 'aff',
    label: 'Hide (use cover)',
    build: ({ selfId, helpers }) => {
      const coverAtom =
        helpers.findPrefix(`world:map:cover:${selfId}`)[0]?.id ||
        helpers.findPrefix(`map:cover:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:cover:${selfId}`)[0]?.id;

      const cover = coverAtom ? helpers.get(coverAtom, 0) : 0;
      if (cover < 0.05) return null;

      const visibilityAtom =
        helpers.findPrefix(`world:loc:visibility:${selfId}`)[0]?.id ||
        helpers.findPrefix(`world:map:visibility:${selfId}`)[0]?.id ||
        helpers.findPrefix(`env_visibility`)[0]?.id;

      const vis = visibilityAtom ? helpers.get(visibilityAtom, 0.5) : 0.5;
      const magnitude = helpers.clamp01(0.7 * cover + 0.3 * (1 - vis));

      return mk({
        id: `aff:hide:${selfId}`,
        kind: 'aff',
        label: 'Hide',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        requires: [coverAtom || 'world:map:cover:*'],
        trace: { usedAtomIds: [coverAtom, visibilityAtom].filter(Boolean) as any, notes: ['cover->hide'] }
      });
    }
  },

  // --- ESCAPE ---
  {
    key: 'escape',
    kind: 'exit',
    label: 'Escape',
    build: ({ selfId, helpers }) => {
      const exitsAtom =
        helpers.findPrefix(`world:map:exits:${selfId}`)[0]?.id ||
        helpers.findPrefix(`nav_exits_count`)[0]?.id;

      const escapeAtom =
        helpers.findPrefix(`world:map:escape:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:escape`)[0]?.id;

      const exits = exitsAtom ? helpers.get(exitsAtom, 0) : 0;
      const esc = escapeAtom ? helpers.get(escapeAtom, 0) : 0;
      if (exits < 0.05 && esc < 0.05) return null;

      const magnitude = helpers.clamp01(0.5 * exits + 0.5 * esc);
      return mk({
        id: `exit:escape:${selfId}`,
        kind: 'exit',
        label: 'Escape',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        requires: [exitsAtom, escapeAtom].filter(Boolean) as any,
        trace: { usedAtomIds: [exitsAtom, escapeAtom].filter(Boolean) as any, notes: ['exits+escape'] }
      });
    }
  },

  // --- SELF-TALK ---
  {
    key: 'self_talk',
    kind: 'cog',
    label: 'Self-talk / rehearse plan',
    build: ({ selfId, helpers }) => {
      const uncAtom = helpers.findPrefix(`ctx:uncertainty:${selfId}`)[0]?.id;
      const privacyAtom =
        helpers.findPrefix(`world:loc:privacy:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:privacy:${selfId}`)[0]?.id;

      const uncertainty = uncAtom ? helpers.get(uncAtom, 0) : 0;
      const privacy = privacyAtom ? helpers.get(privacyAtom, 0) : 0;

      const magnitude = helpers.clamp01(0.75 * uncertainty + 0.25 * privacy);
      if (magnitude < 0.15) return null;

      return mk({
        id: `cog:monologue:${selfId}`,
        kind: 'cog',
        label: 'Self-talk / rehearse plan',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        requires: [uncAtom, privacyAtom].filter(Boolean) as any,
        trace: { usedAtomIds: [uncAtom, privacyAtom].filter(Boolean) as any, notes: ['uncertainty+privacy => monologue'] }
      });
    }
  },

  // --- ATTACK (gated later) ---
  {
    key: 'attack',
    kind: 'aff',
    label: 'Attack (generic)',
    build: ({ selfId, helpers }) => {
      const noViolence = proto(helpers, 'noViolence');
      const taboo = helpers.findPrefix(`con:rel:taboo:attack:${selfId}:`);
      const blockedBy: string[] = [];
      if (noViolence) blockedBy.push(noViolence);
      for (const t of taboo) blockedBy.push(t.id);

      return mk({
        id: `aff:attack:${selfId}`,
        kind: 'aff',
        label: 'Attack',
        magnitude: 1,
        confidence: 1,
        subjectId: selfId,
        blockedBy,
        trace: { usedAtomIds: blockedBy, notes: ['attack base possibility; gating later'] }
      });
    }
  },

  // =========================
  // SOCIAL / TARGETED ACTIONS
  // =========================

  {
    key: 'talk',
    kind: 'aff',
    label: 'Talk',
    build: ({ selfId, atoms, helpers }) => {
      const noTalk = proto(helpers, 'noTalk');
      const others = inferOtherIds(selfId, atoms);
      if (others.length === 0) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'ask_info', 0.35);
        const trust = getMag(atoms, `rel:state:${selfId}:${otherId}:trust`, 0.5);
        const magnitude = clamp01(0.55 * v + 0.45 * trust);
        const used = uniq([pId || '', `rel:state:${selfId}:${otherId}:trust`].filter(id => atoms.some(a => a?.id === id)));

        return mk({
          id: `aff:talk:${selfId}:${otherId}`,
          kind: 'aff',
          label: 'Talk',
          magnitude,
          confidence: 1,
          subjectId: selfId,
          targetId: otherId,
          blockedBy: noTalk ? [noTalk] : undefined,
          trace: { usedAtomIds: used, notes: ['prior.ask_info + rel.trust => talk'], parts: { prior: v, trust } }
        });
      });
    }
  },

  {
    key: 'ask_info',
    kind: 'aff',
    label: 'Ask for information',
    build: ({ selfId, atoms, helpers }) => {
      const noQuestions = proto(helpers, 'noQuestions');
      const others = inferOtherIds(selfId, atoms);
      if (others.length === 0) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'ask_info', 0.4);
        const magnitude = v;
        const used = uniq([pId || ''].filter(id => atoms.some(a => a?.id === id)));

        return mk({
          id: `aff:ask_info:${selfId}:${otherId}`,
          kind: 'aff',
          label: 'Ask for information',
          magnitude,
          confidence: 1,
          subjectId: selfId,
          targetId: otherId,
          blockedBy: noQuestions ? [noQuestions] : undefined,
          trace: { usedAtomIds: used, notes: ['act prior => ask'], parts: { prior: v } }
        });
      });
    }
  },

  {
    key: 'comfort',
    kind: 'aff',
    label: 'Comfort / reassure',
    build: ({ selfId, atoms, helpers }) => {
      const noTouch = proto(helpers, 'noTouch');
      const others = inferOtherIds(selfId, atoms);
      if (others.length === 0) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'help', 0.35);
        const clos = getMag(atoms, `rel:state:${selfId}:${otherId}:closeness`, 0.2);
        const magnitude = clamp01(0.60 * v + 0.40 * clos);
        const used = uniq([pId || '', `rel:state:${selfId}:${otherId}:closeness`].filter(id => atoms.some(a => a?.id === id)));

        return mk({
          id: `aff:comfort:${selfId}:${otherId}`,
          kind: 'aff',
          label: 'Comfort',
          magnitude,
          confidence: 1,
          subjectId: selfId,
          targetId: otherId,
          blockedBy: noTouch ? [noTouch] : undefined,
          trace: { usedAtomIds: used, notes: ['prior.help + rel.closeness => comfort'], parts: { priorHelp: v, clos } }
        });
      });
    }
  },

  {
    key: 'help',
    kind: 'aff',
    label: 'Help / assist',
    build: ({ selfId, atoms }) => {
      const others = inferOtherIds(selfId, atoms);
      if (others.length === 0) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'help', 0.35);
        const oblig = getMag(atoms, `rel:state:${selfId}:${otherId}:obligation`, 0.0);
        const magnitude = clamp01(0.70 * v + 0.30 * oblig);
        const used = uniq([pId || '', `rel:state:${selfId}:${otherId}:obligation`].filter(id => atoms.some(a => a?.id === id)));

        return mk({
          id: `aff:help:${selfId}:${otherId}`,
          kind: 'aff',
          label: 'Help',
          magnitude,
          confidence: 1,
          subjectId: selfId,
          targetId: otherId,
          trace: { usedAtomIds: used, notes: ['prior.help + rel.obligation => help'], parts: { priorHelp: v, oblig } }
        });
      });
    }
  },

  {
    key: 'threaten',
    kind: 'aff',
    label: 'Threaten / intimidate',
    build: ({ selfId, atoms, helpers }) => {
      const noThreats = proto(helpers, 'noThreats');
      const others = inferOtherIds(selfId, atoms);
      if (others.length === 0) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'confront', 0.25);
        const host = getMag(atoms, `rel:state:${selfId}:${otherId}:hostility`, 0.0);
        const magnitude = clamp01(0.65 * v + 0.35 * host);
        const used = uniq([pId || '', `rel:state:${selfId}:${otherId}:hostility`].filter(id => atoms.some(a => a?.id === id)));

        return mk({
          id: `aff:threaten:${selfId}:${otherId}`,
          kind: 'aff',
          label: 'Threaten',
          magnitude,
          confidence: 1,
          subjectId: selfId,
          targetId: otherId,
          blockedBy: noThreats ? [noThreats] : undefined,
          trace: { usedAtomIds: used, notes: ['prior.confront + rel.hostility => threaten'], parts: { priorConfront: v, host } }
        });
      });
    }
  },

  {
    key: 'avoid',
    kind: 'aff',
    label: 'Avoid / disengage',
    build: ({ selfId, atoms }) => {
      const others = inferOtherIds(selfId, atoms);
      if (others.length === 0) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'avoid', 0.25);
        return mk({
          id: `aff:avoid:${selfId}:${otherId}`,
          kind: 'aff',
          label: 'Avoid',
          magnitude: v,
          confidence: 1,
          subjectId: selfId,
          targetId: otherId,
          trace: { usedAtomIds: uniq([pId || ''].filter(id => atoms.some(a => a?.id === id))), notes: ['act prior => avoid'], parts: { prior: v } }
        });
      });
    }
  },

  // --- OFFER: HELP (scene injected) ---
  {
    key: 'help_offer',
    kind: 'off',
    label: 'Offer: help available',
    build: ({ selfId, helpers }) => {
      const off = helpers.findPrefix('off:');
      const help = off.find((a: any) => String(a.id).includes(':help'))?.id;
      if (!help) return null;

      const magnitude = helpers.get(help, 1);
      return mk({
        id: help,
        kind: 'off',
        label: 'Help offer',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        trace: { usedAtomIds: [], notes: ['from scene/offers'], parts: { offerAtomId: help } }
      });
    }
  }
];
