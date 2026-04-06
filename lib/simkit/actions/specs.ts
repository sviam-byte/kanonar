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
import { distSameLocation, getCellCover, getCellElevation, getCharXY, getSpatialConfig, hasLineOfSight } from '../core/spatial';
import { getDyadTrust } from '../core/trust';
import { clamp01 } from '../../util/math';
import { buildGenericSocialSpec } from './genericSocialSpec';
import { recordTrail } from '../core/mapTypes';
import { RespondSpec } from './respondSpec';
import { MoveCellSpec } from './moveCellSpec';
import { decideSpeechContent } from '../dialogue/speechContent';
import { FCS } from '../../config/formulaConfigSim';
import { familyOfActionKind, normalizeTargetId } from '../../behavior/actionPattern';
import { markIntentCooldown, readIntentCooldown } from '../core/behaviorMemory';
import { getIntentStaleness, isCriticalIntentStage } from '../core/intentLifecycle';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

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

// Relation helpers: store dyadic values in a JSON-friendly matrix.
function ensureRelations(world: SimWorld) {
  const facts: any = world.facts as any;
  if (!facts.relations || typeof facts.relations !== 'object') facts.relations = {};
  return facts.relations as any;
}

function bumpRelation(world: SimWorld, fromId: string, toId: string, key: 'trust' | 'respect', delta: number) {
  const rel = ensureRelations(world);
  if (!rel[fromId] || typeof rel[fromId] !== 'object') rel[fromId] = {};
  if (!rel[fromId][toId] || typeof rel[fromId][toId] !== 'object') rel[fromId][toId] = {};
  const cur = Number(rel[fromId][toId][key]);
  const base = Number.isFinite(cur) ? cur : getDyadTrust(world, fromId, toId);
  rel[fromId][toId][key] = clamp01(base + delta);
}

// -----------------------------------------------------------------------------
// Social -> Intent decomposition helpers (Goal/Action fractalization)
// We implement "talk" / "question_about" as complex transactions:
//   Approach -> Attach -> Execute -> Detach
// Actual social act (speech + relation effects) is executed as originalAction at intent completion.
// This keeps intent runtime JSON-safe and avoids emitting speech from the intent engine.
// -----------------------------------------------------------------------------

function getCharPosXY(world: SimWorld, charId: string): { x: number; y: number } | null {
  try {
    const xy = getCharXY(world, charId);
    if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) return null;
    return { x: xy.x, y: xy.y };
  } catch {
    return null;
  }
}

function buildApproachToCharScriptV1(
  world: SimWorld,
  actorId: string,
  targetId: string,
  scriptId: string,
  explain?: string[]
) {
  const dest = getCharPosXY(world, targetId) ?? { x: 0, y: 0 };
  return {
    id: scriptId,
    explain: explain ?? [],
    stages: [
      {
        kind: 'approach',
        ticksRequired: 'until_condition',
        perTick: [
          // Set destination for until_condition heuristic + step toward it.
          { target: 'agent', key: 'dest', op: 'set', value: dest },
          { target: 'agent', key: 'move_toward', op: 'set', value: dest },
        ],
      },
      { kind: 'attach', ticksRequired: 1 },
      { kind: 'execute', ticksRequired: 1 },
      { kind: 'detach', ticksRequired: 1 },
    ],
  };
}

function mkSocialStartIntentOfferV1(args: {
  world: SimWorld;
  actorId: string;
  targetId: string;
  baseScore: number;
  social: string;
  volume: 'whisper' | 'normal' | 'shout';
  kind: 'talk' | 'question_about';
  topic?: string;
  tags?: string[];
}) {
  const { world, actorId, targetId, baseScore, social, volume, kind, topic, tags } = args;
  const scriptId = kind === 'question_about' ? `dialog:${social}:${topic ?? 'topic'}` : `dialog:${social}`;
  const intentScript = buildApproachToCharScriptV1(
    world,
    actorId,
    targetId,
    scriptId,
    [
      `Decompose ${kind.toUpperCase()} -> transaction`,
      `FindTarget(${targetId})`,
      `Plan: Approach -> Attach -> Execute(${social}) -> Detach`,
    ],
  );

  const originalAction: any = {
    kind,
    actorId,
    targetId,
    meta: { volume, social, ...(topic ? { topic } : {}), tags: tags ?? [] },
    payload: null,
  };

  return {
    kind: 'start_intent',
    actorId,
    targetId,
    score: baseScore,
    meta: { scriptId, tags: tags ?? [] },
    payload: {
      intentId: `intent:${actorId}:${kind}:${social}:${world.tickIndex}`,
      remainingTicks: 9999,
      intentScript,
      intent: { originalAction },
    },
  } as any;
}

function featuresAtNode(world: SimWorld, locId: string, nodeId: string | undefined) {
  const loc = getLoc(world, locId);
  const xs = Array.isArray((loc as any)?.features) ? (loc as any).features : [];
  if (!nodeId) return xs;
  return xs.filter((f: any) => !f.nodeId || f.nodeId === nodeId);
}

// Auto-select volume based on distance to the target.
function autoVolume(world: SimWorld, aId: string, bId: string): 'whisper' | 'normal' | 'shout' {
  const cfg = getSpatialConfig(world);
  const d = distSameLocation(world, aId, bId);
  if (!Number.isFinite(d)) return 'normal';
  if (d <= cfg.whisperRange * 0.9) return 'whisper';
  if (d <= cfg.talkRange) return 'normal';
  return 'shout';
}

// NOTE: Stage2 rule:
// talk/question_about are NOT executable as direct ActionSpecs anymore.
// They exist only as originalAction executed on intent_complete (meta.internal=true).

function isInternalCall(action: any) {
  return Boolean(action?.meta && typeof action.meta === 'object' && (action.meta as any).internal === true);
}

// Standardize speech atoms for talk/question/negotiate.
// Legacy fallback — returns one generic atom when no pipeline data exists.
function mkSpeechAtomsFallback(kind: string, fromId: string, toId: string, extra?: any) {
  const base = {
    id: `ctx:${kind}:${fromId}:${toId}`,
    magnitude: 1,
    confidence: 0.8,
    meta: { kind, ...extra },
  };
  return [base];
}

/**
 * Collect relevant belief/context atoms the speaker actually has,
 * filter through decideSpeechContent (truthful/selective/deceptive),
 * and return the atom set + intent metadata for SpeechEventV1.
 */
function buildSpeechAtoms(
  world: SimWorld,
  speakerId: string,
  targetId: string,
  social: string,
): {
  atoms: Array<{ id: string; magnitude: number; confidence: number; meta?: any }>;
  intent: 'truthful' | 'selective' | 'deceptive';
  omittedCount: number;
  distortedCount: number;
} {
  const facts: any = world.facts || {};

  // 1) Gather what the speaker knows: agentAtoms + recent nonverbal observations.
  const agentAtoms: any[] = Array.isArray(facts[`agentAtoms:${speakerId}`])
    ? facts[`agentAtoms:${speakerId}`]
    : [];
  // Add own context axes as "things I can talk about".
  const ctxKeys = Object.keys(facts).filter(
    (k) => k.startsWith(`ctx:`) && k.endsWith(`:${speakerId}`) && typeof facts[k] === 'number',
  );
  const ctxAtoms = ctxKeys.map((k) => {
    const parts = k.split(':');
    const axis = parts.slice(1, -1).join(':');
    return {
      id: k,
      magnitude: clamp01(Number(facts[k])),
      confidence: 0.85,
      meta: { axis, source: 'self' },
    };
  });

  // Only include atoms with meaningful magnitude for topic relevance.
  const topicPool = [...agentAtoms, ...ctxAtoms]
    .filter((a) => typeof a?.magnitude === 'number' && a.magnitude > 0.15)
    .sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0))
    .slice(0, 12);

  if (!topicPool.length) {
    return {
      atoms: mkSpeechAtomsFallback(social, speakerId, targetId, { social }),
      intent: 'truthful',
      omittedCount: 0,
      distortedCount: 0,
    };
  }

  // 2) Build goal scores from pipeline trace for decideSpeechContent.
  const trace = facts[`sim:trace:${speakerId}`];
  const goalScores: Record<string, number> = {};
  if (trace?.goalScores && typeof trace.goalScores === 'object') {
    for (const [k, v] of Object.entries(trace.goalScores)) {
      if (typeof v === 'number') goalScores[k] = v;
    }
  }

  // 3) Run speech content filter (truthful / selective / deceptive).
  const result = decideSpeechContent(world, {
    speakerId,
    targetId,
    beliefAtoms: topicPool,
    topicAtoms: topicPool,
    goalScores,
  });

  const speechAtoms = result.atoms.map((a: any) => ({
    id: String(a.id || ''),
    magnitude: Number(a.magnitude ?? 0),
    confidence: Number(a.confidence ?? 0.6),
    meta: {
      ...(a.meta || {}),
      from: speakerId,
      speechIntent: result.intent,
      ...(a.trueMagnitude != null ? { trueMagnitude: a.trueMagnitude } : {}),
    },
  }));

  return {
    atoms: speechAtoms.length ? speechAtoms : mkSpeechAtomsFallback(social, speakerId, targetId, { social }),
    intent: result.intent,
    omittedCount: result.omitted?.length ?? 0,
    distortedCount: result.distorted?.length ?? 0,
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
    c.energy = clamp01(c.energy + 0.01);
    notes.push(`${c.id} waits`);
    events.push(mkActionEvent(world, 'action:wait', { actorId: c.id, locationId: c.locId }));
    return { world, events, notes };
  },
};

const RestSpec: ActionSpec = {
  kind: 'rest',
  enumerate: () => [],
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
  // UI-only: do not enumerate in policy offers (only forcedActions).
  enumerate: () => [],
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
      // Allow a small out-of-bounds margin (UI drags), clamp in apply.
      if (x < -50 || y < -50 || x > mapW + 50 || y > mapH + 50) {
        return { ...base, blocked: true, reason: 'v1:xy-oob', score: 0 };
      }
      // Per-tick max step (prevents teleport drags).
      const cfg = getSpatialConfig(world);
      const cur = getCharXY(world, c.id);
      const dx = x - cur.x;
      const dy = y - cur.y;
      const d = Math.sqrt(dx * dx + dy * dy);
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
    const locId = String(action.payload?.locationId ?? c.locId);
    const loc = getLoc(world, locId);
    const mapW = Number((loc as any)?.map?.width ?? (loc as any)?.width ?? 1024);
    const mapH = Number((loc as any)?.map?.height ?? (loc as any)?.height ?? 768);
    const cfg = getSpatialConfig(world);
    const x0 = Number(action.payload?.x);
    const y0 = Number(action.payload?.y);
    const goalX = Number.isFinite(x0) ? clamp(x0, 0, mapW) : (c.pos?.x ?? 0);
    const goalY = Number.isFinite(y0) ? clamp(y0, 0, mapH) : (c.pos?.y ?? 0);

    const cur = getCharXY(world, c.id);
    const dx = goalX - cur.x;
    const dy = goalY - cur.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const maxStep = Math.max(1e-6, Number(cfg.moveMaxStep));
    const t = (Number.isFinite(d) && d > maxStep) ? (maxStep / d) : 1;
    const x = cur.x + dx * t;
    const y = cur.y + dy * t;
    // Only local reposition (no locId change).
    c.pos = { nodeId: null, x, y };
    recordTrail(world.facts as any, c.id, world.tickIndex, c.locId, undefined, x, y);
    // energy cost scales with moved distance
    const moved = Number.isFinite(d) ? Math.min(d, maxStep) : 0;
    c.energy = clamp01(c.energy - clamp01(moved / maxStep) * 0.012);
    notes.push(`${c.id} moves_xy to (${Math.round(x)},${Math.round(y)})`);
    events.push(mkActionEvent(world, 'action:move_xy', { actorId: c.id, locationId: c.locId, x, y }));
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
      recordTrail(world.facts as any, c.id, world.tickIndex, c.locId, action.targetNodeId, n?.x, n?.y);
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
    recordTrail(world.facts as any, c.id, world.tickIndex, c.locId, c.pos?.nodeId ?? undefined, c.pos?.x, c.pos?.y);
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
  enumerate: () => [],
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
      const volume = String((offer as any)?.meta?.volume ?? 'normal') as 'whisper' | 'normal' | 'shout';
      const d = distSameLocation(world, c.id, otherId);
      const maxD = volume === 'whisper' ? cfg.whisperRange : volume === 'shout' ? cfg.shoutRange : cfg.talkRange;
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
    if (!isInternalCall(action)) {
      return {
        world,
        events: [mkActionEvent(world, 'action:blocked', { kind: 'talk', actorId: action.actorId, reason: 'use_intent' })],
        notes: [`${action.actorId} talk blocked (use start_intent->intent_complete)`],
      };
    }
    const c = getChar(world, action.actorId);
    const otherId = String(action.targetId ?? '');
    const volume = String(action.meta?.volume ?? 'normal') as 'whisper' | 'normal' | 'shout';
    const social = String(action.meta?.social ?? 'inform');
    const trust = getDyadTrust(world, c.id, otherId);

    // Default effect: reduces stress slightly.
    c.stress = clamp01(c.stress - 0.015);
    world.facts[`talk:${social}:${c.id}:${otherId}`] = (world.facts[`talk:${social}:${c.id}:${otherId}`] ?? 0) + 1;

    // Social effects: minimal but visible in facts.relations.
    if (social === 'offer_resource') {
      bumpRelation(world, otherId, c.id, 'trust', +0.04);
      bumpRelation(world, c.id, otherId, 'trust', +0.01);
      c.energy = clamp01(c.energy - 0.01);
    } else if (social === 'request_access') {
      c.stress = clamp01(c.stress + 0.005);
    } else if (social === 'intimidate') {
      bumpRelation(world, otherId, c.id, 'trust', -0.08);
      c.stress = clamp01(c.stress + 0.01);
      const t = world.characters[otherId];
      if (t) (t as any).stress = clamp01(Number((t as any).stress ?? 0) + 0.04);
    } else if (social === 'insult') {
      bumpRelation(world, otherId, c.id, 'trust', -0.1);
      bumpRelation(world, otherId, c.id, 'respect', -0.06);
      c.stress = clamp01(c.stress + 0.015);
      const t = world.characters[otherId];
      if (t) (t as any).stress = clamp01(Number((t as any).stress ?? 0) + 0.06);
    } else if (social === 'confront') {
      // Confrontation is assertive pressure: trust goes down, respect can rise slightly.
      bumpRelation(world, otherId, c.id, 'trust', -0.05);
      bumpRelation(world, otherId, c.id, 'respect', +0.03);
      bumpRelation(world, c.id, otherId, 'trust', -0.03);
      c.stress = clamp01(c.stress + 0.02);
      c.energy = clamp01(c.energy - 0.01);
      const t = world.characters[otherId];
      if (t) (t as any).stress = clamp01(Number((t as any).stress ?? 0) + 0.05);
    } else if (social === 'help' || social === 'cooperate' || social === 'protect') {
      // Cooperative acts improve trust and calm the local social state.
      bumpRelation(world, otherId, c.id, 'trust', +0.06);
      bumpRelation(world, c.id, otherId, 'trust', +0.03);
      bumpRelation(world, otherId, c.id, 'respect', +0.02);
      c.stress = clamp01(c.stress - 0.02);
      c.energy = clamp01(c.energy - 0.02);
      const t = world.characters[otherId];
      if (t) (t as any).stress = clamp01(Number((t as any).stress ?? 0) - 0.03);
    } else if (social === 'submit') {
      // Submission signals deference and slightly increases counterpart respect.
      bumpRelation(world, otherId, c.id, 'trust', +0.02);
      bumpRelation(world, c.id, otherId, 'respect', +0.04);
      c.stress = clamp01(c.stress - 0.01);
    } else if (social === 'threaten') {
      // Explicit threat is stronger than generic intimidation.
      bumpRelation(world, otherId, c.id, 'trust', -0.12);
      bumpRelation(world, otherId, c.id, 'respect', -0.04);
      c.stress = clamp01(c.stress + 0.02);
      const t = world.characters[otherId];
      if (t) (t as any).stress = clamp01(Number((t as any).stress ?? 0) + 0.07);
    }

    notes.push(`${c.id} ${social} -> ${otherId}`);
    events.push(mkActionEvent(world, 'action:talk', {
      actorId: c.id,
      targetId: otherId,
      locationId: c.locId,
      social,
    }));
    // ── Build speech event with rich Russian text ──
    // Pull communicativeIntent from pipeline trace if available.
    const pipelineData = (world.facts as any)?.[`sim:pipeline:${c.id}`];
    const ci = pipelineData?.communicativeIntent;
    const ciTopic = ci?.topic?.primary || '';
    const ciFacts = Array.isArray(ci?.topic?.facts) ? ci.topic.facts : [];

    const SPEECH_TEXT_RU: Record<string, string> = {
      inform: 'делится информацией',
      offer_resource: 'предлагает ресурсы',
      request_access: 'просит доступ',
      intimidate: 'пытается запугать',
      insult: 'оскорбляет',
      confront: 'выясняет отношения',
      help: 'предлагает помощь',
      cooperate: 'предлагает сотрудничество',
      protect: 'обещает защиту',
      submit: 'уступает',
      threaten: 'угрожает',
    };

    // ── Collect atoms and run speech content filter ──
    const speechData = buildSpeechAtoms(world, c.id, otherId, social);

    // ── Build descriptive text from CI + atoms ──
    let speechText = SPEECH_TEXT_RU[social] || 'обращается';
    if (ciTopic && ciTopic !== social && !ciTopic.startsWith('schema_')) {
      speechText += ` (тема: ${ciTopic})`;
    }
    if (ciFacts.length) {
      const cleanFacts = ciFacts.filter((f: string) => f && !f.startsWith('schema_'));
      if (cleanFacts.length) speechText += ': ' + cleanFacts.slice(0, 3).join('; ');
    }
    // Append key atom summaries for narrative readability.
    const topAtomSummaries = speechData.atoms
      .filter((a: any) => a.magnitude > 0.3)
      .slice(0, 3)
      .map((a: any) => {
        const short = String(a.id || '').replace(/^ctx:/, '').replace(/:.*$/, '');
        return `${short}:${a.magnitude.toFixed(1)}`;
      });
    if (topAtomSummaries.length && !ciFacts.length) {
      speechText += ' [' + topAtomSummaries.join(', ') + ']';
    }

    const speech: SpeechEventV1 = {
      schema: 'SpeechEventV1',
      actorId: c.id,
      targetId: otherId,
      act: social === 'request_access'
        ? 'ask'
        : social === 'offer_resource' || social === 'help' || social === 'cooperate' || social === 'protect'
          ? 'promise'
          : social === 'intimidate' || social === 'insult' || social === 'threaten'
            ? 'threaten'
            : social === 'confront'
              ? 'negotiate'
              : 'inform',
      volume,
      topic: ciTopic || social,
      intent: speechData.intent,
      text: speechText,
      atoms: speechData.atoms,
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
      // Spatial sanity: no attacks through blocked line-of-sight.
      let los = true;
      try { los = hasLineOfSight(world, c.id, other.id); } catch { /* no grid map => open */ }
      if (!los) continue;
      // Hidden targets are harder to detect and therefore less likely to be chosen.
      const isHidden = Boolean((world.facts as any)?.[`ctx:hidden:${other.id}`]);
      out.push({ kind: 'attack', actorId, targetId: other.id, score: isHidden ? 0.03 : 0.08 });
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

    // LoS gate at apply time (enumerate may be stale relative to world update).
    let losBlocked = false;
    try { losBlocked = !hasLineOfSight(world, c.id, targetId); } catch { /* no grid map => open */ }
    if (losBlocked) {
      notes.push(`${c.id} attack blocked (no line of sight to ${targetId})`);
      events.push(mkActionEvent(world, 'action:attack', { actorId: c.id, targetId, ok: false, reason: 'no_los', locationId: c.locId }));
      return { world, events, notes };
    }

    // Cover and distance-aware damage model (still deterministic and lightweight).
    let targetCover = 0;
    try { targetCover = getCellCover(world, targetId); } catch { /* no grid map => 0 */ }
    const coverReduction = targetCover * 0.6;
    const rangeFactor = Number.isFinite(d)
      ? clamp01(1 - (d / Math.max(1, cfg.attackRange)) * 0.4)
      : 1.0;
    const baseDamage = 0.08;

    // Elevation advantage: high ground improves offense, low ground penalizes it.
    let elevFactor = 1.0;
    try {
      const attackerElev = getCellElevation(world, c.id);
      const targetElev = getCellElevation(world, targetId);
      const elevDiff = attackerElev - targetElev;
      if (elevDiff > 0) elevFactor = 1.0 + 0.12 * Math.min(elevDiff, 3);
      if (elevDiff < 0) elevFactor = 1.0 - 0.08 * Math.min(-elevDiff, 3);
    } catch {
      // no elevation data -> neutral multiplier
    }

    const targetHidden = Boolean((world.facts as any)?.[`ctx:hidden:${targetId}`]);
    const hiddenPenalty = targetHidden ? 0.5 : 1.0;

    const guardedBy = (world.facts as any)?.[`ctx:guardedBy:${targetId}`];
    const guardTick = Number((world.facts as any)?.[`ctx:guardedBy:${targetId}:tick`] ?? -10);
    const guardActive = Boolean(guardedBy) && (world.tickIndex - guardTick) <= 2;
    const guardReduction = guardActive ? 0.30 : 0;

    const damage = clamp01(baseDamage * rangeFactor * (1 - coverReduction) * elevFactor * hiddenPenalty * (1 - guardReduction));

    // Minimal combat: stress spike + scaled health delta.
    c.stress = clamp01(c.stress + 0.03);
    c.energy = clamp01(c.energy - 0.02);
    t.health = clamp01(t.health - damage);
    t.stress = clamp01(t.stress + 0.06);
    notes.push(`${c.id} attacks ${targetId} (dmg=${damage.toFixed(3)}, cover=${targetCover.toFixed(2)}, elev=${elevFactor.toFixed(2)}, range=${Number.isFinite(d) ? d.toFixed(0) : '?'}${targetHidden ? ' HIDDEN' : ''}${guardActive ? ` GUARDED by ${guardedBy}` : ''})`);
    events.push(mkActionEvent(world, 'action:attack', {
      actorId: c.id,
      targetId,
      ok: true,
      damage,
      cover: targetCover,
      distance: d,
      elevation: elevFactor,
      hidden: targetHidden,
      guarded: guardActive,
      locationId: c.locId,
    }));
    return { world, events, notes };
  },
};

const ObserveSpec: ActionSpec = {
  kind: 'observe',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const loc = getLoc(world, c.locId);
    const radiation = Number(loc.hazards?.['radiation'] ?? 0);
    const danger = clamp01(Number((world.facts as any)?.[`ctx:danger:${actorId}`] ?? 0));
    // More dangerous situations → more valuable to observe.
    const score = clamp01(0.12 + 0.22 * radiation + 0.15 * danger);
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
    c.energy = clamp01(c.energy - 0.01);
    world.facts[`observeBoost:${c.id}`] = world.tickIndex;
    world.facts[`observe:${c.id}:${world.tickIndex}`] = true;
    world.facts['observe:count'] = (world.facts['observe:count'] ?? 0) + 1;

    // ── Generate observation atoms: what the agent actually sees ──
    const obsAtoms: any[] = [];
    const cfg = getSpatialConfig(world);
    const facts: any = world.facts || {};

    for (const other of Object.values(world.characters)) {
      if (other.id === c.id || (other as any).locId !== c.locId) continue;

      // LoS check: can we see this agent?
      let los = true;
      try { los = hasLineOfSight(world, c.id, other.id); } catch { /* open */ }
      if (!los) continue;

      const d = distSameLocation(world, c.id, other.id);
      if (!Number.isFinite(d)) continue;

      const distConf = clamp01(1 - d / (cfg.talkRange * 1.5));
      const otherName = other.id;

      // Observe their current action (if visible).
      const lastAct = facts[`lastAction:${other.id}`];
      if (lastAct?.kind) {
        obsAtoms.push({
          id: `obs:action:${c.id}:${otherName}:${world.tickIndex}`,
          magnitude: 0.8,
          confidence: distConf * 0.9,
          meta: {
            from: null,
            to: c.id,
            observedAction: lastAct.kind,
            observedTarget: lastAct.targetId || null,
            observedAgent: otherName,
          },
        });
      }

      // Observe their position.
      const otherPos = getCharXY(world, other.id);
      obsAtoms.push({
        id: `obs:position:${c.id}:${otherName}:${world.tickIndex}`,
        magnitude: 0.6,
        confidence: distConf * 0.85,
        meta: {
          to: c.id,
          observedAgent: otherName,
          position: { x: Math.round(otherPos.x), y: Math.round(otherPos.y) },
        },
      });

      // Observe their approximate health (visible injuries).
      const otherHealth = clamp01(Number((other as any).health ?? 1));
      if (otherHealth < 0.7) {
        obsAtoms.push({
          id: `obs:injury:${c.id}:${otherName}:${world.tickIndex}`,
          magnitude: 1 - otherHealth,
          confidence: distConf * 0.7,
          meta: { to: c.id, observedAgent: otherName },
        });
      }
    }

    // Deliver observation atoms to agent's inbox for next tick processing.
    if (obsAtoms.length) {
      const inbox = (facts['inboxAtoms'] && typeof facts['inboxAtoms'] === 'object')
        ? facts['inboxAtoms'] : {};
      const arr = Array.isArray((inbox as any)[c.id]) ? (inbox as any)[c.id] : [];
      arr.push(...obsAtoms);
      (inbox as any)[c.id] = arr;
      facts['inboxAtoms'] = inbox;
    }

    notes.push(`${c.id} observes (${obsAtoms.length} atoms)`);
    events.push(mkActionEvent(world, 'action:observe', {
      actorId: c.id,
      locationId: c.locId,
      atomCount: obsAtoms.length,
    }));
    return { world, events, notes };
  },
};

const QuestionAboutSpec: ActionSpec = {
  kind: 'question_about',
  enumerate: () => [],
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
      const volume = String((offer as any)?.meta?.volume ?? 'normal') as 'whisper' | 'normal' | 'shout';
      const d = distSameLocation(world, c.id, otherId);
      const maxD = volume === 'whisper' ? cfg.whisperRange : volume === 'shout' ? cfg.shoutRange : cfg.talkRange;
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
    if (!isInternalCall(action)) {
      return {
        world,
        events: [
          mkActionEvent(world, 'action:blocked', {
            kind: 'question_about',
            actorId: action.actorId,
            reason: 'use_intent',
          }),
        ],
        notes: [`${action.actorId} question_about blocked (use start_intent->intent_complete)`],
      };
    }
    const c = getChar(world, action.actorId);
    const otherId = String(action.targetId ?? '');
    const topic = String(action.meta?.topic || 'situation');
    const volume = String(action.meta?.volume ?? 'normal') as 'whisper' | 'normal' | 'shout';
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
    const speechData = buildSpeechAtoms(world, c.id, otherId, 'question');
    const TOPIC_RU: Record<string, string> = {
      situation: 'ситуацию', danger: 'опасность', plan: 'план',
      health: 'здоровье', resources: 'ресурсы', route: 'маршрут',
    };
    const topicRu = TOPIC_RU[topic] || topic;
    const speech: SpeechEventV1 = {
      schema: 'SpeechEventV1',
      actorId: c.id,
      targetId: otherId,
      act: 'ask',
      volume,
      topic,
      intent: speechData.intent,
      text: `спрашивает о: ${topicRu}`,
      atoms: speechData.atoms,
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
    const out: ActionOffer[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      const volume = autoVolume(world, c.id, other.id);
      out.push({ kind: 'negotiate', actorId, targetId: other.id, meta: { volume }, score: 0.16 });
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
    const volume = String(action.meta?.volume ?? 'normal') as 'whisper' | 'normal' | 'shout';
    // переговоры немного "съедают энергию"
    c.energy = clamp01(c.energy - 0.02);
    world.facts[`negotiate:${c.id}:${otherId}`] = (world.facts[`negotiate:${c.id}:${otherId}`] ?? 0) + 1;
    notes.push(`${c.id} negotiates with ${otherId}`);
    events.push(mkActionEvent(world, 'action:negotiate', { actorId: c.id, targetId: otherId, locationId: c.locId }));

    // ── Build negotiate speech with proper atom exchange ──
    const pipelineData = (world.facts as any)?.[`sim:pipeline:${c.id}`];
    const ci = pipelineData?.communicativeIntent;
    const ciTopic = ci?.topic?.primary || '';
    const ciFacts = Array.isArray(ci?.topic?.facts) ? ci.topic.facts : [];

    const speechData = buildSpeechAtoms(world, c.id, otherId, 'negotiate');

    let negotiateText = 'ведёт переговоры';
    if (ciTopic && !ciTopic.startsWith('schema_') && ciTopic !== 'terms') {
      negotiateText += ` (тема: ${ciTopic})`;
    }
    if (ciFacts.length) {
      const cleanFacts = ciFacts.filter((f: string) => f && !f.startsWith('schema_'));
      if (cleanFacts.length) negotiateText += ': ' + cleanFacts.slice(0, 3).join('; ');
    }
    // Show top atoms being negotiated about.
    const topNegAtoms = speechData.atoms
      .filter((a: any) => a.magnitude > 0.2)
      .slice(0, 3)
      .map((a: any) => {
        const short = String(a.id || '').replace(/^ctx:/, '').replace(new RegExp(`:${c.id}$`), '');
        return `${short}:${a.magnitude.toFixed(1)}`;
      });
    if (topNegAtoms.length && !ciFacts.length) {
      negotiateText += ' [' + topNegAtoms.join(', ') + ']';
    }

    const speech: SpeechEventV1 = {
      schema: 'SpeechEventV1',
      actorId: c.id,
      targetId: otherId,
      act: 'negotiate',
      volume,
      topic: ciTopic || 'terms',
      intent: speechData.intent,
      text: negotiateText,
      atoms: speechData.atoms,
    };
    events.push(mkActionEvent(world, 'speech:v1', speech));
    return { world, events, notes };
  },
};

// -----------------------------------------------------------------------------
// Intent scripts (v1): fractal actions as staged transactions.
//
function writeIntentTelemetry(world: SimWorld, actorId: string, patch: Record<string, any>) {
  (world.facts as any)[`sim:intent:last:${actorId}`] = {
    tick: Number(world.tickIndex ?? 0),
    actorId,
    ...(patch || {}),
  };
}

// Stored in world.facts['intent:<actorId>'] in a JSON-friendly shape.
// -----------------------------------------------------------------------------

type IntentStageKindV1 = 'approach' | 'attach' | 'execute' | 'detach';

type IntentAtomicDeltaV1 = {
  target: 'agent' | 'world' | 'target';
  key: string;
  op: 'add' | 'set' | 'toward' | 'decay';
  value: any;
  rate?: number;
};

type IntentCompletionCheckV1 = {
  target: 'agent' | 'world' | 'target';
  key: string;
  op: '>=' | '<=' | '>' | '<' | '==';
  value: number;
};

type IntentCompletionConditionV1 = {
  mode?: 'all' | 'any';
  checks: IntentCompletionCheckV1[];
};

type IntentStageV1 = {
  kind: IntentStageKindV1;
  ticksRequired: number | 'until_condition';
  completionCondition?: IntentCompletionConditionV1;
  perTick?: IntentAtomicDeltaV1[];
  onEnter?: IntentAtomicDeltaV1[];
  onExit?: IntentAtomicDeltaV1[];
};

type IntentScriptV1 = {
  id: string;
  stages: IntentStageV1[];
  explain?: string[];
};

function jsonSafeClone(x: any): any {
  // Ensure pipeline snapshot won't explode on functions/Map/cycles/etc.
  try {
    return JSON.parse(JSON.stringify(x));
  } catch {
    return null;
  }
}

function sanitizeIntentDelta(x: any): IntentAtomicDeltaV1 | null {
  if (!x || typeof x !== 'object') return null;
  const target = x.target;
  const op = x.op;
  const key = String(x.key ?? '');
  if (target !== 'agent' && target !== 'world' && target !== 'target') return null;
  if (op !== 'add' && op !== 'set' && op !== 'toward' && op !== 'decay') return null;
  if (!key) return null;
  const value = jsonSafeClone(x.value);
  const rate = Number.isFinite(Number(x.rate)) ? Number(x.rate) : undefined;
  return { target, op, key, value, rate };
}

function sanitizeCompletionCondition(x: any): IntentCompletionConditionV1 | null {
  if (!x || typeof x !== 'object') return null;
  const mode = x.mode === 'any' ? 'any' : 'all';
  const rawChecks = Array.isArray(x.checks) ? x.checks : [];
  const checks = rawChecks
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      const target = c.target;
      const key = String(c.key ?? '');
      const op = c.op;
      const value = Number(c.value);
      if (target !== 'agent' && target !== 'world' && target !== 'target') return null;
      if (!key) return null;
      if (op !== '>=' && op !== '<=' && op !== '>' && op !== '<' && op !== '==') return null;
      if (!Number.isFinite(value)) return null;
      return { target, key, op, value };
    })
    .filter(Boolean) as IntentCompletionCheckV1[];
  if (!checks.length) return null;
  return { mode, checks };
}

function sanitizeIntentStage(x: any): IntentStageV1 | null {
  if (!x || typeof x !== 'object') return null;
  const kind = x.kind;
  if (kind !== 'approach' && kind !== 'attach' && kind !== 'execute' && kind !== 'detach') return null;
  const tr = x.ticksRequired;
  const ticksRequired = tr === 'until_condition' ? 'until_condition' : Math.max(0, Number(tr ?? 0));
  const completionCondition = sanitizeCompletionCondition(x.completionCondition);
  const perTick = Array.isArray(x.perTick) ? (x.perTick.map(sanitizeIntentDelta).filter(Boolean) as IntentAtomicDeltaV1[]) : undefined;
  const onEnter = Array.isArray(x.onEnter) ? (x.onEnter.map(sanitizeIntentDelta).filter(Boolean) as IntentAtomicDeltaV1[]) : undefined;
  const onExit = Array.isArray(x.onExit) ? (x.onExit.map(sanitizeIntentDelta).filter(Boolean) as IntentAtomicDeltaV1[]) : undefined;
  return { kind, ticksRequired, completionCondition, perTick, onEnter, onExit };
}

function sanitizeIntentScript(x: any): IntentScriptV1 | null {
  // Boundary sanitizer: anything persisted in world.facts must stay JSON-safe.
  // If script is malformed we return null and runtime falls back to timer mode.
  if (!x || typeof x !== 'object') return null;
  if (!Array.isArray(x.stages) || x.stages.length === 0) return null;
  const stages = x.stages.map(sanitizeIntentStage).filter(Boolean) as IntentStageV1[];
  if (!stages.length) return null;
  const id = String(x.id ?? 'intent_script');
  const explain = Array.isArray(x.explain) ? x.explain.map((s: any) => String(s)).slice(0, 32) : undefined;
  return { id, stages, explain };
}

function applyIntentDeltaV1(world: SimWorld, actorId: string, targetId: string | null, d: IntentAtomicDeltaV1) {
  const key = String(d.key ?? '');
  const op = d.op;
  const val = d.value;
  const rate = Number.isFinite(Number(d.rate)) ? Number(d.rate) : undefined;

  const applyNumericOp = (cur: number, nextVal: number, clamp?: (x: number) => number) => {
    if (op === 'add') return clamp ? clamp(cur + nextVal) : cur + nextVal;
    if (op === 'set') return clamp ? clamp(nextVal) : nextVal;
    if (op === 'toward') {
      const r = typeof rate === 'number' ? clamp01(rate) : 0.15;
      const out = cur + r * (nextVal - cur);
      return clamp ? clamp(out) : out;
    }
    if (op === 'decay') {
      const r = typeof rate === 'number' ? clamp01(rate) : 0.08;
      const out = cur * (1 - r);
      return clamp ? clamp(out) : out;
    }
    return cur;
  };

  const applyToChar = (charId: string) => {
    const c = getChar(world, charId);
    if (key === 'energy') {
      c.energy = applyNumericOp(c.energy, Number(val ?? c.energy), clamp01);
      return;
    }
    if (key === 'stress') {
      c.stress = applyNumericOp(c.stress, Number(val ?? c.stress), clamp01);
      return;
    }
    if (key === 'pos') {
      const x = Number((val as any)?.x);
      const y = Number((val as any)?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) c.pos = { nodeId: null, x, y };
      return;
    }
    if (key === 'move_toward') {
      const tx = Number((val as any)?.x);
      const ty = Number((val as any)?.y);
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
      const cfg = getSpatialConfig(world);
      const cur = getCharXY(world, charId);
      const dx = tx - cur.x;
      const dy = ty - cur.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (!Number.isFinite(dist) || dist <= 1e-6) {
        c.pos = { nodeId: null, x: tx, y: ty };
        return;
      }
      const step = Math.min(cfg.moveMaxStep, dist);
      const nx = cur.x + (dx / dist) * step;
      const ny = cur.y + (dy / dist) * step;
      c.pos = { nodeId: null, x: nx, y: ny };
      // Tiny travel cost (optional, cheap).
      c.energy = clamp01(c.energy - 0.0025);
      return;
    }

    // Generic sink: keep JSON-friendly.
    const meta = (c as any).meta && typeof (c as any).meta === 'object' ? (c as any).meta : ((c as any).meta = {});
    if (op === 'set') {
      meta[key] = jsonSafeClone(val);
      return;
    }
    if (typeof meta[key] === 'number' && typeof val === 'number' && (op === 'add' || op === 'toward' || op === 'decay')) {
      meta[key] = applyNumericOp(Number(meta[key] ?? 0), Number(val ?? 0));
      return;
    }
    meta[key] = Number(meta[key] ?? 0) + Number(val ?? 0);
  };

  if (d.target === 'agent') return applyToChar(actorId);
  if (d.target === 'target') {
    if (targetId) applyToChar(targetId);
    return;
  }
  if (d.target === 'world') {
    const wf: any = world.facts as any;
    if (op === 'set') {
      wf[key] = jsonSafeClone(val);
      return;
    }
    if (typeof wf[key] === 'number' && typeof val === 'number' && (op === 'add' || op === 'toward' || op === 'decay')) {
      wf[key] = applyNumericOp(Number(wf[key] ?? 0), Number(val ?? 0));
      return;
    }
    wf[key] = Number(wf[key] ?? 0) + Number(val ?? 0);
  }
}

function evalCompletionCondition(world: SimWorld, actorId: string, targetId: string | null, cond?: IntentCompletionConditionV1 | null) {
  if (!cond?.checks?.length) return false;
  const mode = cond.mode === 'any' ? 'any' : 'all';
  const evalCheck = (check: IntentCompletionCheckV1) => {
    let obj: any = null;
    if (check.target === 'agent') obj = getChar(world, actorId);
    if (check.target === 'target' && targetId) obj = getChar(world, targetId);
    if (check.target === 'world') obj = world.facts;
    if (!obj) return false;
    const cur = Number((obj as any)[check.key]);
    if (!Number.isFinite(cur)) return false;
    if (check.op === '>=') return cur >= check.value;
    if (check.op === '<=') return cur <= check.value;
    if (check.op === '>') return cur > check.value;
    if (check.op === '<') return cur < check.value;
    return cur === check.value;
  };
  const results = cond.checks.map(evalCheck);
  return mode === 'any' ? results.some(Boolean) : results.every(Boolean);
}

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

    // Defense-in-depth: do not overwrite an existing active intent.
    // The decider plugin should avoid this, but tests or direct callers
    // may still issue start_intent while an intent is active.
    const existingIntent = world.facts[`intent:${c.id}`];
    if (existingIntent && typeof existingIntent === 'object') {
      notes.push(`${c.id} start_intent blocked: active intent already exists (${(existingIntent as any).id})`);
      events.push(mkActionEvent(world, 'action:start_intent', {
        actorId: c.id,
        ok: false,
        reason: 'active_intent_exists',
        existingIntentId: (existingIntent as any).id,
      }));
      return { world, events, notes };
    }

    const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};
    const intent = payload.intent || null;
    const intentId = String(payload.intentId || `intent:${c.id}:${world.tickIndex}`);
    const remainingTicks = Math.max(1, Number(payload.remainingTicks ?? 2));

    // CRITICAL: sanitize at the boundary (facts must be JSON-friendly).
    // This protects snapshot serialization, replay, and UI inspectors.
    const rawScript = (payload as any).intentScript;
    const safeIntentScript = sanitizeIntentScript(rawScript);

    // Minimal intent storage: one active intent per actor (v0).
    // Derive scriptId for debug/pipeline UI even if script is missing.
    const scriptId =
      safeIntentScript?.id ??
      String((action.meta as any)?.scriptId ?? (payload as any)?.scriptId ?? null);

    world.facts[`intent:${c.id}`] = {
      id: intentId,
      startedAtTick: world.tickIndex,
      remainingTicks,
      intent,
      // Staged script runtime (optional).
      intentScript: safeIntentScript,
      stageIndex: safeIntentScript ? 0 : null,
      stageTicksLeft: safeIntentScript
        ? safeIntentScript.stages[0].ticksRequired === 'until_condition'
          ? 'until_condition'
          : safeIntentScript.stages[0].ticksRequired
        : null,
      stageEnteredIndex: safeIntentScript ? -1 : null,
      scriptId,
      lifecycleState: 'active',
      stageStartedAtTick: world.tickIndex,
      lastProgressTick: world.tickIndex,
      // Approach helper (JSON-friendly).
      dest: null,
    };

    if (safeIntentScript) {
      notes.push(`${c.id} starts intent ${intentId} (script=${safeIntentScript.id})`);
      if (safeIntentScript.explain?.length) {
        notes.push(...safeIntentScript.explain.map((x) => `intent.decompose: ${x}`));
      }
    } else {
      // This is the exact failure mode you currently see in your session.
      notes.push(`${c.id} starts intent ${intentId} (NO_SCRIPT, remainingTicks=${remainingTicks})`);
    }
    writeIntentTelemetry(world, c.id, {
      event: 'start',
      intentId,
      scriptId: safeIntentScript?.id ?? scriptId ?? null,
      stageKind: safeIntentScript?.stages?.[0]?.kind ?? null,
      originalKind: (intent as any)?.originalAction?.kind ?? null,
      originalTargetId: (intent as any)?.originalAction?.targetId ?? null,
    });
    events.push(mkActionEvent(world, 'action:start_intent', {
      actorId: c.id,
      locationId: c.locId,
      intentId,
      remainingTicks,
      intent,
      scriptId: safeIntentScript?.id ?? scriptId ?? null,
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
      writeIntentTelemetry(world, c.id, { event: 'continue_none', reason: 'none' });
      events.push(mkActionEvent(world, 'action:continue_intent', { actorId: c.id, ok: false, reason: 'none' }));
      return { world, events, notes };
    }

    const staleness = getIntentStaleness(cur, world.tickIndex);
    if (staleness.stale && !isCriticalIntentStage(cur)) {
      delete world.facts[key];
      writeIntentTelemetry(world, c.id, {
        event: 'stale_abort',
        intentId: (cur as any)?.id ?? null,
        stageKind: staleness.stageKind,
        ticksSinceProgress: staleness.ticksSinceProgress,
        ticksInStage: staleness.ticksInStage,
      });
      notes.push(`${c.id} aborts stale intent ${String((cur as any)?.id ?? 'unknown')} stage=${staleness.stageKind || 'unknown'} no_progress=${staleness.ticksSinceProgress}`);
      events.push(mkActionEvent(world, 'action:abort_intent', {
        actorId: c.id,
        locationId: c.locId,
        intentId: (cur as any)?.id ?? null,
        reason: 'stale',
        stageKind: staleness.stageKind,
        ticksSinceProgress: staleness.ticksSinceProgress,
        ticksInStage: staleness.ticksInStage,
      }));
      return { world, events, notes };
    }

    // -----------------------------------------------------------------------
    // v1 staged scripts (preferred path):
    // explicit transactional stages with deterministic progression.
    // -----------------------------------------------------------------------
    const script: IntentScriptV1 | null =
      (cur as any).intentScript && typeof (cur as any).intentScript === 'object' ? ((cur as any).intentScript as any) : null;
    if (script && Array.isArray(script.stages) && script.stages.length > 0) {
      const stageIndex = Math.max(0, Number((cur as any).stageIndex ?? 0));
      const stage = script.stages[stageIndex];
      if (!stage) {
        // No stage => complete below.
      } else {
        // On-enter once per stage.
        const entered = Number((cur as any).stageEnteredIndex ?? -1);
        if (entered !== stageIndex) {
          (cur as any).stageEnteredIndex = stageIndex;
          if (Array.isArray(stage.onEnter)) {
            for (const d of stage.onEnter) applyIntentDeltaV1(world, c.id, action.targetId ?? null, d);
          }
        }

        // Per-tick effects.
        if (Array.isArray(stage.perTick)) {
          // Capture position before deltas to detect movement.
          const posBefore = { x: Number((c as any).pos?.x), y: Number((c as any).pos?.y) };

          for (const d of stage.perTick) {
            // Helper: allow scripts to set a destination.
            if (
              d &&
              typeof d === 'object' &&
              d.target === 'agent' &&
              d.op === 'set' &&
              (d.key === 'destination' || d.key === 'dest')
            ) {
              (cur as any).dest = d.value;
            }
            applyIntentDeltaV1(world, c.id, action.targetId ?? null, d);
          }

          // Emit position-change event during approach so narrative can show movement.
          if (stage.kind === 'approach') {
            const posAfter = { x: Number((c as any).pos?.x), y: Number((c as any).pos?.y) };
            const moved = Number.isFinite(posAfter.x) && Number.isFinite(posAfter.y) &&
              (Math.abs(posAfter.x - posBefore.x) > 0.01 || Math.abs(posAfter.y - posBefore.y) > 0.01);
            if (moved) {
              (cur as any).lastProgressTick = world.tickIndex;
              events.push(mkActionEvent(world, 'action:approach_move', {
                actorId: c.id,
                locationId: c.locId,
                targetId: action.targetId,
                fromX: Math.round(posBefore.x), fromY: Math.round(posBefore.y),
                toX: Math.round(posAfter.x), toY: Math.round(posAfter.y),
              }));
            }
          }
        }

        // Stage completion.
        let stageDone = false;
        if (stage.ticksRequired === 'until_condition') {
          // v1 heuristic: if completionCondition exists, check it; otherwise use dest proximity.
          if (stage.completionCondition) {
            stageDone = evalCompletionCondition(world, c.id, action.targetId ?? null, stage.completionCondition);
          } else {
            const dest = (cur as any).dest;
            const dx = Number((dest as any)?.x);
            const dy = Number((dest as any)?.y);
            if (Number.isFinite(dx) && Number.isFinite(dy)) {
              const curXY = getCharXY(world, c.id);
              const dist = Math.sqrt((curXY.x - dx) ** 2 + (curXY.y - dy) ** 2);
              stageDone = dist <= Math.max(2, getSpatialConfig(world).moveMaxStep * 0.5);
            } else {
              // If no dest, do not auto-complete.
              stageDone = false;
            }
          }
        } else {
          const before = Number((cur as any).stageTicksLeft ?? stage.ticksRequired);
          const after = Math.max(0, before - 1);
          (cur as any).stageTicksLeft = after;
          stageDone = after <= 0;
        }

        notes.push(`${c.id} continues intent ${(cur as any).id} stage=${stage.kind}@${stageIndex}${stageDone ? ' (done)' : ''}`);
        events.push(
          mkActionEvent(world, 'action:continue_intent', {
            actorId: c.id,
            locationId: c.locId,
            intentId: (cur as any).id,
            ok: true,
            scriptId: script.id,
            stageIndex,
            stageKind: stage.kind,
            stageDone,
          })
        );

        if (!stageDone) {
          if (stage.ticksRequired !== 'until_condition') {
            (cur as any).lastProgressTick = world.tickIndex;
          }
          writeIntentTelemetry(world, c.id, {
            event: 'continue',
            intentId: (cur as any).id ?? null,
            scriptId: script.id,
            stageIndex,
            stageKind: stage.kind,
            stageDone: false,
          });
          world.facts[key] = cur;
          return { world, events, notes };
        }

        // Stage exit + advance.
        if (Array.isArray(stage.onExit)) {
          for (const d of stage.onExit) applyIntentDeltaV1(world, c.id, action.targetId ?? null, d);
        }
        const nextStageIndex = stageIndex + 1;
        (cur as any).lastProgressTick = world.tickIndex;
        (cur as any).stageIndex = nextStageIndex;
        (cur as any).stageEnteredIndex = -1;
        const next = script.stages[nextStageIndex];
        if (next) {
          (cur as any).stageStartedAtTick = world.tickIndex;
          (cur as any).stageTicksLeft =
            next.ticksRequired === 'until_condition' ? 'until_condition' : next.ticksRequired;
          writeIntentTelemetry(world, c.id, {
            event: 'stage_advance',
            intentId: (cur as any).id ?? null,
            scriptId: script.id,
            fromStageIndex: stageIndex,
            fromStageKind: stage.kind,
            toStageIndex: nextStageIndex,
            toStageKind: next.kind,
          });
          world.facts[key] = cur;
          return { world, events, notes };
        }
        // Fallthrough => complete intent.
      }

      // Complete intent (script finished).
      const original = (cur as any)?.intent?.originalAction;
      if (original && typeof original === 'object' && original.kind && ACTION_SPECS[original.kind as ActionKind]) {
        const oa: SimAction = {
          id: `act:intent_complete:${world.tickIndex}:${c.id}:${String(original.kind)}`,
          kind: original.kind as ActionKind,
          actorId: c.id,
          targetId: original.targetId ?? null,
          payload: original.payload ?? null,
          meta: { ...(original.meta ?? {}), internal: true },
        };
        const spec = ACTION_SPECS[oa.kind];
        const r = spec.apply({ world, action: oa });
        world = r.world;
        events.push(...r.events);
        notes.push(...r.notes.map((x) => `intent.complete: ${x}`));
      } else {
        notes.push(`${c.id} intent complete: no originalAction`);
      }

      (cur as any).lifecycleState = 'completed';
      writeIntentTelemetry(world, c.id, {
        event: 'complete',
        intentId: (cur as any).id ?? null,
        scriptId: script.id,
        originalKind: original?.kind ?? null,
        originalTargetId: original?.targetId ?? null,
      });
      delete world.facts[key];
      // ── Write intent cooldown to prevent immediate re-start ──
      markIntentCooldown(world.facts as any, c.id, String(original?.kind || ''), original?.targetId ?? null, world.tickIndex);
      events.push(
        mkActionEvent(world, 'action:intent_complete', {
          actorId: c.id,
          locationId: c.locId,
          intentId: (cur as any).id,
          scriptId: script.id,
        })
      );
      notes.push(`${c.id} intent complete (script=${script.id})`);
      return { world, events, notes };
    }

    // -----------------------------------------------------------------------
    // v0 fallback: timer-based intent (compat for old payloads/tests).
    // -----------------------------------------------------------------------
    const remainingBefore = Math.max(0, Number((cur as any).remainingTicks ?? 0));
    const remainingAfter = Math.max(0, remainingBefore - 1);
    (cur as any).remainingTicks = remainingAfter;
    (cur as any).lastProgressTick = world.tickIndex;
    world.facts[key] = cur;

    notes.push(`${c.id} continues intent ${(cur as any).id} (${remainingBefore} -> ${remainingAfter})`);
    writeIntentTelemetry(world, c.id, {
      event: 'continue',
      intentId: (cur as any).id ?? null,
      remainingBefore,
      remainingAfter,
      stageKind: 'timer',
    });
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
          meta: { ...(original.meta ?? {}), internal: true },
        };
        const spec = ACTION_SPECS[oa.kind];
        const r = spec.apply({ world, action: oa });
        world = r.world;
        events.push(...r.events);
        notes.push(...r.notes.map((x) => `intent.complete: ${x}`));
      } else {
        notes.push(`${c.id} intent complete: no originalAction`);
      }
      // ── Write intent cooldown (v0 path) ──
      const okV0 = (cur as any)?.intent?.originalAction;
      if (okV0) markIntentCooldown(world.facts as any, c.id, String(okV0.kind || ''), okV0.targetId ?? null, world.tickIndex);
      (cur as any).lifecycleState = 'completed';
      writeIntentTelemetry(world, c.id, {
        event: 'complete',
        intentId: (cur as any).id ?? null,
        originalKind: okV0?.kind ?? null,
        originalTargetId: okV0?.targetId ?? null,
      });
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
    if (cur && typeof cur === 'object') (cur as any).lifecycleState = 'aborted';
    writeIntentTelemetry(world, c.id, {
      event: 'abort',
      intentId: (cur as any)?.id ?? null,
      stageKind: (cur as any)?.intentScript?.stages?.[Math.max(0, Number((cur as any)?.stageIndex ?? 0))]?.kind ?? null,
    });
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

// ── Retreat: personality-driven withdrawal toward exits/cover ──
const RetreatSpec: ActionSpec = {
  kind: 'retreat' as ActionKind,
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const facts: any = world.facts || {};
    const health = clamp01(Number(c.health ?? 1));
    const stress = clamp01(Number(c.stress ?? 0));
    const danger = clamp01(Number(facts[`ctx:danger:${actorId}`] ?? 0));

    // Personality modulates retreat threshold.
    const entity: any = (c as any)?.entity;
    const traits: any = entity?.traits || entity?.params || {};
    const bravery = clamp01(Number(traits?.D_pain_tolerance ?? traits?.B_tolerance_ambiguity ?? 0.5));
    const caution = clamp01(Number(traits?.D_HPA_reactivity ?? traits?.A_Safety_Care ?? 0.5));

    // Brave characters retreat at lower health/higher stress thresholds.
    const healthThreshold = 0.2 + 0.3 * bravery; // brave: 0.5, cautious: 0.2
    const stressThreshold = 0.5 + 0.3 * bravery;  // brave: 0.8, cautious: 0.5

    const shouldRetreat =
      health < healthThreshold ||
      stress > stressThreshold ||
      (danger > 0.6 && health < 0.5);

    if (!shouldRetreat) return [];

    // Score scales with urgency.
    const urgency = clamp01(
      Math.max(0, healthThreshold - health) * 2 +
      Math.max(0, stress - stressThreshold) * 1.5 +
      danger * 0.3 +
      caution * 0.15,
    );
    const score = clamp01(0.15 + urgency * 0.3);

    return [{ kind: 'retreat' as ActionKind, actorId, score }];
  },
  validateV1: ({ world, offer }) => validateCommon(world, offer),
  validateV2: ({ world, offer }) => validateCommon(world, offer),
  classifyV3: () => 'single',
  apply: ({ world, action }) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const c = getChar(world, action.actorId);
    const loc = world.locations[(c as any).locId];
    const facts: any = world.facts || {};

    // Move toward nearest exit or highest-cover cell.
    const cells: any[] = (loc as any)?.entity?.map?.cells;
    const exits: any[] = (loc as any)?.entity?.map?.exits;
    const pos = getCharXY(world, c.id);
    const cfg = getSpatialConfig(world);

    let bestX = pos.x;
    let bestY = pos.y;
    let bestScore = -1;

    if (Array.isArray(cells)) {
      // Score nearby walkable cells: prefer exits, then cover, then distance from threats.
      const dirs = [
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
        { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 },
      ];

      for (const d of dirs) {
        const nx = Math.round(pos.x) + d.dx;
        const ny = Math.round(pos.y) + d.dy;
        const cell = cells.find((cl: any) => cl.x === nx && cl.y === ny);
        if (!cell || cell.walkable === false) continue;

        let s = 0;
        const cellCover = clamp01(Number(cell.cover ?? 0));
        s += cellCover * 0.3;

        // Distance to nearest exit.
        if (Array.isArray(exits) && exits.length) {
          let minExitDist = 999;
          for (const ex of exits) {
            minExitDist = Math.min(minExitDist, Math.abs(nx - Number(ex.x ?? 0)) + Math.abs(ny - Number(ex.y ?? 0)));
          }
          const curExitDist = exits.reduce((m: number, ex: any) =>
            Math.min(m, Math.abs(Math.round(pos.x) - Number(ex.x ?? 0)) + Math.abs(Math.round(pos.y) - Number(ex.y ?? 0))), 999);
          if (minExitDist < curExitDist) s += 0.4;
        }

        // Distance from threats.
        for (const other of Object.values(world.characters)) {
          if (other.id === c.id || (other as any).locId !== (c as any).locId) continue;
          const threat = clamp01(Number(facts?.relations?.[c.id]?.[other.id]?.threat ?? 0));
          if (threat <= 0.3) continue;
          const otherPos = getCharXY(world, other.id);
          const curDist = Math.hypot(pos.x - otherPos.x, pos.y - otherPos.y);
          const newDist = Math.hypot(nx - otherPos.x, ny - otherPos.y);
          if (newDist > curDist) s += 0.2 * threat;
        }

        if (s > bestScore) {
          bestScore = s;
          bestX = nx;
          bestY = ny;
        }
      }
    }

    // Apply movement.
    if (bestX !== pos.x || bestY !== pos.y) {
      (c as any).pos = { ...(c as any).pos, nodeId: null, x: bestX, y: bestY };
      recordTrail(world.facts as any, c.id, world.tickIndex, (c as any).locId, undefined, bestX, bestY);
    }

    c.stress = clamp01(c.stress - 0.02); // slight stress relief from taking action
    c.energy = clamp01(c.energy - 0.01);

    notes.push(`${c.id} retreats to (${bestX},${bestY})`);
    events.push(mkActionEvent(world, 'action:retreat', {
      actorId: c.id, locationId: (c as any).locId,
      x: bestX, y: bestY,
      health: c.health, stress: c.stress,
    }));
    return { world, events, notes };
  },
};

export const ACTION_SPECS: Record<ActionKind, ActionSpec> = {
  wait: WaitSpec,
  rest: RestSpec,
  move: MoveSpec,
  move_cell: MoveCellSpec,
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
  respond: RespondSpec,
  retreat: RetreatSpec,
};

export function enumerateActionOffers(world: SimWorld): ActionOffer[] {
  const offers: ActionOffer[] = [];
  const actorIds = Object.keys(world.characters || {}).sort();

  for (const actorId of actorIds) {
    const ctx: OfferCtx = { world, actorId };

    // If an actor has an active intent, restrict offers to continue/abort/wait
    // BUT allow move_cell during approach stage (so movement is visible).
    const intentData: any = world.facts[`intent:${actorId}`];
    const hasIntent = Boolean(intentData);
    if (hasIntent) {
      const stageIdx = Number(intentData?.stageIndex ?? 0);
      const stageKind = intentData?.intentScript?.stages?.[stageIdx]?.kind;
      const inApproach = stageKind === 'approach';

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
      // During approach, also enumerate move_cell so spatial movement is visible
      // and competes with the intent's built-in teleport.
      if (inApproach && ACTION_SPECS['move_cell' as ActionKind]) {
        const mcSpec = ACTION_SPECS['move_cell' as ActionKind];
        const mcRaw = mcSpec.enumerate(ctx);
        for (const o of mcRaw) {
          const v1 = mcSpec.validateV1({ ...ctx, offer: o });
          const v2 = mcSpec.validateV2({ ...ctx, offer: v1 });
          offers.push(v2);
        }
      }
      continue;
    }

    for (const kind of Object.keys(ACTION_SPECS).sort() as ActionKind[]) {
      const spec = ACTION_SPECS[kind];
      const raw = spec.enumerate(ctx);
      for (const o of raw) {
        if (kind === 'start_intent') {
          const origKind = String(((o as any).payload as any)?.intent?.originalAction?.kind || '');
          const origTarget = normalizeTargetId(((o as any).payload as any)?.intent?.originalAction?.targetId);
          const gaps = readIntentCooldown(world.facts as any, actorId, origKind, origTarget, world.tickIndex);
          if ((gaps.exactGap != null && gaps.exactGap < Number(FCS.behaviorVariety.intentCooldown.exactBlockTicks ?? 3))
            || (gaps.familyGap != null && gaps.familyGap < Number(FCS.behaviorVariety.intentCooldown.familyBlockTicks ?? 4))) {
            offers.push({
              ...o,
              blocked: true,
              reason: 'cooldown:recent_intent',
              score: 0,
              meta: {
                ...(o as any).meta,
                cooldown: {
                  exactGap: gaps.exactGap,
                  familyGap: gaps.familyGap,
                  family: familyOfActionKind(origKind),
                },
              },
            });
            continue;
          }
        }
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

/** Resolved spec cache for generic social actions (avoids rebuilding each tick). */
const _genericCache = new Map<string, ActionSpec>();

function resolveSpec(kind: string): ActionSpec | null {
  const builtin = ACTION_SPECS[kind as ActionKind];
  if (builtin) return builtin;

  let cached = _genericCache.get(kind);
  if (!cached) {
    cached = buildGenericSocialSpec(kind);
    _genericCache.set(kind, cached);
  }
  return cached;
}

export function applyActionViaSpec(world: SimWorld, action: SimAction) {
  const spec = resolveSpec(String(action.kind));
  if (!spec) throw new Error(`No ActionSpec for kind=${String(action.kind)}`);
  return spec.apply({ world, action });
}
