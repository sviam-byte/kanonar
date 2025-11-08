
export enum EntityType {
  Character = 'character',
  Object = 'object',
  Place = 'place',
  Protocol = 'protocol',
  Event = 'event',
  Document = 'document',
  Concept = 'concept',
  Essence = 'essence',
}

export enum Branch {
  PreBorders = 'pre-borders',
  PreRector = 'pre-rector',
  Current = 'current',
}

export interface Relation {
  // FIX: Expanded the union type to include all relation types used in the data files.
  // FIX: Add 'is_brother_of' to the union type to fix type errors.
  type: 'cause' | 'participant' | 'owner' | 'source' | 'trains' | 'advises' | 'buys_from' | 'sells_to' | 'counsels' | 'patched' | 'consults' | 'same_unit_as' | 'reports_to' | 'cites' | 'disputes' | 'mentor_of' | 'advised_by' | 'peer_of' | 'argues_with' | 'antagonizes' | 'student_of' | 'idolizes' | 'manages' | 'receives_reports_from' | 'serves' | 'oversees' | 'escalates_to' | 'supervises' | 'coordinates_with' | 'supplies' | 'works_with' | 'mocks' | 'taunts' | 'banters_with' | 'trades_with' | 'follows' | 'befriends' | 'trained_by' | 'influences' | 'counters' | 'is_sworn_to' | 'is_lover_of' | 'is_protector_of' | 'is_captain_of' | 'is_rival_of' | 'is_monarch_of' | 'controls' | 'is_leader_of' | 'is_niece_of' | 'ordered_assassination_of' | 'is_subordinate_to' | 'is_opponent_of' | 'killed' | 'is_advisor_to' | 'is_colleague_of' | 'is_intellectual_rival_of' | 'was_friend_of' | 'is_creator_of' | 'treats_as_specimen' | 'is_in_contact_with' | 'curated_by' | 'is_brother_of';
  entityId: string;
  entityTitle: string;
}

export interface Media {
  type: 'image' | 'audio' | 'video';
  url: string;
  caption: string;
  source?: string;
}

interface ChangelogEntry {
  version: string;
  date: string;
  author: string;
  summary: string;
}

export interface Parameter {
  key: string;
  name: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  canonValue: number; // Canon value for reset
  description: string;
  category: 'core' | 'mandates' | 'abilities' | 'limitations' | 'switches';
}

export interface SMSBFlags {
  privacyCost?: number;
  fairnessDebt?: boolean;
  rollbackWindow?: string;
  hysteresis?: boolean;
  modelQuorum?: number;
  attentionBudget?: number;
}

export interface BaseEntity {
  entityId: string;
  type: EntityType;
  title: string;
  subtitle?: string;
  authors: { name: string; role: string }[];
  year: string;
  versionTags: string[];
  status: 'draft' | 'published' | 'deprecated';
  tags: string[];
  relations: Relation[];
  media: Media[];
  changelog: ChangelogEntry[];
  description: string;
  parameters: Parameter[];
  evidenceIds?: string[];
  smsb?: SMSBFlags;
}

export interface CharacterEntity extends BaseEntity {
  type: EntityType.Character;
}

export interface ObjectEntity extends BaseEntity {
  type: EntityType.Object;
}

export interface PlaceEntity extends BaseEntity {
  type: EntityType.Place;
}

export interface ProtocolEntity extends BaseEntity {
  type: EntityType.Protocol;
}

export interface EventEntity extends BaseEntity {
  type: EntityType.Event;
}

export interface DocumentEntity extends BaseEntity {
  type: EntityType.Document;
}

export interface ConceptEntity extends BaseEntity {
  type: EntityType.Concept;
}

export interface EssenceEntity extends BaseEntity {
  type: EntityType.Essence;
}


export type AnyEntity = CharacterEntity | ObjectEntity | PlaceEntity | ProtocolEntity | EventEntity | DocumentEntity | ConceptEntity | EssenceEntity;

export interface CalculatedMetrics {
  dose: number;
  Pv: number;
  Vsigma: number;
  S: number;
  drift: number;
  topo: number;
  influence: number;
  prMonstro: number;
  monster_veto: boolean;
  scenarioFitness: ScenarioFitnessResult[];
  simulationData: SimulationPoint[];
  analytics?: {
    timeInCrisis: number;
    cvarS?: number;
  };
}

export interface Scenario {
  key: string;
  title: string;
  supportedTypes: EntityType[];
  calculateFitness: (metrics: Omit<CalculatedMetrics, 'scenarioFitness' | 'simulationData'>, params: Record<string, number>) => { score: number, status: 'ok' | 'fail' };
}

export interface ScenarioFitnessResult {
  key: string;
  title: string;
  score: number;
  status: 'ok' | 'fail';
}

export interface SimulationPoint {
  day: number;
  S: number;
  bands?: { p10: number; p90: number; };
  E?: number;
  Debt?: number;
}

export interface SimulationMeta {
  key:string;
  title: string;
  mode: 'map' | 'logistics' | 'seir' | 'percolation' | 'influence' | 'portfolio' | 'queue' | 'crowd' | 'blackstart' | 'negotiation' | 'network' | 'negotiation-head-to-head';
  description: string;
  payload: any;
  isCharacterCentric?: boolean;
}

// --- RESOURCE BUDGET TYPES ---
export interface ResourceState {
  E: number;      // Energy
  Debt: number;   // Moral Debt
}

// --- NEW SIMULATION TYPES ---
export type EntityParams = Record<string, number>;

export interface CharacterState extends ResourceState {
  stress: number;
  reputation: number;
  fatigue: number;
  darkness: number;
  // observable metrics
  vsigma: number;
  pv: number;
  influence: number;
  prMonstro: number;
}

export interface SimulationRun {
  series: { day: number, S: number }[];
  seed: number;
}

export interface SimulationOutput {
  mean: SimulationPoint[];
  runs: SimulationRun[];
  initialState: CharacterState;
  finalStates?: CharacterState[];
  analytics: {
      timeInCrisis: number; // Percentage of days spent with S < 40
      cvarS?: number;
  };
}

export interface SimConfig {
  horizonDays: number;
  dt: number;
  ensemble: number;
  rngSeed?: number;
  mission?: GeneratedMission;
}

// --- NEGOTIATION SIMULATION TYPES ---
export interface Counterparty {
  id: string;
  name: string;
  hardness: number;
  reputation: number;
  discountDelta: number;
  scrutiny: number;
  batna: number;
}

export interface Mission {
  id: string;
  name: string;
  valueModel: 'supply' | 'alliance' | 'ceasefire';
  deadlineDays: number;
  stakes: number;
}

export interface NegotiationMetrics {
  dealProb: number;
  expectedDealValue: number;
  cvar10: number;
  timeToDealAvg: number;
  scandalProb: number;
  postDelta: { pv: number; vsigma: number; stress: number; S7: number; S30: number; };
  simulationRuns: { accepted: boolean; dealValue: number; time: number; scandal: boolean; loss: number; }[];
}

export interface EnvoyResult {
  id: string;
  entity: CharacterEntity;
  score: number;
  metrics: NegotiationMetrics;
}

export interface NegotiationScenario {
    counterparties: Counterparty[];
    missions: Mission[];
}

// --- MISSION GENERATOR TYPES ---

export type MissionKind = 'negotiation'|'sanction'|'unrest'|'supply'|'audit'|'mandate_reform';

export interface MissionEvent {
  t: number;
  type: 'leak'|'sanction'|'audit'|'supply_delay'|'riot' | 'leadership_change' | 'tech_breakthrough';
  severity: number;
  durationDays?: number;
  description: string;
  effects: { path: string; op:'add'|'mul'|'set'; value:number }[];
};

export interface Objective {
    metric: 'S' | 'pv' | 'vsigma' | 'stress';
    target: number;
    sense: '>=' | '<=';
    weight: number;
}

export interface GeneratedMission {
  id: string;
  kind: MissionKind;
  characterId: string;
  title: string;
  description: string;
  horizonDays: number;
  stakes: number;
  objectives: Objective[];
  events: MissionEvent[];
  seed: number;
};

export interface MissionResult {
    mission: GeneratedMission;
    simulation: SimulationOutput;
    scores: {
        objectiveScore: number;
        stabilityScore: number;
        finalScore: number;
    };
    analytics: {
        timeInCrisis: number;
        eventImpacts: Record<string, number>;
        waterfall: { name: string, value: number }[];
    }
}

// --- NETWORK SIMULATION TYPES ---
export interface SocialGraph {
  nodes: { id:string; kind:'character'|'faction'; trust?:number }[];
  edges: { source:string; target:string; w:number; relation:'ally'|'rival'|'neutral' }[];
};

// --- HEAD-TO-HEAD NEGOTIATION ---
export interface CharacterNegotiationResult {
    envoy1: { metrics: NegotiationMetrics, postSim: SimulationOutput };
    envoy2: { metrics: NegotiationMetrics, postSim: SimulationOutput };
    trajectory: { t: number, offer: number, threshold: number }[];
}

// --- EVIDENCE LAB & LINTER TYPES ---

export type SourceRef = {
  id: string;
  type: 'document'|'witness'|'log'|'simulation'|'archive';
};

export interface Source {
  id: string;
  type: SourceRef['type'];
  name: string;
  reliability: number; // base reliability 0-1
  bias?: number; // systematic bias -1 to 1
}

export interface Evidence {
  id: string;
  statement: string;
  source: SourceRef;
  confidence: number; // calculated confidence 0-1
  relevance: string[]; // keys of metrics it relates to
  date: string;
  context?: string;
}

export interface LintIssue {
  id: string;
  entityId: string;
  entityTitle: string;
  type: 'date_conflict'|'role_conflict'|'missing_ref'|'range_error'|'inconsistency';
  message: string;
  severity:'info'|'warn'|'error';
  location?:string;
};