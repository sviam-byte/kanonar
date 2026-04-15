// lib/dilemma/types.ts
//
// Core types for DilemmaLab.
// v1 types are preserved for backward compatibility; v2 types are appended below.

import type { WorldState, V42Metrics, TomBeliefTraits, Relationship } from '../../types';

// ═══════════════════════════════════════════════════════════════
// v1 types (used by catalog/engine/analysis/bridge/legacy runner)
// ═══════════════════════════════════════════════════════════════

export type DilemmaAction = {
  id: string;
  label: string;
  description?: string;
};

export type PayoffMatrix = Record<string, Record<string, readonly [number, number]>>;

export type ActionScoringMap = {
  idPrefix: string;
  kind: 'aff' | 'con' | 'off' | 'exit' | 'cog';
};

export type DilemmaFraming = {
  setup: string;
  actionLabels: Record<string, string>;
  outcomeDescriptions: Record<string, Record<string, string>>;
};

export type DilemmaSpec = {
  id: string;
  name: string;
  actions: DilemmaAction[];
  payoffs: PayoffMatrix;
  nashEquilibria: readonly (readonly [string, string])[];
  paretoOptimal: readonly (readonly [string, string])[];
  cooperativeActionId: string;
  scoringMap: Record<string, ActionScoringMap>;
  framing: DilemmaFraming;
};

export type DilemmaRound = {
  index: number;
  choices: Record<string, string>;
  payoffs: Record<string, number>;
  traces: Record<string, RoundTrace>;
};

export type ActionDecomposition = {
  actionId: string;
  q: number;
  chosen: boolean;
  D: number; R: number; M: number; P: number; E: number;
};

export type RoundTrace = {
  ranked: ActionDecomposition[];
  dilemmaAtomIds: string[];
  trustAtDecision: number;
  qMargin: number;
  temperature: number;
  cooperativeDisposition: number;
  trustComposite: number;
  trustComponents: {
    relTrust: number; relBond: number; relConflict: number;
    tomTrust: number; tomReliability: number; soPerceivedTrust: number;
  };
  oppEma: number;
  oppTrend: number;
  myInertia: number;
  betrayalShock: number;
  evPerAction: Record<string, number>;
  effectiveShadow: number;
  relSnapshot: Record<string, number>;
  traitSnapshot: Record<string, number>;
};

export type DilemmaGameState = {
  specId: string;
  players: readonly [string, string];
  rounds: DilemmaRound[];
  currentRound: number;
  totalRounds: number;
  cumulativePayoffs: Record<string, number>;
};

export type StrategyMatchScores = {
  titForTat: number; alwaysCooperate: number; alwaysDefect: number;
  pavlov: number; grimTrigger: number;
};

export type DilemmaAnalysis = {
  nashAlignment: Record<string, number>;
  cooperationCurve: number[];
  totalPayoffs: Record<string, number>;
  strategyMatch: Record<string, StrategyMatchScores>;
  mutualCooperationRate: number;
  mutualDefectionRate: number;
};

// ═══════════════════════════════════════════════════════════════
// v2 types — layered decision simulator
// ═══════════════════════════════════════════════════════════════

export interface CompiledAgent {
  id: string;
  v42: V42Metrics;
  latents: Record<string, number>;
  axes: Record<string, number>;
  cognitive: {
    fallbackPolicy: string;
    planningHorizon: number;
    deceptionPropensity: number;
    shameGuiltSensitivity: number;
    wGoals: Record<string, number>;
  };
  state: {
    will: number;
    loyalty: number;
    darkExposure: number;
    driftState: number;
    burnoutRisk: number;
    backlogLoad: number;
    overloadSensitivity: number;
  };
  acute: {
    stress: number;
    fatigue: number;
    moralInjury: number;
    pain: number;
    arousal: number;
  };
  weights: UtilityWeights;
  effectiveTemperature: number;
  roles: string[];
  roleRelations: { otherId: string; role: string }[];
  clearance: number;
  confidence: number;
  /**
   * Subjective scenario severity (0..1) computed from profile × scenario class.
   * Used to sharpen sampling temperature and emphasize dominant utility axes.
   */
  perceivedStakes: number;
}

export interface UtilityWeights {
  wG: number;
  wR: number;
  wI: number;
  wL: number;
  wS: number;
  wM: number;
  wX: number;
}

export interface CompiledDyad {
  fromId: string;
  toId: string;
  rel: Relationship;
  tom: Partial<TomBeliefTraits>;
  secondOrder: {
    perceivedTrust: number;
    perceivedAlign: number;
    perceivedDominance: number;
    mirrorIndex: number;
    shameDelta: number;
  };
  powerAsymmetry: number;
  sharedHistoryDensity: number;
  confidence: number;
}

export type DilemmaClass =
  | 'trust' | 'protection' | 'authority' | 'loyalty'
  | 'sacrifice' | 'opacity' | 'mutiny' | 'care' | 'bargain';

export type MechanicId =
  | 'trust_exchange'
  | 'authority_conflict'
  | 'judgment_sanction'
  | 'resource_split'
  | 'care_under_surveillance';

export interface ScenarioStakes {
  personal: number;
  relational: number;
  institutional: number;
  physical: number;
}

export interface ScenarioVisibility {
  actionsVisible: boolean;
  audiencePresent: boolean;
  consequencesDeferred: boolean;
}

export interface ActionTemplate {
  id: string;
  label: string;
  description: string;
  socialTags: string[];
  requires?: {
    roles?: string[];
    minClearance?: number;
    minTrait?: { axis: string; threshold: number };
    maxTrait?: { axis: string; threshold: number };
    hasFallback?: string[];
  };
  profile: {
    goalFit?: number;
    relationalFit?: number;
    identityFit?: number;
    legitimacyFit?: number;
    safetyFit?: number;
    mirrorFit?: number;
    expectedCost?: number;
  };
  payoffVs?: Record<string, number>;
}

export interface MechanicTemplate {
  id: MechanicId;
  name: string;
  description: string;
  defaultCooperativeActionId: string;
  actionPool: ActionTemplate[];
  defaultStakes: ScenarioStakes;
  defaultVisibility: ScenarioVisibility;
  defaultInstitutionalPressure: number;
}

export interface ActionPresetOverride {
  label?: string;
  description?: string;
  socialTags?: string[];
  requires?: ActionTemplate['requires'];
  profile?: Partial<ActionTemplate['profile']>;
  payoffVs?: Record<string, number>;
  disabled?: boolean;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  mechanicId: MechanicId;
  dilemmaClass: DilemmaClass;
  setup: string;
  cooperativeActionId?: string;
  institutionalPressure?: number;
  stakes?: Partial<ScenarioStakes>;
  visibility?: Partial<ScenarioVisibility>;
  actionOverrides?: Record<string, ActionPresetOverride>;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  mechanicId: MechanicId;
  mechanicName: string;
  mechanicDescription: string;
  dilemmaClass: DilemmaClass;
  setup: string;
  cooperativeActionId: string;
  actionPool: ActionTemplate[];
  stakes: ScenarioStakes;
  visibility: ScenarioVisibility;
  institutionalPressure: number;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ActionScore {
  actionId: string;
  U: number;
  G: number; R: number; I: number; L: number; S: number; M: number; X: number;
  probability: number;
  chosen: boolean;
}

export interface StateUpdate {
  agentId: string;
  againstActionId: string;
  outcomeTag: string;
  willDelta: number;
  burnoutDelta: number;
  stressDelta: number;
  fatigueDelta: number;
  shameDelta: number;
  tomObservation: {
    actionId: string;
    socialTags: string[];
    success: number;
  };
  trustDelta: number;
  bondDelta: number;
  conflictDelta: number;
  fearDelta: number;
}

export interface V2RoundTrace {
  compiled: {
    agent: CompiledAgent;
    dyad: CompiledDyad;
  };
  availableActions: string[];
  filteredOut: string[];
  scores: ActionScore[];
  chosenActionId: string;
  stateUpdate: StateUpdate;
  explanation: string;
}

export interface V2Round {
  index: number;
  choices: Record<string, string>;
  traces: Record<string, V2RoundTrace>;
}

export interface V2GameState {
  scenarioId: string;
  players: readonly [string, string];
  rounds: V2Round[];
  currentRound: number;
  totalRounds: number;
}

export interface V2RunConfig {
  scenarioId: string;
  players: readonly [string, string];
  totalRounds: number;
  world: WorldState;
  seed?: number;
  /** Optional override for scenario institutional pressure (0..1). */
  institutionalPressure?: number;
}

export interface V2RunResult {
  game: V2GameState;
  confidence: Record<string, number>;
  summaries: Record<string, string>;
}
