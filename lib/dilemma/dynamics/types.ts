import type { ActionImpact, ConflictLearningMemory, ConflictReward } from '../learningMemory';

export type ConflictPlayerId = string;

export type ConflictProtocolId = 'trust_exchange';

export type ConflictRole = 'participant';

export type ConflictPhase = 'simultaneous_choice' | 'resolution';

export type TrustExchangeActionId = 'trust' | 'withhold' | 'betray';

export type ConflictActionId = TrustExchangeActionId;

export type ConflictScalarKey =
  | 'goalPressure'
  | 'fear'
  | 'stress'
  | 'resentment'
  | 'loyalty'
  | 'dominanceNeed'
  | 'cooperationTendency'
  | 'will';

export type ConflictRelationKey =
  | 'trust'
  | 'bond'
  | 'perceivedThreat'
  | 'conflict'
  | 'perceivedLegitimacy'
  | 'volatility';

export type ConflictEnvironmentKey =
  | 'resourceScarcity'
  | 'externalPressure'
  | 'visibility'
  | 'institutionalPressure';

export interface ConflictAgentState {
  goalPressure: number;
  fear: number;
  stress: number;
  resentment: number;
  loyalty: number;
  dominanceNeed: number;
  cooperationTendency: number;
  will: number;
}

export interface ConflictRelationState {
  trust: number;
  bond: number;
  perceivedThreat: number;
  conflict: number;
  perceivedLegitimacy: number;
  volatility: number;
}

export interface ConflictEnvironmentState {
  resourceScarcity: number;
  externalPressure: number;
  visibility: number;
  institutionalPressure: number;
}

export interface ConflictHistoryEvent {
  tick: number;
  protocolId: ConflictProtocolId;
  actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>;
  outcomeTag: string;
  payoffs: Readonly<Record<ConflictPlayerId, number>>;
}

export interface StrategyProfile {
  playerId: ConflictPlayerId;
  probabilities: Readonly<Record<ConflictActionId, number>>;
}

export type ConflictRegime =
  | 'secure'
  | 'strained'
  | 'volatile'
  | 'hostile'
  | 'ruptured';

export interface ConflictRegimeState {
  regime: ConflictRegime;
  ticksInRegime: number;
  exitEligibleTicks: number;
}

export type DirectedMemoryMap = Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictLearningMemory>>>>;

export type DirectedRegimeMap = Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictRegimeState>>>>;

export interface ConflictUtilityTrace {
  baseU: number;
  learnedQ: number;
  expectedResponse: number;
  finalU: number;
  marginFromSecondBest: number;
}

export interface ConflictPredictionTrace {
  expectedOtherActionId: ConflictActionId;
  observedOtherActionId: ConflictActionId;
  predictedProbability: number;
  predictionError: number;
}

export interface ConflictTrajectoryFrame {
  tick: number;
  protocolId: ConflictProtocolId;
  phaseId: ConflictPhase;
  agentId: ConflictPlayerId;
  otherId: ConflictPlayerId;
  actionId: ConflictActionId;
  otherActionId: ConflictActionId;
  utility: ConflictUtilityTrace;
  prediction: ConflictPredictionTrace;
  relationBefore: ConflictRelationState;
  relationDelta: RelationDelta;
  relationAfter: ConflictRelationState;
  memoryBefore: ConflictLearningMemory;
  memoryAfter: ConflictLearningMemory;
  reward: ConflictReward;
  regimeBefore: ConflictRegimeState;
  regimeAfter: ConflictRegimeState;
  impact: ActionImpact;
}

export interface ConflictState {
  tick: number;
  players: readonly [ConflictPlayerId, ConflictPlayerId];
  agents: Readonly<Record<ConflictPlayerId, ConflictAgentState>>;
  relations: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictRelationState>>>>;
  memories?: DirectedMemoryMap;
  environment: ConflictEnvironmentState;
  history: readonly ConflictHistoryEvent[];
  regimes?: DirectedRegimeMap;
  strategyProfiles: Readonly<Record<ConflictPlayerId, StrategyProfile>>;
  trace?: readonly ConflictTrajectoryFrame[];
}

export type CanonicalConflictState = ConflictState & {
  memories: DirectedMemoryMap;
  regimes: DirectedRegimeMap;
  trace: readonly ConflictTrajectoryFrame[];
};

export interface ConflictProtocol {
  id: ConflictProtocolId;
  roles: Readonly<Record<ConflictPlayerId, ConflictRole>>;
  phases: readonly ConflictPhase[];
  actionOrder: readonly ConflictActionId[];
}

export interface ConflictObservation {
  playerId: ConflictPlayerId;
  otherId: ConflictPlayerId;
  protocolId: ConflictProtocolId;
  phase: ConflictPhase;
  role: ConflictRole;
  self: ConflictAgentState;
  relationToOther: ConflictRelationState;
  memoryToOther: ConflictLearningMemory;
  regimeToOther: ConflictRegimeState;
  environment: ConflictEnvironmentState;
  historyLength: number;
  availableActionIds: readonly ConflictActionId[];
}

export interface ConflictAction {
  playerId: ConflictPlayerId;
  actionId: ConflictActionId;
}

export interface ActionUtilityBreakdown {
  actionId: ConflictActionId;
  U: number;
  baseU?: number;
  learnedQ?: number;
  expectedResponse?: number;
  volatilityPenalty?: number;
  betrayalDebtPenalty?: number;
  G: number;
  R: number;
  S: number;
  L: number;
  I: number;
  P: number;
  C: number;
}

export type AgentDelta = Partial<Record<ConflictScalarKey, number>>;

export type RelationDelta = Partial<Record<ConflictRelationKey, number>>;

export type EnvironmentDelta = Partial<Record<ConflictEnvironmentKey, number>>;

export interface ConflictOutcome {
  protocolId: ConflictProtocolId;
  outcomeTag: string;
  actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>;
  payoffs: Readonly<Record<ConflictPlayerId, number>>;
  agentDeltas: Readonly<Record<ConflictPlayerId, AgentDelta>>;
  relationDeltas: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, RelationDelta>>>>;
  environmentDelta: EnvironmentDelta;
  eventTags: readonly string[];
}

export interface ConflictStepResult {
  state: ConflictState;
  observations: Readonly<Record<ConflictPlayerId, ConflictObservation>>;
  utilities: Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>;
  strategyProfiles: Readonly<Record<ConflictPlayerId, StrategyProfile>>;
  actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>;
  outcome: ConflictOutcome;
  intervention?: ConflictInterventionTrace;
}

export type ForcedActionStrategyMode = 'freeze' | 'learn_from_utility';

export interface ConflictStepOptions {
  forcedJointActions?: readonly ConflictAction[];
  forcedActionStrategyMode?: ForcedActionStrategyMode;
}

export interface ConflictInterventionTrace {
  forced: true;
  strategyMode: ForcedActionStrategyMode;
  note: string;
}

export interface TrajectoryMetrics {
  distanceFromStart: number;
  collapseScore: number;
  repairCapacity: number;
  cyclePeriod?: number;
  divergenceRate?: number;
}

export type ConflictCoreRuntime = 'canonical_dynamics' | 'unsupported_kernel';

export interface ConflictCoreActionLabels {
  trust: string;
  withhold: string;
  betray: string;
}

export interface ConflictCoreRunSupportedReport {
  runtime: 'canonical_dynamics';
  protocolId: ConflictProtocolId;
  supportedMechanicId: 'trust_exchange';
  players: readonly [ConflictPlayerId, ConflictPlayerId];
  actionLabels: ConflictCoreActionLabels;
  initialState: CanonicalConflictState;
  finalState: CanonicalConflictState;
  steps: readonly ConflictStepResult[];
  frames: readonly ConflictTrajectoryFrame[];
  trajectory: readonly CanonicalConflictState[];
  metrics: TrajectoryMetrics;
}

export interface ConflictCoreRunUnsupportedReport {
  runtime: 'unsupported_kernel';
  mechanicId: string;
  protocolKernel?: string;
  reason: string;
}

export type ConflictCoreRunReport =
  | ConflictCoreRunSupportedReport
  | ConflictCoreRunUnsupportedReport;

export type ConflictValidationErrorCode =
  | 'invalid_player'
  | 'duplicate_player'
  | 'missing_player'
  | 'invalid_action'
  | 'invalid_protocol'
  | 'invalid_state';

export interface ConflictValidationError {
  code: ConflictValidationErrorCode;
  message: string;
}

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
