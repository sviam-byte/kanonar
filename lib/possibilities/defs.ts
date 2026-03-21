import { clamp01 } from '../util/math';
import { Possibility, PossibilityDef } from './catalog';
import { getMag } from '../util/atoms';
import { arr } from '../utils/arr';
import { uniq } from '../util/collections';
import { FC } from '../config/formulaConfig';

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

type SocialEventGateKind =
  | 'talk'
  | 'comfort'
  | 'help'
  | 'share'
  | 'negotiate'
  | 'trade'
  | 'apologize'
  | 'praise'
  | 'accuse'
  | 'threaten'
  | 'confront'
  | 'command'
  | 'call_backup'
  | 'signal';

type SocialEventGate = {
  gate: number;
  topicPressure: number;
  targetRelevance: number;
  targetNeed: number;
  distress: number;
  conflict: number;
  reciprocity: number;
  instrumentalNeed: number;
  authority: number;
  scarcity: number;
  evidence: number;
  usedAtomIds: string[];
  notes: string[];
};

// Event-first social gating: social actions need a current trigger (topic/need/conflict), not static relation only.
function collectSocialEventGate(args: {
  selfId: string;
  otherId: string;
  atoms: any[];
  kind: SocialEventGateKind;
}): SocialEventGate {
  const { selfId, otherId, kind } = args;
  const list = arr<any>(args.atoms);
  const used = new Set<string>();
  const notes = new Set<string>();

  const take = (id: string, fb = 0) => {
    const atom = list.find(a => String(a?.id || '') === id);
    if (atom) used.add(id);
    const raw = atom && Number.isFinite(Number(atom?.magnitude)) ? Number(atom.magnitude) : fb;
    return clamp01(raw);
  };

  const takePrefixMax = (prefix: string) => {
    let best = 0;
    let bestId: string | null = null;
    for (const a of list) {
      const id = String(a?.id || '');
      if (!id.startsWith(prefix)) continue;
      const v = clamp01(Number(a?.magnitude ?? 0));
      if (v > best) {
        best = v;
        bestId = id;
      }
    }
    if (bestId) used.add(bestId);
    return best;
  };

  const trust = take(`rel:state:${selfId}:${otherId}:trust`, 0);
  const closeness = take(`rel:state:${selfId}:${otherId}:closeness`, 0);
  const obligation = take(`rel:state:${selfId}:${otherId}:obligation`, 0);
  const respect = take(`rel:state:${selfId}:${otherId}:respect`, 0);
  const hostility = Math.max(
    take(`rel:final:${selfId}:${otherId}:hostility`, 0),
    take(`rel:state:${selfId}:${otherId}:hostility`, 0)
  );
  const threat = Math.max(
    take(`tom:effective:dyad:${selfId}:${otherId}:threat`, 0),
    take(`tom:dyad:${selfId}:${otherId}:threat`, 0),
    hostility
  );
  const nearby = Math.max(
    take(`obs:nearby:${selfId}:${otherId}`, 0),
    take(`obs:nearby:${selfId}:${otherId}:closeness`, 0)
  );

  const evidence = Math.max(take(`ctx:evidence:${selfId}`, 0), take('ctx:evidence', 0));
  const scarcity = Math.max(take(`ctx:scarcity:${selfId}`, 0), take('ctx:scarcity', 0));
  const authority = Math.max(
    take(`role:authority:${selfId}`, 0),
    take(`ctx:authority:${selfId}`, 0),
    take('ctx:authority', 0)
  );

  const nonverbalTense = takePrefixMax(`obs:nonverbal:${selfId}:${otherId}:tense`);
  const nonverbalAfraid = takePrefixMax(`obs:nonverbal:${selfId}:${otherId}:afraid`);
  const nonverbalAngry = takePrefixMax(`obs:nonverbal:${selfId}:${otherId}:angry`);

  let topicPressure = 0;
  let targetNeed = 0;
  let distress = Math.max(nonverbalTense, nonverbalAfraid);
  let conflict = Math.max(nonverbalAngry, hostility * 0.6);
  let reciprocity = 0;
  let selfCausedTrouble = 0;
  let otherCausedTrouble = 0;
  let otherDidGood = 0;

  for (const a of list) {
    const id = String(a?.id || '');
    if (!id.startsWith('event:')) continue;
    const ev = (a as any)?.meta?.event;
    if (!ev || typeof ev !== 'object') continue;
    const actorId = String((ev as any)?.actorId ?? '');
    const targetId = String((ev as any)?.targetId ?? '');
    const evKind = String((ev as any)?.kind ?? '').toLowerCase();
    const mag = clamp01(Number((a as any)?.magnitude ?? (ev as any)?.magnitude ?? 0));
    const involvesSelf = actorId === selfId || targetId === selfId;
    const involvesOther = actorId === otherId || targetId === otherId;
    if (!involvesSelf && !involvesOther) continue;
    used.add(id);

    const isHarm = /attack|harm|injur|threat|hazard|betray|insult|accus|deceiv/.test(evKind);
    const isHelp = /help|assist|heal|protect|save|comfort|treat/.test(evKind);
    const isSpeech = /speech|talk|ask|negot|command|signal/.test(evKind);
    const isMove = /move|approach|escort/.test(evKind);

    if (involvesOther) {
      topicPressure = Math.max(topicPressure, mag);
      if (isMove || isSpeech) {
        topicPressure = Math.max(topicPressure, clamp01(mag * 0.8));
      }
    }
    if (targetId === otherId && (isHarm || isHelp)) {
      targetNeed = Math.max(targetNeed, mag);
    }
    if (targetId === otherId && isHarm) {
      distress = Math.max(distress, mag);
    }
    if (actorId === otherId && targetId === selfId && isHarm) {
      otherCausedTrouble = Math.max(otherCausedTrouble, mag);
      conflict = Math.max(conflict, mag);
    }
    if (actorId === selfId && targetId === otherId && isHarm) {
      selfCausedTrouble = Math.max(selfCausedTrouble, mag);
    }
    if (actorId === otherId && targetId === selfId && isHelp) {
      otherDidGood = Math.max(otherDidGood, mag);
      reciprocity = Math.max(reciprocity, mag);
    }
    if (actorId === selfId && targetId === otherId && isHelp) {
      reciprocity = Math.max(reciprocity, mag * 0.7);
    }
  }

  targetNeed = Math.max(targetNeed, distress, threat * 0.7);
  const targetRelevance = clamp01(Math.max(
    obligation,
    closeness * 0.75 + trust * 0.15,
    threat * 0.55,
    respect * 0.45,
    nearby * 0.35,
  ));
  const instrumentalNeed = clamp01(Math.max(
    evidence,
    scarcity,
    authority,
    obligation,
    threat * 0.85,
    otherDidGood * 0.7,
    otherCausedTrouble * 0.8,
  ));

  let gate = 0;
  switch (kind) {
    case 'comfort':
      gate = Math.min(Math.max(distress, targetNeed), Math.max(targetRelevance, obligation, trust));
      if (gate > 0.01) notes.add('event-first comfort: target distress + relevance');
      break;
    case 'help':
      gate = Math.max(
        targetNeed * (0.55 + 0.45 * Math.max(obligation, trust)),
        Math.min(topicPressure, Math.max(obligation, trust))
      );
      if (gate > 0.01) notes.add('event-first help: observed need + alliance/utility');
      break;
    case 'talk':
      gate = Math.max(topicPressure, instrumentalNeed * 0.85);
      if (gate > 0.01) notes.add('event-first talk: topic or instrumental need required');
      break;
    case 'share':
    case 'trade':
    case 'negotiate':
      gate = Math.max(topicPressure, Math.max(scarcity, evidence, obligation) * 0.9, conflict * 0.75);
      if (gate > 0.01) notes.add('event-first negotiation: open topic / scarcity / conflict');
      break;
    case 'apologize':
      gate = Math.max(selfCausedTrouble, conflict * 0.55);
      if (gate > 0.01) notes.add('event-first apology: I caused trouble or relation damaged');
      break;
    case 'praise':
      gate = Math.max(otherDidGood, reciprocity * 0.85);
      if (gate > 0.01) notes.add('event-first praise: positive contribution from target');
      break;
    case 'accuse':
      gate = Math.max(otherCausedTrouble, evidence * 0.9, conflict * 0.85);
      if (gate > 0.01) notes.add('event-first accuse: evidence / recent harm / conflict');
      break;
    case 'threaten':
    case 'confront':
      gate = Math.max(otherCausedTrouble, conflict, threat * 0.9);
      if (gate > 0.01) notes.add('event-first confrontation: threat / recent trouble');
      break;
    case 'command':
      gate = Math.max(topicPressure, authority * 0.85 + threat * 0.15, instrumentalNeed * 0.8);
      if (gate > 0.01) notes.add('event-first command: authority + current task pressure');
      break;
    case 'call_backup':
    case 'signal':
      gate = Math.max(topicPressure, threat, evidence * 0.75);
      if (gate > 0.01) notes.add('event-first coordination: threat/topic pressure');
      break;
    default:
      gate = Math.max(topicPressure, targetNeed * 0.8, conflict * 0.8);
      if (gate > 0.01) notes.add('event-first social gating');
      break;
  }

  if (gate <= 0.12) {
    notes.add('blocked: no recent event/topic/need strong enough');
  }

  return {
    gate: clamp01(gate),
    topicPressure: clamp01(topicPressure),
    targetRelevance,
    targetNeed: clamp01(targetNeed),
    distress: clamp01(distress),
    conflict: clamp01(conflict),
    reciprocity: clamp01(reciprocity),
    instrumentalNeed,
    authority: clamp01(authority),
    scarcity: clamp01(scarcity),
    evidence: clamp01(evidence),
    usedAtomIds: Array.from(used),
    notes: Array.from(notes),
  };
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
      const W = (FC as any).possibilityWeights?.hide ?? { cover: 0.70, antiVis: 0.30, priorBlend: 0.55 };
      const magnitude = helpers.clamp01(W.cover * cover + W.antiVis * (1 - vis));
      const { id: pId, v: priorHide } = getPrior(atoms || [], selfId, selfId, 'hide', 0.45);
      const mag = helpers.clamp01(magnitude * (W.priorBlend + (1 - W.priorBlend) * priorHide));

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

      const W = (FC as any).possibilityWeights?.escape ?? { exits: 0.50, esc: 0.50, priorBlend: 0.55 };
      const magnitude = helpers.clamp01(W.exits * exits + W.esc * esc);
      const { id: pId, v: priorEscape } = getPrior(atoms || [], selfId, selfId, 'escape', 0.45);
      // keep map affordance primary, but let desire-to-escape matter
      const mag = helpers.clamp01(magnitude * (W.priorBlend + (1 - W.priorBlend) * priorEscape));
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
      const W = (FC as any).possibilityWeights?.wait ?? { antiPressure: 0.45, pressureScale: 0.35, priorBlend: 0.65 };
      const magnitude = clamp01(W.antiPressure - W.pressureScale * p);
      if (magnitude < 0.05) return null;
      const { id: pId, v: priorWait } = getPrior(atoms || [], selfId, selfId, 'wait', 0.35);
      const mag = helpers.clamp01(magnitude * (W.priorBlend + (1 - W.priorBlend) * priorWait));

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

      const W = (FC as any).possibilityWeights?.rest ?? { fatigue: 0.80, antiThreat: 0.20, threshold: 0.12 };
      const magnitude = clamp01(W.fatigue * fatigue + W.antiThreat * (1 - threat));
      if (magnitude < W.threshold) return null;

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
      const W = (FC as any).possibilityWeights?.observe_area ?? { base: 0.15, uncScale: 0.75, threshold: 0.12 };
      const magnitude = clamp01(W.base + W.uncScale * unc);
      if (magnitude < W.threshold) return null;

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

      const W = (FC as any).possibilityWeights?.self_talk ?? { uncertainty: 0.75, privacy: 0.25, threshold: 0.15 };
      const magnitude = helpers.clamp01(W.uncertainty * uncertainty + W.privacy * privacy);
      if (magnitude < W.threshold) return null;

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
  // THREAT-GATED VIOLENCE
  // -------------------
  {
    key: 'attack',
    kind: 'off',
    label: 'Attack',
    build: ({ selfId, helpers, atoms }) => {
      const noViolence = proto(helpers, 'noViolence');
      const taboo = tabooPrefix(helpers, `con:rel:taboo:attack:${selfId}:`);
      const blockedBy: string[] = [];
      if (noViolence) blockedBy.push(noViolence);
      blockedBy.push(...taboo);

      // Safety invariant: only offer attack when threat is present and a concrete target exists.
      const threatAtom =
        helpers.findPrefix(`ctx:threat:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:threat`)[0]?.id;
      const threat = threatAtom ? helpers.get(threatAtom, 0) : 0;
      const W = (FC as any).possibilityWeights?.attack ?? { threat: 0.65, near: 0.20, host: 0.15, threatThreshold: 0.25 };
      if (threat < W.threatThreshold) return null;

      const others = inferOtherIds(selfId, atoms || []);
      if (!others.length) return null;

      return others.map(otherId => {
        const nearId = `obs:nearby:${selfId}:${otherId}`;
        const near = getMag(atoms || [], nearId, 0);
        const hostId = `rel:state:${selfId}:${otherId}:hostility`;
        const host = getMag(atoms || [], hostId, 0);

        const magnitude = clamp01(W.threat * threat + W.near * near + W.host * host);
        if (magnitude < 0.1) return null;

        return mkTargeted({
          kind: 'off',
          selfId,
          otherId,
          key: 'attack',
          label: 'Attack',
          magnitude,
          blockedBy,
          usedAtomIds: uniq([threatAtom, nearId, hostId, ...blockedBy].filter(Boolean) as any),
          notes: ['threat+nearby(+hostility) => targeted attack'],
          parts: { threat, near, host },
          meta: { cost: 0.05 }
        });
      }).filter(Boolean) as any;
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
        const W = (FC as any).possibilityWeights?.talk ?? { prior: 0.55, trust: 0.45 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'talk' });
        const base = clamp01(W.prior * v + W.trust * trust);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.08) return null;

        const used = uniq([...usedIfPresent(atoms, [pId || '', trustId]), ...gate.usedAtomIds]);
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'talk',
          label: 'Talk',
          magnitude,
          blockedBy: noTalk ? [noTalk] : undefined,
          usedAtomIds: used,
          notes: ['event-first talk: topic or need required', ...gate.notes],
          parts: { priorAsk: v, trust, topicPressure: gate.topicPressure, targetRelevance: gate.targetRelevance, instrumentalNeed: gate.instrumentalNeed, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'talk' });
        const magnitude = clamp01(v * Math.max(gate.topicPressure, gate.instrumentalNeed));
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        const used = uniq([...usedIfPresent(atoms, [pId || '']), ...gate.usedAtomIds]);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'ask_info',
          label: 'Ask for information',
          magnitude,
          blockedBy: noQuestions ? [noQuestions] : undefined,
          usedAtomIds: used,
          notes: ['event-first ask_info: missing topic -> no question', ...gate.notes],
          parts: { prior: v, topicPressure: gate.topicPressure, instrumentalNeed: gate.instrumentalNeed, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'talk' });
        const magnitude = clamp01(v * Math.max(gate.evidence, gate.topicPressure, gate.conflict));
        if (magnitude < 0.06) return null;
        return mkTargeted({
          kind: 'cog',
          selfId,
          otherId,
          key: 'verify',
          label: 'Verify / fact-check',
          magnitude,
          usedAtomIds: uniq([...usedIfPresent(atoms, [pId || '']), ...gate.usedAtomIds]),
          notes: ['event-first verify: only when claim/conflict exists', ...gate.notes],
          parts: { prior: v, evidence: gate.evidence, topicPressure: gate.topicPressure, conflict: gate.conflict }
        });
      }).filter(Boolean) as any;
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
        const W = (FC as any).possibilityWeights?.comfort ?? { prior: 0.60, closeness: 0.40 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'comfort' });
        const base = clamp01(W.prior * v + W.closeness * clos);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.16 || gate.distress <= 0.12 || magnitude < 0.08) return null;

        const used = uniq([...usedIfPresent(atoms, [pId || '', closId]), ...gate.usedAtomIds]);
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'comfort',
          label: 'Comfort',
          magnitude,
          blockedBy: noTouch ? [noTouch] : undefined,
          usedAtomIds: used,
          notes: ['event-first comfort: distress + relevance', ...gate.notes],
          parts: { priorComfort: v, clos, distress: gate.distress, targetRelevance: gate.targetRelevance, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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
        const W = (FC as any).possibilityWeights?.help ?? { prior: 0.70, obligation: 0.30 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'help' });
        const base = clamp01(W.prior * v + W.obligation * obl);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.14 || magnitude < 0.08) return null;

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'help',
          label: 'Help',
          magnitude,
          usedAtomIds: uniq([...usedIfPresent(atoms, [pId || '', oblId]), ...gate.usedAtomIds]),
          notes: ['event-first help: observed need + obligation', ...gate.notes],
          parts: { priorHelp: v, obligation: obl, targetNeed: gate.targetNeed, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.share_resource ?? { prior: 0.55, trust: 0.45, scarcityDampen: 0.60 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'share' });
        const base = clamp01((W.prior * v + W.trust * trust) * (1 - W.scarcityDampen * scarcity));
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        const used = uniq([...usedIfPresent(atoms, [pId || '', trustId, scarcityAtom || '']), ...gate.usedAtomIds]);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'share',
          label: 'Share resources',
          magnitude,
          blockedBy: noShare ? [noShare] : undefined,
          usedAtomIds: used,
          notes: ['event-first share: topic/need before generosity', ...gate.notes],
          parts: { priorShare: v, trust, scarcity, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.negotiate ?? { prior: 0.65, respect: 0.20, formal: 0.15 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'negotiate' });
        const base = clamp01(W.prior * v + W.respect * respect + W.formal * isFormal);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        const used = uniq([...usedIfPresent(atoms, [pId || '', respectId, formalAtom || '']), ...gate.usedAtomIds]);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'negotiate',
          label: 'Negotiate',
          magnitude,
          blockedBy: noDeal ? [noDeal] : undefined,
          usedAtomIds: used,
          notes: ['event-first negotiate: open topic/conflict/task', ...gate.notes],
          parts: { prior: v, respect, isFormal, topicPressure: gate.topicPressure, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.propose_trade ?? { prior: 0.55, trust: 0.45, scarcityBoost: 0.60 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'trade' });
        const base = clamp01((W.prior * v + W.trust * trust) * (0.6 + W.scarcityBoost * scarcity));
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        const used = uniq([...usedIfPresent(atoms, [pId || '', trustId, scarcityAtom || '']), ...gate.usedAtomIds]);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'trade',
          label: 'Propose trade',
          magnitude,
          blockedBy: noDeal ? [noDeal] : undefined,
          usedAtomIds: used,
          notes: ['event-first trade: scarcity/topic before offer', ...gate.notes],
          parts: { prior: v, trust, scarcity, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.apologize ?? { prior: 0.55, hostility: 0.45 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'apologize' });
        const base = clamp01(W.prior * v + W.hostility * host);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'apologize',
          label: 'Apologize',
          magnitude,
          blockedBy: noApology ? [noApology] : undefined,
          usedAtomIds: uniq([...usedIfPresent(atoms, [pId || '', hostId]), ...gate.usedAtomIds]),
          notes: ['event-first apologize: only after trouble/damage', ...gate.notes],
          parts: { prior: v, hostility: host, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.praise ?? { prior: 0.65, respect: 0.35 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'praise' });
        const base = clamp01(W.prior * v + W.respect * respect);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'praise',
          label: 'Praise',
          magnitude,
          blockedBy: noPraise ? [noPraise] : undefined,
          usedAtomIds: uniq([...usedIfPresent(atoms, [pId || '', respectId]), ...gate.usedAtomIds]),
          notes: ['event-first praise: target earned it this scene', ...gate.notes],
          parts: { prior: v, respect, reciprocity: gate.reciprocity, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.accuse ?? { prior: 0.50, threat: 0.30, evidence: 0.20 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'accuse' });
        const base = clamp01(W.prior * v + W.threat * threat + W.evidence * evidence);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        const used = uniq([...usedIfPresent(atoms, [pId || '', threatId, evidenceAtom || '']), ...gate.usedAtomIds]);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'accuse',
          label: 'Accuse',
          magnitude,
          blockedBy: noAccuse ? [noAccuse] : undefined,
          usedAtomIds: used,
          notes: ['event-first accuse: evidence / recent harm / conflict', ...gate.notes],
          parts: { prior: v, threat, evidence, conflict: gate.conflict, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.threaten ?? { prior: 0.65, hostility: 0.35 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'threaten' });
        const base = clamp01(W.prior * v + W.hostility * host);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'threaten',
          label: 'Threaten',
          magnitude,
          blockedBy: noThreats ? [noThreats] : undefined,
          usedAtomIds: uniq([...usedIfPresent(atoms, [pId || '', hostId]), ...gate.usedAtomIds]),
          notes: ['event-first threaten: pressure only under real conflict', ...gate.notes],
          parts: { priorConfront: v, hostility: host, conflict: gate.conflict, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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
        const W = (FC as any).possibilityWeights?.confront ?? { prior: 0.30, hostility: 0.35, threat: 0.35 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'confront' });
        const base = helpers.clamp01(W.prior * v + W.hostility * host + W.threat * threat);
        const magnitude = helpers.clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'confront',
          label: 'Confront',
          magnitude,
          blockedBy: noThreats ? [noThreats] : undefined,
          usedAtomIds: uniq([
            ...usedIfPresent(atoms, [
              pId || '',
              `rel:final:${selfId}:${otherId}:hostility`,
              `rel:state:${selfId}:${otherId}:hostility`,
              `tom:effective:dyad:${selfId}:${otherId}:threat`,
            ]),
            ...gate.usedAtomIds,
          ]),
          notes: ['event-first confront: hostility needs a live trigger', ...gate.notes],
          parts: { prior: v, hostility: host, threat, conflict: gate.conflict, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.command ?? { prior: 0.50, authority: 0.30, respect: 0.20 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'command' });
        const base = clamp01(W.prior * v + W.authority * authority + W.respect * respect);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        const used = uniq([...usedIfPresent(atoms, [pId || '', authorityAtom || '', respectId]), ...gate.usedAtomIds]);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'command',
          label: 'Command',
          magnitude,
          blockedBy: noCommand ? [noCommand] : undefined,
          usedAtomIds: used,
          notes: ['event-first command: current pressure, not idle bossiness', ...gate.notes],
          parts: { prior: v, authority, respect, topicPressure: gate.topicPressure, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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
        const W = (FC as any).possibilityWeights?.call_backup ?? { prior: 0.55, threat: 0.45 };
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'call_backup' });
        const base = clamp01(W.prior * v + W.threat * threat);
        const magnitude = clamp01(base * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        const used = uniq([...usedIfPresent(atoms, [pId || '', threatAtom || '']), ...gate.usedAtomIds]);

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'call_backup',
          label: 'Call backup',
          magnitude,
          blockedBy: noRadio ? [noRadio] : undefined,
          usedAtomIds: used,
          notes: ['event-first call_backup: only under pressure', ...gate.notes],
          parts: { prior: v, threat, topicPressure: gate.topicPressure, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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
        const gate = collectSocialEventGate({ selfId, otherId, atoms, kind: 'signal' });
        const magnitude = clamp01(v * gate.gate);
        if (gate.gate <= 0.12 || magnitude < 0.07) return null;
        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'signal',
          label: 'Signal',
          magnitude,
          blockedBy: noComms ? [noComms] : undefined,
          usedAtomIds: uniq([...usedIfPresent(atoms, [pId || '']), ...gate.usedAtomIds]),
          notes: ['event-first signal: current pressure/topic only', ...gate.notes],
          parts: { prior: v, topicPressure: gate.topicPressure, gate: gate.gate }
        });
      }).filter(Boolean) as any;
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

        const W = (FC as any).possibilityWeights?.guard ?? { prior: 0.45, closeness: 0.35, threat: 0.20 };
        const magnitude = clamp01(W.prior * v + W.closeness * clos + W.threat * threat);
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

        const W = (FC as any).possibilityWeights?.escort ?? { prior: 0.50, trust: 0.25, danger: 0.25 };
        const magnitude = clamp01(W.prior * v + W.trust * trust + W.danger * danger);
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

        const W = (FC as any).possibilityWeights?.treat ?? { prior: 0.55, wounded: 0.45, suppliesScale: 0.50 };
        const magnitude = clamp01((W.prior * v + W.wounded * wounded) * (0.5 + W.suppliesScale * supplies));
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
        const W = (FC as any).possibilityWeights?.investigate ?? { prior: 0.55, uncertainty: 0.45 };
        const magnitude = clamp01(W.prior * v + W.uncertainty * uncertainty);
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
        const W = (FC as any).possibilityWeights?.observe_target ?? { prior: 0.60, visibility: 0.40 };
        const magnitude = clamp01(W.prior * v + W.visibility * vis);
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


  // ---- DECEPTION ----
  {
    key: 'deceive',
    kind: 'aff',
    label: 'Deceive / mislead',
    build: ({ selfId, atoms, helpers }) => {
      const noDeceive = proto(helpers, 'noDeception');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'deceive', 0.15);
        const trustId = `rel:state:${selfId}:${otherId}:trust`;
        const trust = getMag(atoms, trustId, 0.5);
        // Deception is easier on trusting targets.
        const W = (FC as any).possibilityWeights?.deceive ?? { prior: 0.50, trust: 0.50 };
        const magnitude = clamp01(W.prior * v + W.trust * trust);
        const used = uniq(usedIfPresent(atoms, [pId || '', trustId]));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'deceive',
          label: 'Deceive',
          magnitude,
          blockedBy: noDeceive ? [noDeceive] : undefined,
          usedAtomIds: used,
          notes: ['prior.deceive + target.trust => deceive'],
          parts: { prior: v, trust },
        });
      });
    }
  },

  // ---- COMPLIANCE ----
  {
    key: 'submit',
    kind: 'aff',
    label: 'Submit / comply',
    build: ({ selfId, atoms, helpers }) => {
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      const threatAtom = helpers.findPrefix(`ctx:threat:${selfId}`)[0]?.id;
      const threat = threatAtom ? helpers.get(threatAtom, 0) : 0;

      return others.map(otherId => {
        const { id: pId, v } = getPrior(atoms, selfId, otherId, 'submit', 0.15);
        const respectId = `rel:state:${selfId}:${otherId}:respect`;
        const respect = getMag(atoms, respectId, 0);
        const hostId = `rel:state:${selfId}:${otherId}:hostility`;
        const host = getMag(atoms, hostId, 0);

        // Submit scales with respect for target and external threat.
        const W = (FC as any).possibilityWeights?.submit
          ?? { prior: 0.40, respect: 0.30, threat: 0.20, hostility: 0.10 };
        const magnitude = clamp01(W.prior * v + W.respect * respect + W.threat * threat + W.hostility * host);
        const used = uniq(usedIfPresent(atoms, [pId || '', respectId, hostId, threatAtom || '']));

        return mkTargeted({
          kind: 'aff',
          selfId,
          otherId,
          key: 'submit',
          label: 'Submit',
          magnitude,
          usedAtomIds: used,
          notes: ['prior.submit + respect + threat => submit'],
          parts: { prior: v, respect, threat, hostility: host },
        });
      });
    }
  },

  // ---- LOOTING ----
  {
    key: 'loot',
    kind: 'aff',
    label: 'Loot / scavenge',
    build: ({ selfId, helpers }) => {
      const noLoot = proto(helpers, 'noLooting');

      const scarcityAtom = helpers.findPrefix(`ctx:scarcity:${selfId}`)[0]?.id;
      const scarcity = scarcityAtom ? helpers.get(scarcityAtom, 0) : 0;

      const survAtom = helpers.findPrefix(`ctx:surveillance:${selfId}`)[0]?.id;
      const surv = survAtom ? helpers.get(survAtom, 0) : 0;

      // Looting is driven by scarcity and dampened by surveillance.
      const W = (FC as any).possibilityWeights?.loot ?? { scarcity: 0.60, survDampen: 0.50, threshold: 0.10 };
      const magnitude = clamp01(W.scarcity * scarcity * (1 - W.survDampen * surv));
      if (magnitude < W.threshold) return null;

      return mkSelf({
        kind: 'aff',
        selfId,
        key: 'loot',
        label: 'Loot',
        magnitude,
        blockedBy: noLoot ? [noLoot] : undefined,
        usedAtomIds: [scarcityAtom, survAtom].filter(Boolean) as any,
        notes: ['scarcity - surveillance => loot'],
        parts: { scarcity, surveillance: surv },
      });
    }
  },

  // ---- BETRAY (high-cost social action) ----
  {
    key: 'betray',
    kind: 'aff',
    label: 'Betray',
    build: ({ selfId, atoms, helpers }) => {
      const noBetray = proto(helpers, 'noBetray');
      const others = inferOtherIds(selfId, atoms);
      if (!others.length) return null;

      return others
        .map(otherId => {
          const { id: pId, v } = getPrior(atoms, selfId, otherId, 'betray', 0.05);
          const trustId = `rel:state:${selfId}:${otherId}:trust`;
          const trust = getMag(atoms, trustId, 0.5);
          const hostId = `rel:state:${selfId}:${otherId}:hostility`;
          const host = getMag(atoms, hostId, 0);

          // Betrayal requires both motive (hostility) and opportunity (existing trust).
          const W = (FC as any).possibilityWeights?.betray
            ?? { prior: 0.35, hostility: 0.35, trust: 0.30, threshold: 0.15 };
          const magnitude = clamp01(W.prior * v + W.hostility * host + W.trust * trust);
          if (magnitude < W.threshold) return null;

          const used = uniq(usedIfPresent(atoms, [pId || '', trustId, hostId]));
          return mkTargeted({
            kind: 'aff',
            selfId,
            otherId,
            key: 'betray',
            label: 'Betray',
            magnitude,
            blockedBy: noBetray ? [noBetray] : undefined,
            usedAtomIds: used,
            notes: ['prior.betray + hostility + trust(opportunity) => betray'],
            parts: { prior: v, hostility: host, trust },
            meta: { cost: 0.08 },
          });
        })
        .filter(Boolean) as any;
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
