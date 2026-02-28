
// ... existing imports ...
import type { WorldState } from '../../../types';
import type { AgentContextFrame } from '../../context/frame/types';
import { appraise, updateAffect, defaultAffect } from '../../emotions/engine';
import type { TomStateKey, TomBeliefState } from '../v3/types';
import { betaConfidence, betaMean, betaUpdate, clamp01, initBetaFromMeanExact, mix } from './math';
import type { BetaCell, ContextualMindInputs, ContextualMindResult, ContextualMindReport, ContextualMindState, DyadBeliefMemory, ContextualMindHistoryPoint, ContextSignals } from './types';
import { normalizeAffectState } from '../../affect/normalize';
import { deriveContextAxes, axesForDyad } from './axes';

// ... existing helpers (as01, avg01, pushHistory, getOrCreateMemory) ...

function as01(x: any, fallback = 0): number {
  const v = Number(x);
  if (!Number.isFinite(v)) return fallback;
  return clamp01(v);
}

function avg01(values: number[], fallback = 0): number {
  const xs = values.filter(v => Number.isFinite(v));
  if (xs.length === 0) return fallback;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pushHistory(prev: ContextualMindHistoryPoint[] | undefined, point: ContextualMindHistoryPoint, limit = 24) {
  const arr = prev ? prev.slice() : [];
  arr.push(point);
  if (arr.length > limit) arr.splice(0, arr.length - limit);
  return arr;
}

function getOrCreateMemory(world: WorldState, agentId: string): ContextualMindState {
  const agent = world.agents.find(a => a.entityId === agentId);
  const existing = (agent as any)?.contextualMind as ContextualMindState | undefined;
  if (existing) return existing;

  const created: ContextualMindState = {
    selfId: agentId,
    affect: defaultAffect(world.tick ?? 0),
    dyads: {},
    history: []
  };

  if (agent) (agent as any).contextualMind = created;
  return created;
}

// ... existing getBaseFromFrameOrWorld, initBeta, updateCell ...

function getBaseFromFrameOrWorld(world: any, frame: any, observerId: string, targetId: string): {
  baseState: TomBeliefState | null;
  baseConfOverall: number;
  baseConfByAxis?: Partial<Record<TomStateKey, number>>;
  domains?: Record<string, number>;
  norms?: Record<string, number>;
  decomposition?: any;
  dataAdequacy?: number;
} {
  const rep = frame?.tom?.reports?.[targetId];
  if (rep?.state) {
    const confOverall = as01(rep?.confidence?.overall, avg01(Object.values(rep?.confidence || {}), 0.3));
    return {
      baseState: rep.state as TomBeliefState,
      baseConfOverall: confOverall,
      baseConfByAxis: rep.confidence || undefined,
      domains: rep.domains || undefined,
      norms: rep.norms || undefined,
      decomposition: rep.decomposition || undefined,
      dataAdequacy: rep.dataAdequacy,
    };
  }

  const raw = (world.tom as any)?.[observerId]?.[targetId];
  if (raw?.traits) {
    const t = raw.traits;
    const base: TomBeliefState = {
      trust: as01(t.trust, 0.5),
      threat: as01(t.threat ?? t.conflict, 0.2),
      support: as01(t.support ?? t.reliability ?? t.trust, 0.5),
      attachment: as01(t.bond, 0.1),
      respect: as01(t.respect, 0.5),
      dominance: as01(t.dominance, 0.5),
      predictability: clamp01(1 - as01(t.uncertainty, 0.7)),
      alignment: as01(t.align, 0.5),
    };
    const confOverall = clamp01(1 - as01(raw.uncertainty, 0.9));
    return { baseState: base, baseConfOverall: confOverall };
  }

  return { baseState: null, baseConfOverall: 0.15 };
}

function initBeta(mean: number, baseConf: number, tick: number): BetaCell {
  const strength = 4 + 14 * clamp01(baseConf);
  const { alpha, beta } = initBetaFromMeanExact(mean, strength, 1);
  return { alpha, beta, lastTick: tick };
}

function updateCell(cell: BetaCell, observation: number, baseConf: number, tick: number): BetaCell {
  const w = 0.25 + 0.75 * clamp01(baseConf);
  const decay = 0.985;
  const next = betaUpdate(cell, observation, w, decay);
  return { ...next, lastTick: tick };
}

// ... existing processDyad ...

function processDyad(args: {
  targetId: string;
  mem: DyadBeliefMemory | undefined;
  baseView: TomBeliefState | null;
  baseConf: number;
  ctx: Record<string, number>;
  tick: number;
}): { memory: DyadBeliefMemory; current: Record<TomStateKey, number>; confidence: number; delta?: Partial<Record<TomStateKey, number>> } {
  const { targetId, mem, baseView, baseConf, ctx, tick } = args;

  const b = baseView;
  const obsTrust = b?.trust ?? 0.5;
  const obsThreat = b?.threat ?? 0.2;
  const obsRespect = b?.respect ?? 0.5;
  const obsDominance = b?.dominance ?? 0.5;
  const obsSupport = b?.support ?? obsTrust;
  const obsAttachment = b?.attachment ?? 0.1;

  const memory: DyadBeliefMemory =
    mem ||
    ({
      targetId,
      trust: initBeta(obsTrust, baseConf, tick),
      threat: initBeta(obsThreat, baseConf, tick),
      respect: initBeta(obsRespect, baseConf, tick),
      closeness: initBeta(obsAttachment, baseConf, tick),
      dominance: initBeta(obsDominance, baseConf, tick),
      support: initBeta(obsSupport, baseConf, tick),
      lastValue: {
        trust: obsTrust,
        threat: obsThreat,
        respect: obsRespect,
        dominance: obsDominance,
        support: obsSupport,
        attachment: obsAttachment,
        predictability: b?.predictability ?? 0.5,
        alignment: b?.alignment ?? 0.5,
      },
    } as DyadBeliefMemory);

  const danger = as01((ctx as any).danger, 0);
  const intimacy = as01((ctx as any).intimacy, 0);
  const hierarchy = as01((ctx as any).hierarchy, 0);
  const publicness = as01((ctx as any).publicness, 0.2);
  const normPressure = as01((ctx as any).normPressure, 0);
  
  // Extended axes
  const scarcity = as01((ctx as any).scarcity, 0);
  const timePressure = as01((ctx as any).timePressure, 0);
  const uncertainty = as01((ctx as any).uncertainty, 0);
  const legitimacy = as01((ctx as any).legitimacy, 0.5);
  const secrecy = as01((ctx as any).secrecy, 0);

  const ctxTrust = clamp01(
    obsTrust - 
    0.25 * danger + 
    0.25 * intimacy - 
    0.08 * publicness - 
    0.10 * secrecy + 
    0.10 * legitimacy
  );
  
  const ctxThreat = clamp01(
    obsThreat + 
    0.35 * danger - 
    0.15 * intimacy + 
    0.10 * normPressure + 
    0.10 * scarcity + 
    0.12 * timePressure + 
    0.10 * uncertainty + 
    0.08 * secrecy
  );
  
  const ctxDominance = clamp01(obsDominance + 0.20 * hierarchy + 0.05 * publicness);
  const ctxRespect = clamp01(obsRespect + 0.15 * hierarchy + 0.10 * publicness);
  const ctxCloseness = clamp01(obsAttachment + 0.35 * intimacy - 0.15 * danger);
  
  const ctxSupport = clamp01(
    obsSupport + 
    0.20 * intimacy - 
    0.10 * danger + 
    0.10 * (ctxTrust - 0.5) -
    0.08 * scarcity -
    0.10 * timePressure
  );

  memory.trust = updateCell(memory.trust, ctxTrust, baseConf, tick);
  memory.threat = updateCell(memory.threat, ctxThreat, baseConf, tick);
  memory.dominance = updateCell(memory.dominance, ctxDominance, baseConf, tick);
  memory.respect = updateCell(memory.respect, ctxRespect, baseConf, tick);
  memory.closeness = updateCell(memory.closeness, ctxCloseness, baseConf, tick);
  memory.support = updateCell(memory.support, ctxSupport, baseConf, tick);

  const anchor = clamp01(0.85 * baseConf);

  const cur: Record<TomStateKey, number> = {
    trust: mix(betaMean(memory.trust), obsTrust, anchor),
    threat: mix(betaMean(memory.threat), obsThreat, anchor),
    dominance: mix(betaMean(memory.dominance), obsDominance, anchor),
    respect: mix(betaMean(memory.respect), obsRespect, anchor),
    support: mix(betaMean(memory.support), obsSupport, anchor),
    attachment: mix(betaMean(memory.closeness), obsAttachment, anchor),
    predictability: b?.predictability ?? 0.5,
    alignment: b?.alignment ?? 0.5,
  };

  memory.lastValue = cur;

  const betaConf = avg01(
    [
      betaConfidence(memory.trust),
      betaConfidence(memory.threat),
      betaConfidence(memory.dominance),
      betaConfidence(memory.respect),
      betaConfidence(memory.support),
      betaConfidence(memory.closeness),
    ],
    0
  );
  const confidence = clamp01(0.55 * betaConf + 0.45 * baseConf);

  const delta: Partial<Record<TomStateKey, number>> | undefined =
    b
      ? {
          trust: cur.trust - obsTrust,
          threat: cur.threat - obsThreat,
          support: cur.support - obsSupport,
          attachment: cur.attachment - obsAttachment,
          dominance: cur.dominance - obsDominance,
          respect: cur.respect - obsRespect,
          alignment: cur.alignment - (b.alignment ?? 0.5),
          predictability: cur.predictability - (b.predictability ?? 0.5),
        }
      : undefined;

  return { memory, current: cur, confidence, delta };
}

// ... computeContextualMind ...

export function computeContextualMind(inputs: ContextualMindInputs): ContextualMindResult {
  const { world, agent, frame, goalPreview, domainMix, atoms, tuning } = inputs;
  const tick = world.tick ?? 0;

  const prevState = getOrCreateMemory(world, agent.entityId);
  
  const appraisalResult = appraise(agent, world, frame);
  const appraisal = appraisalResult.a;
  const appraisalWhy = appraisalResult.why;
  const appraisalTrace = appraisalResult.trace;
  
  let topGoalPriority = 0;
  if (goalPreview && goalPreview.length > 0) {
    topGoalPriority = Math.max(...goalPreview.map(g => Number(g.priority) || 0));
    if (topGoalPriority > 0.85) {
      appraisal.goalBlock = Math.max(appraisal.goalBlock, 0.2);
    }
  }
  
  const { affect: nextAffect } = updateAffect(prevState.affect, appraisal, appraisalWhy, tick);
  const normalizedAffect = normalizeAffectState(nextAffect);

  const relTargets = new Set<string>();
  // frame?.tom?.relations might not exist or be empty
  if (frame?.tom?.relations?.length) {
    for (const r of frame.tom.relations) relTargets.add(r.targetId);
  }
  if (!relTargets.size && frame?.what?.nearbyAgents?.length) {
    for (const n of frame.what.nearbyAgents) relTargets.add(n.id);
  }
  if (!relTargets.size && world.tom?.[agent.entityId]) {
    for (const tid of Object.keys(world.tom[agent.entityId])) relTargets.add(tid);
  }

  const candidates = Array.from(relTargets);
  
  const nextDyads: Record<string, DyadBeliefMemory> = { ...prevState.dyads };
  const reportDyads: ContextualMindReport['dyads'] = [];
  
  // Context axes derivation
  const axesRes = deriveContextAxes({
      selfId: agent.entityId,
      frame,
      world,
      atoms: atoms ?? null,
      domainMix: domainMix ?? null,
      tuning: (frame?.what?.contextTuning ?? tuning ?? world?.scene?.contextTuning ?? null),
  });

  const ctxAxesTuned = axesRes.tuned;
  const fromRelations = Boolean(frame?.tom?.relations?.length);
  const fromNearby = Boolean(frame?.what?.nearbyAgents?.length);
  const fromWorldTomKeys = Boolean(world.tom?.[agent.entityId]);

  // Signal debug info
  const locTags: string[] = frame?.where?.locationTags ?? [];
  const safeHub = locTags.includes('safe_hub');
  const privateSpace = locTags.includes('private') || safeHub;

  const signals: ContextSignals = {
    safeHub,
    privateSpace,
    topGoalPriority,
    goalDomainMix: domainMix || undefined,
    targetSource: { fromRelations, fromNearby, fromWorldTomKeys },
    axes: {
        raw: axesRes.raw,
        tuned: axesRes.tuned,
        tuningApplied: axesRes.tuningApplied,
    },
    signalAtomsUsed: axesRes.atomsUsed,
  };
  
  for (const targetId of candidates) {
    const base = getBaseFromFrameOrWorld(world, frame, agent.entityId, targetId);
    
    // Per-dyad context axes
    const dyadAxesVec = axesForDyad({
        global: ctxAxesTuned,
        dyadDomains: base.domains ?? null,
        dyadNorms: base.norms ?? null,
        tuning: (frame?.what?.contextTuning ?? tuning ?? world?.scene?.contextTuning ?? null),
        targetId,
    });

    const { memory, current, confidence, delta } = processDyad({
      tick,
      targetId,
      mem: prevState.dyads[targetId],
      baseView: base.baseState,
      baseConf: base.baseConfOverall,
      ctx: dyadAxesVec as any,
    });

    nextDyads[targetId] = memory;

    const targetName = world.agents?.find((a: any) => a.entityId === targetId)?.title;
    // Robust access to role label
    const roleLabel = (frame?.what?.nearbyAgents?.find(n => n.id === targetId)?.role) || 'none';
    
    const selfFear = as01((normalizedAffect as any).e?.fear, as01((normalizedAffect as any).fear, 0));
    const selfAnger = as01((normalizedAffect as any).e?.anger, as01((normalizedAffect as any).anger, 0));
    const selfShame = as01((normalizedAffect as any).e?.shame, as01((normalizedAffect as any).shame, 0));
    const selfHope = as01((normalizedAffect as any).hope, 0);
    const selfControl = as01((normalizedAffect as any).control, 0.5);

    const dThreat = current.threat - 0.5;
    const dTrust = current.trust - 0.5;

    const fear = clamp01(selfFear + 0.95 * dThreat - 0.35 * dTrust - 0.15 * selfControl);
    const anger = clamp01(selfAnger + 0.85 * dThreat + 0.10 * (1 - selfControl));
    const shame = clamp01(
      selfShame +
        0.70 * dyadAxesVec.publicness * Math.max(0, current.dominance - 0.5) +
        0.40 * as01((appraisal as any).normViolation, 0)
    );
    const hope = clamp01(selfHope + 0.55 * (current.support - current.threat) + 0.25 * dTrust);
    const exhaustion = as01((normalizedAffect as any).fatigue, 0);
    
    reportDyads.push({
      targetId,
      targetName,
      base: base.baseState
        ? {
            state: base.baseState,
            confidenceOverall: base.baseConfOverall,
            confidenceByAxis: base.baseConfByAxis,
            domains: base.domains,
            norms: base.norms,
            decomposition: base.decomposition,
            dataAdequacy: base.dataAdequacy,
          }
        : undefined,
      contextual: {
        state: current,
        confidence,
        deltaFromBase: delta,
        ctxAxes: {
          danger: dyadAxesVec.danger,
          intimacy: dyadAxesVec.intimacy,
          hierarchy: dyadAxesVec.hierarchy,
          publicness: dyadAxesVec.publicness,
          normPressure: dyadAxesVec.normPressure,
        },
        ctxAxesFull: dyadAxesVec
      },
      dyadAffect: {
        fear,
        anger,
        shame,
        hope,
        exhaustion,
        fatigue: exhaustion
      },
      role: { label: roleLabel },
    });
  }
  
  const nextState: ContextualMindState = {
    selfId: agent.entityId,
    affect: normalizedAffect,
    dyads: nextDyads,
    history: prevState.history,
  };

  const point: ContextualMindHistoryPoint = {
    tick,
    self: {
      fear: as01((normalizedAffect as any).e?.fear, 0),
      anger: as01((normalizedAffect as any).e?.anger, 0),
      shame: as01((normalizedAffect as any).e?.shame, 0),
      hope: as01((normalizedAffect as any).hope, 0),
      guilt: as01((normalizedAffect as any).e?.guilt, 0),
      stress: as01((normalizedAffect as any).stress, 0),
      fatigue: as01((normalizedAffect as any).fatigue, 0),
      valence: as01((normalizedAffect as any).valence, 0),
      arousal: as01((normalizedAffect as any).arousal, 0),
      control: as01((normalizedAffect as any).control, 0.5),
    },
    dyads: Object.fromEntries(
      reportDyads.map(d => [
        d.targetId,
        d.contextual?.state
          ? {
              trust: d.contextual.state.trust,
              threat: d.contextual.state.threat,
              support: d.contextual.state.support,
              attachment: d.contextual.state.attachment,
              dominance: d.contextual.state.dominance,
              respect: d.contextual.state.respect,
            }
          : { trust: 0.5, threat: 0.2, support: 0.5, attachment: 0.1, dominance: 0.5, respect: 0.5 },
      ])
    ),
  };

  nextState.history = pushHistory(prevState.history, point, 24);

  const agentObj = world.agents?.find((a: any) => a.entityId === agent.entityId);
  if (agentObj) (agentObj as any).contextualMind = nextState;

  const targetsUsed: string[] = Array.isArray(candidates) ? candidates : [];

  const report: ContextualMindReport = {
    tick,
    observerId: agent.entityId,
    
    scope: "scene",
    primaryTargetId: targetsUsed[0] ?? null,
    targetsUsed,

    affect: normalizedAffect,
    affectSources: {
        agentAffectPath: "agents[*].affect",
        frameAffectPath: "context.frame.how.affect",
        contextualAffectPath: "contextual_mind.affect",
    },

    appraisal,
    appraisalWhy,
    appraisalTrace,
    signals,
    dyads: reportDyads,
    topGoals: goalPreview || undefined,
    domainMix: {
      ...(domainMix || {}),
      danger: ctxAxesTuned.danger,
      intimacy: ctxAxesTuned.intimacy,
      hierarchy: ctxAxesTuned.hierarchy,
      publicness: ctxAxesTuned.publicness,
      normPressure: ctxAxesTuned.normPressure,
      surveillance: ctxAxesTuned.surveillance,
      privacy: ctxAxesTuned.intimacy, // mapped
    },
    targetsDebug: {
      candidates,
      used: candidates,
      sources: {
        relationsCount: frame?.tom?.relations?.length || 0,
        nearbyCount: frame?.what?.nearbyAgents?.length || 0,
        worldTomKeyCount: world.tom?.[agent.entityId] ? Object.keys(world.tom[agent.entityId]).length : 0,
      },
    },
    history: nextState.history,
  };
  
  return { nextState, report };
}
