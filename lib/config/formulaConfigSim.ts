/**
 * lib/config/formulaConfigSim.ts
 *
 * Simulator-specific formula coefficients.
 * Extends the core GoalLab FC with sections for dual-process gate,
 * relation dynamics, norms, perception, physics, group, beats.
 *
 * USAGE: import { FCS } from '../config/formulaConfigSim';
 */

export const DUAL_PROCESS = {
  reactiveThreshold: 0.75,
  degradedThreshold: 0.45,
  fatigueHabitualThreshold: 0.70,
  surpriseWeight: 0.50,
  degradedModifiers: {
    temperatureMultiplier: 2.5,
    topK: 3,
    tomEnabled: false,
    lookaheadEnabled: false,
  },
  reactiveShortcut: {
    fearThreshold: 0.65,
    angerThreshold: 0.60,
    shameThreshold: 0.55,
    careThreshold: 0.60,
    inertiaBonus: 0.15,
  },
} as const;

export const RELATION_DYNAMICS = {
  expectationViolation: { trustBoost: 0.8, sensitivityWeight: 0.3, salienceWeight: 0.2 },
  indirectEvidence: { alignmentWeight: 0.6, confidenceDiscount: 0.7 },
  passiveProximity: { coopBonus: 0.01, familiarityBonus: 0.005, separationDecay: 0.003 },
  decayToNeutral: 0.002,
} as const;

export const NORM_FORMULA = {
  severity: { taboo: 1.0, hard: 0.5, soft: 0.15 },
  oathPenalty: { unbreakable: Infinity, strong: 0.9, moderate: 0.4 },
  violationConsequences: { shameSpike: 0.35, trustCascadeRadius: 0.25, selfTrustDrop: 0.2 },
} as const;

export const INFO_CHANNELS = {
  vision: { sameLocationConfidence: 0.9, bodyLanguageThreshold: 0.6, hideReduction: 0.6 },
  hearing: { whisperRange: 2, normalRange: 'location' as const, shoutRange: 'adjacent' as const },
  speech: { trustGated: true, contradictionPenalty: 0.3 },
  nonverbal: {
    stressVisibleThreshold: 0.6, angerVisibleThreshold: 0.5,
    fearVisibleThreshold: 0.55, selfControlSuppression: 0.4, distanceDecay: 0.1,
  },
} as const;

export const PHYSICAL = {
  injury: { bleedRateDefault: 0.02, healRateDefault: 0.01, treatStabilizes: true, painFromSeverity: 0.8 },
  energy: { restRecovery: 0.03, idleRecovery: 0.01, activeDrain: 0.02, stressedActiveDrain: 0.04 },
  sleepDebt: { growthPerTick: 0.01, sleepResetTicks: 10, hallucinationThreshold: 0.8, perceptualNoiseScale: 0.3 },
} as const;

export const GROUP = {
  coalitionDetection: { trustThreshold: 0.6, minSize: 2, cooperationWindow: 3 },
  conformityPressure: { baseWeight: 0.04, normSensitivityScale: 1.5, autonomyDampen: 0.8 },
  leadershipScore: { trustWeight: 0.3, respectWeight: 0.3, initiativeWeight: 0.25, antiFearWeight: 0.15 },
  leaderLossPenalty: { stressSpike: 0.25, controlDrop: 0.3 },
} as const;

export const BEATS = {
  modeSwitchSignificant: true,
  trustDeltaThreshold: 0.15,
  goalActivationChange: true,
  conflictDetected: true,
  convergenceMinAgents: 3,
  surpriseThreshold: 0.4,
  tensionWeights: { meanStress: 0.3, maxDanger: 0.3, goalConflict: 0.25, trustVolatility: 0.15 },
} as const;

export const BEHAVIOR_VARIETY = {
  historyWindow: 10,
  noveltyWindow: 5,
  noveltyBonus: 0.03,
  repetitionPenalties: {
    streak2: 0.12,
    streak3: 0.30,
    streak4: 0.55,
    streak5Plus: 0.85,
  },
} as const;

export const FCS = {
  dualProcess: DUAL_PROCESS,
  relationDynamics: RELATION_DYNAMICS,
  normFormula: NORM_FORMULA,
  infoChannels: INFO_CHANNELS,
  physical: PHYSICAL,
  group: GROUP,
  beats: BEATS,
  behaviorVariety: BEHAVIOR_VARIETY,
} as const;

export type FormulaConfigSim = typeof FCS;
