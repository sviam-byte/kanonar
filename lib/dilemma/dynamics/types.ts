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
  | 'perceivedLegitimacy';

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

export interface ConflictState {
  tick: number;
  players: readonly [ConflictPlayerId, ConflictPlayerId];
  agents: Readonly<Record<ConflictPlayerId, ConflictAgentState>>;
  relations: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictRelationState>>>>;
  environment: ConflictEnvironmentState;
  history: readonly ConflictHistoryEvent[];
  strategyProfiles: Readonly<Record<ConflictPlayerId, StrategyProfile>>;
}

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
}

export interface TrajectoryMetrics {
  distanceFromStart: number;
  collapseScore: number;
  repairCapacity: number;
  cyclePeriod?: number;
  divergenceRate?: number;
}

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

