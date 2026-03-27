import type { WorldState, AgentState } from '../../../types';
import type { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';
import { mergeAtomsPreferNewer } from '../../context/v2/atomMerge';

import { buildStage0Atoms } from '../../context/pipeline/stage0';
import { deriveSocialProximityAtoms } from '../../context/stage1/socialProximity';
import { deriveHazardGeometryAtoms } from '../../context/stage1/hazardGeometry';
import { deriveAxes } from '../../context/axes/deriveAxes';
import { applyCharacterLens } from '../../context/lens/characterLens';

import { applyRelationPriorsToDyads } from '../../tom/base/applyRelationPriors';
import { deriveNonContextDyadAtoms } from '../../tom/base/deriveNonContextDyads';
import { derivePhysicalThreatAtoms } from '../../context/sources/physicalThreatAtoms';
import { deriveSocialStandingAtoms } from '../../context/sources/socialStandingAtoms';
import { buildBeliefToMBias } from '../../tom/ctx/beliefBias';
import { buildTomPolicyLayer } from '../../tom/policy/tomPolicy';

import { deriveAppraisalAtoms } from '../../emotion/appraisals';
import { deriveEmotionAtoms } from '../../emotion/emotions';
import { deriveDyadicEmotionAtoms } from '../../emotion/dyadic';

import { atomizeContextMindMetrics } from '../../contextMind/atomizeMind';
import { computeContextMindScoreboard } from '../../contextMind/scoreboard';

import { deriveDriversAtoms } from '../../drivers/deriveDrivers';
import { deriveContextPriorities } from '../../context/priorities/deriveContextPriorities';
import { deriveGoalAtoms } from '../../goals/goalAtoms';
import { derivePlanningGoalAtoms } from '../../goals/planningGoalAtoms';
import { deriveGoalActionLinkAtoms } from '../../goals/goalActionLinksAtoms';

import { derivePossibilitiesRegistry } from '../../possibilities/derive';
import { atomizePossibilities } from '../../possibilities/atomize';
import type { Possibility } from '../../possibilities/catalog';
import { deriveAccess } from '../../access/deriveAccess';
import { deriveActionPriors } from '../../decision/actionPriors';
import { decideAction } from '../../decision/decide';
import { scoreAction } from '../../decision/scoreAction';
import { buildActionCandidates } from '../../decision/actionCandidateUtils';
import { arr } from '../../utils/arr';
import { uniq as uniqStrings } from '../../util/collections';
import { clamp01 } from '../../util/math';
import { getMag } from '../../util/atoms';
import { buildIntentPreview } from './intentPreview';
import { makeSimStep, type SimStep } from '../../core/simStep';
import { observeLite, type ObserveLiteParams } from './observeLite';
import { buildBeliefUpdateLiteSnapshot } from './beliefUpdateLite';
import { buildTransitionSnapshot } from './lookahead';
import { buildBeliefPersistAtoms, type BeliefPersistOutput } from './beliefPersist';
import { buildGoalEvalContext } from './buildGoalEvalContext';
import { deriveGoalPressuresV1 } from './deriveGoalPressuresV1';
import { deriveIntentCandidatesV1 } from '../../intents/specs/deriveIntentCandidatesV1';
import { projectGoalPressuresToAtoms } from '../../goals/specs/projectGoalPressuresToAtoms';
import { projectIntentCandidatesToAtoms } from '../../intents/specs/projectIntentCandidatesToAtoms';
import type { AppraisalView, RecentEventView } from '../../goals/specs/evalTypes';
import { deriveActionSchemaCandidatesV1 } from '../../actions/specs/evaluateActionSchema';
import { groundSchemasToOffers } from '../../simkit/plugins/groundSchemasToOffers';
import { validatePlacement, type PlacementValidationResult } from '../../simkit/placement/validatePlacement';

export type GoalLabStageId = 'S0'|'S1'|'S2'|'S3'|'S4'|'S5'|'S6'|'S7'|'S8'|'S9';

export type GoalLabStageFrame = {
  stage: GoalLabStageId;
  title: string;
  atoms: ContextAtom[];
  atomsAddedIds: string[];
  warnings: string[];
  stats: {
    atomCount: number;
    addedCount: number;
    missingCodeCount: number;
    missingTraceDerivedCount: number;
  };
  artifacts?: Record<string, any>;
};

export type GoalLabPipelineV1 = {
  schemaVersion: 1;
  selfId: string;
  tick: number;
  /** Explicit step record (tick + seed + events). */
  step: SimStep;
  participantIds: string[];
  stages: GoalLabStageFrame[];
  /**
   * Belief atoms to persist for next tick's S0.
   * Caller MUST write these to agent.memory.beliefAtoms.
   */
  beliefPersist: BeliefPersistOutput | null;
};

function computeAdded(prev: ContextAtom[], next: ContextAtom[]): string[] {
  const p = indexById(prev);
  const out: string[] = [];
  for (const a of next) {
    const id = (a as any)?.id;
    if (typeof id !== 'string') continue;
    if (!p.has(id)) out.push(id);
  }
  return out;
}

function indexById(atoms: ContextAtom[]): Set<string> {
  const s = new Set<string>();
  for (const a of atoms) if (a && typeof (a as any).id === 'string') s.add((a as any).id);
  return s;
}

function stageStats(atoms: ContextAtom[]) {
  let missingCodeCount = 0;
  let missingTraceDerivedCount = 0;
  for (const a of atoms) {
    if (!(a as any)?.code) missingCodeCount += 1;
    if ((a as any)?.origin === 'derived') {
      const tr = (a as any)?.trace;
      const used = Array.isArray(tr?.usedAtomIds) ? tr.usedAtomIds : [];
      const parts = tr?.parts;
      if (!used.length && (parts == null || (typeof parts === 'object' && Object.keys(parts).length === 0))) {
        missingTraceDerivedCount += 1;
      }
    }
  }
  return { missingCodeCount, missingTraceDerivedCount };
}

function cloneAsBaseCtxAtoms(ctxAtoms: ContextAtom[], selfId: string): ContextAtom[] {
  // debug-only: сохраняем "ctx до линзы" отдельными id вида ctx:base:*
  return ctxAtoms
    .filter(a => typeof (a as any)?.id === 'string' && String((a as any).id).startsWith('ctx:'))
    .map(a => {
      const id = String((a as any).id);
      const used = arr((a as any)?.trace?.usedAtomIds).filter((x: any) => typeof x === 'string');
      return normalizeAtom({
        ...(a as any),
        id: `ctx:base:${id.slice('ctx:'.length)}`,
        origin: 'derived',
        source: 'pipeline:S3.baseCopy',
        label: (a as any)?.label ? `[base] ${(a as any).label}` : `[base] ${id}`,
        trace: { usedAtomIds: used.length ? used : [id], notes: ['debug-only base copy'], parts: { selfId, originalId: id } }
      } as any);
    });
}

function computeQuarks(atoms: ContextAtom[]) {
  // минимальный quark-frame: ключ = atom.code
  const quarks: Record<string, { v: number; c: number; atomId: string }[]> = {};
  for (const a of atoms) {
    const code = (a as any)?.code;
    const id = (a as any)?.id;
    if (!code || typeof id !== 'string') continue;
    const v = Number((a as any)?.magnitude ?? 0);
    const c = Number((a as any)?.confidence ?? 1);
    (quarks[code] ||= []).push({ v, c, atomId: id });
  }
  return quarks;
}

function safeLogit01(p01: number): number {
  const p = Math.max(1e-6, Math.min(1 - 1e-6, Number(p01)));
  return Math.log(p / (1 - p));
}

function buildGoalLayerSnapshot(selfId: string, atomsAfterS7: ContextAtom[], goalRes: any, planRes: any) {
  const domainAtoms = atomsAfterS7.filter((a: any) => a?.ns === 'goal' && typeof a?.id === 'string' && a.id.startsWith(`goal:domain:`) && a.id.endsWith(`:${selfId}`));
  const activeDomainAtoms = atomsAfterS7.filter((a: any) => a?.ns === 'goal' && typeof a?.id === 'string' && a.id.startsWith(`goal:active:`) && a.id.endsWith(`:${selfId}`));
  const modeAtom = atomsAfterS7.find((a: any) => a?.ns === 'goal' && typeof a?.id === 'string' && a.id === `goal:mode:${selfId}`) as any;

  const domains = domainAtoms
    .map((a: any) => {
      const id: string = String(a.id);
      const domain = id.split(':')[2] || id;
      const score01 = Number(a.magnitude ?? 0);
      const parts = a?.trace?.parts ?? null;
      return {
        id,
        domain,
        score01,
        logit: safeLogit01(score01),
        label: a?.label ?? null,
        parts,
        usedAtomIds: arr(a?.trace?.usedAtomIds).slice(0, 50),
      };
    })
    .sort((x: any, y: any) => (y.score01 ?? 0) - (x.score01 ?? 0));

  const activeDomains = activeDomainAtoms
    .map((a: any) => {
      const id: string = String(a.id);
      const domain = id.split(':')[2] || id;
      return { id, domain, score01: Number(a.magnitude ?? 0), usedAtomIds: arr(a?.trace?.usedAtomIds).slice(0, 50) };
    })
    .sort((x: any, y: any) => (y.score01 ?? 0) - (x.score01 ?? 0));

  const planningTop = arr(planRes?.top).map((x: any) => ({ goalId: String(x?.goalId || ''), v: Number(x?.v ?? 0) })).filter((x: any) => x.goalId);
  const goalDebug = goalRes?.debug ?? null;

  const mode = modeAtom ? {
    id: String(modeAtom.id),
    magnitude: Number(modeAtom.magnitude ?? 0),
    label: modeAtom.label ?? null,
    parts: modeAtom?.trace?.parts ?? null,
    usedAtomIds: arr(modeAtom?.trace?.usedAtomIds).slice(0, 50),
  } : null;

  return {
    selfId,
    domains,
    activeDomains,
    mode,
    planningTop,
    // Keep the raw goalDebug for deep inspection in legacy/dev mode.
    goalDebug,
  };
}

type AppraisedEventLite = {
  eventId: string;
  tick: number;
  kind: string;
  actorId: string;
  targetId?: string;
  topic?: string;
  appraisal: {
    relevance: number;
    dangerToSelf: number;
    dangerToOther: number;
    obligation: number;
    affiliationPull: number;
    novelty: number;
  };
  interpretation: {
    summary: string;
    topic: string[];
    aboutWhom: string[];
    actionBias: string[];
  };
};

function eventLocId(ev: any): string | undefined {
  const raw = ev?.locationId ?? ev?.context?.locationId ?? ev?.ctx?.locationId;
  return raw != null && String(raw) ? String(raw) : undefined;
}

function eventTick(ev: any, fallbackTick: number): number {
  const raw = ev?.tick ?? ev?.t ?? ev?.meta?.payload?.tick ?? ev?.meta?.payload?.tickIndex;
  const n = Number(raw ?? fallbackTick);
  return Number.isFinite(n) ? n : fallbackTick;
}

function isDangerKind(kind: string): boolean {
  return /hazard|attack|threat|harm|hurt|blocked|betray/.test(String(kind || '').toLowerCase());
}

function isCareKind(kind: string): boolean {
  return /help|comfort|heal|protect|save|escort|assist/.test(String(kind || '').toLowerCase());
}

function isSpeechishKind(kind: string): boolean {
  return /talk|inform|ask|question|promise|negotiate|accuse|apologize|praise|threaten|comfort/.test(String(kind || '').toLowerCase());
}

function inferPrimaryTargetId(selfId: string, events: any[]): string | undefined {
  const stats = new Map<string, number>();
  for (const ev of events) {
    const t = ev?.targetId != null ? String(ev.targetId) : '';
    if (!t || t === selfId) continue;
    stats.set(t, (stats.get(t) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = -1;
  for (const [targetId, count] of stats.entries()) {
    if (count > bestCount) {
      best = targetId;
      bestCount = count;
    }
  }
  return best;
}

function collectGoalMetrics(args: {
  selfId: string;
  targetId?: string;
  atoms: ContextAtom[];
}): Record<string, number> {
  const { selfId, targetId, atoms } = args;
  const target = targetId ?? '';

  return {
    self_stress: clamp01(getMag(atoms, `feat:char:${selfId}:body.stress`, 0)),
    self_fatigue: clamp01(getMag(atoms, `feat:char:${selfId}:body.fatigue`, 0)),
    self_health: clamp01(getMag(atoms, `feat:char:${selfId}:body.health`, 1)),
    target_stress: target ? clamp01(getMag(atoms, `feat:char:${target}:body.stress`, 0)) : 0,
    target_fatigue: target ? clamp01(getMag(atoms, `feat:char:${target}:body.fatigue`, 0)) : 0,
    target_health: target ? clamp01(getMag(atoms, `feat:char:${target}:body.health`, 1)) : 0,
    trust: target ? clamp01(getMag(atoms, `rel:ctx:${selfId}:${target}:trust`, getMag(atoms, `rel:base:${selfId}:${target}:trust`, 0))) : 0,
    closeness: target ? clamp01(getMag(atoms, `rel:ctx:${selfId}:${target}:closeness`, getMag(atoms, `rel:base:${selfId}:${target}:closeness`, 0))) : 0,
    authority: target ? clamp01(getMag(atoms, `rel:ctx:${selfId}:${target}:authority`, getMag(atoms, `rel:base:${selfId}:${target}:authority`, 0))) : 0,
    dependency: target ? clamp01(getMag(atoms, `rel:ctx:${selfId}:${target}:dependency`, getMag(atoms, `rel:base:${selfId}:${target}:dependency`, 0))) : 0,
    distance: target ? Math.max(0, getMag(atoms, `map:distance:${selfId}:${target}`, 0)) : 0,
    hazard: clamp01(getMag(atoms, `ctx:final:danger:${selfId}`, getMag(atoms, `threat:final:${selfId}`, 0))),
    uncertainty: clamp01(getMag(atoms, `ctx:final:uncertainty:${selfId}`, getMag(atoms, `ctx:uncertainty:${selfId}`, 0))),
    utility_of_target: target ? clamp01(getMag(atoms, `tom:trust:${selfId}:${target}`, getMag(atoms, `ctx:final:attachment:${selfId}`, 0))) : 0,
  };
}

function collectGoalAppraisals(appraisedEvents: AppraisedEventLite[]): AppraisalView[] {
  const out: AppraisalView[] = [];
  for (const ev of appraisedEvents) {
    out.push({ tag: 'danger_to_self', score: ev.appraisal.dangerToSelf, eventId: ev.eventId, targetId: ev.targetId });
    out.push({ tag: 'target_distress', score: ev.appraisal.dangerToOther, eventId: ev.eventId, targetId: ev.targetId });
    out.push({ tag: 'cooperation_risk', score: ev.appraisal.obligation, eventId: ev.eventId, targetId: ev.targetId });
    out.push({ tag: 'information_gap', score: ev.appraisal.novelty, eventId: ev.eventId, targetId: ev.targetId });
    if (isDangerKind(ev.kind)) {
      out.push({ tag: 'target_as_threat', score: clamp01(ev.appraisal.dangerToSelf + 0.25), eventId: ev.eventId, targetId: ev.targetId });
    }
    if (/injury|wound|bleed|hurt|harm/.test(ev.kind)) {
      out.push({ tag: 'target_injury', score: clamp01(ev.appraisal.dangerToOther + 0.2), eventId: ev.eventId, targetId: ev.targetId });
    }
  }
  return out;
}

function collectRecentEventsForGoals(args: { tick: number; events: any[] }): RecentEventView[] {
  return arr(args.events)
    .map((ev): RecentEventView | null => {
      const eventTickValue = eventTick(ev, args.tick);
      const kind = String(ev?.kind ?? ev?.type ?? 'unknown');
      if (!kind) return null;
      return {
        id: String(ev?.id ?? `${kind}:${eventTickValue}`),
        kind,
        age: Math.max(0, args.tick - eventTickValue),
        salience: clamp01(Number(ev?.salience ?? ev?.magnitude ?? 0)),
        actorId: ev?.actorId != null ? String(ev.actorId) : undefined,
        targetId: ev?.targetId != null ? String(ev.targetId) : undefined,
        observerMode: 'inferred',
      };
    })
    .filter(Boolean) as RecentEventView[];
}

// Converts raw event stream into bounded appraisal-ready structures for S4/S8 debug + intent shaping.
function collectAppraisedEvents(args: {
  selfId: string;
  tick: number;
  agent: any;
  events: any[];
}): AppraisedEventLite[] {
  const { selfId, tick, agent } = args;
  const selfLocId = String((agent as any)?.locationId || '');
  const out: AppraisedEventLite[] = [];

  for (const ev of arr<any>(args.events)) {
    const actorId = String(ev?.actorId ?? '');
    const targetId = ev?.targetId != null ? String(ev.targetId) : undefined;
    const kind = String(ev?.kind ?? ev?.actionId ?? ev?.type ?? 'event');
    const locId = eventLocId(ev);
    const direct = actorId === selfId || targetId === selfId;
    const colocated = !!selfLocId && !!locId && selfLocId === locId;
    const witnessed = arr<string>(ev?.epistemics?.witnesses).map(String).includes(selfId);
    const age = Math.max(0, tick - eventTick(ev, tick));
    const freshness = clamp01(1 - age / 8);
    const magnitude = clamp01(Number(ev?.magnitude ?? ev?.intensity ?? ev?.urgency ?? 0.5));

    const relevance = clamp01(
      magnitude * 0.45
      + (direct ? 0.35 : 0)
      + (witnessed ? 0.15 : 0)
      + (!direct && colocated ? 0.1 : 0)
      + freshness * 0.2
    );
    if (relevance < 0.15) continue;

    const dangerToSelf = clamp01((targetId === selfId && isDangerKind(kind) ? 0.7 : 0) + (actorId === selfId && kind === 'hazard' ? 0.4 : 0) + magnitude * (isDangerKind(kind) ? 0.3 : 0));
    const dangerToOther = clamp01((targetId && targetId !== selfId && isDangerKind(kind) ? 0.65 : 0) + magnitude * (isDangerKind(kind) ? 0.25 : 0));
    const obligation = clamp01((targetId && targetId !== selfId ? 0.25 : 0) + (isCareKind(kind) ? 0.2 : 0) + (dangerToOther > 0 ? 0.35 : 0));
    const affiliationPull = clamp01((targetId && targetId !== selfId ? 0.25 : 0) + (isCareKind(kind) ? 0.35 : 0) + (isSpeechishKind(kind) ? 0.15 : 0));
    const novelty = freshness;

    const topic = Array.from(new Set([
      kind,
      ev?.topic ? String(ev.topic) : '',
      dangerToSelf > 0 || dangerToOther > 0 ? 'danger' : '',
      obligation > 0.45 ? 'coordination' : '',
    ].filter(Boolean)));

    const actionBias = Array.from(new Set([
      dangerToSelf > 0.45 ? 'move' : '',
      dangerToOther > 0.45 ? 'warn' : '',
      obligation > 0.45 ? 'assist' : '',
      affiliationPull > 0.45 ? 'talk' : '',
      isCareKind(kind) ? 'reassure' : '',
    ].filter(Boolean)));

    const aboutWhom = Array.from(new Set([actorId, targetId || ''].filter(Boolean)));
    const summaryTarget = targetId ? `→${targetId}` : '';

    out.push({
      eventId: String(ev?.id || `${kind}:${actorId}:${targetId || 'none'}:${tick}`),
      tick: eventTick(ev, tick),
      kind,
      actorId,
      targetId,
      topic: ev?.topic ? String(ev.topic) : undefined,
      appraisal: {
        relevance,
        dangerToSelf,
        dangerToOther,
        obligation,
        affiliationPull,
        novelty,
      },
      interpretation: {
        summary: `${kind}${summaryTarget}`,
        topic,
        aboutWhom,
        actionBias,
      },
    });
  }

  return out.sort((a, b) => (b.appraisal.relevance + b.appraisal.dangerToSelf + b.appraisal.dangerToOther) - (a.appraisal.relevance + a.appraisal.dangerToSelf + a.appraisal.dangerToOther)).slice(0, 8);
}

function buildCommunicativeIntent(args: {
  selfId: string;
  best: any;
  appraisedEvents: AppraisedEventLite[];
}): any | null {
  const bestKind = String(args.best?.kind || args.best?.action?.kind || '').toLowerCase();
  if (!bestKind) return null;
  const social = /talk|question_about|negotiate|comfort|guard|escort|treat|deceive|accuse|praise|apologize|share|signal|help/.test(bestKind);
  if (!social) return null;

  const anchor = args.appraisedEvents[0] || null;
  const targetId = args.best?.targetId ?? args.best?.action?.targetId ?? anchor?.targetId ?? null;
  let kind = 'inform';
  let desiredEffect = 'share_information';
  let tone = 'calm';

  if (bestKind === 'comfort' || anchor?.appraisal?.dangerToOther > 0.45) {
    kind = 'reassure';
    desiredEffect = 'reduce_panic';
    tone = 'soft';
  } else if (/question_about/.test(bestKind)) {
    kind = 'request_help';
    desiredEffect = 'obtain_commitment';
    tone = 'urgent';
  } else if (/accuse/.test(bestKind)) {
    kind = 'accuse';
    desiredEffect = 'increase_compliance';
    tone = 'cold';
  } else if (/negotiate|share|signal|talk|help/.test(bestKind)) {
    kind = anchor?.appraisal?.dangerToOther > 0.35 || anchor?.appraisal?.dangerToSelf > 0.35 ? 'warn' : 'inform';
    desiredEffect = kind === 'warn' ? 'increase_compliance' : 'share_information';
    tone = kind === 'warn' ? 'urgent' : 'calm';
  }

  return {
    kind,
    targetId,
    triggerEventId: anchor?.eventId ?? null,
    topic: {
      primary: anchor?.topic || anchor?.kind || bestKind,
      entities: anchor?.interpretation?.aboutWhom || (targetId ? [String(targetId)] : []),
      facts: anchor?.interpretation?.topic || [bestKind],
    },
    desiredEffect,
    stance: {
      honesty: 'truthful',
      emotionalTone: tone,
      directness: kind === 'warn' || kind === 'accuse' ? 0.9 : 0.6,
    },
  };
}

export function runGoalLabPipelineV1(input: {
  world: WorldState;
  agentId: string;
  participantIds: string[];
  manualAtoms?: any[];
  injectedEvents?: any[];
  sceneControl?: any;
  affectOverrides?: any;
  mapMetrics?: any;
  tickOverride?: number;
  observeLiteParams?: ObserveLiteParams;
  /**
   * External possibilities injected by the caller (e.g. SimKit offers converted to
   * Possibility objects). Merged with internally derived possibilities in S8.
   * This allows GoalLab to score concrete spatial offers (move→loc:kitchen)
   * alongside its own abstract possibilities (escape, hide, etc.).
   */
  externalPossibilities?: Possibility[];
}): GoalLabPipelineV1 | null {
  const { world, agentId, participantIds } = input;
  const tick = Number(input.tickOverride ?? (world as any)?.tick ?? 0);
  const agent = arr((world as any)?.agents).find((a: any) => a?.entityId === agentId) as AgentState | undefined;
  if (!agent) return null;
  const selfId = agent.entityId;

  const step = makeSimStep({
    t: tick,
    seed: (world as any)?.rngSeed ?? (world as any)?.rng_seed ?? (world as any)?.seed ?? 0,
    events: [
      ...arr(input.injectedEvents),
      ...arr((world as any)?.eventLog?.events),
    ],
  });

  const stages: GoalLabStageFrame[] = [];
  let atoms: ContextAtom[] = [];
  let beliefPersistResult: BeliefPersistOutput | null = null;

  // ── Placement validation gate ──
  // Hard principle: scene is invalid until all characters are placed.
  const placementValidation: PlacementValidationResult = (() => {
    try {
      // Build a minimal SimWorld-like shape for validation.
      const simWorldLike: any = {
        characters: {},
        locations: {},
      };
      const agents = arr((world as any)?.agents);
      for (const a of agents) {
        if (!a?.entityId) continue;
        simWorldLike.characters[a.entityId] = {
          id: a.entityId,
          locId: a.locationId ?? '',
          pos: a.pos ?? { nodeId: null, x: null, y: null },
        };
      }
      const locs = arr((world as any)?.locations ?? (world as any)?.worldLocations);
      for (const l of locs) {
        const id = l?.entityId ?? l?.id;
        if (!id) continue;
        simWorldLike.locations[id] = l;
      }
      return validatePlacement(simWorldLike);
    } catch {
      return { isComplete: false, unplacedActors: [], invalidActors: [], warnings: ['validation_error'], allPositioned: false, spatialReady: false };
    }
  })();

  // S0: canonical atoms (строго без ctx)
  const s0 = buildStage0Atoms({
    world,
    agent,
    selfId,
    mapMetrics: input.mapMetrics,
    beliefAtoms: arr((agent as any)?.memory?.beliefAtoms),
    overrideAtoms: arr(input.manualAtoms).map(normalizeAtom),
    events: step.events,
    sceneSnapshot: (world as any).sceneSnapshot,
    includeAxes: false
  });
  atoms = arr((s0 as any)?.mergedAtoms).map(normalizeAtom);
  // Observation snapshot (lite): best-effort visibility model for GoalLab console.
  // IMPORTANT: this does not replace the existing obs-atoms pipeline.
  const observationLite = observeLite({
    world,
    agent,
    selfId,
    tick,
    params: {
      // Defaults are conservative; GoalLab console can override via input.observeLiteParams.
      radius: Number(input.observeLiteParams?.radius ?? 10),
      maxAgents: Number(input.observeLiteParams?.maxAgents ?? 12),
      noiseSigma: Number(input.observeLiteParams?.noiseSigma ?? 0),
      seed: Number(input.observeLiteParams?.seed ?? (world as any)?.rngSeed ?? 0),
    },
  });

  const s0ObsAtomIds = arr((s0 as any)?.obsAtoms)
    .map((a: any) => String(a?.id || ''))
    .filter(Boolean);
  const s0RawObservations = arr((world as any)?.observations?.[selfId]).slice(0, 50);

  const beliefAtomIds = arr((agent as any)?.memory?.beliefAtoms)
    .map((a: any) => (typeof a?.id === 'string' ? a.id : null))
    .filter(Boolean) as string[];

  const overrideAtomIds = arr(input.manualAtoms)
    .map((a: any) => (typeof a?.id === 'string' ? a.id : null))
    .filter(Boolean) as string[];

  stages.push({
    stage: 'S0',
    title: 'S0 Canonicalization (world/obs/mem/override)',
    atoms,
    atomsAddedIds: atoms.map(a => String((a as any).id)).filter(Boolean),
    warnings: placementValidation.isComplete
      ? []
      : [
          'placement_incomplete',
          ...arr(placementValidation.unplacedActors).map((id: string) => `unplaced:${id}`),
          ...arr(placementValidation.invalidActors).map((id: string) => `invalid:${id}`),
          ...arr(placementValidation.warnings).map((w: string) => `warn:${w}`),
        ],
    stats: { atomCount: atoms.length, addedCount: atoms.length, ...stageStats(atoms) },
    artifacts: {
      obsAtomsCount: arr((s0 as any)?.obsAtoms).length,
      provenanceSize: ((s0 as any)?.provenance as any)?.size ?? 0,
      // Level 3.1: explicit observation snapshot (lite).
      observationSnapshot: {
        agentId: selfId,
        tick,
        rawObservations: s0RawObservations,
        obsAtomIds: s0ObsAtomIds.slice(0, 800),
        observationLite,
        note: 'Lite snapshot: world.observations[agentId] + obsAtomIds from Stage0 (extractObservationAtoms).',
      },
      // Belief update (lite): strict snapshot for the "prior belief injection" step in S0.
      // This is the first brick of the future U(b,a,o) protocol.
      beliefUpdateSnapshot: buildBeliefUpdateLiteSnapshot({
        world,
        agent,
        selfId,
        tick,
        mergedAtomsS0: atoms,
        obsAtomIds: s0ObsAtomIds,
        priorBeliefAtomIds: beliefAtomIds,
        overrideAtomIds,
        eventsCount: arr(step.events).length,
        params: { maxIds: 800 },
      }),
      placementValidation,
      placementComplete: placementValidation.isComplete,
    }
  });

  // Hard gate: even direct pipeline calls must not proceed with incomplete placement.
  if (!placementValidation.isComplete) {
    return {
      schemaVersion: 1,
      selfId,
      tick,
      step,
      participantIds: participantIds.slice(),
      stages,
      beliefPersist: null,
    };
  }

  // S1: Normalize -> Quarks (минимально)
  const quarks = computeQuarks(atoms);
  stages.push({
    stage: 'S1',
    title: 'S1 Normalize → Quarks',
    atoms,
    atomsAddedIds: [],
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) },
    artifacts: { quarks }
  });

  // S2: контекстные сигналы + базовые ctx оси
  // IMPORTANT: stage-1 enrichers must be computed from the canonical world.
  // If hazardGeometry doesn't see world (map + positions), it silently produces 0 atoms
  // and the downstream context becomes "одинаковым" even when hazards exist.
  const s2Warnings: string[] = [];
  const sp = deriveSocialProximityAtoms({ selfId, atoms });
  const hz = deriveHazardGeometryAtoms({ world, selfId, atoms } as any);

  const spAtoms = arr((sp as any)?.atoms).map(normalizeAtom);
  const hzAtoms = arr((hz as any)?.atoms).map(normalizeAtom);

  // Guardrails: detect "input present but module produced nothing".
  const hasNearby = atoms.some(a => typeof (a as any)?.id === 'string' && String((a as any).id).startsWith(`obs:nearby:${selfId}:`));
  const hasAnyHazard = atoms.some(a => {
    const id = String((a as any)?.id || '');
    return id.includes('hazard') || id.startsWith('world:env:') || id.startsWith('world:map:');
  });
  if (hasNearby && spAtoms.length === 0) {
    s2Warnings.push('S2: obs:nearby:* present, but socialProximity produced 0 atoms (check obs magnitudes + dyad tags/priors).');
  }
  if (hasAnyHazard && hzAtoms.length === 0) {
    s2Warnings.push('S2: hazard-ish signals present, but hazardGeometry produced 0 atoms (check world.locations[].map + agent positions).');
  }

  const mS2a = mergeAtomsPreferNewer(atoms, [...spAtoms, ...hzAtoms]);
  const atomsS2in = mS2a.atoms;

  const ctx = deriveAxes({ selfId, atoms: atomsS2in });
  const ctxAtoms = arr((ctx as any)?.atoms).map(normalizeAtom);
  const ctxBaseCopies = cloneAsBaseCtxAtoms(ctxAtoms, selfId);
  const mS2b = mergeAtomsPreferNewer(atomsS2in, [...ctxAtoms, ...ctxBaseCopies]);
  const atomsS2 = mS2b.atoms;
  const s2Added = uniqStrings([...mS2a.newIds, ...mS2b.newIds]);
  const s2Overridden = uniqStrings([...mS2a.overriddenIds, ...mS2b.overriddenIds]);
  atoms = atomsS2;
  stages.push({
    stage: 'S2',
    title: 'S2 Context axes (base ctx:*)',
    atoms,
    atomsAddedIds: s2Added,
    warnings: s2Warnings,
    stats: { atomCount: atoms.length, addedCount: s2Added.length, ...stageStats(atoms) },
    artifacts: {
      socialProximity: sp,
      hazardGeometry: hz,
      ctxAxisCount: ctxAtoms.length,
      overriddenIds: s2Overridden,
      moduleAdds: {
        // keep these bounded so export stays sane
        socialProximityIds: spAtoms.map(a => String((a as any).id)).slice(0, 200),
        hazardGeometryIds: hzAtoms.map(a => String((a as any).id)).slice(0, 200),
      }
    }
  });

  // S3: lens (субъективные поправки)
  const lens = applyCharacterLens({ selfId, atoms, agent });
  const mS3 = mergeAtomsPreferNewer(atoms, arr((lens as any)?.atoms));
  const atomsS3 = mS3.atoms;
  const s3Added = mS3.newIds;
  const s3Overridden = mS3.overriddenIds;
  atoms = atomsS3;
  stages.push({
    stage: 'S3',
    title: 'S3 Lens (subjective ctx/tom overrides)',
    atoms,
    atomsAddedIds: s3Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s3Added.length, ...stageStats(atoms) },
    artifacts: { lens: (lens as any)?.lens, overriddenIds: s3Overridden }
  });

  // S4: appraisal -> emotions
  const app = deriveAppraisalAtoms({ selfId, atoms });
  const appAtoms = arr((app as any)?.atoms).map(normalizeAtom);
  const mS4a = mergeAtomsPreferNewer(atoms, appAtoms);

  const emo = deriveEmotionAtoms({ selfId, atoms: mS4a.atoms });
  const emoAtoms = arr((emo as any)?.atoms).map(normalizeAtom);
  const mS4b = mergeAtomsPreferNewer(mS4a.atoms, emoAtoms);

  const dy = deriveDyadicEmotionAtoms({ selfId, atoms: mS4b.atoms });
  const dyAtoms = arr((dy as any)?.atoms).map(normalizeAtom);
  const mS4c = mergeAtomsPreferNewer(mS4b.atoms, dyAtoms);
  const appraisedEvents = collectAppraisedEvents({
    selfId,
    tick,
    agent,
    events: step.events,
  });

  const atomsS4 = mS4c.atoms;
  const s4Added = uniqStrings([...mS4a.newIds, ...mS4b.newIds, ...mS4c.newIds]);
  const s4Overridden = uniqStrings([...mS4a.overriddenIds, ...mS4b.overriddenIds, ...mS4c.overriddenIds]);
  atoms = atomsS4;
  stages.push({
    stage: 'S4',
    title: 'S4 Appraisal → Emotions',
    atoms,
    atomsAddedIds: s4Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s4Added.length, ...stageStats(atoms) },
    artifacts: {
      appCount: appAtoms.length,
      emoCount: emoAtoms.length,
      dyEmoCount: dyAtoms.length,
      appraisedEvents,
      overriddenIds: s4Overridden,
    }
  });

  // S5: ToM (priors/ctx/final + policy) + physical/social dyad factors
  const enableToM = (input.sceneControl as any)?.enableToM !== false;
  if (enableToM) {
    const relPriors = applyRelationPriorsToDyads({ selfId, atoms });
    const relAtoms = arr((relPriors as any)?.atoms).map(normalizeAtom);
    const mS5a = mergeAtomsPreferNewer(atoms, relAtoms);

    const othersForTom = participantIds.filter(id => id && id !== selfId);

    // Derived dyad modifiers that make threat and status target-specific.
    const physAtoms = derivePhysicalThreatAtoms({ atoms: mS5a.atoms, selfId, otherIds: othersForTom }).map(normalizeAtom);
    const mS5phys = mergeAtomsPreferNewer(mS5a.atoms, physAtoms);

    const socialAtoms = deriveSocialStandingAtoms({ atoms: mS5phys.atoms, selfId, otherIds: othersForTom }).map(normalizeAtom);
    const mS5social = mergeAtomsPreferNewer(mS5phys.atoms, socialAtoms);

    const nonCtx = deriveNonContextDyadAtoms({ selfId, otherIds: othersForTom, atoms: mS5social.atoms });
    const nonCtxAtoms = arr((nonCtx as any)?.atoms).map(normalizeAtom);
    const mS5x = mergeAtomsPreferNewer(mS5social.atoms, nonCtxAtoms);

    const beliefBias = buildBeliefToMBias({ selfId, atoms: mS5x.atoms });
    const beliefAtoms = arr((beliefBias as any)?.atoms).map(normalizeAtom);
    const mS5b = mergeAtomsPreferNewer(mS5x.atoms, beliefAtoms);

    const policy = buildTomPolicyLayer({ selfId, atoms: mS5b.atoms });
    const policyAtoms = arr((policy as any)?.atoms).map(normalizeAtom);
    const mS5c = mergeAtomsPreferNewer(mS5b.atoms, policyAtoms);

    const atomsS5 = mS5c.atoms;
    const s5Added = uniqStrings([...mS5a.newIds, ...mS5phys.newIds, ...mS5social.newIds, ...mS5x.newIds, ...mS5b.newIds, ...mS5c.newIds]);
    const s5Overridden = uniqStrings([...mS5a.overriddenIds, ...mS5phys.overriddenIds, ...mS5social.overriddenIds, ...mS5x.overriddenIds, ...mS5b.overriddenIds, ...mS5c.overriddenIds]);
    atoms = atomsS5;
    stages.push({
      stage: 'S5',
      title: 'S5 ToM (priors/ctx/final + policy)',
      atoms,
      atomsAddedIds: s5Added,
      warnings: [],
      stats: { atomCount: atoms.length, addedCount: s5Added.length, ...stageStats(atoms) },
      artifacts: {
        tomEnabled: true,
        relPriorsCount: relAtoms.length,
        physicalThreatCount: physAtoms.length,
        socialStandingCount: socialAtoms.length,
        nonContextDyadCount: nonCtxAtoms.length,
        beliefBiasCount: beliefAtoms.length,
        policyCount: policyAtoms.length,
        overriddenIds: s5Overridden,
      }
    });
  } else {
    stages.push({
      stage: 'S5',
      title: 'S5 ToM (disabled)',
      atoms,
      atomsAddedIds: [],
      warnings: ['ToM disabled'],
      stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) },
      artifacts: { tomEnabled: false },
    });
  }

  // S6: drivers bridge (canonical drv:* atoms)
  const scoreboard = computeContextMindScoreboard({ selfId, atoms });
  const mindAtoms = arr(atomizeContextMindMetrics(selfId, scoreboard as any)).map(normalizeAtom);
  const mS6a = mergeAtomsPreferNewer(atoms, mindAtoms);

  const driverCurves = (agent as any)?.driverCurves;
  const inhibitionOverrides = (agent as any)?.inhibitionOverrides;
  const driverInertia = (agent as any)?.driverInertia;
  const drv = deriveDriversAtoms({
    selfId,
    atoms: mS6a.atoms,
    ...(driverCurves ? { driverCurves } : {}),
    ...(inhibitionOverrides ? { inhibitionOverrides } : {}),
    ...(driverInertia ? { driverInertia } : {}),
  });
  const drvAtoms = arr((drv as any)?.atoms).map(normalizeAtom);
  const mS6b = mergeAtomsPreferNewer(mS6a.atoms, drvAtoms);

  // Personal context priorities are produced right after drivers so S7 goal ecology
  // can modulate domain activation through explicit ctx:prio:* atoms.
  const prio = deriveContextPriorities({ selfId, atoms: mS6b.atoms });
  const prioAtoms = arr((prio as any)?.atoms).map(normalizeAtom);
  const mS6c = mergeAtomsPreferNewer(mS6b.atoms, prioAtoms);

  const atomsS6 = mS6c.atoms;
  const s6Added = uniqStrings([...mS6a.newIds, ...mS6b.newIds, ...mS6c.newIds]);
  const s6Overridden = uniqStrings([...mS6a.overriddenIds, ...mS6b.overriddenIds, ...mS6c.overriddenIds]);
  atoms = atomsS6;
  stages.push({
    stage: 'S6',
    title: 'S6 Drivers (drv:*) / ContextMind / Priorities',
    atoms,
    atomsAddedIds: s6Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s6Added.length, ...stageStats(atoms) },
    artifacts: { contextMind: scoreboard, drvCount: drvAtoms.length, prioCount: prioAtoms.length, overriddenIds: s6Overridden }
  });

  // S7: goals (ecology + active) + planning-goals
  // Safe: uses only existing atoms; if drv/life are missing it falls back to ctx.
  const goalTuning = (agent as any)?.goalTuning ?? null;
  const goalRes = deriveGoalAtoms(selfId, atoms as any, { topN: 3, goalTuning });
  const goalAtoms = arr((goalRes as any)?.atoms).map(normalizeAtom);

  const planRes = derivePlanningGoalAtoms(selfId, mergeAtomsPreferNewer(atoms, goalAtoms).atoms as any, { topN: 5 });
  const planAtoms = arr((planRes as any)?.atoms).map(normalizeAtom);

  const linkRes = deriveGoalActionLinkAtoms(selfId, mergeAtomsPreferNewer(atoms, goalAtoms).atoms);
  const linkAtoms = arr((linkRes as any)?.atoms).map(normalizeAtom);

  const mS7a = mergeAtomsPreferNewer(atoms, goalAtoms);
  const mS7b = mergeAtomsPreferNewer(mS7a.atoms, planAtoms);
  const mS7c = mergeAtomsPreferNewer(mS7b.atoms, linkAtoms);
  // Project Goal-layer atoms to Action-visible utility atoms (one-way dependency: Goal -> Util -> Action).
  // Decision layer must read `ns === 'util'`, not `ns === 'goal'`.
  const utilAtoms = mS7c.atoms
    .filter(a => (a as any)?.ns === 'goal' && typeof (a as any)?.id === 'string' && (a as any).id.startsWith('goal:'))
    .map(a => ({
      ...a,
      ns: 'util' as const,
      id: (a as any).id.replace(/^goal:/, 'util:'),
      origin: (a as any).origin ?? 'derived',
      trace: {
        ...(a as any).trace,
        usedAtomIds: uniqStrings([...(a as any)?.trace?.usedAtomIds || [], (a as any).id]),
        notes: uniqStrings([...(a as any)?.trace?.notes || [], 'goal->util projection'])
      }
    }));

  const mS7d = mergeAtomsPreferNewer(mS7c.atoms, utilAtoms as any);
  const atomsS7 = mS7d.atoms;
  const s7Added = uniqStrings([...mS7a.newIds, ...mS7b.newIds, ...mS7c.newIds, ...mS7d.newIds]);
  const s7Overridden = uniqStrings([...mS7a.overriddenIds, ...mS7b.overriddenIds, ...mS7c.overriddenIds, ...mS7d.overriddenIds]);
  atoms = atomsS7;

  // Canonical GoalSpecV1 pressure derivation is additive for now:
  // we keep legacy goal atoms intact and expose new pressures as S7 artifacts.
  const canonicalTargetId = inferPrimaryTargetId(selfId, step.events);
  const goalEvalCtx = buildGoalEvalContext({
    selfId,
    targetId: canonicalTargetId,
    tick,
    metrics: collectGoalMetrics({ selfId, targetId: canonicalTargetId, atoms: atomsS7 }),
    recentEvents: collectRecentEventsForGoals({ tick, events: step.events }),
    appraisals: collectGoalAppraisals(appraisedEvents),
    beliefs: arr((agent as any)?.memory?.beliefAtoms)
      .map((a: any) => (typeof a?.id === 'string' ? a.id : null))
      .filter(Boolean) as string[],
    capabilities: [],
    recentActionKinds: [],
    cooldownReady: [],
  });
  const derivedGoalPressuresV1 = deriveGoalPressuresV1(goalEvalCtx);

  // Transitional bridge:
  // project canonical GoalSpecV1 pressures into normal goal-atoms so downstream
  // layers can already "see" the new registry.
  const derivedGoalAtomsV1 = projectGoalPressuresToAtoms(derivedGoalPressuresV1);
  const mS7e = mergeAtomsPreferNewer(atoms, derivedGoalAtomsV1 as any);
  // Layer F/G bridge (additive): derive intent candidates and action schemas from
  // canonical GoalSpecV1 pressures. These artifacts are currently observational and
  // do not replace legacy S8 choice logic.
  const intentCandidatesV1 = deriveIntentCandidatesV1(goalEvalCtx, derivedGoalPressuresV1);
  const intentAtomsV1 = projectIntentCandidatesToAtoms(intentCandidatesV1);
  const mS7f = mergeAtomsPreferNewer(mS7e.atoms, intentAtomsV1 as any);
  const actionSchemaCandidatesV1 = deriveActionSchemaCandidatesV1(intentCandidatesV1, goalEvalCtx);
  atoms = mS7f.atoms;

  const s7AddedFinal = uniqStrings([...s7Added, ...mS7e.newIds, ...mS7f.newIds]);
  const s7OverriddenFinal = uniqStrings([...s7Overridden, ...mS7e.overriddenIds, ...mS7f.overriddenIds]);

  // Level 4.0b (F/G): explicit goal layer snapshot (domains/logits/goals/modes).
  const goalLayerSnapshot = buildGoalLayerSnapshot(selfId, atoms, goalRes as any, planRes as any);
  stages.push({
    stage: 'S7',
    title: 'S7 Goals (ecology + planning)',
    atoms,
    atomsAddedIds: s7AddedFinal,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s7AddedFinal.length, ...stageStats(atoms) },
    artifacts: {
      goalAtomsCount: goalAtoms.length,
      goalDebug: (goalRes as any)?.debug ?? null,
      goalLayerSnapshot,
      derivedGoalPressuresV1,
      projectedGoalAtomsV1: derivedGoalAtomsV1.map((a) => a.id),
      intentCandidatesV1: intentCandidatesV1.slice(0, 10),
      projectedIntentAtomsV1: intentAtomsV1.map((a) => a.id),
      actionSchemaCandidatesV1: actionSchemaCandidatesV1.slice(0, 10),
      topIntentFamily: intentCandidatesV1[0]?.family ?? null,
      topSchemaFamily: actionSchemaCandidatesV1[0]?.family ?? null,
      topSchemaNarrative: actionSchemaCandidatesV1[0]?.narrativeLabel ?? null,
      topSchemaDialogueHook: actionSchemaCandidatesV1[0]?.dialogueHook ?? null,
      canonicalGoalTopV1: derivedGoalPressuresV1[0]?.goalId ?? null,
      goalEvalContextV1: {
        targetId: goalEvalCtx.targetId ?? null,
        metricKeys: Object.keys(goalEvalCtx.metrics).sort(),
        appraisalsCount: goalEvalCtx.appraisals.length,
        recentEventsCount: goalEvalCtx.recentEvents.length,
      },
      planGoalAtomsCount: planAtoms.length,
      goalActionLinksCount: linkAtoms.length,
      utilAtomsCount: utilAtoms.length,
      topPlanGoals: (planRes as any)?.top || [],
      overriddenIds: s7OverriddenFinal,
    }
  });

  // S8: actions
  // IMPORTANT: keep this stage strictly typed + non-throwing.
  // A pipeline crash should never take down the UI.
  try {
    const internalPoss = derivePossibilitiesRegistry({ selfId, atoms });
    // Merge external possibilities (e.g. SimKit spatial offers) with internal ones.
    // External possibilities carry concrete targetId/targetNodeId from SimKit enumeration,
    // allowing GoalLab to score specific move destinations via goal-weighted Q(a).
    // Dedup by id: internal wins on collision (they have richer trace/context).
    const externalPoss = arr(input.externalPossibilities);
    const internalIds = new Set(internalPoss.map((p) => p.id));
    const possList = [...internalPoss, ...externalPoss.filter((p) => p?.id && !internalIds.has(p.id))];
    const externalOffersLike = externalPoss.map((p: any) => ({
      actorId: selfId,
      kind: String((p as any)?.meta?.sim?.kind ?? ''),
      targetId: (p as any)?.targetId ?? null,
      targetNodeId: (p as any)?.targetNodeId ?? null,
      score: Number((p as any)?.meta?.sim?.score ?? 0),
      blocked: false,
    }));
    const possAtoms = arr(atomizePossibilities(possList)).map(normalizeAtom);
    const mS8a = mergeAtomsPreferNewer(atoms, possAtoms);

    const locationId = (agent as any)?.locationId;
    const accessPack = deriveAccess(mS8a.atoms, selfId, locationId);
    const accessAtoms = arr((accessPack as any)?.atoms).map(normalizeAtom);
    const mS8b = mergeAtomsPreferNewer(mS8a.atoms, accessAtoms);

    const otherIds = participantIds.filter(id => id && id !== selfId);
    const priorsAtoms = arr(deriveActionPriors({
      selfId,
      otherIds,
      atoms: mS8b.atoms,
    })).map(normalizeAtom);
    const mS8c = mergeAtomsPreferNewer(mS8b.atoms, priorsAtoms);

    const { actions, goalEnergy } = buildActionCandidates({
      selfId,
      atoms: mS8c.atoms,
      possibilities: possList,
    });

    const rng = (agent as any)?.rngChannels?.decide;
    const temperature =
      (world as any)?.decisionTemperature ??
      (agent as any)?.behavioralParams?.T0 ??
      (agent as any)?.temperature ??
      1.0;

    const enablePredict = (input.sceneControl as any)?.enablePredict === true;
    const useLookaheadForChoice = (input.sceneControl as any)?.useLookaheadForChoice === true;
    const lookaheadGamma = Number((input.sceneControl as any)?.lookaheadGamma ?? 0.7);
    const lookaheadRisk = Number((input.sceneControl as any)?.lookaheadRiskAversion ?? (input.sceneControl as any)?.riskAversion ?? 0);

    // Build deterministic baseline ranking for lookahead (does not consume RNG channel).
    const rankedBaseline = actions
      .map((action: any) => ({
        ...(action || {}),
        q: Number(scoreAction(action, goalEnergy) ?? 0),
      }))
      .sort((a: any, b: any) => Number(b?.q ?? 0) - Number(a?.q ?? 0));

    // Optional console override: if a force_action event is injected for this agent,
    // promote that action as "best" in artifacts (without stepping world dynamics).
    const forcedActionId = (() => {
      const evs = arr(input.injectedEvents);
      let last: any = null;
      for (const e of evs) {
        const t = String((e as any)?.type || (e as any)?.kind || '');
        if (t !== 'force_action') continue;
        const a = String((e as any)?.agentId || (e as any)?.selfId || '');
        if (a && a !== selfId) continue;
        last = e;
      }
      const id = String((last as any)?.actionId || (last as any)?.action || '');
      return id && id !== 'undefined' && id !== 'null' ? id : '';
    })();

    const rankedForLookahead = (() => {
      if (!forcedActionId) return rankedBaseline;
      const rest = rankedBaseline.filter((a: any) => String(a?.id || a?.actionId || a?.name || '') !== forcedActionId);
      const forced = rankedBaseline.find((a: any) => String(a?.id || a?.actionId || a?.name || '') === forcedActionId) || { id: forcedActionId, q: (rest[0]?.q ?? 0) + 1e-6 };
      return [forced, ...rest];
    })();

    const transitionSnapshot = enablePredict
      ? buildTransitionSnapshot({
          selfId,
          tick,
          seed: Number(input.observeLiteParams?.seed ?? (step as any)?.seed ?? 0),
          gamma: lookaheadGamma,
          riskAversion: lookaheadRisk,
          atoms: mS8c.atoms,
          actions: rankedForLookahead.slice(0, 10).map((a: any) => ({
            id: String(a?.id || a?.actionId || a?.name || ''),
            kind: String(a?.kind || ''),
            qNow: Number(a?.q ?? 0),
          })),
          goalEnergy,
          enableSensitivityZ0: true,
          observationLite: observationLite ? {
            visibleAgentIds: arr((observationLite as any)?.visibleAgents).map((a: any) => String(a?.id || '')).filter(Boolean),
            noiseSigma: Number(input.observeLiteParams?.noiseSigma ?? 0),
          } : undefined,
        })
      : null;

    // POMDP feasibility feedback: dampen goalEnergy for goals that no top action
    // can advance (all v1PerGoal deltas negative). This prevents the decision
    // layer from chasing unachievable goals.
    if (transitionSnapshot && Object.keys(goalEnergy).length > 0) {
      const bestDeltaPerGoal: Record<string, number> = {};
      for (const ev of (transitionSnapshot.perAction || []).slice(0, 5)) {
        const v1pg = ev.v1PerGoal || {};
        const v0pg = ev.v0PerGoal || {};
        for (const [gid, v1Raw] of Object.entries(v1pg)) {
          const v0 = Number(v0pg[gid] ?? 0);
          const delta = Number(v1Raw) - v0;
          bestDeltaPerGoal[gid] = Math.max(bestDeltaPerGoal[gid] ?? -Infinity, delta);
        }
      }
      for (const [gid, bestDelta] of Object.entries(bestDeltaPerGoal)) {
        if (bestDelta < -0.005 && goalEnergy[gid] !== undefined) {
          // Damp: bestDelta=-0.5 → factor≈0; bestDelta=-0.01 → factor≈0.98
          const factor = Math.max(0, Math.min(1, 1 + bestDelta * 2));
          goalEnergy[gid] *= factor;
        }
      }
    }

    // Optional: steer stochastic choice by lookahead Q while preserving ranked q reporting.
    const qSamplingOverrides = (useLookaheadForChoice && transitionSnapshot)
      ? (() => {
          const out: Record<string, number> = {};
          for (const ev of transitionSnapshot.perAction || []) {
            const id = String((ev as any)?.actionId || '');
            if (!id) continue;
            out[id] = Number((ev as any)?.qLookahead ?? 0);
          }
          return out;
        })()
      : undefined;

    const decision = decideAction({
      actions,
      goalEnergy,
      topK: 10,
      rng: rng && typeof rng.next === 'function' ? () => rng.next() : () => 0.5,
      temperature,
      qSamplingOverrides,
    });

    const decisionAtoms = arr((decision as any)?.atoms).map(normalizeAtom);
    const mS8d = mergeAtomsPreferNewer(mS8c.atoms, decisionAtoms);
    const atomsS8 = mS8d.atoms;
    const s8Added = uniqStrings([...mS8a.newIds, ...mS8b.newIds, ...mS8c.newIds, ...mS8d.newIds]);
    const s8Overridden = uniqStrings([...mS8a.overriddenIds, ...mS8b.overriddenIds, ...mS8c.overriddenIds, ...mS8d.overriddenIds]);
    atoms = atomsS8;

    // Invariant (C2/C8): Action layer must not read Goal atoms directly.
    // The decision layer is expected to read util:* projections instead.
    const actionReadsGoalViolations = (() => {
      const actionAtoms = atomsS8.filter(a => a.ns === 'action');
      const bad: string[] = [];
      for (const a of actionAtoms) {
        const used = arr((a as any)?.trace?.usedAtomIds).map(String);
        const hits = used.filter(id => id.startsWith('goal:'));
        if (hits.length) bad.push(`${a.id} <- ${hits.join(', ')}`);
      }
      return bad;
    })();

    const rankedActions = arr((decision as any)?.ranked).map((r: any) => ({
      ...(r?.action || {}),
      q: Number(r?.q ?? 0),
    }));

    // Level 4.0b (J): decision breakdown per action (goal contributions + cost/confidence).
    const buildDecisionBreakdown = (actionObj: any, q: number) => {
      const deltaGoals = actionObj?.deltaGoals && typeof actionObj.deltaGoals === 'object' ? actionObj.deltaGoals : {};
      const contribByGoal: Record<string, number> = {};
      let sum = 0;
      for (const [g, delta] of Object.entries(deltaGoals)) {
        const w = Number((goalEnergy as any)?.[g] ?? 0);
        const d = Number(delta ?? 0);
        const c = w * d;
        contribByGoal[String(g)] = c;
        sum += c;
      }
      const cost = Number(actionObj?.cost ?? 0);
      const conf = Number(actionObj?.confidence ?? 1);

      const id = String(actionObj?.id || actionObj?.actionId || actionObj?.name || '');
      const look = id ? (lookByActionId.get(id) || null) : null;

      return {
        id,
        kind: String(actionObj?.kind || ''),
        targetId: actionObj?.targetId ?? null,
        q: Number(q ?? 0),
        cost,
        confidence: conf,
        deltaGoals,
        contribByGoal,
        rawBeforeConfidence: sum - cost,
        // Lookahead (optional): Q_lookahead = Q_now + gamma * V(z_hat).
        qLookahead: look ? Number(look.qLookahead ?? 0) : null,
        deltaLookahead: look ? Number(look.delta ?? 0) : null,
        v1: look ? Number(look.v1 ?? 0) : null,
      };
    };

    const bestRaw = (decision as any)?.best || null;
    const bestOverridden = forcedActionId
      ? (rankedActions.find((a: any) => String(a?.id || a?.actionId || a?.name || '') === forcedActionId) || { id: forcedActionId })
      : bestRaw;

    const rankedOverridden = (() => {
      if (!forcedActionId) return rankedActions;
      const rest = rankedActions.filter((a: any) => String(a?.id || a?.actionId || a?.name || '') !== forcedActionId);
      const forced = rankedActions.find((a: any) => String(a?.id || a?.actionId || a?.name || '') === forcedActionId) || { id: forcedActionId, q: (rest[0]?.q ?? 0) + 1e-6 };
      return [forced, ...rest];
    })();

    const lookByActionId = new Map<string, any>();
    if (transitionSnapshot) {
      for (const ev of transitionSnapshot.perAction || []) {
        const id = String((ev as any)?.actionId || '');
        if (id) lookByActionId.set(id, ev);
      }
    }

    const decisionWarnings = arr<string>((decision as any)?.warnings);
    const groundedSchemasV1 = groundSchemasToOffers(actionSchemaCandidatesV1, externalOffersLike as any, selfId).slice(0, 10);
    const communicativeIntent = (() => {
      // Prefer schema-layer communicative intent over legacy heuristic.
      const topCommSchema = actionSchemaCandidatesV1.find(
        (s) => s.dialogueHook && s.score > 0,
      );
      if (topCommSchema?.dialogueHook) {
        const sourceIntent = intentCandidatesV1.find(
          (i) => i.intentId === topCommSchema.intentId,
        );
        const anchor = appraisedEvents[0] || null;
        return {
          kind: topCommSchema.dialogueHook.act,
          targetId: topCommSchema.targetId ?? bestOverridden?.targetId ?? null,
          triggerEventId: anchor?.eventId ?? null,
          topic: {
            primary: anchor?.topic || anchor?.kind || topCommSchema.schemaId,
            entities: anchor?.interpretation?.aboutWhom || [],
            facts: anchor?.interpretation?.topic || [topCommSchema.schemaId],
          },
          desiredEffect: topCommSchema.dialogueHook.desiredEffect,
          stance: {
            honesty: 'truthful',
            emotionalTone: topCommSchema.dialogueHook.act === 'warn' ? 'urgent'
              : topCommSchema.dialogueHook.act === 'command' ? 'firm' : 'calm',
            directness: topCommSchema.dialogueHook.act === 'command'
              || topCommSchema.dialogueHook.act === 'accuse' ? 0.9 : 0.6,
          },
          _source: 'schemaLayer',
          _schemaId: topCommSchema.schemaId,
          _intentId: topCommSchema.intentId,
          _narrativeLabel: topCommSchema.narrativeLabel,
          _sourceGoalIds: sourceIntent?.goalContribs?.map((g) => g.goalId) ?? [],
        };
      }
      // Fallback: legacy heuristic.
      return buildCommunicativeIntent({
        selfId,
        best: bestOverridden,
        appraisedEvents,
      });
    })();

    // Level 4.5: explicit mode/stabilizer snapshots for console observability.
    const modesSnapshot = {
      fastMode: !!(input.sceneControl as any)?.fastMode,
      source: (input as any)?.worldSource || 'derived',
      consoleMode: true,
      observe: {
        radius: input.observeLiteParams?.radius ?? null,
        noise: input.observeLiteParams?.noiseSigma ?? null,
        seed: input.observeLiteParams?.seed ?? null,
      },
      forcedActionId: forcedActionId || null,
      enableToM: (input.sceneControl as any)?.enableToM !== false,
      enablePredict: enablePredict,
      useLookaheadForChoice: useLookaheadForChoice,
      lookahead: enablePredict ? { gamma: lookaheadGamma, riskAversion: lookaheadRisk } : null,
    };

    const stabilizersSnapshot = {
      temperature,
      forced: forcedActionId || null,
      emptyGoalEnergy: !goalEnergy || Object.keys(goalEnergy).length === 0,
      useLookaheadForChoice: useLookaheadForChoice,
      warnings: decisionWarnings || [],
    };

    stages.push({
      stage: 'S8',
      title: 'S8 Decision / actions',
      atoms: atomsS8,
      atomsAddedIds: s8Added,
      warnings: actionReadsGoalViolations.map(v => `INVARIANT: action reads goal:* (${v})`),
      stats: { atomCount: atomsS8.length, addedCount: s8Added.length, ...stageStats(atomsS8) },
      artifacts: {
        // Keep artifacts light: export is dominated by atoms; store only top scoring + access decisions.
        accessDecisions: (accessPack as any)?.decisions || [],
        ranked: rankedOverridden.slice(0, 10),
        best: bestOverridden,
        groundedSchemasV1,
        decisionSnapshot: {
          selfId,
          temperature,
          goalEnergy,
          digest: (() => {
            const entries = Object.entries(goalEnergy || {})
              .map(([id, energy]) => ({ id: String(id), energy: Number(energy) }))
              .filter((x) => x.id && Number.isFinite(x.energy));
            entries.sort((a, b) => Math.abs(b.energy) - Math.abs(a.energy));
            const leadingGoal = entries.length ? entries[0] : null;

            const linearBest = rankedBaseline && rankedBaseline.length
              ? (() => {
                  const top: any = rankedBaseline[0];
                  const a: any = top?.action;
                  return {
                    actionId: String(a?.id || ''),
                    kind: String(a?.kind || ''),
                    targetId: a?.targetId ? String(a.targetId) : undefined,
                    qNow: Number(top?.q ?? 0),
                  };
                })()
              : null;

            const pomdpBest = transitionSnapshot && (transitionSnapshot.perAction || []).length
              ? (() => {
                  const x: any = (transitionSnapshot.perAction || [])[0];
                  return {
                    actionId: String(x?.actionId || ''),
                    kind: String(x?.kind || ''),
                    qNow: Number(x?.qNow ?? 0),
                    qLookahead: Number(x?.qLookahead ?? 0),
                    delta: Number(x?.delta ?? 0),
                  };
                })()
              : null;

            const chosen = bestOverridden
              ? {
                  actionId: String((bestOverridden as any)?.id || ''),
                  kind: String((bestOverridden as any)?.kind || ''),
                  targetId: (bestOverridden as any)?.targetId ? String((bestOverridden as any).targetId) : undefined,
                  forcedActionId: forcedActionId || null,
                }
              : null;

            return {
              leadingGoal: leadingGoal ? { id: leadingGoal.id, energy: leadingGoal.energy } : null,
              linearBest,
              pomdpBest,
              chosen,
            };
          })(),
          ranked: arr((decision as any)?.ranked).slice(0, 10).map((r: any) => buildDecisionBreakdown(r?.action || {}, r?.q)),
          rankedOverridden: rankedOverridden.slice(0, 10).map((a: any) => buildDecisionBreakdown(a, a?.q)),
          best: bestOverridden ? buildDecisionBreakdown(bestOverridden as any, (bestOverridden as any)?.q ?? 0) : null,
          forcedActionId: forcedActionId || null,
          note: 'Decision breakdown: Q(a)=Σ_g goalEnergy[g]*Δg(a) - cost(a), then *confidence(a). contribByGoal are pre-confidence.',
          lookahead: transitionSnapshot ? {
            enabled: true,
            gamma: transitionSnapshot.gamma,
            riskAversion: transitionSnapshot.riskAversion,
            v0: transitionSnapshot.valueFn?.v0 ?? null,
            ranked: (transitionSnapshot.perAction || []).slice(0, 10).map((x: any) => ({
              actionId: String(x?.actionId || ''),
              qLookahead: Number(x?.qLookahead ?? 0),
              delta: Number(x?.delta ?? 0),
              v1: Number(x?.v1 ?? 0),
            })),
          } : { enabled: false },
          noteLookahead: 'Q_lookahead = Q_now + gamma * V*(z_hat, goalEnergy); z_hat = z + Δz_passive + Δz_action + noise; V* uses goal-weighted projections over features (fallbacks to legacy V if goalEnergy empty).',
          featureVector: transitionSnapshot ? transitionSnapshot.z0 : null,
          linearApprox: transitionSnapshot ? {
            perAction: (transitionSnapshot.perAction || []).slice(0, 10).map((x: any, i: number) => ({
              rank: i + 1,
              actionId: String(x?.actionId || ''),
              kind: String(x?.kind || ''),
              qNow: Number(x?.qNow ?? 0),
              qLookahead: Number(x?.qLookahead ?? 0),
              deltaLookahead: Number(x?.delta ?? 0),
              v1: Number(x?.v1 ?? 0),
              topDeltas: Object.entries(x?.deltas || {})
                .map(([k, v]: any) => ({ k, v: Number(v ?? 0) }))
                .sort((a: any, b: any) => Math.abs(b.v) - Math.abs(a.v))
                .slice(0, 4),
              v1PerGoal: x?.v1PerGoal || null,
            })),
            sensitivity: transitionSnapshot.sensitivity || null,
            sensitivityZ0: transitionSnapshot.sensitivityZ0 || null,
            flipCandidates: transitionSnapshot.flipCandidates || null,
          } : null

        },
        forcedActionId: forcedActionId || null,
        modesSnapshot,
        stabilizersSnapshot,
        intentPreview: buildIntentPreview({
          selfId,
          atoms: atomsS8,
          s8Artifacts: { best: bestOverridden, ranked: rankedOverridden },
          horizonSteps: 5,
        }),
        derivedIntentCandidatesV1: intentCandidatesV1.slice(0, 10),
        projectedIntentAtomsV1: intentAtomsV1.map((a) => a.id),
        canonicalIntentTopV1: intentCandidatesV1[0]?.intentId ?? null,
        basedOnEvents: appraisedEvents.map((ev) => ev.eventId),
        communicativeIntent,
        schemaGroundedCommunicativeIntent: communicativeIntent?._source === 'schemaLayer'
          ? {
              source: 'schemaLayer',
              schemaId: communicativeIntent._schemaId,
              intentId: communicativeIntent._intentId,
              narrativeLabel: communicativeIntent._narrativeLabel,
              act: communicativeIntent.kind,
              desiredEffect: communicativeIntent.desiredEffect,
            }
          : { source: 'legacy' },
        appraisedEvents,
        overriddenIds: s8Overridden,
        priorsAtomIds: (priorsAtoms || []).map(a => String((a as any)?.id || '')),
        decisionAtomIds: decisionAtoms.map(a => String((a as any)?.id || '')),
      }
    });


    if (transitionSnapshot) {
      stages.push({
        stage: 'S9',
        title: 'S9 Predict tick (linear lookahead)',
        atoms,
        atomsAddedIds: [],
        warnings: (transitionSnapshot.warnings || []).slice(),
        stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) },
        artifacts: {
          transitionSnapshot,
        }
      });
    }

    // --- Belief persist: close the POMDP feedback loop ---
    // Caller MUST write beliefPersistResult.beliefAtoms to agent.memory.beliefAtoms.
    const driverPressure: Record<string, number> = {};
    for (const a of drvAtoms) {
      const id = String((a as any)?.id || '');
      const m = id.match(/^drv:(\w+):/);
      if (m) driverPressure[m[1]] = clamp01(Number((a as any)?.magnitude ?? 0));
    }

    beliefPersistResult = buildBeliefPersistAtoms({
      selfId,
      tick,
      chosenAction: bestOverridden ? {
        id: String((bestOverridden as any)?.id || ''),
        kind: String((bestOverridden as any)?.kind || ''),
        targetId: (bestOverridden as any)?.targetId ?? null,
        q: Number((bestOverridden as any)?.q ?? 0),
      } : null,
      goalEnergy,
      transition: transitionSnapshot,
      prevBeliefAtoms: arr((agent as any)?.memory?.beliefAtoms),
      driverPressure,
    });

    // Inject surprise atoms into the current frame for console visibility.
    if (beliefPersistResult.surpriseAtoms.length) {
      atoms = [...atoms, ...beliefPersistResult.surpriseAtoms];
    }
  } catch (e: any) {
    stages.push({
      stage: 'S8',
      title: 'S8 Decision / actions (FAILED)',
      atoms,
      atomsAddedIds: [],
      warnings: [String(e?.message || e)],
      stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) },
      artifacts: {
        error: {
          name: String(e?.name || ''),
          message: String(e?.message || e),
          stack: String(e?.stack || ''),
        }
      }
    });
  }

  return { schemaVersion: 1, selfId, tick, step, participantIds: participantIds.slice(), stages, beliefPersist: beliefPersistResult };
}
