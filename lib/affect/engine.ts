import { AffectState, EmotionAppraisal, EmotionAtom, EmotionId, AppraisalTrace } from '../emotions/types';
import { AgentState, WorldState } from '../types';
import { AgentContextFrame } from '../context/frame/types';
import { normalizeAffectState } from '../affect/normalize';

// Local helpers
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp11 = (x: number) => Math.max(-1, Math.min(1, x));
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;

const c01 = (x: any, fb = 0) => {
  const v = Number(x);
  if (!Number.isFinite(v)) return fb;
  return clamp01(v);
};

function sumParts(parts: Record<string, number>) {
  return Object.values(parts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function fmt3(x: number) {
  return Number.isFinite(x) ? x.toFixed(3) : '—';
}

function traceLine(key: string, total: number, parts: Record<string, number>) {
  const items = Object.entries(parts)
    .filter(([, v]) => Math.abs(v) > 1e-6)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8)
    .map(([k, v]) => `${k}=${fmt3(v)}`);
  return `${key}=${fmt3(total)} :: ${items.join(' · ')}`;
}

export function defaultAffect(tick: number): AffectState {
  const e: Record<EmotionId, number> = {
    fear: 0, anger: 0, sadness: 0, joy: 0, disgust: 0, shame: 0, guilt: 0, pride: 0,
    trust: 0.2, attachment: 0.1, loneliness: 0, curiosity: 0.2, hope: 0,
  };
  return normalizeAffectState({
    valence: 0,
    arousal: 0.2,
    control: 0.5,
    e,
    stress: 0.2,
    fatigue: 0.2,
    dissociation: 0,
    stability: 0.8,
    regulation: { suppression: 0.2, reappraisal: 0.3, rumination: 0.2, threatBias: 0.3, moralRumination: 0 },
    moral: { guilt: 0, shame: 0 },
    updatedAtTick: tick,
    fear: 0,
    anger: 0,
    shame: 0,
    trustBaseline: 0.5,
    hope: 0
  });
}

export function appraise(agent: AgentState, world: WorldState, frame: AgentContextFrame | null): { a: EmotionAppraisal; why: string[]; trace: AppraisalTrace } {
  const a: EmotionAppraisal = {
    threat: 0,
    goalBlock: 0,
    socialSupport: 0,
    intimacy: 0,
    uncertainty: 0,
    normViolation: 0,
    loss: 0,
    goalProgress: 0,
    statusDelta: 0,
    responsibility: 0,
    controllability: 0.5,
    publicExposure: 0.2,
    reparability: 0.5,
  };
  const trace: AppraisalTrace = {};
  const why: string[] = [];

  // --- Extract Raw Signals (Robustly) ---
  const sceneThreat01 = c01(world?.scene?.metrics?.threat, 0) / 100;
  const sceneChaos01 = c01((world?.scene?.metrics as any)?.chaos, 0) / 100;
  const mapHazard01 = c01(frame?.where?.map?.hazard, 0);
  
  // New: use pre-calculated environmental danger index if available to separate from social threat
  const envDanger01 = typeof (frame as any)?.derived?.envDangerIndex === 'number'
    ? clamp01((frame as any).derived.envDangerIndex)
    : clamp01(Math.max(sceneThreat01, mapHazard01, 0.6 * sceneChaos01));

  const locTags: string[] = frame?.where?.locationTags ?? [];
  const isSafeHub = locTags.includes('safe_hub');
  const isPrivate = locTags.includes('private') || isSafeHub;
  const role = (frame as any)?.self?.role || (frame as any)?.what?.selfRole || agent.effectiveRole || 'none';

  // V3 norms/domains if present on frame (optional)
  const norms = (frame?.tom as any)?.norms || {};
  const publicExposure01 = c01(norms.publicExposure, isPrivate ? 0.2 : 0.8);
  const privacy01 = c01(norms.privacy, isPrivate ? 0.9 : 0.2);
  const normPressure01 = c01(norms.normPressure, 0.2);
  const surveillance01 = c01(norms.surveillance, 0.1);

  // Goal pressure
  const goalPressure01 = c01((frame?.what as any)?.goalPressure01, 0);

  // --- THREAT ---
  const threatParts: Record<string, number> = {
    envDanger: 0.75 * envDanger01,
    normPressure: 0.12 * normPressure01,
    // residual chaos adds "unease" even when danger is low
    chaos: 0.10 * sceneChaos01,
    safeDamp: isPrivate && mapHazard01 < 0.25 ? -0.40 * envDanger01 : 0,
  };
  a.threat = clamp01(sumParts(threatParts));
  trace.threat = { total: a.threat, parts: threatParts };
  why.push(traceLine('threat', a.threat, threatParts));

  // --- UNCERTAINTY ---
  const infoAdequacy01 = c01((frame?.what as any)?.infoAdequacy01, 0.3);
  const uncertaintyParts: Record<string, number> = {
    lackInfo: 0.65 * (1 - infoAdequacy01),
    surveillance: 0.25 * surveillance01,
    chaos: 0.20 * sceneChaos01,
    safeReduce: isPrivate ? -0.10 : 0,
  };
  a.uncertainty = clamp01(sumParts(uncertaintyParts));
  trace.uncertainty = { total: a.uncertainty, parts: uncertaintyParts };
  why.push(traceLine('uncertainty', a.uncertainty, uncertaintyParts));

  // --- INTIMACY ---
  const intimacyParts: Record<string, number> = {
    privacy: 0.60 * privacy01,
    privateTag: isPrivate ? 0.25 : 0,
    publicPenalty: -0.30 * publicExposure01,
  };
  a.intimacy = clamp01(sumParts(intimacyParts));
  trace.intimacy = { total: a.intimacy, parts: intimacyParts };
  why.push(traceLine('intimacy', a.intimacy, intimacyParts));

  // --- PUBLIC EXPOSURE ---
  const publicParts: Record<string, number> = {
    publicExposure: 0.70 * publicExposure01,
    invPrivacy: 0.30 * (1 - privacy01),
  };
  a.publicExposure = clamp01(sumParts(publicParts));
  trace.publicExposure = { total: a.publicExposure, parts: publicParts };
  why.push(traceLine('publicExposure', a.publicExposure, publicParts));

  // --- GOAL BLOCK ---
  const obstacle01 = c01((frame?.what as any)?.obstacle01, 0.2);
  const goalBlockParts: Record<string, number> = {
    obstacles: 0.55 * obstacle01,
    threatSpill: 0.25 * a.threat,
    goalPressure: 0.35 * goalPressure01,
  };
  a.goalBlock = clamp01(sumParts(goalBlockParts));
  trace.goalBlock = { total: a.goalBlock, parts: goalBlockParts };
  why.push(traceLine('goalBlock', a.goalBlock, goalBlockParts));

  // --- SOCIAL SUPPORT ---
  const nearbyAllies01 = c01((frame?.what as any)?.nearbyAllies01, 0);
  const supportParts: Record<string, number> = {
    nearbyAllies: 0.55 * nearbyAllies01,
    intimacy: 0.25 * a.intimacy,
    threatPenalty: -0.20 * a.threat,
    surveillancePenalty: -0.15 * surveillance01,
  };
  a.socialSupport = clamp01(sumParts(supportParts));
  trace.socialSupport = { total: a.socialSupport, parts: supportParts };
  why.push(traceLine('socialSupport', a.socialSupport, supportParts));

  // --- NORM VIOLATION ---
  const ruleViolation01 = c01((frame?.what as any)?.ruleViolation01, 0);
  const protocolStrict01 = c01((frame?.what as any)?.protocolStrict01, 0.3);
  const normParts: Record<string, number> = {
    explicit: 0.70 * ruleViolation01,
    pressure: 0.25 * normPressure01,
    protocol: 0.25 * protocolStrict01,
    threatAmplify: 0.15 * a.threat,
    privateDamp: isPrivate ? -0.10 : 0,
  };
  a.normViolation = clamp01(sumParts(normParts));
  trace.normViolation = { total: a.normViolation, parts: normParts };
  why.push(traceLine('normViolation', a.normViolation, normParts));

  // --- RESPONSIBILITY / CONTROLLABILITY / REPARABILITY ---
  const isLeader = role === 'incident_leader' || role === 'leader' || role === 'commander';
  const responsibilityParts: Record<string, number> = {
    leader: isLeader ? 0.55 : 0.20,
    protocol: 0.25 * protocolStrict01,
    exposure: 0.15 * (a.publicExposure ?? 0.2),
  };
  a.responsibility = clamp01(sumParts(responsibilityParts));
  trace.responsibility = { total: a.responsibility!, parts: responsibilityParts };
  why.push(traceLine('responsibility', a.responsibility!, responsibilityParts));

  const controllabilityParts: Record<string, number> = {
    inverseThreat: 0.45 * (1 - a.threat),
    inverseUnc: 0.35 * (1 - a.uncertainty),
    leaderBoost: isLeader ? 0.15 : 0.05,
  };
  a.controllability = clamp01(sumParts(controllabilityParts));
  trace.controllability = { total: a.controllability!, parts: controllabilityParts };
  why.push(traceLine('controllability', a.controllability!, controllabilityParts));

  const reparabilityParts: Record<string, number> = {
    control: 0.40 * (a.controllability ?? 0.5),
    support: 0.35 * a.socialSupport,
    exposurePenalty: -0.20 * (a.publicExposure ?? 0.2),
    threatPenalty: -0.15 * a.threat,
  };
  a.reparability = clamp01(sumParts(reparabilityParts));
  trace.reparability = { total: a.reparability!, parts: reparabilityParts };
  why.push(traceLine('reparability', a.reparability!, reparabilityParts));

  return { a, why, trace };
}

export function updateAffect(
  prev: AffectState | null | undefined,
  appraisal: EmotionAppraisal,
  why: string[],
  tick: number,
): { affect: AffectState; atoms: EmotionAtom[] } {
  const base = defaultAffect(tick);
  const p = prev ?? null;
  
  const a0: AffectState = {
    ...base,
    ...(p as any),
    e: { ...base.e, ...((p as any)?.e ?? {}) },
    regulation: { ...base.regulation, ...((p as any)?.regulation ?? {}) },
    updatedAtTick: (p as any)?.updatedAtTick ?? base.updatedAtTick,
  };

  const next = JSON.parse(JSON.stringify(a0)) as AffectState;
  
  if(!next.e) next.e = { ...base.e };
  if(!next.regulation) next.regulation = { ...base.regulation };
  if(!next.moral) next.moral = { guilt: 0, shame: 0 };

  const r = next.regulation;
  const reapp = c01(r.reappraisal, 0);
  const supp = c01(r.suppression, 0);
  const rum = c01(r.rumination, 0);
  const diss = c01(next.dissociation, 0);

  const threat = c01(appraisal.threat, 0);
  const goalBlock = c01(appraisal.goalBlock, 0);
  const support = c01(appraisal.socialSupport, 0);
  const intimacy = c01(appraisal.intimacy, 0);
  const unc = c01(appraisal.uncertainty, 0);
  const normV = c01(appraisal.normViolation, 0);
  const resp = c01(appraisal.responsibility, 0.3);
  const ctrl = c01(appraisal.controllability, 0.5);
  const pub = c01(appraisal.publicExposure, 0.2);
  const rep = c01(appraisal.reparability, 0.5);

  const fear0 = clamp01(0.55 * threat + 0.35 * unc - 0.20 * support);
  const anger0 = clamp01(0.55 * goalBlock + 0.25 * threat - 0.15 * ctrl);
  const shame0 = clamp01(0.55 * normV + 0.25 * pub + 0.20 * (1 - ctrl));
  const guilt0 = clamp01(0.55 * normV + 0.25 * resp + 0.20 * rep - 0.25 * diss);
  const hope0 = clamp01(0.50 * support + 0.25 * (1 - threat) + 0.20 * intimacy);
  const joy0 = clamp01(appraisal.goalProgress * 0.8 + appraisal.socialSupport * 0.3);

  const fearT = clamp01(fear0 * (1 - 0.35 * reapp) * (1 + 0.15 * rum));
  const angerT = clamp01(anger0 * (1 - 0.25 * reapp) * (1 - 0.20 * supp));
  const shameT = clamp01(shame0 * (1 - 0.30 * reapp) * (1 - 0.15 * supp) * (1 + 0.25 * rum));
  const guiltT = clamp01(guilt0 * (1 - 0.20 * reapp) * (1 + 0.35 * rum));
  const hopeT = clamp01(hope0 * (1 + 0.20 * reapp) * (1 - 0.10 * rum));
  const joyT = clamp01(joy0);

  const dt = Math.max(1, tick - (a0.updatedAtTick ?? tick));
  const k = dt > 10 ? 0.8 : 0.25;

  next.e.fear = next.e.fear * (1 - k) + fearT * k;
  next.e.anger = next.e.anger * (1 - k) + angerT * k;
  next.e.shame = next.e.shame * (1 - k) + shameT * k;
  next.e.guilt = (next.e.guilt ?? 0) * (1 - k) + guiltT * k;
  next.e.hope = next.e.hope * (1 - k) + hopeT * k;
  next.e.joy = next.e.joy * (1 - k) + joyT * k;

  // Sync moral block
  next.moral.shame = next.e.shame;
  next.moral.guilt = next.e.guilt;

  next.arousal = clamp01(0.55 * next.e.fear + 0.35 * next.e.anger + 0.15 * unc);
  next.valence = clamp11(clamp01(0.55 * next.e.hope - 0.45 * next.e.fear - 0.30 * next.e.shame - 0.18 * (next.e.guilt ?? 0)) * 2 - 1);
  next.control = clamp01(0.55 * (1 - threat) + 0.25 * support + 0.20 * ctrl - 0.15 * unc);

  next.stress = clamp01(0.60 * threat + 0.25 * goalBlock + 0.20 * unc - 0.15 * support);
  next.fatigue = clamp01(0.60 * next.fatigue + 0.40 * next.stress);
  next.dissociation = clamp01(0.70 * next.dissociation + 0.30 * (0.65 * threat + 0.25 * unc - 0.15 * ctrl));
  next.stability = clamp01(1 - (0.45 * next.stress + 0.25 * next.dissociation + 0.15 * next.fatigue));
  
  next.updatedAtTick = tick;

  // Use normalization to ensure everything is consistent including aliases
  const normalized = normalizeAffectState(next);

  // Generate atoms from ALL emotions present with emotion-specific details
  const express = clamp01(1 - 0.55 * supp);
  const atoms: EmotionAtom[] = (Object.keys(next.e) as EmotionId[])
  .map((id) => {
    const intensity = clamp01(next.e[id] * express);
    
    // emotion-specific polarity (so trust/curiosity isn't displayed as strongly negative by default)
    const polarity: Record<EmotionId, number> = {
      fear: -1, anger: -1, sadness: -1, disgust: -1, shame: -1, guilt: -1,
      joy: +1, pride: +1, trust: +1, attachment: +1, curiosity: +1, loneliness: -1,
      hope: +1, // Add missing key
    } as any;
    
    const valenceLocal = clamp11(polarity[id] * intensity);
    
    // emotion-specific arousal: fear/anger high; sadness/loneliness low; curiosity mid; trust/attachment low-mid
    const arousalLocal = clamp01(
      id === 'fear' ? (0.35 + 0.65 * intensity) :
      id === 'anger' ? (0.30 + 0.70 * intensity) :
      id === 'curiosity' ? (0.20 + 0.55 * intensity) :
      id === 'joy' ? (0.20 + 0.50 * intensity) :
      id === 'pride' ? (0.18 + 0.45 * intensity) :
      id === 'trust' ? (0.12 + 0.35 * intensity) :
      id === 'attachment' ? (0.10 + 0.30 * intensity) :
      id === 'sadness' ? (0.10 + 0.25 * intensity) :
      id === 'loneliness' ? (0.08 + 0.25 * intensity) :
      id === 'shame' ? (0.18 + 0.45 * intensity) :
      id === 'guilt' ? (0.14 + 0.40 * intensity) :
      (0.15 + 0.35 * intensity)
    );
    
    // pick more relevant "why" lines per emotion (short, stable)
    const whyLocal =
      id === 'fear' ? why.filter(s => s.startsWith('threat') || s.startsWith('uncertainty')).slice(0, 4) :
      id === 'anger' ? why.filter(s => s.startsWith('goal_block') || s.startsWith('threat')).slice(0, 4) :
      id === 'sadness' ? why.filter(s => s.startsWith('loss')).slice(0, 3) :
      id === 'joy' ? why.filter(s => s.startsWith('progress') || s.startsWith('support')).slice(0, 4) :
      id === 'trust' ? why.filter(s => s.startsWith('support') || s.startsWith('threat')).slice(0, 4) :
      id === 'attachment' ? why.filter(s => s.startsWith('support') || s.startsWith('loss') || s.startsWith('status')).slice(0, 4) :
      id === 'curiosity' ? why.filter(s => s.startsWith('uncertainty') || s.startsWith('progress')).slice(0, 4) :
      id === 'shame' ? why.filter(s => s.startsWith('norm_violation') || s.startsWith('status')).slice(0, 4) :
      why.slice(0, 4);

    return {
      kind: 'emotion' as const,
      emotion: id,
      intensity,
      valence: valenceLocal,
      arousal: arousalLocal,
      why: whyLocal.length ? whyLocal : why.slice(0, 4),
    };
  })
  .filter(a => a.intensity > 0.08)
  .sort((a, b) => b.intensity - a.intensity)
  .slice(0, 10);
  
  return { affect: normalized, atoms };
}
