/**
 * lib/config/formulaConfig.ts
 *
 * Named coefficients registry. Single source of truth for all tunable parameters
 * across GoalLab, decision layer, action priors, POMDP lookahead.
 *
 * USAGE:
 *   import { FC } from '../config/formulaConfig';
 */

// ─── Drivers (S6 deriveDrivers) ───────────────────────────────────────────

export const DRIVERS_FORMULA = {
  safetyNeed: {
    threatW: 0.60,
    fearW: 0.40,
  },
  controlNeed: {
    antiControlW: 0.70,
    uncertaintyW: 0.30,
  },
  statusNeed: {
    shameW: 0.50,
    publicnessW: 0.25,
    normW: 0.25,
  },
  affiliationNeed: {
    careW: 0.70,
    antiThreatW: 0.30,
  },
  resolveNeed: {
    angerW: 0.50,
    threatW: 0.50,
  },
  /** Surprise feedback: how much belief:surprise:* atoms amplify needs. */
  surpriseFeedback: {
    /** Maximum total surprise boost across all features. */
    maxBoost: 0.25,
    /** Per-feature routing: which surprise amplifies which need. */
    routing: {
      threat: { safetyNeed: 0.6, controlNeed: 0.3 },
      socialTrust: { affiliationNeed: 0.5, statusNeed: 0.2 },
      emotionValence: { affiliationNeed: 0.3 },
      resourceAccess: { controlNeed: 0.2 },
      scarcity: { controlNeed: 0.3 },
      fatigue: { safetyNeed: 0.1 },
      stress: { safetyNeed: 0.2, controlNeed: 0.2 },
    } as Record<string, Record<string, number>>,
  },
} as const;

// ─── Goal Ecology Domain Weights ───────────────────────────────────────────

export const GOAL_FORMULA = {
  safety: {
    ctxWeight: 0.80,
    drvWeight: 0.20,
    baseWeight: 0.55,
    lifeWeight: 0.45,
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
    socialWeight: 0.55,
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
  /** Anti-fatigue multiplier: score *= 1 - antiFatiguePenalty * fatigue */
  antiFatiguePenalty: 0.35,
  /** feltField composition (from ctx signals before mode gating) */
  feltField: {
    attachment_antiDanger: 0.7,
    attachment_antiUncertainty: 0.3,
    status_public: 0.5,
    status_norm: 0.5,
    curiosity_unc: 0.6,
    curiosity_antiDanger: 0.4,
  },
  /** amplifyByPrio: k = kBase + kScale * prio */
  amplifyByPrio: {
    kBase: 0.6,
    kScale: 0.8,
  },
} as const;

// ─── Domain ↔ Mode Projection Matrix ──────────────────────────────────────
// domainBias(d) = Σ_m projection[d][m] * W[m]

export const DOMAIN_MODE_PROJECTION: Record<string, Record<string, number>> = {
  safety:      { threat_mode: 1.00, resource_mode: 0.25 },
  control:     { threat_mode: 0.35, resource_mode: 0.25, social_mode: 0.15 },
  affiliation: { social_mode: 0.25, care_mode: 0.85 },
  status:      { social_mode: 0.95 },
  exploration: { explore_mode: 1.00 },
  order:       { social_mode: 0.25, resource_mode: 0.25, threat_mode: 0.20 },
  rest:        { resource_mode: 0.85 },
  wealth:      { resource_mode: 0.55, social_mode: 0.15 },
};

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
    threat:   { threat: 1.25, uncertainty: 0.35, norm: 0.15, curiosityPenalty: 0.35 },
    social:   { norm: 0.95, status: 0.85, attachment: 0.25, threatPenalty: 0.25 },
    explore:  { curiosity: 1.15, uncertainty: 0.45, threatPenalty: 0.85, normPenalty: 0.25 },
    resource: { resource: 1.2, threat: 0.25, uncertainty: 0.15, curiosityPenalty: 0.25 },
    care:     { attachment: 1.25, threatPenalty: 0.35, normPenalty: 0.15, careSignal: 0.4 },
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
  avoid: {
    base: 0.10,
    tomThreat: 0.55, hostility: 0.25, recentHarm: 0.35, danger: 0.05,
    trustPenalty: 0.30, tomIntimacyPenalty: 0.45,
    closenessPenalty: 0.15, obligationPenalty: 0.25,
    socialRiskPenalty: 0.10,
    gSafety: 0.20, gAffPenalty: 0.12,
  },
  confront: {
    base: 0.20,
    hostility: 0.50, antiSocialRisk: 0.25, respect: 0.15,
    dangerPenalty: 0.35,
    gControl: 0.18, gStatus: 0.12, gSafetyPenalty: 0.15, gOrderPenalty: 0.10,
  },
  socialRisk: { pub: 0.45, surv: 0.35, norm: 0.20 },
} as const;

// ─── Competitive Inhibition ───────────────────────────────────────────────

export const INHIBITION = {
  gamma: 0.25,
  /** Domain-specific gamma overrides (winner suppresses loser) */
  domainGamma: {
    safety: 0.5,
    exploration: 0.5,
    status: 0.1,
    rest: 0.1,
  } as Record<string, number>,
} as const;

// ─── Decision Layer (score.ts) ────────────────────────────────────────────

export const DECISION = {
  utilityMix: {
    raw: 0.55,
    goal: 0.30,
    energy: 0.15,
  },
  planBoostWeight: 0.65,
  energyBonusScale: 0.25,

  /** Context key modifiers: action-type × context → multiplier */
  contextMod: {
    wait:    { dangerPenalty: 0.55, uncPenalty: 0.35 },
    rest:    { dangerPenalty: 0.65 },
    work:    { dangerPenalty: 0.65, uncPenalty: 0.25 },
    observe: { uncBonus: 0.55, dangerBonus: 0.25 },
    move:    { dangerBonus: 0.45 },
    social:  { uncInfoBonus: 0.55, uncTalkBonus: 0.25, survPenalty: 0.55, crowdPenalty: 0.35, privacyPenalty: 0.45 },
    bounds:  { min: 0.55, max: 1.65 },
  },

  /** Trait modulation weights by action family */
  traits: {
    defensive:  { safety: 0.25, paranoia: 0.22, powerDrivePenalty: 0.18 },
    social:     { care: 0.22, paranoiaPenalty: 0.22, safetyPenalty: 0.12, autonomy: 0.10 },
    epistemic:  { truthNeed: 0.28, autonomy: 0.12, paranoiaPenalty: 0.12 },
    help:       { care: 0.35, safetyPenalty: 0.10, paranoiaPenalty: 0.10 },
    aggressive: { powerDrive: 0.30, autonomy: 0.10, orderPenalty: 0.25, normSensPenalty: 0.20, carePenalty: 0.15 },
    passive:    { order: 0.18, safety: 0.12, autonomyPenalty: 0.10 },
  },

  /** Emotion-based preference weights */
  emotionPref: {
    escape:  { fear: 0.25, threat: 0.10 },
    hide:    { fear: 0.20 },
    talk:    { shame: 0.10, fearPenalty: 0.10, hazardPenalty: 0.20, recentHarmPenalty: 0.30, recentHelpBonus: 0.18 },
    attack:  { anger: 0.20, resolve: 0.10, shamePenalty: 0.25, enemyHazardPenalty: 0.25, hazardPenalty: 0.10, recentHarmBonus: 0.22, recentHelpPenalty: 0.12 },
    help:    { care: 0.20, fearPenalty: 0.10, allyHazardPenalty: 0.35, hazardPenalty: 0.15, recentHarmPenalty: 0.25, recentHelpBonus: 0.20 },
    monologue: { uncertainty: 0.15, shame: 0.05, threatPenalty: 0.10 },
    protocol: { talkBonus: 0.15, attackPenalty: 0.40 },
  },

  /** Energy domain mapping: domain → channel weights for energyDelta */
  energyMap: {
    safety:      { threat: 0.60, uncertainty: 0.30 },
    affiliation: { attachment: 0.55, threatPenalty: 0.15 },
    status:      { status: 0.45, normPenalty: 0.10 },
    exploration: { curiosity: 0.55, threatPenalty: 0.25, uncertaintyPenalty: 0.15 },
    control:     { antiUncertainty: 0.35, norm: 0.20 },
    rest:        { antiResource: 0.65, threatPenalty: 0.10 },
  },
} as const;

// ─── Action Scoring (scoreAction.ts) ──────────────────────────────────────

export const ACTION_SCORING = {
  /** Risk penalty coefficient for confidence < 1. */
  riskCoeff: 0.4,
} as const;

// ─── Target-Specific ToM Modulation (actionCandidateUtils.ts) ─────────────

export const TOM_MODULATION = {
  aggressive: {
    trustPenalty: 0.4,
    intimacyPenalty: 0.3,
    threatBonus: 0.5,
    physThreatSafetyPenalty: 0.6,
    socialStandingStatusPenalty: 0.3,
  },
  cooperative: {
    trustBonus: 0.4,
    alignmentBonus: 0.2,
    threatPenalty: 0.3,
    supportBonus: 0.2,
  },
  avoidant: {
    threatBonus: 0.5,
    physThreatBonus: 0.3,
    trustPenalty: 0.3,
    intimacyPenalty: 0.2,
  },
  contextual: {
    /** danger-based delta scaling for safety/survival goals. */
    dangerBaseScale: 0.6,
    dangerSlopeScale: 0.8,
    /** Affiliation/status dampening above danger threshold. */
    affStatusDampenThreshold: 0.5,
    affStatusDampenBase: 1.3,
    affStatusDampenSlope: 0.6,
    /** Fatigue penalty on positive deltas. */
    fatigueThreshold: 0.4,
    fatigueBase: 1.1,
    fatigueSlope: 0.3,
  },
} as const;

// ─── Goal State Dynamics ──────────────────────────────────────────────────

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
  tension: {
    upBase: 0.10,
    upAntiActivation: 0.25,
    downActive: 0.02,
    downInactive: 0.08,
    inertia: 0.85,
  },
  progress: {
    inertia: 0.97,
    completionThreshold: 0.99,
    completionTensionScale: 0.25,
    completionLockInScale: 0.80,
    completionFatigueScale: 0.75,
  },
  activationEMA: {
    /** Duplicated from hysteresis for goalState internal use */
    alphaBase: 0.65,
    lockInBoost: 0.25,
  },
} as const;

// ─── Lookahead / POMDP-lite ──────────────────────────────────────────────

export const LOOKAHEAD = {
  value: {
    safety: 0.33, resource: 0.20, progress: 0.22,
    stealth: 0.12, wellbeing: 0.13,
  },
  resourceMix:  { access: 0.6, antiScarcity: 0.4 },
  wellbeingMix: { fatigue: 0.55, stress: 0.45 },
  stealthMix:   { cover: 0.6, antiVis: 0.4 },
  gamma: 0.9,
  riskAversion: 1.0,
  riskUncertaintyScale: 0.3,
  passiveDrift: {
    fatigueBase: 0.01, fatigueThreat: 0.02,
    stressBase: 0.01, stressScarcity: 0.02, stressThreat: 0.01,
    socialTrust: -0.002,
    emotionValenceStress: -0.01, emotionValenceThreat: -0.005,
  },
  observation: {
    socialNoiseScale: 0.3,
  },
  noise: {
    scale: 0.02,
  },
} as const;

// ─── Shorthand ────────────────────────────────────────────────────────────

export const FC = {
  drivers: DRIVERS_FORMULA,
  goal: GOAL_FORMULA,
  domainModeProjection: DOMAIN_MODE_PROJECTION,
  mode: MODE_FORMULA,
  priors: PRIORS_FORMULA,
  inhibition: INHIBITION,
  decision: DECISION,
  actionScoring: ACTION_SCORING,
  tomMod: TOM_MODULATION,
  goalState: GOAL_STATE,
  lookahead: LOOKAHEAD,
} as const;

export type FormulaConfig = typeof FC;
