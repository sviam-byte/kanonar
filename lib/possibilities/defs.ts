import { Possibility, PossibilityDef } from './catalog';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs.filter(Boolean)));
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

// Extract otherIds from multiple sources:
// - rel:final / rel:state / rel:base
// - rel:tag
// - obs:nearby:self:other
// - event:didTo:actor:self:kind (actorId becomes "other")
function inferOtherIds(selfId: string, atoms: any[]): string[] {
  const out: string[] = [];
  const list = arr<any>(atoms);

  const takeRel = (kind: 'final' | 'state' | 'base') => {
    const prefix = `rel:${kind}:${selfId}:`;
    for (const a of list) {
      const id = String(a?.id || '');
      if (!id.startsWith(prefix)) continue;
      const rest = id.slice(prefix.length); // other:metric
      const other = rest.split(':')[0];
      if (other && other !== selfId) out.push(other);
    }
  };

  takeRel('final');
  takeRel('state');
  takeRel('base');

  // rel:tag:self:other:tag
  {
    const prefix = `rel:tag:${selfId}:`;
    for (const a of list) {
      const id = String(a?.id || '');
      if (!id.startsWith(prefix)) continue;
      const rest = id.slice(prefix.length); // other:tag
      const other = rest.split(':')[0];
      if (other && other !== selfId) out.push(other);
    }
  }

  // obs:nearby:self:other
  {
    const prefix = `obs:nearby:${selfId}:`;
    for (const a of list) {
      const id = String(a?.id || '');
      if (!id.startsWith(prefix)) continue;
      const other = id.slice(prefix.length);
      if (other && other !== selfId) out.push(other);
    }
  }

  // event:didTo:actor:self:kind -> actor is a targetable "other"
  {
    const prefix = 'event:didTo:';
    for (const a of list) {
      const id = String(a?.id || '');
      if (!id.startsWith(prefix)) continue;
      const parts = id.split(':'); // event didTo actor self kind
      const actor = parts[2] || '';
      const target = parts[3] || '';
      if (target === selfId && actor && actor !== selfId) out.push(actor);
    }
  }

  return uniq(out);
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

// Protocols: return protocol atomId if present.
function proto(helpers: any, key: string): string | null {
  return helpers.findPrefix(`con:protocol:${key}`)[0]?.id || null;
}

function tabooPrefix(helpers: any, prefix: string): string[] {
  return helpers.findPrefix(prefix).map((a: any) => String(a?.id || '')).filter(Boolean);
}

function usedIfPresent(atoms: any[], ids: string[]): string[] {
  const set = new Set(arr<any>(atoms).map(a => String(a?.id || '')));
  return ids.filter(id => id && set.has(id));
}

function mkTargeted(
  args: {
    kind: 'aff' | 'con' | 'off' | 'exit' | 'cog';
    selfId: string;
    otherId: string;
    key: string;
    label: string;
    magnitude: number;
    blockedBy?: string[];
    requires?: string[];
    usedAtomIds?: string[];
    notes?: string[];
    parts?: any;
    meta?: any;
  }
): Possibility {
  return mk({
    id: `${args.kind}:${args.key}:${args.selfId}:${args.otherId}`,
    kind: args.kind,
    label: args.label,
    magnitude: args.magnitude,
    confidence: 1,
    subjectId: args.selfId,
    targetId: args.otherId,
    blockedBy: args.blockedBy,
    requires: args.requires,
    trace: {
      usedAtomIds: args.usedAtomIds || [],
      notes: args.notes,
      parts: args.parts
    },
    meta: args.meta
  });
}

function mkSelf(
  args: {
    kind: 'aff' | 'con' | 'off' | 'exit' | 'cog';
    selfId: string;
    key: string;
    label: string;
    magnitude: number;
    blockedBy?: string[];
    requires?: string[];
    usedAtomIds?: string[];
    notes?: string[];
    parts?: any;
    meta?: any;
  }
): Possibility {
  return mk({
    id: `${args.kind}:${args.key}:${args.selfId}`,
    kind: args.kind,
    label: args.label,
    magnitude: args.magnitude,
    confidence: 1,
    subjectId: args.selfId,
    blockedBy: args.blockedBy,
    requires: args.requires,
    trace: {
      usedAtomIds: args.usedAtomIds || [],
      notes: args.notes,
      parts: args.parts
    },
    meta: args.meta
  });
}

export const DEFAULT_POSSIBILITY_DEFS: PossibilityDef[] = [
  // -------------------
  // SELF / MOVEMENT
  // -------------------

  {
    key: 'hide',
    kind: 'aff',
    label: 'Hide (use cover)',
    build: ({ selfId, helpers, atoms }) => {
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
      const { id: pId, v: priorHide } = getPrior(atoms || [], selfId, selfId, 'hide', 0.45);
      const mag = helpers.clamp01(magnitude * (0.55 + 0.45 * priorHide));

      return mkSelf({
        kind: 'aff',
        selfId,
        key: 'hide',
        label: 'Hide',
        magnitude: mag,
        requires: [coverAtom || 'world:map:cover:*'],
        usedAtomIds: [coverAtom, visibilityAtom, pId].filter(Boolean) as any,
        notes: ['cover->hide * prior.hide(self)'],
        parts: { cover, vis, priorHide }
      });
    }
  },

  {
    key: 'escape',
    kind: 'exit',
    label: 'Escape',
    build: ({ selfId, helpers, atoms }) => {
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
      const { id: pId, v: priorEscape } = getPrior(atoms || [], selfId, selfId, 'escape', 0.45);
      // keep map affordance primary, but let desire-to-escape matter
      const mag = helpers.clamp01(magnitude * (0.55 + 0.45 * priorEscape));
      return mkSelf({
        kind: 'exit',
        selfId,
        key: 'escape',
        label: 'Escape',
        magnitude: mag,
        requires: [exitsAtom, escapeAtom].filter(Boolean) as any,
        usedAtomIds: [exitsAtom, escapeAtom, pId].filter(Boolean) as any,
        notes: ['exits+escape * prior.escape(self)'],
        parts: { exits, esc, priorEscape }
      });
    }
  },

  {
    key: 'wait',
    kind: 'cog',
    label: 'Wait / do nothing',
    build: ({ selfId, helpers, atoms }) => {
      const pressureAtom =
        helpers.findPrefix(`ctx:timePressure:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:timePressure`)[0]?.id;
      const p = pressureAtom ? helpers.get(pressureAtom, 0) : 0;
      const magnitude = clamp01(0.45 - 0.35 * p);
      if (magnitude < 0.05) return null;
      const { id: pId, v: priorWait } = getPrior(atoms || [], selfId, selfId, 'wait', 0.35);
      const mag = helpers.clamp01(magnitude * (0.65 + 0.35 * priorWait));

      return mkSelf({
        kind: 'cog',
        selfId,
        key: 'wait',
        label: 'Wait',
        magnitude: mag,
        usedAtomIds: [pressureAtom, pId].filter(Boolean) as any,
        notes: ['low timePressure => wait * prior.wait(self)'],
        parts: { timePressure: p, priorWait }
      });
    }
  },

  {
    key: 'rest',
    kind: 'aff',
    label: 'Rest / recover',
    build: ({ selfId, helpers }) => {
      const fatigueAtom =
        helpers.findPrefix(`body:fatigue:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:fatigue:${selfId}`)[0]?.id ||
        helpers.findPrefix(`fatigue`)[0]?.id;

      const threatAtom =
        helpers.findPrefix(`ctx:threat:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:threat`)[0]?.id;

      const fatigue = fatigueAtom ? helpers.get(fatigueAtom, 0) : 0;
      const threat = threatAtom ? helpers.get(threatAtom, 0) : 0;

      const magnitude = clamp01(0.8 * fatigue + 0.2 * (1 - threat));
      if (magnitude < 0.12) return null;

      return mkSelf({
        kind: 'aff',
        selfId,
        key: 'rest',
        label: 'Rest',
        magnitude,
        usedAtomIds: [fatigueAtom, threatAtom].filter(Boolean) as any,
        notes: ['fatigue(+safe) => rest'],
        parts: { fatigue, threat }
      });
    }
  },

  {
    key: 'observe_area',
    kind: 'cog',
    label: 'Observe surroundings',
    build: ({ selfId, helpers }) => {
      const uncAtom =
        helpers.findPrefix(`ctx:uncertainty:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:uncertainty`)[0]?.id;

      const unc = uncAtom ? helpers.get(uncAtom, 0) : 0;
      const magnitude = clamp01(0.15 + 0.75 * unc);
      if (magnitude < 0.12) return null;

      return mkSelf({
        kind: 'cog',
        selfId,
        key: 'observe',
        label: 'Observe',
        magnitude,
        usedAtomIds: [uncAtom].filter(Boolean) as any,
        notes: ['uncertainty => observe'],
        parts: { uncertainty: unc }
      });
    }
  },

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

      return mkSelf({
        kind: 'cog',
        selfId,
        key: 'monologue',
        label: 'Self-talk / rehearse plan',
        magnitude,
        usedAtomIds: [uncAtom, privacyAtom].filter(Boolean) as any,
        notes: ['uncertainty+privacy => monologue'],
        parts: { uncertainty, privacy }
      });
    }
  },

  // -------------------
  // HARD-GATED VIOLENCE (placeholder)
  // -------------------
  {
    key: 'attack',
    kind: 'aff',
    label: 'Attack (generic)',
    build: ({ selfId, helpers }) => {
      const noViolence = proto(helpers, 'noViolence');
      const taboo = tabooPrefix(helpers, `con:rel:taboo:attack:${selfId}:`);
      const blockedBy: string[] = [];
      if (noViolence) blockedBy.push(noViolence);
      blockedBy.push(...taboo);

      return mkSelf({
        kind: 'aff',
        selfId,
        key: 'attack',
        label: 'Attack',
        magnitude: 1,
        blockedBy,
        usedAtomIds: blockedBy,
        notes: ['attack base possibility; gating later']
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
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'ask_info', 0.35);
        const trustId = `rel:state:${selfId}:${otherId}:trust`;
        const trust = getMag(atoms, trustId, 0.5);
        const magnitude = clamp01(0.55 * v + 0.45 * trust);

        const used = uniq(usedIfPresent(atoms, [pId || '', trustId]));
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'talk',
          label: 'Talk',
          magnitude,
          blockedBy: noTalk ? [noTalk] : undefined,
          usedAtomIds: used,
          notes: ['prior.ask_info + rel.trust => talk'],
          parts: { priorAsk: v, trust }
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
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'ask_info', 0.4);
        const used = uniq(usedIfPresent(atoms, [pId || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'ask_info',
          label: 'Ask for information',
          magnitude: v,
          blockedBy: noQuestions ? [noQuestions] : undefined,
          usedAtomIds: used,
          notes: ['act prior => ask_info'],
          parts: { prior: v }
        });
      });
    }
  },

  {
    key: 'verify',
    kind: 'cog',
    label: 'Verify / fact-check',
    build: ({ selfId, atoms }) => {
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'verify', 0.25);
        return mkTargeted({
          kind: 'cog',
          selfId,
          otherId,
          key: 'verify',
          label: 'Verify / fact-check',
          magnitude: v,
          usedAtomIds: uniq(usedIfPresent(atoms, [pId || ''])),
          notes: ['act prior => verify'],
          parts: { prior: v }
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
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'comfort', 0.3);
        const closId = `rel:state:${selfId}:${otherId}:closeness`;
        const clos = getMag(atoms, closId, 0.2);
        const magnitude = clamp01(0.60 * v + 0.40 * clos);

        const used = uniq(usedIfPresent(atoms, [pId || '', closId]));
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'comfort',
          label: 'Comfort',
          magnitude,
          blockedBy: noTouch ? [noTouch] : undefined,
          usedAtomIds: used,
          notes: ['prior.comfort + rel.closeness => comfort'],
          parts: { priorComfort: v, clos }
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
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'help', 0.35);
        const oblId = `rel:state:${selfId}:${otherId}:obligation`;
        const obl = getMag(atoms, oblId, 0.0);
        const magnitude = clamp01(0.70 * v + 0.30 * obl);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'help',
          label: 'Help',
          magnitude,
          usedAtomIds: uniq(usedIfPresent(atoms, [pId || '', oblId])),
          notes: ['prior.help + rel.obligation => help'],
          parts: { priorHelp: v, obligation: obl }
        });
      });
    }
  },

  {
    key: 'share_resource',
    kind: 'aff',
    label: 'Share resources',
    build: ({ selfId, atoms, helpers }) => {
      const noShare = proto(helpers, 'noSharing');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const scarcityAtom = helpers.findPrefix(`ctx:scarcity:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:scarcity`)[0]?.id;
      const scarcity = scarcityAtom ? helpers.get(scarcityAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'share', 0.25);
        const trustId = `rel:state:${selfId}:${otherId}:trust`;
        const trust = getMag(atoms, trustId, 0.5);

        const magnitude = clamp01((0.55 * v + 0.45 * trust) * (1 - 0.6 * scarcity));
        const used = uniq(usedIfPresent(atoms, [pId || '', trustId, scarcityAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'share',
          label: 'Share resources',
          magnitude,
          blockedBy: noShare ? [noShare] : undefined,
          usedAtomIds: used,
          notes: ['prior.share + trust - scarcity => share'],
          parts: { priorShare: v, trust, scarcity }
        });
      });
    }
  },

  {
    key: 'negotiate',
    kind: 'aff',
    label: 'Negotiate',
    build: ({ selfId, atoms, helpers }) => {
      const noDeal = proto(helpers, 'noNegotiation');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const formalAtom = helpers.findPrefix(`ctx:isFormal:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:isFormal`)[0]?.id;
      const isFormal = formalAtom ? helpers.get(formalAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'negotiate', 0.35);
        const respectId = `rel:state:${selfId}:${otherId}:respect`;
        const respect = getMag(atoms, respectId, 0.0);

        const magnitude = clamp01(0.65 * v + 0.20 * respect + 0.15 * isFormal);
        const used = uniq(usedIfPresent(atoms, [pId || '', respectId, formalAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'negotiate',
          label: 'Negotiate',
          magnitude,
          blockedBy: noDeal ? [noDeal] : undefined,
          usedAtomIds: used,
          notes: ['prior.negotiate + respect + formal => negotiate'],
          parts: { prior: v, respect, isFormal }
        });
      });
    }
  },

  {
    key: 'propose_trade',
    kind: 'aff',
    label: 'Propose trade',
    build: ({ selfId, atoms, helpers }) => {
      const noDeal = proto(helpers, 'noNegotiation');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const scarcityAtom = helpers.findPrefix(`ctx:scarcity:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:scarcity`)[0]?.id;
      const scarcity = scarcityAtom ? helpers.get(scarcityAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'trade', 0.25);
        const trustId = `rel:state:${selfId}:${otherId}:trust`;
        const trust = getMag(atoms, trustId, 0.5);

        const magnitude = clamp01((0.55 * v + 0.45 * trust) * (0.6 + 0.6 * scarcity));
        const used = uniq(usedIfPresent(atoms, [pId || '', trustId, scarcityAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'trade',
          label: 'Propose trade',
          magnitude,
          blockedBy: noDeal ? [noDeal] : undefined,
          usedAtomIds: used,
          notes: ['prior.trade + trust + scarcity => trade'],
          parts: { prior: v, trust, scarcity }
        });
      });
    }
  },

  {
    key: 'apologize',
    kind: 'aff',
    label: 'Apologize',
    build: ({ selfId, atoms, helpers }) => {
      const noApology = proto(helpers, 'noApologies');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'apologize', 0.2);
        const hostId = `rel:state:${selfId}:${otherId}:hostility`;
        const host = getMag(atoms, hostId, 0);

        const magnitude = clamp01(0.55 * v + 0.45 * host);
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'apologize',
          label: 'Apologize',
          magnitude,
          blockedBy: noApology ? [noApology] : undefined,
          usedAtomIds: uniq(usedIfPresent(atoms, [pId || '', hostId])),
          notes: ['prior.apologize + hostility => apologize'],
          parts: { prior: v, hostility: host }
        });
      });
    }
  },

  {
    key: 'praise',
    kind: 'aff',
    label: 'Praise',
    build: ({ selfId, atoms, helpers }) => {
      const noPraise = proto(helpers, 'noPraise');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'praise', 0.2);
        const respectId = `rel:state:${selfId}:${otherId}:respect`;
        const respect = getMag(atoms, respectId, 0);

        const magnitude = clamp01(0.65 * v + 0.35 * respect);
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'praise',
          label: 'Praise',
          magnitude,
          blockedBy: noPraise ? [noPraise] : undefined,
          usedAtomIds: uniq(usedIfPresent(atoms, [pId || '', respectId])),
          notes: ['prior.praise + respect => praise'],
          parts: { prior: v, respect }
        });
      });
    }
  },

  {
    key: 'accuse',
    kind: 'aff',
    label: 'Accuse',
    build: ({ selfId, atoms, helpers }) => {
      const noAccuse = proto(helpers, 'noAccusations');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const evidenceAtom = helpers.findPrefix(`ctx:evidence:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:evidence`)[0]?.id;
      const evidence = evidenceAtom ? helpers.get(evidenceAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'accuse', 0.15);
        const threatId = `tom:dyad:${selfId}:${otherId}:threat`;
        const threat = getMag(atoms, threatId, getMag(atoms, `rel:state:${selfId}:${otherId}:hostility`, 0));

        const magnitude = clamp01(0.50 * v + 0.30 * threat + 0.20 * evidence);
        const used = uniq(usedIfPresent(atoms, [pId || '', threatId, evidenceAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'accuse',
          label: 'Accuse',
          magnitude,
          blockedBy: noAccuse ? [noAccuse] : undefined,
          usedAtomIds: used,
          notes: ['prior.accuse + threat + evidence => accuse'],
          parts: { prior: v, threat, evidence }
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
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'confront', 0.25);
        const hostId = `rel:state:${selfId}:${otherId}:hostility`;
        const host = getMag(atoms, hostId, 0.0);

        const magnitude = clamp01(0.65 * v + 0.35 * host);
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'threaten',
          label: 'Threaten',
          magnitude,
          blockedBy: noThreats ? [noThreats] : undefined,
          usedAtomIds: uniq(usedIfPresent(atoms, [pId || '', hostId])),
          notes: ['prior.confront + hostility => threaten'],
          parts: { priorConfront: v, hostility: host }
        });
      });
    }
  },

  {
    key: 'confront',
    kind: 'aff',
    label: 'Confront',
    build: ({ selfId, atoms, helpers }) => {
      const noThreats = proto(helpers, 'noThreats');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'confront', 0.25);
        const host = helpers.get(`rel:final:${selfId}:${otherId}:hostility`, helpers.get(`rel:state:${selfId}:${otherId}:hostility`, 0.1));
        const threat = helpers.get(`tom:effective:dyad:${selfId}:${otherId}:threat`, 0.2);
        const magnitude = helpers.clamp01(0.30 * v + 0.35 * host + 0.35 * threat);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'confront',
          label: 'Confront',
          magnitude,
          blockedBy: noThreats ? [noThreats] : undefined,
          usedAtomIds: usedIfPresent(atoms, [
            pId || '',
            `rel:final:${selfId}:${otherId}:hostility`,
            `rel:state:${selfId}:${otherId}:hostility`,
            `tom:effective:dyad:${selfId}:${otherId}:threat`,
          ]),
          notes: ['confront scales with hostility and perceived threat'],
          parts: { prior: v, hostility: host, threat }
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
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'avoid', 0.25);
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'avoid',
          label: 'Avoid',
          magnitude: v,
          usedAtomIds: uniq(usedIfPresent(atoms, [pId || ''])),
          notes: ['act prior => avoid'],
          parts: { prior: v }
        });
      });
    }
  },

  // ---- COMMAND / COORDINATION ----
  {
    key: 'command',
    kind: 'aff',
    label: 'Command / instruct',
    build: ({ selfId, atoms, helpers }) => {
      const noCommand = proto(helpers, 'noCommand');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const authorityAtom = helpers.findPrefix(`role:authority:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:authority:${selfId}`)[0]?.id;
      const authority = authorityAtom ? helpers.get(authorityAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'command', 0.2);
        const respectId = `rel:state:${selfId}:${otherId}:respect`;
        const respect = getMag(atoms, respectId, 0);

        const magnitude = clamp01(0.50 * v + 0.30 * authority + 0.20 * respect);
        const used = uniq(usedIfPresent(atoms, [pId || '', authorityAtom || '', respectId]));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'command',
          label: 'Command',
          magnitude,
          blockedBy: noCommand ? [noCommand] : undefined,
          usedAtomIds: used,
          notes: ['prior.command + authority + respect => command'],
          parts: { prior: v, authority, respect }
        });
      });
    }
  },

  {
    key: 'call_backup',
    kind: 'aff',
    label: 'Call backup',
    build: ({ selfId, atoms, helpers }) => {
      const noRadio = proto(helpers, 'noComms');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const threatAtom = helpers.findPrefix(`ctx:threat:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:threat`)[0]?.id;
      const threat = threatAtom ? helpers.get(threatAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'call_backup', 0.15);
        const magnitude = clamp01(0.55 * v + 0.45 * threat);
        const used = uniq(usedIfPresent(atoms, [pId || '', threatAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'call_backup',
          label: 'Call backup',
          magnitude,
          blockedBy: noRadio ? [noRadio] : undefined,
          usedAtomIds: used,
          notes: ['prior.call_backup + threat => call_backup'],
          parts: { prior: v, threat }
        });
      });
    }
  },

  {
    key: 'signal',
    kind: 'aff',
    label: 'Signal / nonverbal cue',
    build: ({ selfId, atoms, helpers }) => {
      const noComms = proto(helpers, 'noComms');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'signal', 0.2);
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'signal',
          label: 'Signal',
          magnitude: v,
          blockedBy: noComms ? [noComms] : undefined,
          usedAtomIds: uniq(usedIfPresent(atoms, [pId || ''])),
          notes: ['act prior => signal'],
          parts: { prior: v }
        });
      });
    }
  },

  // ---- SECURITY ----
  {
    key: 'guard',
    kind: 'aff',
    label: 'Guard / protect',
    build: ({ selfId, atoms, helpers }) => {
      const noGuard = proto(helpers, 'noGuard');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const threatAtom = helpers.findPrefix(`ctx:threat:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:threat`)[0]?.id;
      const threat = threatAtom ? helpers.get(threatAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'guard', 0.2);
        const closId = `rel:state:${selfId}:${otherId}:closeness`;
        const clos = getMag(atoms, closId, 0.2);

        const magnitude = clamp01(0.45 * v + 0.35 * clos + 0.20 * threat);
        const used = uniq(usedIfPresent(atoms, [pId || '', closId, threatAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'guard',
          label: 'Guard',
          magnitude,
          blockedBy: noGuard ? [noGuard] : undefined,
          usedAtomIds: used,
          notes: ['prior.guard + closeness + threat => guard'],
          parts: { prior: v, closeness: clos, threat }
        });
      });
    }
  },

  {
    key: 'escort',
    kind: 'aff',
    label: 'Escort / accompany',
    build: ({ selfId, atoms, helpers }) => {
      const noEscort = proto(helpers, 'noEscort');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const dangerAtom = helpers.findPrefix(`ctx:hazard:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:hazard`)[0]?.id;
      const danger = dangerAtom ? helpers.get(dangerAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'escort', 0.2);
        const trustId = `rel:state:${selfId}:${otherId}:trust`;
        const trust = getMag(atoms, trustId, 0.5);

        const magnitude = clamp01(0.50 * v + 0.25 * trust + 0.25 * danger);
        const used = uniq(usedIfPresent(atoms, [pId || '', trustId, dangerAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'escort',
          label: 'Escort',
          magnitude,
          blockedBy: noEscort ? [noEscort] : undefined,
          usedAtomIds: used,
          notes: ['prior.escort + trust + hazard => escort'],
          parts: { prior: v, trust, hazard: danger }
        });
      });
    }
  },

  // ---- MEDICAL / CARE ----
  {
    key: 'treat',
    kind: 'aff',
    label: 'Treat / heal',
    build: ({ selfId, atoms, helpers }) => {
      const noMed = proto(helpers, 'noMedical');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const suppliesAtom = helpers.findPrefix(`inv:medical:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:medicalSupplies:${selfId}`)[0]?.id;
      const supplies = suppliesAtom ? helpers.get(suppliesAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'treat', 0.2);
        const woundId = `body:wounded:${otherId}`;
        const wounded = getMag(atoms, woundId, 0);

        const magnitude = clamp01((0.55 * v + 0.45 * wounded) * (0.5 + 0.5 * supplies));
        const used = uniq(usedIfPresent(atoms, [pId || '', woundId, suppliesAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'treat',
          label: 'Treat',
          magnitude,
          blockedBy: noMed ? [noMed] : undefined,
          usedAtomIds: used,
          notes: ['prior.treat + target.wounded + supplies => treat'],
          parts: { prior: v, wounded, supplies }
        });
      });
    }
  },

  // ---- INFO / INVESTIGATION ----
  {
    key: 'investigate',
    kind: 'cog',
    label: 'Investigate',
    build: ({ selfId, atoms, helpers }) => {
      const noSearch = proto(helpers, 'noSearch');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const uncAtom = helpers.findPrefix(`ctx:uncertainty:${selfId}`)[0]?.id || helpers.findPrefix(`ctx:uncertainty`)[0]?.id;
      const uncertainty = uncAtom ? helpers.get(uncAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'investigate', 0.25);
        const magnitude = clamp01(0.55 * v + 0.45 * uncertainty);
        const used = uniq(usedIfPresent(atoms, [pId || '', uncAtom || '']));

        return mkTargeted({
          kind: 'cog',
          selfId,
          otherId,
          key: 'investigate',
          label: 'Investigate',
          magnitude,
          blockedBy: noSearch ? [noSearch] : undefined,
          usedAtomIds: used,
          notes: ['prior.investigate + uncertainty => investigate'],
          parts: { prior: v, uncertainty }
        });
      });
    }
  },

  {
    key: 'observe_target',
    kind: 'cog',
    label: 'Observe target',
    build: ({ selfId, atoms, helpers }) => {
      const noStare = proto(helpers, 'noObservation');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const visibilityAtom =
        helpers.findPrefix(`world:loc:visibility:${selfId}`)[0]?.id ||
        helpers.findPrefix(`world:map:visibility:${selfId}`)[0]?.id ||
        helpers.findPrefix(`env_visibility`)[0]?.id;
      const vis = visibilityAtom ? helpers.get(visibilityAtom, 0.6) : 0.6;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'observe', 0.2);
        const magnitude = clamp01(0.60 * v + 0.40 * vis);
        const used = uniq(usedIfPresent(atoms, [pId || '', visibilityAtom || '']));

        return mkTargeted({
          kind: 'cog',
          selfId,
          otherId,
          key: 'observe_target',
          label: 'Observe target',
          magnitude,
          blockedBy: noStare ? [noStare] : undefined,
          usedAtomIds: used,
          notes: ['prior.observe + visibility => observe target'],
          parts: { prior: v, visibility: vis }
        });
      });
    }
  },

  // ---- OFFER (scene injected) ----
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
