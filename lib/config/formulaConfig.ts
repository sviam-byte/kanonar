/**
 * lib/config/formulaConfig.ts
 *
 * Named coefficients registry — replaces 150+ magic numbers in goalAtoms.ts,
 * actionPriors.ts, modes.ts, lookahead.ts, etc.
 *
 * ALL VALUES are identical to current hardcoded ones. This is a pure rename.
 *
 * USAGE:
 *   import { FC } from '../config/formulaConfig';
 *   const base = clamp01(FC.goal.safety.ctxWeight * dangerW + FC.goal.safety.drvWeight * drvSafety);
 */

// ─── Goal Ecology Domain Weights ───────────────────────────────────────────

export const GOAL_FORMULA = {
  safety: {
    ctxWeight: 0.80,      // dangerW contribution to base
    drvWeight: 0.20,      // drv:safetyNeed contribution to base
    baseWeight: 0.55,     // base contribution to final v
    lifeWeight: 0.45,     // lifeSafety contribution to final v
  },
  control: {
    ctxWeight: 0.60,
    drvWeight: 0.40,
    baseWeight: 0.55,
    lifeWeight: 0.45,
  },
  affiliation: {
    drvWeight: 0.55,
    antiDangerWeight: 0.45,
    baseWeight: 0.55,
    lifeWeight: 0.45,
  },
  status: {
    socialWeight: 0.55,   // clamp01(publicW + normW)
    drvWeight: 0.45,
    baseWeight: 0.55,
    lifeWeight: 0.45,
  },
  exploration: {
    uncertaintyWeight: 0.35,
    drvWeight: 0.65,
    baseWeight: 0.55,
    lifeWeight: 0.45,
  },
  order: {
    ctxWeight: 0.60,
    lifeWeight: 0.40,
  },
  rest: {
    fatigueWeight: 0.60,
    drvWeight: 0.40,
  },
  wealth: {
    scarcityWeight: 0.65,
    statusDriveWeight: 0.35,
    baseWeight: 0.70,
    lifeWeight: 0.30,
  },
  energyBlend: {
    ecologyWeight: 0.60,
    energyWeight: 0.40,
  },
  hysteresis: {
    alphaBase: 0.65,
    lockInBoost: 0.25,
    shockThreshold: 0.3,
    shockAlphaScale: 0.5,
    shockAlphaMin: 0.3,
  },
  modeBias: {
    boostBase: 0.7,
    boostScale: 0.6,
  },
} as const;

// ─── Mode Gating (MoE) ───────────────────────────────────────────────────

export const MODE_FORMULA = {
  signals: {
    threat: { dangerW: 1.0 },
    social: { publicW: 0.5, normW: 0.5 },
    curiosity: { uncW: 0.6, antiDanger: 0.4 },
  },
  projection: {
    safety:      { threat_mode: 1.00, resource_mode: 0.25 },
    control:     { threat_mode: 0.35, resource_mode: 0.25, social_mode: 0.15 },
    affiliation: { social_mode: 0.25, care_mode: 0.85 },
  },
  logits: {
    threat: { threat: 1.25, uncertainty: 0.35, norm: 0.15, curiosityPenalty: 0.35 },
    social: { norm: 0.95, status: 0.85, attachment: 0.25, threatPenalty: 0.25 },
    explore: { curiosity: 1.15, uncertainty: 0.45, threatPenalty: 0.85, normPenalty: 0.25 },
    resource: { resource: 1.2, threat: 0.25, uncertainty: 0.15, curiosityPenalty: 0.25 },
    care: { attachment: 1.25, threatPenalty: 0.35, normPenalty: 0.15, careSignal: 0.4 },
  },
  temperature: 0.8,
} as const;

// ─── Action Priors ────────────────────────────────────────────────────────

export const PRIORS_FORMULA = {
  escape: {
    base: 0.20,
    dangerW: 0.55, threatW: 0.20, timeW: 0.15,
    protocolPenalty: 0.25,
    gSafety: 0.18, gControl: 0.10, gAffPenalty: 0.10,
  },
  hide: {
    base: 0.15,
    dangerW: 0.45, survW: 0.25, pubW: 0.10,
    gSafety: 0.16, gOrder: 0.06, gStatusPenalty: 0.06,
  },
  wait: {
    base: 0.30,
    safeW: 0.25, relaxW: 0.15, threatPenalty: 0.20,
    gOrder: 0.10, gExplorePenalty: 0.08,
  },
  help: {
    trust: 0.50, closeness: 0.18, obligation: 0.18,
    tomTrust: 0.10, tomIntimacy: 0.18, tomThreatPenalty: 0.30,
    dangerDampen: 0.45,
    gAff: 0.25, gOrder: 0.10, gSafetyThreatPenalty: 0.20,
  },
  harm: {
    hostility: 0.70, tomThreat: 0.25, trustPenalty: 0.20,
    socialRiskDampen: 0.60,
    gOrderPenalty: 0.35, gAffPenalty: 0.25, gSafetyPenalty: 0.20,
  },
  askInfo: {
    base: 0.35,
    distrust: 0.25, distance: 0.25, respect: 0.15,
    dangerDampen: 0.25,
    gExplore: 0.20, gControl: 0.15, gSafety: 0.10,
  },
  socialRisk: { pub: 0.45, surv: 0.35, norm: 0.20 },
  confront: { tomThreat: 0.55, hostility: 0.25, recentHarm: 0.35, danger: 0.05 },
} as const;

// ─── Competitive Inhibition ───────────────────────────────────────────────

export const INHIBITION = {
  gamma: 0.25,
} as const;

// ─── Lookahead / POMDP-lite ──────────────────────────────────────────────

export const LOOKAHEAD = {
  value: {
    safety: 0.33, resource: 0.20, progress: 0.22,
    stealth: 0.12, wellbeing: 0.13,
  },
  resourceMix: { access: 0.6, antiScarcity: 0.4 },
  wellbeingMix: { fatigue: 0.55, stress: 0.45 },
  stealthMix: { cover: 0.6, antiVis: 0.4 },
  gamma: 0.9,
  riskAversion: 1.0,
  passiveDrift: {
    socialTrust: -0.002,
  },
} as const;

export const GOAL_STATE = {
  lock: {
    upBase: 0.22,
    upActivation: 0.18,
    downInactive: 0.15,
    inertia: 0.85,
  },
  fatigue: {
    upBase: 0.12,
    upActivation: 0.10,
    downActive: 0.02,
    downInactive: 0.04,
    inertia: 0.92,
  },
} as const;

export const DECISION = {
  utilityMix: {
    raw: 0.55,
    goal: 0.30,
    energy: 0.15,
  },
} as const;

// ─── Shorthand ────────────────────────────────────────────────────────────

export const FC = {
  goal: GOAL_FORMULA,
  mode: MODE_FORMULA,
  priors: PRIORS_FORMULA,
  inhibition: INHIBITION,
  lookahead: LOOKAHEAD,
  goalState: GOAL_STATE,
  decision: DECISION,
} as const;

export type FormulaConfig = typeof FC;
