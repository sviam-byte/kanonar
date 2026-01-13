// lib/simkit/actions/specs.ts
// ActionSpecs: source of truth for "what actions exist" and "when/how they work".
//
// Encodes:
// - enumerate (when possible)
// - validate V1/V2 with reason codes
// - classify V3 (single tick vs intent) — v1: all are single
// - apply (effects + events)

import type { ActionKind, ActionOffer, SimAction, SimEvent, SimWorld, SpeechEventV1 } from '../core/types';
import { getChar, getLoc } from '../core/world';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type Atomicity = 'single' | 'intent';

export type OfferCtx = {
  world: SimWorld;
  actorId: string;
};

export type ValidateCtx = OfferCtx & {
  offer: ActionOffer;
};

export type ApplyCtx = {
  world: SimWorld;
  action: SimAction;
};

export type ActionSpec = {
  kind: ActionKind;
  enumerate: (ctx: OfferCtx) => ActionOffer[];
  validateV1: (ctx: ValidateCtx) => ActionOffer;
  validateV2: (ctx: ValidateCtx) => ActionOffer;
  classifyV3: (ctx: ValidateCtx) => Atomicity;
  apply: (ctx: ApplyCtx) => { world: SimWorld; events: SimEvent[]; notes: string[] };
};

function normLevel(world: SimWorld, locId: string, key: string): number {
  try {
    const loc = getLoc(world, locId);
    return Number(loc.norms?.[key] ?? 0);
  } catch {
    return 0;
  }
}

function hashStr(s: string): number {
  // Deterministic tiny hash for ids (not crypto).
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function mkActionEvent(world: SimWorld, type: string, payload: any): SimEvent {
  // Note: id is deterministic-ish: tick + actor + payload hash.
  const actorId = String(payload?.actorId ?? 'system');
  const t = world.tickIndex;
  return {
    id: `evt:${type}:${t}:${actorId}:${Math.abs(hashStr(JSON.stringify(payload))).toString(36)}`,
    type,
    payload,
  };
}

function validateCommon(_world: SimWorld, o: ActionOffer): ActionOffer {
  const score = Number(o.score ?? 0);
  return {
    ...o,
    score: Number.isFinite(score) ? score : 0,
    blocked: Boolean(o.blocked),
    reason: o.reason ?? null,
  };
}

function featuresAtNode(world: SimWorld, locId: string, nodeId: string | undefined) {
  const loc = getLoc(world, locId);
  const xs = Array.isArray((loc as any)?.features) ? (loc as any).features : [];
  if (!nodeId) return xs;
  return xs.filter((f: any) => !f.nodeId || f.nodeId === nodeId);
}

const WaitSpec: ActionSpec = {
  kind: 'wait',
  enumerate: ({ actorId }) => [{ kind: 'wait', actorId, score: 0.1 }],
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    c.energy = clamp01(c.energy + 0.02);
    c.stress = clamp01(c.stress - 0.01);
    notes.push(`${c.id} waits`);
    events.push(mkActionEvent(world, 'action:wait', { actorId: c.id, locationId: c.locId }));
    return { world, events, notes };
  },
};

const RestSpec: ActionSpec = {
  kind: 'rest',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    return [{ kind: 'rest', actorId, score: clamp01((0.6 - c.energy) * 2) }];
  },
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    if (normLevel(world, c.locId, 'no_rest') >= 0.7) {
      return { ...base, blocked: true, reason: 'norm:no_rest', score: 0 };
    }
    return base;
  },
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    c.energy = clamp01(c.energy + 0.08);
    c.stress = clamp01(c.stress - 0.03);
    notes.push(`${c.id} rests`);
    events.push(mkActionEvent(world, 'action:rest', { actorId: c.id, locationId: c.locId }));
    return { world, events, notes };
  },
};

const MoveSpec: ActionSpec = {
  kind: 'move',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const loc = getLoc(world, c.locId);
    const curNode = c.pos?.nodeId;
    const nav = loc.nav;
    if (nav?.nodes?.length && curNode) {
      const neighbors = nav.edges
        .filter((e) => e.a === curNode || e.b === curNode)
        .map((e) => (e.a === curNode ? e.b : e.a));
      const uniq = Array.from(new Set(neighbors));
      return uniq.map((nid) => ({
        kind: 'move',
        actorId,
        targetNodeId: nid,
        score: 0.14,
      }));
    }
    const out: ActionOffer[] = [];
    for (const n of loc.neighbors || []) {
      out.push({ kind: 'move', actorId, targetId: n, score: 0.2 });
    }
    return out;
  },
  validateV1: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    try {
      const c = getChar(world, base.actorId);
      const fromLoc = getLoc(world, c.locId);
      if (base.targetNodeId && fromLoc?.nav?.nodes?.length) {
        const cur = c.pos?.nodeId;
        if (!cur) return { ...base, blocked: true, reason: 'v1:no-pos', score: 0 };
        const ok = fromLoc.nav.edges.some((e) =>
          (e.a === cur && e.b === base.targetNodeId) || (e.b === cur && e.a === base.targetNodeId)
        );
        if (!ok) return { ...base, blocked: true, reason: 'v1:not-neighbor', score: 0 };
      } else {
        const to = String(base.targetId ?? '');
        const ok = !!to && (fromLoc.neighbors || []).includes(to);
        if (!ok) return { ...base, blocked: true, reason: 'v1:not-a-neighbor', score: 0 };
      }
      return base;
    } catch {
      return { ...base, blocked: true, reason: 'v1:invalid', score: 0 };
    }
  },
  validateV2: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    if (normLevel(world, c.locId, 'no_move') >= 0.7) {
      return { ...base, blocked: true, reason: 'norm:no_move', score: 0 };
    }
    return base;
  },
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    if (action.targetNodeId) {
      const loc = getLoc(world, c.locId);
      const n = loc?.nav?.nodes?.find((x) => x.id === action.targetNodeId);
      c.pos = { nodeId: action.targetNodeId, x: n?.x, y: n?.y };
      c.energy = clamp01(c.energy - 0.01);
      notes.push(`${c.id} moves to node ${action.targetNodeId}`);
      events.push(mkActionEvent(world, 'action:move_local', {
        actorId: c.id,
        locationId: c.locId,
        nodeId: action.targetNodeId,
      }));
      return { world, events, notes };
    }
    const to = String(action.targetId ?? '');
    const from = c.locId;
    const fromLoc = getLoc(world, from);
    const ok = !!to && (fromLoc.neighbors || []).includes(to);

    if (!ok) {
      notes.push(`${c.id} move blocked ${from} -> ${to || '(none)'}`);
      events.push(mkActionEvent(world, 'action:move', {
        actorId: c.id,
        fromLocId: from,
        toLocId: to || null,
        ok: false,
        locationId: from,
      }));
      return { world, events, notes };
    }

    c.locId = to;
    c.energy = clamp01(c.energy - 0.03);
    notes.push(`${c.id} moves ${from} -> ${to}`);
    events.push(mkActionEvent(world, 'action:move', {
      actorId: c.id,
      fromLocId: from,
      toLocId: to,
      ok: true,
      locationId: to,
    }));
    return { world, events, notes };
  },
};

const InspectFeatureSpec: ActionSpec = {
  kind: 'inspect_feature',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const feats = featuresAtNode(world, c.locId, c.pos?.nodeId);
    return feats.slice(0, 6).map((f: any) => ({
      kind: 'inspect_feature',
      actorId,
      meta: { featureId: f.id, featureKind: f.kind },
      score: 0.17,
    }));
  },
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const c = getChar(world, action.actorId);
    const fid = String(action.meta?.featureId || '');
    c.stress = clamp01(c.stress - 0.005);
    world.facts[`inspected:${c.id}:${fid}`] = (world.facts[`inspected:${c.id}:${fid}`] ?? 0) + 1;
    return {
      world,
      events: [mkActionEvent(world, 'action:inspect_feature', { actorId: c.id, locationId: c.locId, featureId: fid })],
      notes: [`${c.id} inspects ${fid}`],
    };
  },
};

const RepairFeatureSpec: ActionSpec = {
  kind: 'repair_feature',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const feats = featuresAtNode(world, c.locId, c.pos?.nodeId).filter((f: any) => (f.tags || []).includes('repairable'));
    return feats.slice(0, 6).map((f: any) => ({
      kind: 'repair_feature',
      actorId,
      meta: { featureId: f.id, featureKind: f.kind },
      score: 0.16,
    }));
  },
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const c = getChar(world, action.actorId);
    const fid = String(action.meta?.featureId || '');
    c.energy = clamp01(c.energy - 0.05);
    c.stress = clamp01(c.stress + 0.01);
    world.facts[`repaired:${c.id}:${fid}`] = (world.facts[`repaired:${c.id}:${fid}`] ?? 0) + 1;
    return {
      world,
      events: [mkActionEvent(world, 'action:repair_feature', { actorId: c.id, locationId: c.locId, featureId: fid })],
      notes: [`${c.id} repairs ${fid}`],
    };
  },
};

const ScavengeFeatureSpec: ActionSpec = {
  kind: 'scavenge_feature',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const feats = featuresAtNode(world, c.locId, c.pos?.nodeId).filter((f: any) => (f.tags || []).includes('loot'));
    return feats.slice(0, 6).map((f: any) => ({
      kind: 'scavenge_feature',
      actorId,
      meta: { featureId: f.id, featureKind: f.kind },
      score: 0.15,
    }));
  },
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const c = getChar(world, action.actorId);
    const fid = String(action.meta?.featureId || '');
    c.energy = clamp01(c.energy - 0.03);
    world.facts[`scavenged:${c.id}:${fid}`] = (world.facts[`scavenged:${c.id}:${fid}`] ?? 0) + 1;
    return {
      world,
      events: [mkActionEvent(world, 'action:scavenge_feature', { actorId: c.id, locationId: c.locId, featureId: fid })],
      notes: [`${c.id} scavenges ${fid}`],
    };
  },
};

const TalkSpec: ActionSpec = {
  kind: 'talk',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const out: ActionOffer[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      out.push({ kind: 'talk', actorId, targetId: other.id, score: 0.15 });
    }
    return out;
  },
  validateV1: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    try {
      const c = getChar(world, base.actorId);
      const otherId = String(base.targetId ?? '');
      const other = world.characters[otherId];
      if (!other) return { ...base, blocked: true, reason: 'v1:no-target', score: 0 };
      if (other.locId !== c.locId) return { ...base, blocked: true, reason: 'v1:not-same-location', score: 0 };
      return base;
    } catch {
      return { ...base, blocked: true, reason: 'v1:invalid', score: 0 };
    }
  },
  validateV2: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    if (normLevel(world, c.locId, 'no_talk') >= 0.7) {
      return { ...base, blocked: true, reason: 'norm:no_talk', score: 0 };
    }
    return base;
  },
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const otherId = String(action.targetId ?? '');
    c.stress = clamp01(c.stress - 0.02);
    world.facts[`talk:${c.id}:${otherId}`] = (world.facts[`talk:${c.id}:${otherId}`] ?? 0) + 1;
    notes.push(`${c.id} talks to ${otherId}`);
    events.push(mkActionEvent(world, 'action:talk', {
      actorId: c.id,
      targetId: otherId,
      locationId: c.locId,
    }));
    // Прототип: "разговор" как сигнал, который можно превратить в atoms в GoalLab.
    const speech: SpeechEventV1 = {
      schema: 'SpeechEventV1',
      actorId: c.id,
      targetId: otherId,
      act: 'inform',
      topic: 'talk',
      text: 'shares an update',
      atoms: [
        { id: `speech:talk:${c.id}:${otherId}`, magnitude: 1, confidence: 0.85, meta: { kind: 'talk' } },
      ],
    };
    events.push(mkActionEvent(world, 'speech:v1', speech));
    return { world, events, notes };
  },
};

const ObserveSpec: ActionSpec = {
  kind: 'observe',
  enumerate: ({ world, actorId }) => {
    // базово всегда возможно; чуть выше, чем wait, но ниже "настоящих" действий
    const c = getChar(world, actorId);
    const loc = getLoc(world, c.locId);
    const radiation = Number(loc.hazards?.['radiation'] ?? 0);
    // чем опаснее, тем чаще "озираемся"
    const score = clamp01(0.12 + 0.22 * radiation);
    return [{ kind: 'observe', actorId, score }];
  },
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    if (normLevel(world, c.locId, 'no_observe') >= 0.7) {
      return { ...base, blocked: true, reason: 'norm:no_observe', score: 0 };
    }
    return base;
  },
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    // "наблюдение" снижает стресс и фиксирует факт
    c.stress = clamp01(c.stress - 0.015);
    world.facts[`observe:${c.id}:${world.tickIndex}`] = true;
    world.facts['observe:count'] = (world.facts['observe:count'] ?? 0) + 1;
    notes.push(`${c.id} observes`);
    events.push(mkActionEvent(world, 'action:observe', { actorId: c.id, locationId: c.locId }));
    return { world, events, notes };
  },
};

const QuestionAboutSpec: ActionSpec = {
  kind: 'question_about',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const out: ActionOffer[] = [];
    const feats = featuresAtNode(world, c.locId, c.pos?.nodeId);
    const topic = feats[0]?.id || 'situation';
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      out.push({ kind: 'question_about', actorId, targetId: other.id, meta: { topic }, score: 0.18 });
    }
    return out;
  },
  validateV1: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    try {
      const c = getChar(world, base.actorId);
      const otherId = String(base.targetId ?? '');
      const other = world.characters[otherId];
      if (!other) return { ...base, blocked: true, reason: 'v1:no-target', score: 0 };
      if (other.locId !== c.locId) return { ...base, blocked: true, reason: 'v1:not-same-location', score: 0 };
      return base;
    } catch {
      return { ...base, blocked: true, reason: 'v1:invalid', score: 0 };
    }
  },
  validateV2: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    if (normLevel(world, c.locId, 'no_talk') >= 0.7) {
      return { ...base, blocked: true, reason: 'norm:no_talk', score: 0 };
    }
    return base;
  },
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const otherId = String(action.targetId ?? '');
    const topic = String(action.meta?.topic || 'situation');
    // "вопрос" обычно чуть повышает стресс (риск), но увеличивает счетчик знания
    c.stress = clamp01(c.stress + 0.005);
    world.facts[`question:${c.id}:${otherId}:${topic}`] = (world.facts[`question:${c.id}:${otherId}:${topic}`] ?? 0) + 1;
    notes.push(`${c.id} questions ${otherId} about ${topic}`);
    events.push(mkActionEvent(world, 'action:question_about', {
      actorId: c.id,
      targetId: otherId,
      topic,
      locationId: c.locId,
    }));
    const speech: SpeechEventV1 = {
      schema: 'SpeechEventV1',
      actorId: c.id,
      targetId: otherId,
      act: 'ask',
      topic,
      text: `asks about ${topic}`,
      atoms: [
        { id: `speech:ask:${c.id}:${otherId}:${topic}`, magnitude: 1, confidence: 0.9, meta: { kind: 'question_about' } },
      ],
    };
    events.push(mkActionEvent(world, 'speech:v1', speech));
    return { world, events, notes };
  },
};

const NegotiateSpec: ActionSpec = {
  kind: 'negotiate',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const out: ActionOffer[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      out.push({ kind: 'negotiate', actorId, targetId: other.id, score: 0.16 });
    }
    return out;
  },
  validateV1: ({ world, offer }) => QuestionAboutSpec.validateV1({ world, actorId: offer.actorId, offer }),
  validateV2: ({ world, offer }) => QuestionAboutSpec.validateV2({ world, actorId: offer.actorId, offer }),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const otherId = String(action.targetId ?? '');
    // переговоры немного "съедают энергию"
    c.energy = clamp01(c.energy - 0.02);
    world.facts[`negotiate:${c.id}:${otherId}`] = (world.facts[`negotiate:${c.id}:${otherId}`] ?? 0) + 1;
    notes.push(`${c.id} negotiates with ${otherId}`);
    events.push(mkActionEvent(world, 'action:negotiate', { actorId: c.id, targetId: otherId, locationId: c.locId }));
    const speech: SpeechEventV1 = {
      schema: 'SpeechEventV1',
      actorId: c.id,
      targetId: otherId,
      act: 'negotiate',
      topic: 'terms',
      text: 'proposes terms',
      atoms: [
        { id: `speech:negotiate:${c.id}:${otherId}`, magnitude: 1, confidence: 0.85, meta: { kind: 'negotiate' } },
      ],
    };
    events.push(mkActionEvent(world, 'speech:v1', speech));
    return { world, events, notes };
  },
};

const StartIntentSpec: ActionSpec = {
  kind: 'start_intent',
  enumerate: () => [],
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);

    const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};
    const intent = payload.intent || null;
    const intentId = String(payload.intentId || `intent:${c.id}:${world.tickIndex}`);

    // Minimal intent storage: one active intent per actor (v0).
    world.facts[`intent:${c.id}`] = {
      id: intentId,
      startedAtTick: world.tickIndex,
      intent,
    };

    notes.push(`${c.id} starts intent ${intentId}`);
    events.push(mkActionEvent(world, 'action:start_intent', {
      actorId: c.id,
      locationId: c.locId,
      intentId,
      intent,
    }));
    return { world, events, notes };
  },
};

export const ACTION_SPECS: Record<ActionKind, ActionSpec> = {
  wait: WaitSpec,
  rest: RestSpec,
  move: MoveSpec,
  talk: TalkSpec,
  observe: ObserveSpec,
  question_about: QuestionAboutSpec,
  negotiate: NegotiateSpec,
  inspect_feature: InspectFeatureSpec,
  repair_feature: RepairFeatureSpec,
  scavenge_feature: ScavengeFeatureSpec,
  start_intent: StartIntentSpec,
};

export function enumerateActionOffers(world: SimWorld): ActionOffer[] {
  const offers: ActionOffer[] = [];
  const actorIds = Object.keys(world.characters || {}).sort();

  for (const actorId of actorIds) {
    const ctx: OfferCtx = { world, actorId };
    for (const kind of Object.keys(ACTION_SPECS).sort() as ActionKind[]) {
      const spec = ACTION_SPECS[kind];
      const raw = spec.enumerate(ctx);
      for (const o of raw) {
        const v1 = spec.validateV1({ ...ctx, offer: o });
        const v2 = spec.validateV2({ ...ctx, offer: v1 });
        offers.push(v2);
      }
    }
  }

  return offers.sort((a, b) => (b.score - a.score)
    || a.actorId.localeCompare(b.actorId)
    || String(a.targetId ?? '').localeCompare(String(b.targetId ?? ''))
    || a.kind.localeCompare(b.kind));
}

export function applyActionViaSpec(world: SimWorld, action: SimAction) {
  const spec = ACTION_SPECS[action.kind];
  if (!spec) throw new Error(`No ActionSpec for kind=${String(action.kind)}`);
  return spec.apply({ world, action });
}
