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
  restNeed: {
    fatigueW: 0.60,
    stressW: 0.40,
  },
  curiosityNeed: {
    uncertaintyW: 0.50,
    antiThreatW: 0.30,
    antiFearW: 0.20,
  },
  /**
   * Response curves: nonlinear mapping applied AFTER the linear weighted sum.
   *
   * Each need's raw value (linear sum, [0,1]) passes through a CurveSpec.
   * Default: linear (identity). Override per-agent via agent.driverCurves.
   */
  curves: {
    safetyNeed:      { type: 'linear' },
    controlNeed:     { type: 'linear' },
    statusNeed:      { type: 'linear' },
    affiliationNeed: { type: 'linear' },
    resolveNeed:     { type: 'linear' },
    restNeed:        { type: 'linear' },
    curiosityNeed:   { type: 'linear' },
  } as Record<string, import('../utils/curves').CurveSpec>,
  /**
   * Lateral inhibition between needs after curve shaping.
   * Example: high safetyNeed suppresses exploration/status.
   */
  inhibition: {
    threshold: 0.3,
    maxSuppression: 0.60,
    matrix: {
      safetyNeed:      { curiosityNeed: 0.35, statusNeed: 0.20, affiliationNeed: 0.10 },
      controlNeed:     { curiosityNeed: 0.25 },
      resolveNeed:     { affiliationNeed: 0.30, statusNeed: 0.15 },
      affiliationNeed: { resolveNeed: 0.25 },
      statusNeed:      { safetyNeed: 0.10 },
      // Tired agents should reduce confrontational and novelty-seeking behavior.
      restNeed:        { resolveNeed: 0.20, curiosityNeed: 0.30 },
    } as Record<string, Record<string, number>>,
  },
  /**
   * Temporal accumulation (EMA) over driver pressure across ticks.
   * pressure[t] = alpha*pressure[t-1] + (1-alpha)*instant
   * final = blend*pressure + (1-blend)*instant
   */
  accumulation: {
    alpha: {
      safetyNeed: 0.55,
      controlNeed: 0.50,
      statusNeed: 0.60,
      affiliationNeed: 0.65,
      resolveNeed: 0.45,
      restNeed: 0.70,
      curiosityNeed: 0.35,
    } as Record<string, number>,
    blend: 0.35,
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
      fatigue: { safetyNeed: 0.1, restNeed: 0.4 },
      stress: { safetyNeed: 0.2, controlNeed: 0.2, restNeed: 0.3 },
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
  /**
   * Resolve modulation: adjust S7 domain scores when resolveNeed is high.
   * safety is multiplicatively dampened, control is additively boosted.
   */
  resolveModulation: {
    safetyDampen: 0.25,
    controlBoost: 0.12,
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
  /** Saturation penalty: score *= 1 - saturationPenalty * saturation */
  saturationPenalty: 0.45,
  /**
   * Surprise mode override: if surprise on a feature exceeds threshold,
   * force mode switch for 1 tick (startle response).
   */
  surpriseModeOverride: {
    threshold: 0.45,
    overrideMix: 0.75,
    featureToMode: {
      threat: 'threat_mode',
      socialTrust: 'social_mode',
      emotionValence: 'care_mode',
      resourceAccess: 'resource_mode',
      scarcity: 'resource_mode',
    } as Record<string, string>,
  },
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

// ─── Intent / Action Schema bridge (S7.5 → S8) ───────────────────────────
// Additive scoring between canonical GoalSpecV1 pressures and executable actions.
export const INTENT_SCHEMA_FORMULA = {
  intent: {
    goalPressureWeight: 0.5,
  },
  schema: {
    intentScoreWeight: 0.4,
  },
  grounding: {
    schemaScoreWeight: 0.7,
    offerScoreWeight: 0.3,
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


// ─── Personality-Driven Action Priors ─────────────────────────────────────
// Maps character traits to base action tendency offsets.
// prior(act) = basePrior + Σ (traitValue * weight)
// Applied in deriveActionPriors for social actions beyond the core 5.

export const PERSONALITY_ACTION_MAP: Record<string, {
  base: number;
  traits: Record<string, number>;
}> = {
  // ── Prosocial ──
  comfort: { base: 0.25, traits: { care: 0.35, sensitivity: 0.15, normSensitivity: 0.10 } },
  praise: { base: 0.20, traits: { care: 0.25, normSensitivity: 0.20 } },
  apologize: { base: 0.15, traits: { normSensitivity: 0.30, sensitivity: 0.15, care: 0.10 } },
  share_resource: { base: 0.20, traits: { care: 0.30, normSensitivity: 0.10 } },
  treat: { base: 0.15, traits: { care: 0.40, sensitivity: 0.10 } },
  guard: { base: 0.20, traits: { safety: 0.25, care: 0.20, powerDrive: 0.10 } },
  escort: { base: 0.20, traits: { care: 0.25, safety: 0.15 } },
  // ── Assertive ──
  command: { base: 0.15, traits: { powerDrive: 0.40, normSensitivity: -0.15 } },
  threaten: { base: 0.10, traits: { powerDrive: 0.30, hpaReactivity: 0.15, care: -0.20 } },
  accuse: { base: 0.10, traits: { powerDrive: 0.20, normSensitivity: 0.20, care: -0.15 } },
  // ── Investigative ──
  investigate: { base: 0.25, traits: { ambiguityTolerance: -0.15, experience: 0.15 } },
  observe_target: { base: 0.20, traits: { paranoia: 0.20, sensitivity: 0.10 } },
  verify: { base: 0.20, traits: { paranoia: 0.15, ambiguityTolerance: -0.20 } },
  // ── Communicative ──
  talk: { base: 0.35, traits: { care: 0.10, sensitivity: 0.10, normSensitivity: 0.05 } },
  negotiate: { base: 0.25, traits: { powerDrive: 0.10, normSensitivity: 0.15, experience: 0.10 } },
  signal: { base: 0.20, traits: { experience: 0.15, safety: 0.10 } },
  call_backup: { base: 0.15, traits: { safety: 0.25, hpaReactivity: 0.15 } },
  // ── Trade ──
  propose_trade: { base: 0.20, traits: { normSensitivity: 0.10, experience: 0.15 } },
} as const;

// ─── Possibility Weights (defs.ts magic numbers) ────────────────────────
// Each possibility builder reads weights from here instead of hardcoding.
// Format: { <key>: { <inputName>: weight, ... } }

export const POSSIBILITY_WEIGHTS = {
  hide: { cover: 0.70, antiVis: 0.30, priorBlend: 0.55 },
  escape: { exits: 0.50, esc: 0.50, priorBlend: 0.55 },
  wait: { antiPressure: 0.45, pressureScale: 0.35, priorBlend: 0.65 },
  rest: { fatigue: 0.80, antiThreat: 0.20, threshold: 0.12 },
  observe_area: { base: 0.15, uncScale: 0.75, threshold: 0.12 },
  self_talk: { uncertainty: 0.75, privacy: 0.25, threshold: 0.15 },
  attack: { threat: 0.65, near: 0.20, host: 0.15, threatThreshold: 0.25 },
  talk: { prior: 0.55, trust: 0.45 },
  ask_info: { prior: 1.0 },
  verify: { prior: 1.0 },
  comfort: { prior: 0.60, closeness: 0.40 },
  help: { prior: 0.70, obligation: 0.30 },
  share_resource: { prior: 0.55, trust: 0.45, scarcityDampen: 0.60 },
  negotiate: { prior: 0.65, respect: 0.20, formal: 0.15 },
  propose_trade: { prior: 0.55, trust: 0.45, scarcityBoost: 0.60 },
  apologize: { prior: 0.55, hostility: 0.45 },
  praise: { prior: 0.65, respect: 0.35 },
  accuse: { prior: 0.50, threat: 0.30, evidence: 0.20 },
  threaten: { prior: 0.65, hostility: 0.35 },
  confront: { prior: 0.30, hostility: 0.35, threat: 0.35 },
  avoid: { prior: 1.0 },
  command: { prior: 0.50, authority: 0.30, respect: 0.20 },
  call_backup: { prior: 0.55, threat: 0.45 },
  signal: { prior: 1.0 },
  guard: { prior: 0.45, closeness: 0.35, threat: 0.20 },
  escort: { prior: 0.50, trust: 0.25, danger: 0.25 },
  treat: { prior: 0.55, wounded: 0.45, suppliesScale: 0.50 },
  investigate: { prior: 0.55, uncertainty: 0.45 },
  observe_target: { prior: 0.60, visibility: 0.40 },
  deceive: { prior: 0.50, trust: 0.50 },
  submit: { prior: 0.40, respect: 0.30, threat: 0.20, hostility: 0.10 },
  loot: { scarcity: 0.60, survDampen: 0.50, threshold: 0.10 },
  betray: { prior: 0.35, hostility: 0.35, trust: 0.30, threshold: 0.15 },
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

  /** Repetition penalty: discourages repeating the same action kind consecutively. */
  repetition: {
    /** Penalty applied to Q when action kind matches previous tick. */
    sameKindPenalty: 0.25,
    /** Additional penalty when both kind AND target match. */
    sameTargetPenalty: 0.15,
    /** Decay factor per tick gap (0 = no decay, 1 = full decay after 1 tick). */
    decayPerTick: 0.3,
  },

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
  /** Used in action scorer as a smooth penalty term; keep in config for auditability. */
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
  saturation: {
    /** Base growth per active tick. */
    upBase: 0.04,
    /** Additional growth proportional to current activation. */
    upActivation: 0.06,
    /** Small decay while still active to avoid runaway. */
    downActive: 0.01,
    /** Fast recovery when the goal leaves the active set. */
    downInactive: 0.15,
    /** Persistence of saturation memory. */
    inertia: 0.95,
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
  intentSchema: INTENT_SCHEMA_FORMULA,
  domainModeProjection: DOMAIN_MODE_PROJECTION,
  mode: MODE_FORMULA,
  priors: PRIORS_FORMULA,
  personalityActionMap: PERSONALITY_ACTION_MAP,
  possibilityWeights: POSSIBILITY_WEIGHTS,
  inhibition: INHIBITION,
  decision: DECISION,
  actionScoring: ACTION_SCORING,
  tomMod: TOM_MODULATION,
  goalState: GOAL_STATE,
  lookahead: LOOKAHEAD,
} as const;

export type FormulaConfig = typeof FC;
