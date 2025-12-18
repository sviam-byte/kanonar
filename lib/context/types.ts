
import type { AgentState, WorldState, AgentGoalState, AgentActionProfile, ActionStyleTag, GoalId, SocialActionId, CharacterGoalId } from '../../types';

export type { AgentState, WorldState, AgentGoalState, AgentActionProfile, ActionStyleTag, GoalId, SocialActionId, CharacterGoalId };

/**
 * 0) Метрики и базовые id
 */
export type MetricId =
  | 'group_safety'
  | 'route_known'
  | 'time_pressure'
  | 'cohesion'
  | 'legitimacy_leader'
  | 'authority_conflict'
  | 'guards_presence'
  | 'wounded_count'
  | 'resources_food'
  | 'exit_control'
  | 'morale'
  | string; // расширяемость

export type Metrics = Record<MetricId, number>; // предполагаем 0..1, но не заставляем

export type AgentId = string;
export type ActionId = string;
export type RoleId = string;
export type LocationId = string;
export type Tag = string;
export type LocationTagId = string;

export type ContextMode =
  | 'physical_survival'
  | 'strategic_decision'
  | 'intimate_dyad'
  | 'routine';

export type StageId = string;

export type MandateId = string;
export type CommitmentId = string;
export type NormId = string;
export type PropositionId = string;

export type TargetSpec =
  | { mode: 'none' }
  | { mode: 'self' }
  | { mode: 'agent' }
  | { mode: 'role' }
  | { mode: 'group' }
  | { mode: 'location' };

export type HardGate =
  | { kind: 'context'; allowed: ContextMode[] }
  | { kind: 'stage'; allowed?: StageId[]; forbidden?: StageId[] }
  | { kind: 'locationTags'; requires?: Tag[]; forbids?: Tag[] }
  | { kind: 'metric'; metric: MetricId; min?: number; max?: number }
  | { kind: 'mandate'; mandateId: MandateId }
  | { kind: 'commitmentAbsent'; commitmentKind: string; minConf?: number }
  | { kind: 'requiresFact'; prop: PropositionId; minConf?: number }
  | { kind: 'locationTagRequired'; tag: LocationTagId };

export interface MetricDelta {
  metric: MetricId;
  deltaMean: number;
  deltaVar?: number;
}

export interface SoftGate {
  kind: 'norm' | 'etiquette' | 'risk';
  normId: NormId;
  penalty: {
    metricDeltas?: MetricDelta[];
    addViolationSeverity?: number;
    reputationHit?: number;
  };
  violationLikelihood: (agent: AgentState, w: ContextWorldState) => number;
}

export type GatePredicate =
  | { kind: 'hasMandate'; mandateId: MandateId }
  | { kind: 'hasSharedFact'; prop: PropositionId; minConf?: number }
  | { kind: 'atLocationTag'; tag: Tag }
  | { kind: 'stageReached'; stageId: StageId }
  | { kind: 'metricAtLeast'; metric: MetricId; value: number };

export interface ActionIntent {
  actorId: AgentId;
  actionId: ActionId;
  target?:
    | { kind: 'agent'; id: AgentId }
    | { kind: 'role'; id: RoleId }
    | { kind: 'location'; id: LocationId }
    | { kind: 'group'; id: string }
    | { kind: 'none' };
  effort?: number; // 0..1
  tags?: Record<string, boolean>; // например { usurpation: true }
  args?: Record<string, any>;
  planId?: string | null;
  causeAtomId?: string | null;
}

export interface ActionDef {
  id: ActionId;
  label: string;

  target: TargetSpec;

  gatesHard: HardGate[];
  gatesSoft?: SoftGate[];

  effects: (w: ContextWorldState, intent: ActionIntent) => MetricDelta[];

  enables?: GatePredicate[];

  tags?: Tag[];

  // Style Layer
  styleTags?: ActionStyleTag[];
  domainTags?: Tag[];
  baseRisk?: number; // 0..1

  // Fact Generation
  satisfies?: {
    prop: string;
    scope: 'per_scenario' | 'per_agent' | 'global';
    value?: any;
  };

  /** Optional probabilistic outcomes: events triggered, atoms added, metric changes */
  outcomes?: { p: number; events?: EventAtom[]; atomsAdded?: ContextAtom[]; metricDeltas?: MetricDelta[] }[];
}

export interface GoalTerm {
  metric: MetricId;
  weight: number;
  utility: (x: number) => number;
}

export interface GoalDef {
  id: GoalId;
  label: string;
  terms: GoalTerm[];

  parentId?: GoalId;
  childrenIds?: GoalId[];
}

/**
 * 3) Контекст: атомы мира, знания и признание власти
 */

export type Scope = 'shared' | { kind: 'private'; ownerId: AgentId };

export interface AtomBase {
  id: string;
  scope: Scope;
  createdTick: number;
  confidence: number;       // 0..1
  decayPerTick?: number;    // 0..1, если задано — линейное затухание уверенности
  source: 'perception'|'told'|'inferred'|'system'|'action';
  expiresAt?: number;
}

export interface FactAtom extends AtomBase {
  kind: 'fact';
  prop: PropositionId;
  label: string;
  payload?: any;
}

export interface EventAtom extends AtomBase {
  kind: 'event';
  label: string;
  actorId?: AgentId;
  targetId?: AgentId;
  locationId?: LocationId;
  tags?: Tag[];
}

export interface NormAtom extends AtomBase {
  kind: 'norm';
  normId: NormId;
  label: string;
}

export interface MandateAtom extends AtomBase {
  kind: 'mandate';
  mandateId: MandateId;
  exclusiveGroup: MandateId;
  holderId: AgentId;
  grantedBy?: AgentId;
  revoked?: boolean;
  expiresTick?: number;
}

// Обязательство: "X обязался сделать Y для Z"
export type CommitmentStatus = 'active' | 'fulfilled' | 'breached' | 'released';

export interface CommitmentAtom extends AtomBase {
  kind: 'commitment';
  commitmentKind: string; // произвольный id вида обязательства
  fromId: string;         // кто обязался
  toId: string;           // перед кем
  dueTick?: number;       // необязательный дедлайн (тик мира)
  status: CommitmentStatus;
  strength?: number;      // [0,1], по умолчанию 1
  payload?: any;
}

export interface ViolationAtom extends AtomBase {
  kind: 'violation';
  normId: NormId;
  eventId: string;
  violatorId?: AgentId;
  victimId?: AgentId | 'group';
  severity: number;
}

export interface MapBeliefAtom extends AtomBase {
  kind: 'map_belief';
  prop: PropositionId;
  fromAgentId: AgentId;
  toAgentId: AgentId;
  passableProb: number;
}

export interface OfferAtom extends AtomBase {
  kind: 'offer';
  offerKind: string;
  actorId?: AgentId;
  fromId: AgentId; // Explicitly required
  targetId: AgentId;
  label?: string;
  payload?: any;
}

export interface RefusalAtom extends AtomBase {
  kind: 'refusal';
  actorId: AgentId;
  targetId: AgentId;
  label: string;
}

export interface AckAtom extends AtomBase {
  kind: 'ack';
  fromId: AgentId;
  toId?: AgentId;
  relatedOfferId?: string;
}

export interface PlanStepSummary {
    actionId: string;
    targetId?: string;
    description?: string;
}

export interface PlanAtom extends AtomBase {
    kind: 'plan';
    planId: string;
    fromId: string;
    toId?: string;
    steps: PlanStepSummary[];
    status: 'proposed' | 'accepted' | 'rejected' | 'in_progress' | 'done' | 'active' | 'failed';
    goalId?: string;
}

export type ContextAtom =
  | FactAtom
  | EventAtom
  | NormAtom
  | MandateAtom
  | CommitmentAtom
  | ViolationAtom
  | MapBeliefAtom
  | OfferAtom
  | RefusalAtom
  | AckAtom
  | PlanAtom;

export interface AgentInterpretation {
  atomId: string;
  blame: 'self' | 'other' | 'shared' | 'none';
  fairness: number;
  salience: number;
}

export interface BeliefState {
  byProp: Record<
    PropositionId,
    { bestAtomId: string; confidence: number }
  >;
  contradictions: Array<{ prop: PropositionId; atomIds: string[] }>;
}

export interface RecognitionState {
  recognition: Record<MandateId, Record<AgentId, number>>;
}

export interface AgentContextView {
  knownAtomIds: Set<string>;
  interp: Record<string, AgentInterpretation>;
  beliefs: BeliefState;
  recognition: RecognitionState;
}

/**
 * 4) Конфликты
 */

export interface ConflictFrame {
  id: string;
  actorId: AgentId;
  targetId: AgentId;
  causeAtomId: string;
  kind: 'resource' | 'value' | 'status' | 'authority';
  tension: number;
  linkedGoals: GoalId[];
}

/**
 * 5) Сценарий как компилятор контекста
 */

export interface SceneMapConfig {
  locations: Array<{ id: LocationId; label: string; tags: Tag[] }>;
  connections: Array<{ from: LocationId; to: LocationId; tags?: Tag[] }>;
}

export interface SceneAffordance {
  requiresLocationTags?: Tag[];
  allowedActions: ActionId[];
}

export interface ScenarioGoalSettings {
  isRelevant?: boolean;
  weightMul?: number;
  boundMetric?: MetricId;
}

export interface ScenarioStage {
  id: StageId;
  label: string;
  contextOverride?: ContextMode;
  allowedActions?: ActionId[];
  forbiddenActions?: ActionId[];
  goalTuning?: Record<GoalId, ScenarioGoalSettings>;
  transition: (w: ContextWorldState) => boolean;
}

export type GovernanceMode =
  | 'hierarchical'
  | 'horizontal'
  | 'mixed'
  | 'fractured';

export interface ScenarioOutcomeRules {
  success: Array<{ id: string; when: (w: ContextWorldState) => boolean }>;
  failure: Array<{ id: string; when: (w: ContextWorldState) => boolean }>;
  partial?: Array<{
    id: string;
    when: (w: ContextWorldState) => boolean;
    goalEffects?: Record<GoalId, number>;
  }>;
}

export interface ContextRule {
  id: string;
  when: (w: ContextWorldState) => boolean;
  thenAdd: (w: ContextWorldState) => ContextAtom[];
}

export interface ScenarioConfig {
  id: string;
  label: string;
  kind: string;

  map: SceneMapConfig;
  contextMode: ContextMode;
  engineMode?: 'legacy' | 'context' | 'hybrid';
  governance: GovernanceMode;

  affordances: SceneAffordance[];
  stages: ScenarioStage[];

  activeNorms: NormId[];

  contextSeed: ContextAtom[];
  contextRules: ContextRule[];

  outcomeRules: ScenarioOutcomeRules;
}

/**
 * 6) Мандаты и расширенный WorldState
 */

export interface MandateRegistryEntry {
  mandateId: MandateId;
  holderId: AgentId;
  atomId: string;
  active: boolean;
}

export interface LogEntry {
  tick: number;
  kind:
    | 'goal_support'
    | 'context'
    | 'mandate'
    | 'resolution'
    | 'action'
    | 'norm'
    | 'outcome';
  actorId?: AgentId;
  message: string;
  data?: any;
}

export type AgentLocationTags = Record<string, LocationTagId[]>;

export interface ContextSlice {
  metrics: Metrics;
  locationOf: Record<AgentId, LocationId>;
  contextAtoms: Record<string, ContextAtom>;
  agentViews: Record<AgentId, AgentContextView>;
  conflicts: Record<string, ConflictFrame>;
  mandates: Record<MandateId, MandateRegistryEntry | null>;
  stageId: StageId;
  scenarioId: string;
  scenarioConfig?: ScenarioConfig;
  logs: LogEntry[];
  agentLocationTags?: AgentLocationTags;
}

export interface ContextWorldState extends WorldState {
  contextEx: ContextSlice;
}
