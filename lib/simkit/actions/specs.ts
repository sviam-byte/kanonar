// lib/simkit/actions/specs.ts
// ActionSpecs: source of truth for "what actions exist" and "when/how they work".
//
// Encodes:
// - enumerate (when possible)
// - validate V1/V2 with reason codes
// - classify V3 (single tick vs intent) — v1: all are single
// - apply (effects + events)

import type { ActionKind, ActionOffer, SimAction, SimEvent, SimWorld } from '../core/types';
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

const WorkSpec: ActionSpec = {
  kind: 'work',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    return [{ kind: 'work', actorId, score: clamp01((c.energy - 0.2) * 0.8) }];
  },
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    if (normLevel(world, c.locId, 'no_work') >= 0.7) {
      return { ...base, blocked: true, reason: 'norm:no_work', score: 0 };
    }
    return base;
  },
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    c.energy = clamp01(c.energy - 0.06);
    c.stress = clamp01(c.stress + 0.03);
    world.facts['work:count'] = (world.facts['work:count'] ?? 0) + 1;
    notes.push(`${c.id} works`);
    events.push(mkActionEvent(world, 'action:work', {
      actorId: c.id,
      locationId: c.locId,
      factKey: 'work:count',
    }));
    return { world, events, notes };
  },
};

const MoveSpec: ActionSpec = {
  kind: 'move',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const loc = getLoc(world, c.locId);
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
      const to = String(base.targetId ?? '');
      const ok = !!to && (fromLoc.neighbors || []).includes(to);
      if (!ok) return { ...base, blocked: true, reason: 'v1:not-a-neighbor', score: 0 };
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

const AskInfoSpec: ActionSpec = {
  kind: 'ask_info',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const out: ActionOffer[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      out.push({ kind: 'ask_info', actorId, targetId: other.id, score: 0.18 });
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
    // "вопрос" обычно чуть повышает стресс (риск), но увеличивает счетчик знания
    c.stress = clamp01(c.stress + 0.005);
    world.facts[`ask_info:${c.id}:${otherId}`] = (world.facts[`ask_info:${c.id}:${otherId}`] ?? 0) + 1;
    notes.push(`${c.id} asks info from ${otherId}`);
    events.push(mkActionEvent(world, 'action:ask_info', { actorId: c.id, targetId: otherId, locationId: c.locId }));
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
  validateV1: ({ world, offer }) => AskInfoSpec.validateV1({ world, actorId: offer.actorId, offer }),
  validateV2: ({ world, offer }) => AskInfoSpec.validateV2({ world, actorId: offer.actorId, offer }),
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
  work: WorkSpec,
  move: MoveSpec,
  talk: TalkSpec,
  observe: ObserveSpec,
  ask_info: AskInfoSpec,
  negotiate: NegotiateSpec,
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
