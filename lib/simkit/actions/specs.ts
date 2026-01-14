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
import { distSameLocation, getCharXY, getSpatialConfig } from '../core/spatial';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const hypot = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

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
  // If classifyV3() returns 'intent', this is the default number of ticks to run.
  // The intent runtime may still override this via payload.
  intentTicks?: number;
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

function parseVolume(raw: unknown): 'whisper' | 'normal' | 'shout' {
  const v = String(raw ?? 'normal');
  if (v === 'whisper' || v === 'shout') return v;
  return 'normal';
}

function autoVolume(world: SimWorld, aId: string, bId: string): 'whisper' | 'normal' | 'shout' {
  const cfg = getSpatialConfig(world);
  const d = distSameLocation(world, aId, bId);
  if (!Number.isFinite(d)) return 'normal';
  if (d <= cfg.whisperRange * 0.9) return 'whisper';
  if (d <= cfg.talkRange) return 'normal';
  return 'shout';
}

function mkSpeechAtoms(kind: string, fromId: string, toId: string, extra?: any) {
  const base = {
    id: `ctx:${kind}:${fromId}:${toId}`,
    magnitude: 1,
    confidence: 0.8,
    meta: { kind, ...extra },
  };
  return [base];
}

function nearestNavNode(loc: any, x: number, y: number, maxDist: number): { id: string; x: number; y: number } | null {
  const nodes = loc?.nav?.nodes;
  if (!Array.isArray(nodes) || !nodes.length) return null;
  let best: any = null;
  let bd = Infinity;
  for (const n of nodes) {
    const dx = Number(n.x) - x;
    const dy = Number(n.y) - y;
    const d = hypot(dx, dy);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  if (!best) return null;
  return bd <= maxDist ? { id: String(best.id), x: Number(best.x), y: Number(best.y) } : null;
}

function enumerateMoveXYOffers(world: SimWorld, actorId: string): ActionOffer[] {
  const c = getChar(world, actorId);
  const loc = getLoc(world, c.locId);
  const cfg = getSpatialConfig(world);
  const cur = getCharXY(world, c.id);

  const offers: ActionOffer[] = [];

  // 1) If we have nav graph + current node, offer moves to adjacent nodes.
  const nodeId = String(c.pos?.nodeId ?? '');
  const nodes = loc?.nav?.nodes ?? [];
  const edges = loc?.nav?.edges ?? [];
  if (nodeId && Array.isArray(nodes) && Array.isArray(edges) && edges.length) {
    const neigh = edges
      .filter((e: any) => String(e.a) === nodeId || String(e.b) === nodeId)
      .map((e: any) => (String(e.a) === nodeId ? String(e.b) : String(e.a)));

    for (const nid of neigh.slice(0, 8)) {
      const n = nodes.find((nn: any) => String(nn.id) === nid);
      if (!n) continue;
      const x = Number(n.x);
      const y = Number(n.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const dx = x - cur.x;
      const dy = y - cur.y;
      const d = hypot(dx, dy);
      if (!Number.isFinite(d) || d <= 0) continue;
      if (d > cfg.moveMaxStep * 1.05) continue;
      offers.push({
        kind: 'move_xy',
        actorId,
        payload: { locationId: c.locId, x, y },
        meta: { toNodeId: nid },
        score: 0.14,
      });
    }
  }

  // 2) Small “patrol” step towards closest other character.
  let bestOther: string | null = null;
  let bestD = Infinity;
  for (const o of Object.values(world.characters)) {
    if (o.id === c.id) continue;
    if (o.locId !== c.locId) continue;
    const d = distSameLocation(world, c.id, o.id);
    if (Number.isFinite(d) && d < bestD) {
      bestD = d;
      bestOther = o.id;
    }
  }
  if (bestOther && Number.isFinite(bestD) && bestD > cfg.attackRange * 0.95) {
    const to = getCharXY(world, bestOther);
    const dx = to.x - cur.x;
    const dy = to.y - cur.y;
    const d = hypot(dx, dy);
    if (Number.isFinite(d) && d > 1e-6) {
      const t = Math.min(1, cfg.moveMaxStep / d);
      offers.push({
        kind: 'move_xy',
        actorId,
        payload: { locationId: c.locId, x: cur.x + dx * t, y: cur.y + dy * t },
        meta: { toward: bestOther },
        score: 0.11,
      });
    }
  }

  return offers;
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
    const c = getChar(world, action.actorId);
    c.energy = clamp01(c.energy + 0.01);
    return {
      world,
      events: [mkActionEvent(world, 'action:wait', { actorId: c.id, locationId: c.locId })],
      notes: [`${c.id} waits`],
    };
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

const MoveXYSpec: ActionSpec = {
  kind: 'move_xy',
  enumerate: ({ world, actorId }) => enumerateMoveXYOffers(world, actorId),
  validateV1: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    try {
      const c = getChar(world, base.actorId);
      const locId = String((offer as any)?.payload?.locationId ?? c.locId);
      const loc = getLoc(world, locId);
      const mapW = Number((loc as any)?.map?.width ?? (loc as any)?.width ?? 1024);
      const mapH = Number((loc as any)?.map?.height ?? (loc as any)?.height ?? 768);
      const x = Number((offer as any)?.payload?.x);
      const y = Number((offer as any)?.payload?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...base, blocked: true, reason: 'v1:bad-xy', score: 0 };
      if (!Number.isFinite(mapW) || !Number.isFinite(mapH)) return { ...base, blocked: true, reason: 'v1:bad-map', score: 0 };
      // Per-tick max step (prevents teleport drags).
      const cfg = getSpatialConfig(world);
      const cur = getCharXY(world, c.id);
      const dx = x - cur.x;
      const dy = y - cur.y;
      const d = hypot(dx, dy);
      if (Number.isFinite(d) && d > cfg.moveMaxStep * 1.25) {
        return { ...base, blocked: true, reason: 'v1:step-too-far', score: 0 };
      }
      return base;
    } catch {
      return { ...base, blocked: true, reason: 'v1:invalid', score: 0 };
    }
  },
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const loc = getLoc(world, c.locId);
    const mapW = Number((loc as any)?.map?.width ?? (loc as any)?.width ?? 1024);
    const mapH = Number((loc as any)?.map?.height ?? (loc as any)?.height ?? 768);
    const cfg = getSpatialConfig(world);
    const cur = getCharXY(world, c.id);

    const x0 = Number(action.payload?.x);
    const y0 = Number(action.payload?.y);
    const gx = Number.isFinite(x0) ? clamp(x0, 0, mapW) : cur.x;
    const gy = Number.isFinite(y0) ? clamp(y0, 0, mapH) : cur.y;

    const dx = gx - cur.x;
    const dy = gy - cur.y;
    const d = hypot(dx, dy);
    const maxStep = Math.max(1e-6, Number(cfg.moveMaxStep));
    const t = (Number.isFinite(d) && d > maxStep) ? (maxStep / d) : 1;

    const x = cur.x + dx * t;
    const y = cur.y + dy * t;

    // Snap to nearest node if close (keeps nodeId consistent for nav-based offers)
    const snap = nearestNavNode(loc, x, y, 12);
    c.pos = {
      nodeId: snap ? snap.id : (c.pos?.nodeId ?? null),
      x: snap ? snap.x : x,
      y: snap ? snap.y : y,
    };
    // energy cost scales with moved distance
    const moved = Number.isFinite(d) ? Math.min(d, maxStep) : 0;
    c.energy = clamp01(c.energy - clamp01(moved / maxStep) * 0.012);
    notes.push(`${c.id} moves_xy to (${Math.round(c.pos.x)},${Math.round(c.pos.y)})`);
    events.push(mkActionEvent(world, 'action:move_xy', {
      actorId: c.id,
      locationId: c.locId,
      x: c.pos.x,
      y: c.pos.y,
      nodeId: c.pos.nodeId ?? null,
    }));
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
  intentTicks: 3,
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
  classifyV3: () => 'intent',
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
    const cfg = getSpatialConfig(world);
    const out: ActionOffer[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      const d = distSameLocation(world, c.id, other.id);
      if (!Number.isFinite(d) || d > cfg.talkRange) continue;
      const volume = autoVolume(world, c.id, other.id);
      out.push({ kind: 'talk', actorId, targetId: other.id, meta: { volume }, score: 0.15 });
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

      // Spatial gating: whisper/normal require proximity; shout is wide.
      const cfg = getSpatialConfig(world);
      const volume = parseVolume((offer as any)?.meta?.volume);
      const d = distSameLocation(world, c.id, otherId);
      const maxD = (volume === 'whisper') ? cfg.whisperRange : (volume === 'shout') ? cfg.shoutRange : cfg.talkRange;
      if (Number.isFinite(d) && d > maxD) {
        return { ...base, blocked: true, reason: 'v1:too-far', score: 0 };
      }
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
    const volume = parseVolume(action.meta?.volume);
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
      volume,
      topic: 'talk',
      text: 'shares an update',
      atoms: mkSpeechAtoms('talk', c.id, otherId, { tone: 'neutral' }),
    };
    events.push(mkActionEvent(world, 'speech:v1', speech));
    return { world, events, notes };
  },
};

const AttackSpec: ActionSpec = {
  kind: 'attack',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const cfg = getSpatialConfig(world);
    const out: ActionOffer[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      const d = distSameLocation(world, c.id, other.id);
      if (!Number.isFinite(d) || d > cfg.attackRange) continue;
      out.push({ kind: 'attack', actorId, targetId: other.id, score: 0.08 });
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
      const cfg = getSpatialConfig(world);
      const d = distSameLocation(world, c.id, otherId);
      if (Number.isFinite(d) && d > cfg.attackRange) {
        return { ...base, blocked: true, reason: 'v1:too-far', score: 0 };
      }
      return base;
    } catch {
      return { ...base, blocked: true, reason: 'v1:invalid', score: 0 };
    }
  },
  validateV2: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    if (normLevel(world, c.locId, 'no_violence') >= 0.7) {
      return { ...base, blocked: true, reason: 'norm:no_violence', score: 0 };
    }
    return base;
  },
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const targetId = String(action.targetId ?? '');
    const t = world.characters[targetId];
    if (!t || t.locId !== c.locId) {
      notes.push(`${c.id} attack blocked (no target)`);
      events.push(mkActionEvent(world, 'action:attack', { actorId: c.id, targetId: targetId || null, ok: false, locationId: c.locId }));
      return { world, events, notes };
    }
    const cfg = getSpatialConfig(world);
    const d = distSameLocation(world, c.id, targetId);
    if (Number.isFinite(d) && d > cfg.attackRange) {
      notes.push(`${c.id} attack blocked (too far)`);
      events.push(mkActionEvent(world, 'action:attack', { actorId: c.id, targetId, ok: false, reason: 'too_far', locationId: c.locId }));
      return { world, events, notes };
    }

    // Minimal combat: stress spike + small health delta.
    c.stress = clamp01(c.stress + 0.03);
    c.energy = clamp01(c.energy - 0.02);
    t.health = clamp01(t.health - 0.08);
    t.stress = clamp01(t.stress + 0.06);
    notes.push(`${c.id} attacks ${targetId}`);
    events.push(mkActionEvent(world, 'action:attack', { actorId: c.id, targetId, ok: true, locationId: c.locId }));
    return { world, events, notes };
  },
};

const ObserveSpec: ActionSpec = {
  kind: 'observe',
  enumerate: ({ actorId }) => [{ kind: 'observe', actorId, score: 0.12 }],
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const c = getChar(world, action.actorId);
    c.energy = clamp01(c.energy - 0.01);
    world.facts[`observeBoost:${c.id}`] = world.tickIndex;
    return {
      world,
      events: [mkActionEvent(world, 'action:observe', { actorId: c.id, locationId: c.locId })],
      notes: [`${c.id} observes carefully`],
    };
  },
};

const QuestionAboutSpec: ActionSpec = {
  kind: 'question_about',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const cfg = getSpatialConfig(world);
    const out: ActionOffer[] = [];
    const feats = featuresAtNode(world, c.locId, c.pos?.nodeId);
    const topic = feats[0]?.id || 'situation';
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      const d = distSameLocation(world, c.id, other.id);
      if (!Number.isFinite(d) || d > cfg.talkRange) continue;
      const volume = autoVolume(world, c.id, other.id);
      out.push({ kind: 'question_about', actorId, targetId: other.id, meta: { topic, volume }, score: 0.18 });
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

      // Spatial gating (same as talk).
      const cfg = getSpatialConfig(world);
      const volume = parseVolume((offer as any)?.meta?.volume);
      const d = distSameLocation(world, c.id, otherId);
      const maxD = (volume === 'whisper') ? cfg.whisperRange : (volume === 'shout') ? cfg.shoutRange : cfg.talkRange;
      if (Number.isFinite(d) && d > maxD) {
        return { ...base, blocked: true, reason: 'v1:too-far', score: 0 };
      }
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
    const volume = parseVolume(action.meta?.volume);
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
      volume,
      topic,
      text: `asks about ${topic}`,
      atoms: mkSpeechAtoms('question', c.id, otherId, { topic }),
    };
    events.push(mkActionEvent(world, 'speech:v1', speech));
    return { world, events, notes };
  },
};

const NegotiateSpec: ActionSpec = {
  kind: 'negotiate',
  intentTicks: 3,
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const cfg = getSpatialConfig(world);
    const out: ActionOffer[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      const d = distSameLocation(world, c.id, other.id);
      if (!Number.isFinite(d) || d > cfg.talkRange) continue;
      const volume = autoVolume(world, c.id, other.id);
      out.push({ kind: 'negotiate', actorId, targetId: other.id, meta: { volume }, score: 0.16 });
    }
    return out;
  },
  validateV1: ({ world, offer }) => QuestionAboutSpec.validateV1({ world, actorId: offer.actorId, offer }),
  validateV2: ({ world, offer }) => QuestionAboutSpec.validateV2({ world, actorId: offer.actorId, offer }),
  classifyV3: () => 'intent',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const otherId = String(action.targetId ?? '');
    const volume = parseVolume(action.meta?.volume);
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
      volume,
      topic: 'terms',
      text: 'proposes terms',
      atoms: mkSpeechAtoms('negotiate', c.id, otherId, { topic: 'terms' }),
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
    const remainingTicks = Math.max(1, Number(payload.remainingTicks ?? 2));

    // Minimal intent storage: one active intent per actor (v0).
    world.facts[`intent:${c.id}`] = {
      id: intentId,
      startedAtTick: world.tickIndex,
      remainingTicks,
      intent,
    };

    notes.push(`${c.id} starts intent ${intentId} (remainingTicks=${remainingTicks})`);
    events.push(mkActionEvent(world, 'action:start_intent', {
      actorId: c.id,
      locationId: c.locId,
      intentId,
      remainingTicks,
      intent,
    }));
    return { world, events, notes };
  },
};

const ContinueIntentSpec: ActionSpec = {
  kind: 'continue_intent',
  enumerate: ({ actorId }) => [{ kind: 'continue_intent', actorId, score: 0.35 }],
  validateV1: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    const cur = world.facts[`intent:${c.id}`];
    if (!cur) return { ...base, blocked: true, reason: 'intent:none', score: 0 };
    return base;
  },
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const key = `intent:${c.id}`;
    const cur = world.facts[key];
    if (!cur || typeof cur !== 'object') {
      notes.push(`${c.id} continue_intent: none`);
      events.push(mkActionEvent(world, 'action:continue_intent', { actorId: c.id, ok: false, reason: 'none' }));
      return { world, events, notes };
    }

    const remainingBefore = Math.max(0, Number((cur as any).remainingTicks ?? 0));
    const remainingAfter = Math.max(0, remainingBefore - 1);
    (cur as any).remainingTicks = remainingAfter;
    world.facts[key] = cur;

    notes.push(`${c.id} continues intent ${(cur as any).id} (${remainingBefore} -> ${remainingAfter})`);
    events.push(mkActionEvent(world, 'action:continue_intent', {
      actorId: c.id,
      locationId: c.locId,
      intentId: (cur as any).id,
      remainingBefore,
      remainingAfter,
      ok: true,
    }));

    if (remainingAfter <= 0) {
      const original = (cur as any)?.intent?.originalAction;
      if (original && typeof original === 'object' && original.kind && ACTION_SPECS[original.kind as ActionKind]) {
        const oa: SimAction = {
          id: `act:intent_complete:${world.tickIndex}:${c.id}:${String(original.kind)}`,
          kind: original.kind as ActionKind,
          actorId: c.id,
          targetId: original.targetId ?? null,
          payload: original.payload ?? null,
          meta: original.meta ?? null,
        };
        const spec = ACTION_SPECS[oa.kind];
        const r = spec.apply({ world, action: oa });
        world = r.world;
        events.push(...r.events);
        notes.push(...r.notes.map((x) => `intent.complete: ${x}`));
      } else {
        notes.push(`${c.id} intent complete: no originalAction`);
      }
      delete world.facts[key];
      events.push(mkActionEvent(world, 'action:intent_complete', {
        actorId: c.id,
        locationId: c.locId,
        intentId: (cur as any).id,
      }));
    }

    return { world, events, notes };
  },
};

const AbortIntentSpec: ActionSpec = {
  kind: 'abort_intent',
  enumerate: ({ actorId }) => [{ kind: 'abort_intent', actorId, score: 0.12 }],
  validateV1: ({ world, offer }) => {
    const base = validateCommon(world, offer);
    const c = getChar(world, base.actorId);
    const cur = world.facts[`intent:${c.id}`];
    if (!cur) return { ...base, blocked: true, reason: 'intent:none', score: 0 };
    return base;
  },
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const key = `intent:${c.id}`;
    const cur = world.facts[key];
    delete world.facts[key];
    notes.push(`${c.id} aborts intent ${String((cur as any)?.id ?? 'unknown')}`);
    events.push(mkActionEvent(world, 'action:abort_intent', {
      actorId: c.id,
      locationId: c.locId,
      intentId: (cur as any)?.id ?? null,
    }));
    return { world, events, notes };
  },
};
export const ACTION_SPECS: Record<ActionKind, ActionSpec> = {
  wait: WaitSpec,
  rest: RestSpec,
  move: MoveSpec,
  move_xy: MoveXYSpec,
  talk: TalkSpec,
  attack: AttackSpec,
  observe: ObserveSpec,
  question_about: QuestionAboutSpec,
  negotiate: NegotiateSpec,
  inspect_feature: InspectFeatureSpec,
  repair_feature: RepairFeatureSpec,
  scavenge_feature: ScavengeFeatureSpec,
  start_intent: StartIntentSpec,
  continue_intent: ContinueIntentSpec,
  abort_intent: AbortIntentSpec,
};

export function enumerateActionOffers(world: SimWorld): ActionOffer[] {
  const offers: ActionOffer[] = [];
  const actorIds = Object.keys(world.characters || {}).sort();

  for (const actorId of actorIds) {
    const ctx: OfferCtx = { world, actorId };

    // If an actor has an active intent, restrict offers to continue/abort/wait.
    const hasIntent = Boolean(world.facts[`intent:${actorId}`]);
    if (hasIntent) {
      for (const kind of ['continue_intent', 'abort_intent', 'wait'] as ActionKind[]) {
        const spec = ACTION_SPECS[kind];
        const raw = spec.enumerate(ctx);
        const seeds: ActionOffer[] = raw.length ? raw : [{ kind, actorId, score: kind === 'continue_intent' ? 0.35 : 0.15 }];
        for (const o of seeds) {
          const v1 = spec.validateV1({ ...ctx, offer: o });
          const v2 = spec.validateV2({ ...ctx, offer: v1 });
          offers.push(v2);
        }
      }
      continue;
    }

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
