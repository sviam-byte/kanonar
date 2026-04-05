// lib/simkit/plugins/goalLabDeciderPlugin.ts
// SimKit plugin: uses GoalLab S8 decision ranking and stores rich per-agent trace
// for UI inspection in world.facts['sim:trace:<agentId>'].

import type { SimPlugin } from '../core/simulator';
import type { SimSnapshot, SimWorld, SimAction, ActionOffer } from '../core/types';
import { runGoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import { arr } from '../../utils/arr';
import { toSimAction } from '../actions/fromActionCandidate';
import { buildWorldStateFromSim } from './goalLabWorldState';
import { selectDecisionMode, type DecisionMode } from '../core/decisionGate';
import { reactiveDecision } from '../core/reactiveDecision';
import { FCS } from '../../config/formulaConfigSim';
import { clamp01 } from '../../util/math';
import type { Possibility } from '../../possibilities/catalog';
import { validatePlacement } from '../placement/validatePlacement';

// ── Intent cooldown: read cooldown facts and return penalty multiplier ──
// If an agent just completed an intent of the same kind+target, penalize re-selection.
function getIntentCooldownPenalty(world: SimWorld, actorId: string, kind: string, targetId: string | null): number {
  const cdKey = `intentCooldown:${actorId}`;
  const cdData: any = (world.facts as any)?.[cdKey];
  if (!cdData || typeof cdData !== 'object') return 0;
  const comboKey = `${kind}:${targetId || ''}`;
  const lastTick = Number(cdData[comboKey] ?? -999);
  const gap = (world.tickIndex ?? 0) - lastTick;
  if (gap <= 0) return 0.6;  // just completed this tick
  if (gap <= 1) return 0.45;
  if (gap <= 2) return 0.25;
  if (gap <= 4) return 0.10;
  return 0;
}

// ── Actions that execute in one tick via genericSocialSpec — no intent wrap needed ──
const DIRECT_EXECUTE_KINDS = new Set([
  'comfort', 'guard', 'escort', 'treat', 'investigate', 'deceive',
  'accuse', 'praise', 'apologize', 'share', 'trade', 'signal',
  'command', 'call_backup', 'observe_target', 'verify',
  'retreat', 'rally', 'suppress', 'patrol', 'cover_fire', 'take_cover',
  'confide', 'encourage', 'warn', 'plead', 'challenge',
  'help', 'cooperate', 'protect', 'confront', 'threaten', 'submit',
  'hide', 'observe', 'wait', 'rest',
]);

function buildSnapshot(world: SimWorld, tickIndex: number): SimSnapshot {
  return {
    schema: 'SimKitSnapshotV1',
    id: `sim:gl:decider:t${String(tickIndex).padStart(5, '0')}`,
    time: new Date().toISOString(),
    tickIndex,
    characters: Object.values(world.characters || {}).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    locations: Object.values(world.locations || {}).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    events: (world.events || []).slice(),
    debug: {},
  } as any;
}

function readActorFilter(world: SimWorld): string[] {
  const raw = (world as any)?.facts?.['sim:actors'];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

function extractDecisionBest(pipeline: any): any | null {
  const s8 = pipeline?.stages?.find((s: any) => s?.stage === 'S8');
  return (s8 as any)?.artifacts?.best ?? null;
}

function decorateAction(action: SimAction, best: any): SimAction {
  return {
    ...action,
    meta: {
      ...(action as any).meta,
      source: 'goalLab',
      decisionId: String(best?.p?.id ?? best?.id ?? ''),
      score: Number((best as any)?.q ?? 0),
      cost: Number(best?.cost ?? 0),
    },
  };
}

/**
 * Returns a deterministic per-actor sequence number for the current tick.
 * Stored in world.facts so repeated calls in one tick produce stable unique ids
 * without relying on wall-clock time.
 */
function nextIntentSeq(world: SimWorld, actorId: string): number {
  const tick = Number(world.tickIndex ?? 0);
  const key = `sim:intentSeq:${actorId}:${tick}`;
  const cur = Number((world.facts as any)?.[key] ?? 0);
  const next = Number.isFinite(cur) ? cur + 1 : 1;
  (world.facts as any)[key] = next;
  return next;
}

// ── SimKit offers → GoalLab Possibilities bridge ──
// Converts concrete spatial offers from SimKit's proposeActions() into Possibility
// objects that GoalLab S8 can score alongside its own abstract possibilities.
// This closes the gap: GoalLab decides *what* to do based on goals, and now also
// sees *where* to move based on SimKit's spatial enumeration.

const OFFER_KIND_TO_POSS_KIND: Record<string, 'aff' | 'con' | 'off' | 'exit' | 'cog'> = {
  move: 'exit', move_xy: 'exit', move_cell: 'exit',
  talk: 'aff', negotiate: 'aff', attack: 'con',
  observe: 'cog', wait: 'cog', rest: 'cog',
  question_about: 'aff', inspect_feature: 'cog',
  repair_feature: 'off', scavenge_feature: 'off',
};

function offersToExternalPossibilities(
  offers: ActionOffer[],
  actorId: string,
): Possibility[] {
  // Deterministic ordering is inherited from offers array (already sorted upstream).
  // We keep explicit idx in IDs so same kind+target variants remain uniquely traceable.
  const forActor = offers.filter(o => o.actorId === actorId && !o.blocked);
  return forActor.map((o, idx) => {
    const provenanceId = `sim:offer:${actorId}:${o.kind}:${String(o.targetId ?? (o as any).targetNodeId ?? 'self')}:${idx}`;
    const targetStr = String(o.targetId ?? (o as any).targetNodeId ?? 'self');
    return {
      // Include stable per-tick index to avoid id collisions when multiple
      // offers share kind+target (e.g., variants with different meta/score).
      id: `sim:${o.kind}:${actorId}:${targetStr}:${idx}`,
      kind: OFFER_KIND_TO_POSS_KIND[o.kind] || 'cog',
      label: `${o.kind}${o.targetId ? `→${o.targetId}` : ''}`,
      magnitude: clamp01(Number(o.score ?? 0.1)),
      confidence: 1,
      subjectId: actorId,
      targetId: o.targetId ?? undefined,
      // targetNodeId must be at top level for buildActionCandidates to propagate it.
      targetNodeId: (o as any).targetNodeId ?? undefined,
      meta: {
        source: 'simkit:offer',
        sim: {
          kind: o.kind,
          targetId: o.targetId ?? null,
          targetNodeId: (o as any).targetNodeId ?? null,
          score: o.score ?? 0,
          ...(o.meta || {}),
        },
      },
      trace: {
        // External offers are not atoms; keep synthetic ids to preserve provenance.
        usedAtomIds: [provenanceId],
        notes: [`SimKit offer: ${o.kind}${o.targetId ? `→${o.targetId}` : ''}`],
        parts: { offerScore: o.score ?? 0, provenanceId },
      },
    };
  });
}

// ── GoalLab abstract kind → SimKit executable kind mapping ──
// GoalLab S8 produces abstract intent kinds (escape, flee, help, confront, etc.)
// that are not directly executable by SimKit. This table maps them to concrete
// SimKit action kinds. When a kind maps to 'move', the grounding step below
// picks the best available move offer from SimKit's enumeration.
const GOALLAB_TO_SIMKIT: Record<string, string> = {
  // Direct SimKit-compatible kinds (identity mapping).
  move: 'move', move_xy: 'move_xy', move_cell: 'move_cell',
  wait: 'wait', rest: 'rest', talk: 'talk', attack: 'attack',
  observe: 'observe', question_about: 'question_about', negotiate: 'negotiate',
  inspect_feature: 'inspect_feature', repair_feature: 'repair_feature',
  scavenge_feature: 'scavenge_feature', start_intent: 'start_intent',
  continue_intent: 'continue_intent', abort_intent: 'abort_intent',

  // Abstract GoalLab kinds bridged to SimKit movement.
  escape: 'move', flee: 'move', avoid: 'move',

  // Abstract GoalLab kinds bridged to concrete SimKit actions.
  // Important: do not collapse rich social kinds into plain talk, otherwise
  // event-grounded intent disappears in the final narrative.
  help: 'help', cooperate: 'cooperate', protect: 'protect', npc: 'talk',
  confront: 'confront', threaten: 'threaten', submit: 'submit',
  hide: 'wait', harm: 'attack',
  ask_info: 'question_about', persuade: 'negotiate',

  // Extended social kinds (handled by genericSocialSpec at validation).
  comfort: 'comfort', guard: 'guard', escort: 'escort',
  treat: 'treat', investigate: 'investigate', deceive: 'deceive',
  accuse: 'accuse', praise: 'praise', apologize: 'apologize',
  share: 'share', trade: 'trade', signal: 'signal',
  command: 'command', call_backup: 'call_backup',
  observe_target: 'observe', loot: 'scavenge_feature', betray: 'attack',
  help_offer: 'help', verify: 'verify', monologue: 'wait',
  self_talk: 'wait',

  // Tactical actions (handled by genericSocialSpec).
  retreat: 'retreat', rally: 'rally', suppress: 'suppress',
  patrol: 'patrol', cover_fire: 'cover_fire', take_cover: 'take_cover',
  hold_position: 'wait',

  // Social-emotional actions (handled by genericSocialSpec).
  confide: 'confide', encourage: 'encourage', warn: 'warn',
  plead: 'plead', challenge: 'challenge',
  mourn: 'wait', celebrate: 'wait',
};

/**
 * Ground an abstract GoalLab decision into a concrete SimKit action.
 *
 * Three problems solved:
 *   1) Kind mapping: GoalLab abstract kinds (escape, flee, help…) → SimKit builtin kinds.
 *   2) Target resolution for move: GoalLab says "move" without targetId/targetNodeId;
 *      we pick the best-scoring move offer from SimKit's spatial enumeration.
 *   3) Target resolution for social: GoalLab says "talk" to someone not nearby;
 *      we verify the target exists in offers, else pick the best available.
 */
function groundAbstractAction(
  action: SimAction,
  offers: ActionOffer[],
  actorId: string,
  goalLabKind: string,
  world: SimWorld,
): SimAction {
  const rawKind = String(action.kind || '');
  const actionId = String(action.id || '');

  // If GoalLab chose a sim:* possibility (injected from SimKit offers),
  // it already carries concrete kind/targetId/targetNodeId. Extract them.
  if (actionId.startsWith('sim:')) {
    // The action.kind was set by buildActionCandidates from the possibility key,
    // which is the SimKit offer kind (move, talk, etc.). The targetId comes from
    // the possibility's targetId. We just need to ensure the SimKit payload is intact.
    const mapped = GOALLAB_TO_SIMKIT[rawKind] || rawKind;
    return {
      ...action,
      kind: mapped as any,
      meta: {
        ...(action.meta || {}),
        goalLabKind,
        groundedFrom: rawKind,
        groundedVia: 'simOffer:direct',
      },
    };
  }

  const mapped = GOALLAB_TO_SIMKIT[rawKind] || GOALLAB_TO_SIMKIT[rawKind.toLowerCase()] || rawKind;

  // Movement needs concrete spatial grounding (location/node/payload) before apply.
  const isMovement = mapped === 'move' || mapped === 'move_xy' || mapped === 'move_cell';
  const needsMoveTarget = isMovement && !action.targetId && !action.targetNodeId;

  if (needsMoveTarget) {
    // Pick the best available move offer for this actor from SimKit's enumeration.
    const moveOffers = offers
      .filter(o => o.actorId === actorId && (o.kind === 'move' || o.kind === 'move_xy' || o.kind === 'move_cell') && !o.blocked)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    if (moveOffers.length) {
      const best = moveOffers[0];
      return {
        ...action,
        kind: best.kind as any,
        targetId: best.targetId ?? null,
        targetNodeId: (best as any).targetNodeId ?? null,
        meta: {
          ...(action.meta || {}),
          goalLabKind,
          groundedFrom: rawKind,
          groundedVia: 'moveOffer',
        },
      };
    }

    // No move offers available (stuck): fall back to wait.
    return {
      ...action,
      kind: 'wait',
      targetId: null,
      targetNodeId: null,
      meta: {
        ...(action.meta || {}),
        goalLabKind,
        groundedFrom: rawKind,
        groundedVia: 'noMoveOffers:fallbackWait',
      },
    };
  }

  // Non-movement abstract kinds: just remap the kind.
  if (mapped !== rawKind) {
    // For social actions with a targetId, verify target is reachable via offers.
    const isSocial = /talk|negotiate|attack|question_about|observe/.test(mapped);
    if (isSocial && action.targetId) {
      const hasOffer = offers.some(
        o => o.actorId === actorId && o.kind === mapped && String(o.targetId) === String(action.targetId) && !o.blocked
      );
      if (!hasOffer) {
        // Target not reachable for this mapped kind — try to find any valid offer of that kind.
        const fallbackOffer = offers.find(
          o => o.actorId === actorId && o.kind === mapped && !o.blocked
        );
        if (fallbackOffer) {
          return {
            ...action,
            kind: mapped as any,
            targetId: fallbackOffer.targetId ?? null,
            meta: {
              ...(action.meta || {}),
              goalLabKind,
              groundedFrom: rawKind,
              groundedVia: 'socialFallbackTarget',
              originalTargetId: action.targetId,
            },
          };
        }
        // No offers for mapped kind at all — keep original kind, let validation handle it.
      }
    }

    return {
      ...action,
      kind: mapped as any,
      meta: {
        ...(action.meta || {}),
        goalLabKind,
        groundedFrom: rawKind,
        groundedVia: 'kindMap',
      },
    };
  }

  // ── Direct-execute bypass ──
  // Actions that have specs in genericSocialSpec (comfort, guard, help, etc.)
  // execute in one tick and do NOT need the intent lifecycle wrapper.
  // Let them pass through directly for action diversity.
  if (DIRECT_EXECUTE_KINDS.has(mapped)) {
    return {
      ...action,
      kind: mapped as any,
      meta: {
        ...(action.meta || {}),
        goalLabKind,
        groundedFrom: rawKind,
        groundedVia: 'directExecute',
      },
    };
  }

  // ── Intent bridge for talk / question_about / negotiate ──
  // TalkSpec and QuestionAboutSpec block direct (non-internal) calls — they
  // require the intent lifecycle (start_intent → continue_intent → intent_complete).
  // GoalLab doesn't know about intents, so when it picks 'talk' or 'question_about'
  // we wrap the action in a start_intent envelope here.  The intent system will
  // approach the target, execute the original action with meta.internal=true on
  // completion, and emit the speech/information-transfer events.
  const needsIntentWrap = (action.kind === 'talk' || action.kind === 'question_about' || action.kind === 'negotiate') && action.targetId;
  if (needsIntentWrap) {
    // ── Cooldown guard: don't re-wrap if recently completed same intent ──
    const cdPenalty = getIntentCooldownPenalty(world, actorId, action.kind, action.targetId ?? null);
    if (cdPenalty > 0.4) {
      // Too soon to start this intent again — fall back to a direct single-tick action.
      return {
        ...action,
        kind: 'observe' as any,
        targetId: action.targetId,
        meta: {
          ...(action.meta || {}),
          goalLabKind,
          groundedFrom: rawKind,
          groundedVia: 'intentCooldown:observe',
          cooldownPenalty: cdPenalty,
        },
      };
    }
    const social = String((action as any).meta?.social ?? 'inform');
    const volume = String((action as any).meta?.volume ?? 'normal');
    const topic = (action as any).meta?.topic ?? null;
    // Deterministic id for reproducible seeded runs.
    // We append a per-tick seq so repeated wraps in one tick remain unique.
    const intentSeq = nextIntentSeq(world, actorId);
    const intentId = `intent:${actorId}:${action.kind}:${social}:${world.tickIndex}:${intentSeq}`;
    const scriptId = action.kind === 'question_about'
      ? `dialog:${social}:${topic ?? 'topic'}`
      : `dialog:${social}`;

    // Resolve target position for approach navigation.
    // move_toward expects {x, y}, not {charId}.
    const targetChar = world.characters[String(action.targetId)];
    const targetPos = targetChar
      ? { x: Number((targetChar as any).pos?.x ?? 0), y: Number((targetChar as any).pos?.y ?? 0) }
      : { x: 0, y: 0 };

    return {
      ...action,
      id: `act:start_intent:${actorId}:${action.kind}:grounded`,
      kind: 'start_intent' as any,
      payload: {
        intentId,
        remainingTicks: 9999, // script controls actual duration
        intentScript: {
          id: scriptId,
          explain: [
            `Bridge: GoalLab ${action.kind} → intent transaction`,
            `Target: ${action.targetId}`,
          ],
          stages: [
            {
              kind: 'approach',
              ticksRequired: 'until_condition' as const,
              // No completionCondition — ContinueIntentSpec falls back to
              // dest-proximity check: stageDone when dist(agent, dest) <= 2.
              perTick: [
                { target: 'agent', key: 'dest', op: 'set', value: targetPos },
                { target: 'agent', key: 'move_toward', op: 'set', value: targetPos },
              ],
            },
            { kind: 'attach', ticksRequired: 1 },
            { kind: 'execute', ticksRequired: 1 },
            { kind: 'detach', ticksRequired: 1 },
          ],
        },
        intent: {
          originalAction: {
            kind: action.kind,
            actorId,
            targetId: action.targetId,
            meta: { volume, social, ...(topic ? { topic } : {}), internal: true },
            payload: null,
          },
        },
      },
      meta: {
        ...(action.meta || {}),
        goalLabKind,
        groundedFrom: action.kind,
        groundedVia: 'intentBridge:talk',
        scriptId,
      },
    };
  }

  return action;
}

/**
 * Extracts compact per-agent trace from pipeline for UI consumption.
 * Trace lives in world.facts['sim:trace:<agentId>'] and is safe for rendering.
 */
function extractAgentTrace(pipeline: any, actorId: string, world: SimWorld, mode: DecisionMode, gateResult: any): any {
  const stages = arr((pipeline as any)?.stages);

  // S4: emotions
  const s4atoms = arr(stages.find((s: any) => s.stage === 'S4')?.atoms);
  const emotions: Record<string, number> = {};
  for (const a of s4atoms) {
    const id = String((a as any)?.id || '');
    if (id.startsWith('emo:') && id.endsWith(`:${actorId}`)) {
      const key = id.split(':')[1] || '';
      if (key) emotions[key] = clamp01(Number((a as any)?.magnitude ?? 0));
    }
  }

  // S5: ToM dyad metrics from atoms and fallback world facts
  const s5atoms = arr(stages.find((s: any) => s.stage === 'S5')?.atoms);
  const relations: Record<string, Record<string, number>> = {};
  for (const a of s5atoms) {
    const id = String((a as any)?.id || '');
    // tom:dyad:<metric>:<from>:<to> OR rel:state:<metric>:<from>:<to>
    const m = id.match(/^(?:tom:dyad:|rel:state:)([^:]+):([^:]+):([^:]+)$/);
    if (!m) continue;
    const [, metric, fromId, toId] = m;
    if (fromId !== actorId) continue;
    if (!relations[toId]) relations[toId] = {};
    relations[toId][metric] = clamp01(Number((a as any)?.magnitude ?? 0));
  }

  const factsRels = (world.facts as any)?.relations?.[actorId];
  if (factsRels && typeof factsRels === 'object') {
    for (const [toId, metrics] of Object.entries(factsRels as Record<string, any>)) {
      if (!relations[toId]) relations[toId] = {};
      for (const [k, v] of Object.entries(metrics || {})) {
        const n = Number(v);
        if (Number.isFinite(n)) relations[toId][k] = clamp01(n);
      }
    }
  }

  // S6: drivers
  const s6atoms = arr(stages.find((s: any) => s.stage === 'S6')?.atoms);
  const drivers: Record<string, number> = {};
  for (const a of s6atoms) {
    const id = String((a as any)?.id || '');
    if (id.startsWith('drv:') && id.endsWith(`:${actorId}`)) {
      const key = id.split(':')[1] || '';
      if (key) drivers[key] = clamp01(Number((a as any)?.magnitude ?? 0));
    }
  }

  // S7: goals + active domains + goal mode
  const s7 = stages.find((s: any) => s.stage === 'S7');
  const goalSnapshot = (s7 as any)?.artifacts?.goalLayerSnapshot;
  const goals = arr(goalSnapshot?.domains).map((d: any) => ({
    domain: d.domain,
    score: clamp01(Number(d.score01 ?? 0)),
  }));
  const goalScores = Object.fromEntries(goals.map((g: any) => [String(g.domain), Number(g.score ?? 0)]));
  const activeGoals = arr(goalSnapshot?.activeDomains).map((d: any) => d.domain);
  const modeLabel = goalSnapshot?.mode?.label || '';
  // S7.5: enriched intent + action schema trace.
  const s7artifacts = (s7 as any)?.artifacts ?? {};
  const intentCandidates = arr(s7artifacts.intentCandidatesV1).slice(0, 6).map((c: any) => ({
    intentId: String(c?.intentId || ''),
    family: String(c?.family || ''),
    score: Number(c?.score ?? 0),
    sourceGoalIds: arr(c?.goalContribs).map((g: any) => String(g?.goalId || '')).filter(Boolean),
    dialogueAct: c?.dialogueAct ?? null,
    desiredEffect: c?.desiredEffect ?? null,
    groundingHints: arr(c?.groundingHints).map(String),
  }));
  const schemaCandidates = arr(s7artifacts.actionSchemaCandidatesV1).slice(0, 8).map((c: any) => ({
    schemaId: String(c?.schemaId || ''),
    intentId: String(c?.intentId || ''),
    family: String(c?.family || ''),
    score: Number(c?.score ?? 0),
    narrativeLabel: String(c?.narrativeLabel || ''),
    requiredOfferKinds: arr(c?.requiredOfferKinds).map(String),
    dialogueHook: c?.dialogueHook ?? null,
    cost: Number(c?.cost ?? 0),
  }));

  // S8: ranked actions (top candidates)
  const s8 = stages.find((s: any) => s.stage === 'S8');
  const appraisedEvents = arr((stages.find((s: any) => s.stage === 'S4') as any)?.artifacts?.appraisedEvents).slice(0, 8);
  const communicativeIntent = (s8 as any)?.artifacts?.communicativeIntent ?? null;
  const basedOnEvents = arr((s8 as any)?.artifacts?.basedOnEvents).map((x: any) => String(x)).filter(Boolean);
  const ranked = arr((s8 as any)?.artifacts?.ranked).slice(0, 10).map((r: any) => ({
    action: String(r?.action?.id || r?.id || ''),
    kind: String(r?.action?.kind || r?.kind || ''),
    targetId: r?.action?.targetId || r?.targetId || null,
    q: Number(r?.q ?? 0),
    cost: Number(r?.action?.cost ?? r?.cost ?? 0),
    confidence: clamp01(Number(r?.action?.confidence ?? r?.confidence ?? 1)),
    goalContribs: (() => {
      const deltas = (r?.action?.deltaGoals || r?.deltaGoals || {});
      const out: Record<string, number> = {};
      for (const [g, d] of Object.entries(deltas)) out[g] = Number(d);
      return out;
    })(),
  }));

  const best = ranked[0] || null;

  return {
    tick: (pipeline as any)?.tick ?? 0,
    actorId,
    decisionMode: mode,
    gate: gateResult,
    emotions,
    drivers,
    goals,
    goalScores,
    activeGoals,
    mode: modeLabel,
    relations,
    appraisedEvents,
    basedOnEvents,
    communicativeIntent,
    ranked,
    best: best
      ? {
          kind: best.kind,
          targetId: best.targetId,
          q: best.q,
          goalContribs: best.goalContribs,
          explanation: buildExplanation(best, ranked, drivers, emotions, modeLabel, mode, {
            topIntent: intentCandidates[0] || null,
            topSchema: schemaCandidates[0] || null,
          }),
        }
      : null,
    intentCandidates,
    schemaCandidates,
    topIntent: intentCandidates[0] || null,
    topSchema: schemaCandidates[0] || null,
  };
}

/** Build readable explanation for why the highest-ranked action was selected. */
function buildExplanation(
  best: any,
  ranked: any[],
  drivers: Record<string, number>,
  emotions: Record<string, number>,
  _mode: string,
  decisionMode: DecisionMode,
  trace?: any,
): string[] {
  const lines: string[] = [];

  if (decisionMode === 'reactive') {
    lines.push('⚡ Реактивное решение (System 1)');
    return lines;
  }
  if (decisionMode === 'degraded') {
    lines.push('⚠ Ослабленное обдумывание (усталость/стресс)');
  }
  // Intent/schema narrative.
  if (best && typeof best === 'object') {
    if (trace?.topIntent?.intentId) {
      lines.push(`🎯 Намерение: ${trace.topIntent.intentId} [${trace.topIntent.family}]`);
      if (trace.topIntent.sourceGoalIds?.length) {
        lines.push(`  ← из целей: ${trace.topIntent.sourceGoalIds.join(', ')}`);
      }
      if (trace.topIntent.dialogueAct) {
        lines.push(`  💬 речевой акт: ${trace.topIntent.dialogueAct}`);
      }
    }
    if (trace?.topSchema?.schemaId) {
      lines.push(`📋 ${trace.topSchema.narrativeLabel || trace.topSchema.schemaId}`);
    }
  }

  const topGoalContrib = Object.entries(best.goalContribs || {})
    .sort(([, a]: any, [, b]: any) => Math.abs(Number(b)) - Math.abs(Number(a)))
    .slice(0, 2);
  for (const [goal, delta] of topGoalContrib) {
    const d = Number(delta);
    if (d > 0.01) lines.push(`↑ ${goal}: +${(d * 100).toFixed(0)}% (продвигает цель)`);
    else if (d < -0.01) lines.push(`↓ ${goal}: ${(d * 100).toFixed(0)}% (цена)`);
  }

  if (ranked.length > 1) {
    const alt = ranked[1];
    const gap = Number(best.q) - Number(alt.q);
    if (gap < 0.05) {
      lines.push(`≈ Почти равен: ${alt.kind}${alt.targetId ? `→${alt.targetId}` : ''} (Q=${alt.q.toFixed(3)}, разрыв ${(gap * 100).toFixed(1)}%)`);
    } else {
      lines.push(`> Альтернатива: ${alt.kind} (Q=${alt.q.toFixed(3)}, хуже на ${(gap * 100).toFixed(0)}%)`);
    }
  }

  const topDriver = Object.entries(drivers).sort(([, a], [, b]) => b - a)[0];
  if (topDriver && topDriver[1] > 0.4) {
    lines.push(`🔥 Главный драйвер: ${topDriver[0]} (${(topDriver[1] * 100).toFixed(0)}%)`);
  }

  const topEmo = Object.entries(emotions)
    .filter(([k]) => !['arousal', 'valence'].includes(k))
    .sort(([, a], [, b]) => b - a)[0];
  if (topEmo && topEmo[1] > 0.3) {
    lines.push(`💭 Эмоция: ${topEmo[0]} (${(topEmo[1] * 100).toFixed(0)}%)`);
  }

  return lines;
}

export function makeGoalLabDeciderPlugin(opts?: { storePipeline?: boolean; enableDualProcess?: boolean }): SimPlugin {
  return {
    id: 'plugin:goalLabDecider',
    decideActions: ({ world, tickIndex, offers }) => {
      if (String((world as any)?.facts?.['sim:decider'] ?? '') === 'heuristic') return null;

      const snapshot = buildSnapshot(world, tickIndex);
      const offersByAgent = offers.reduce((acc, offer) => {
        const key = String((offer as any)?.actorId || '');
        if (!key) return acc;
        (acc[key] ||= []).push(offer);
        return acc;
      }, {} as Record<string, ActionOffer[]>);
      const worldState = buildWorldStateFromSim(world, snapshot, { offersByAgent });
      const participantIds = Object.keys(world.characters || {}).sort();
      const actorFilter = readActorFilter(world);
      const actorIds = (actorFilter.length ? actorFilter : participantIds)
        .filter((id) => Boolean((world.characters || {})[id]))
        .sort();

      const actions: SimAction[] = [];
      // Placement gate: skip deliberative pipeline if characters not placed.
      const placementResult = validatePlacement(world);
      if (!placementResult.isComplete) {
        (world.facts as any)['sim:placementValidation'] = placementResult;
        // Still allow reactive decisions, but skip full GoalLab pipeline.
        // The UI can read sim:placementValidation to show \"scene invalid\" state.
      }

      for (const actorId of actorIds) {
        if (!placementResult.isComplete) {
          const rr = reactiveDecision(world, actorId, offers, tickIndex);
          (world.facts as any)[`sim:trace:${actorId}`] = {
            tick: tickIndex,
            actorId,
            decisionMode: 'reactive',
            gate: { reason: 'placement_incomplete', placementResult },
            emotions: {},
            drivers: {},
            goals: [],
            activeGoals: [],
            mode: '',
            relations: {},
            ranked: [],
            best: rr.action
              ? {
                  kind: rr.action.kind,
                  targetId: rr.action.targetId,
                  q: 0,
                  goalContribs: {},
                  explanation: ['⚠ Делиберативный pipeline пропущен: placement incomplete', `Эмоция: ${rr.emotion} (${(rr.emotionValue * 100).toFixed(0)}%)`],
                }
              : null,
          };
          if (rr.action) {
            rr.action.meta = { ...(rr.action.meta || {}), decisionMode: 'reactive', reactiveReason: 'placement_incomplete' };
            actions.push(rr.action);
          }
          continue;
        }

        const dualProcessEnabled = opts?.enableDualProcess !== false;
        let mode: DecisionMode = 'deliberative';
        let gateResult: any = null;
        if (dualProcessEnabled) {
          const dr = selectDecisionMode(world, actorId);
          mode = dr.mode;
          gateResult = dr.gate;
        }

        if (mode === 'reactive') {
          const rr = reactiveDecision(world, actorId, offers, tickIndex);
          (world.facts as any)[`sim:trace:${actorId}`] = {
            tick: tickIndex,
            actorId,
            decisionMode: 'reactive',
            gate: gateResult,
            emotions: {},
            drivers: {},
            goals: [],
            activeGoals: [],
            mode: '',
            relations: {},
            ranked: [],
            best: rr.action
              ? {
                  kind: rr.action.kind,
                  targetId: rr.action.targetId,
                  q: 0,
                  goalContribs: {},
                  explanation: [`⚡ Реактивное: ${rr.reason}`, `Эмоция: ${rr.emotion} (${(rr.emotionValue * 100).toFixed(0)}%)`],
                }
              : null,
          };

          if (rr.action) {
            rr.action.meta = { ...(rr.action.meta || {}), decisionMode: 'reactive', gate: gateResult, reactiveReason: rr.reason };
            actions.push(rr.action);
          }
          continue;
        }

        const sceneControl: any = {};
        if (mode === 'degraded') {
          const dm = FCS.dualProcess.degradedModifiers;
          sceneControl.enableToM = dm.tomEnabled;
          sceneControl.enablePredict = dm.lookaheadEnabled;
          sceneControl._degradedTopK = dm.topK;
          sceneControl._degradedTempMult = dm.temperatureMultiplier;
          (worldState as any).decisionTemperature = (Number((worldState as any).decisionTemperature) || 1.0) * dm.temperatureMultiplier;
        } else {
          // Deliberative mode: explicitly keep prediction loop on.
          // This guarantees generation of belief:predicted / belief:surprise atoms
          // and preserves S9→beliefPersist→S6/S7 feedback behavior.
          sceneControl.enablePredict = true;
        }

        const externalPossibilities = offersToExternalPossibilities(offers, actorId);

        const pipeline = runGoalLabPipelineV1({
          world: worldState as any,
          agentId: actorId,
          participantIds,
          tickOverride: tickIndex,
          externalPossibilities,
          sceneControl,
        });
        if (!pipeline) continue;

        const bpAtoms = arr((pipeline as any)?.beliefPersist?.beliefAtoms);
        if (bpAtoms.length) {
          const memKey = `mem:beliefAtoms:${actorId}`;
          const prev = arr((world.facts as any)?.[memKey]);
          const byId = new Map<string, any>();
          for (const a of prev) {
            const id = String((a as any)?.id || '');
            if (id) byId.set(id, a);
          }
          for (const a of bpAtoms) {
            const id = String((a as any)?.id || '');
            if (id) byId.set(id, a);
          }
          (world.facts as any)[memKey] = Array.from(byId.values());
        }

        if (opts?.storePipeline) {
          (world as any).facts['sim:goalLab:lastPipeline'] = pipeline;
        }

        const trace = extractAgentTrace(pipeline, actorId, world, mode, gateResult);
        if (trace?.best?.explanation) {
          trace.best.explanation = buildExplanation(
            trace.best,
            trace.ranked || [],
            trace.drivers || {},
            trace.emotions || {},
            trace.mode || '',
            mode,
            trace,
          );
        }
        (world.facts as any)[`sim:trace:${actorId}`] = trace;
        const s8Stage = (pipeline as any)?.stages?.find((s: any) => s?.stage === 'S8');
        (world.facts as any)[`sim:grounded:${actorId}`] = arr((s8Stage as any)?.artifacts?.groundedSchemasV1).slice(0, 5);
        (world.facts as any)[`sim:pipeline:${actorId}`] = {
          mode: trace.mode,
          decisionMode: mode,
          tick: tickIndex,
          goalScores: trace.goalScores || {},
          appraisedEvents: trace.appraisedEvents || [],
          basedOnEvents: trace.basedOnEvents || [],
          communicativeIntent: trace.communicativeIntent || null,
        };
        // Store placement validation for UI consumption.
        if (placementResult) {
          (world.facts as any)['sim:placementValidation'] = placementResult;
        }

        const best = extractDecisionBest(pipeline);
        if (!best) continue;

        const rawAction = toSimAction(best, tickIndex);
        if (!rawAction) continue;
        const goalLabKind = String(best?.kind || rawAction.kind || '');

        // ── Intent lifecycle guard (v2) ─────────────────────────────────────
        // If the actor has an active intent, decide: continue, abort, or override.
        // v2 improvements:
        //   - Allow abort if GoalLab wants a DIFFERENT kind of action (not just talk→talk loop)
        //   - Allow direct-execute actions to override stale intents (>3 ticks old)
        //   - Force continue only during approach/execute stages of scripted intents
        const activeIntent = world.facts[`intent:${actorId}`];
        if (activeIntent) {
          const isIntentAction = /^(continue_intent|abort_intent|wait)$/.test(rawAction.kind);
          if (!isIntentAction) {
            const intentAge = tickIndex - Number((activeIntent as any)?.startedAtTick ?? tickIndex);
            const intentOrigKind = (activeIntent as any)?.intent?.originalAction?.kind || '';
            const wantsDifferentKind = rawAction.kind !== intentOrigKind && rawAction.kind !== 'start_intent';
            const isDirectAction = DIRECT_EXECUTE_KINDS.has(String(rawAction.kind));
            const isStale = intentAge >= 3;
            const stageKind = (activeIntent as any)?.intentScript?.stages?.[(activeIntent as any)?.stageIndex ?? 0]?.kind || '';
            const inCriticalStage = stageKind === 'execute' || stageKind === 'attach';

            // Abort if: agent wants genuinely different action AND (intent is stale OR action is direct-execute)
            // BUT not if we're in a critical stage (execute/attach).
            if (wantsDifferentKind && (isStale || isDirectAction) && !inCriticalStage) {
              // Abort the current intent, then let the new action through.
              delete world.facts[`intent:${actorId}`];
              // Fall through to grounding below — the new action will execute directly.
            } else {
              actions.push({
                id: `act:continue_intent:${tickIndex}:${actorId}:forced`,
                kind: 'continue_intent' as any,
                actorId,
                targetId: (activeIntent as any)?.intent?.originalAction?.targetId ?? null,
                meta: {
                  decisionMode: mode,
                  gate: gateResult,
                  goalLabKind,
                  groundedFrom: rawAction.kind,
                  groundedVia: 'intentGuard:forceContinue',
                  suppressedAction: rawAction.kind,
                  activeIntentId: (activeIntent as any)?.id ?? null,
                  activeIntentScriptId: (activeIntent as any)?.scriptId ?? null,
                },
              });
              continue;
            }
          }
        }
        const action = groundAbstractAction(rawAction, offers, actorId, goalLabKind, world);
        const decorated = decorateAction(action, best);
        decorated.meta = { ...(decorated.meta || {}), decisionMode: mode, gate: gateResult };
        actions.push(decorated);
      }

      return actions;
    },
  };
}
