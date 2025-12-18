
// lib/location/types.ts

import { LocationMap } from '../../types';

// Базовые ID-типажи — подружишь с тем, что уже есть у агентов/фракций.
export type LocationID = string;
export type AgentID = string;
export type FactionID = string;
export type GoalTag = string;
export type FactID = string;
export type EventID = string;
export type ObjectID = string;
export type SceneBlueprintID = string;

// Контекстные режимы
export type ContextModeId =
  | "physical_survival"
  | "strategic_planning"
  | "social_arena"
  | "intimate_dyad"
  | "emergency"
  | "stealth"
  | "evacuation"
  | "siege"
  | (string & {}); // расширяемое

// Архетипы локаций
export type LocationArchetypeID =
  | "sanctuary"
  | "arena"
  | "forge"
  | "maze"
  | "throne"
  | "market"
  | (string & {});

// Вектора стоимости/эффектов — подружишь с уже существующими метриками.
export interface CostVector {
  [metric: string]: number;
}

export interface EffectVector {
  [metric: string]: number;
}

// ------------------------- Topology & Zones -------------------------

export interface Zone {
  id: string;
  name: string;
  description?: string;
}

export interface BehaviorZone {
  id: string;
  name: string;
  zoneRef: string; // id зоны из zones
  localNorms?: NormativeBlock;
  localAffordances?: Affordance[];
  localAffect?: AffectProfile;
  localToMModifier?: ToMModifier;
}

export interface Topology {
  connections: LocationID[]; // соседние локации
  zones: Zone[];
  // Граф проходимости по зонам внутри локации
  zoneGraph: Record<string, string[]>; // zoneId -> соседние zoneId[]
  // Кто кого видит из какой зоны (по умолчанию можно использовать z→z)
  visibilityMap: Record<string, string[]>; // zoneId -> видимые zoneId[]
}

// ------------------------- Affordances -------------------------

export type AffordanceKind = "physical" | "social" | "cognitive" | "narrative";

export interface Affordance {
  id: string;
  name: string;
  description?: string;
  kind: AffordanceKind;

  // Простейший фильтр вместо прямой функции allow(agent, context):
  // полноценный allow можно реализовывать в коде, опираясь на эти поля.
  requiredTags?: string[]; // теги агента/роли, необходимые для действия
  forbiddenTags?: string[];

  cost: CostVector;
  effects: EffectVector;
}

// ------------------------- Context Modes -------------------------

export interface ContextMode {
  id: ContextModeId;
  label: string;
  // Модификаторы весов целей в этом режиме (GoalTag -> delta weight)
  goalWeightModifiers?: Record<GoalTag, number>;
  // Общие мультипликаторы/штрафы
  tensionModifier?: number;
  riskModifier?: number;
}

// ------------------------- Hazards -------------------------

export type HazardType =
  | "fire"
  | "collapse"
  | "enemy_presence"
  | "infection"
  | "radiation"
  | "toxic_gas"
  | (string & {});

export interface HazardSpec {
  id: string;
  type: HazardType;
  intensity: number; // 0–1
  // Опциональная ссылка на модель распространения
  spreadModelId?: string;
  description?: string;
}

// ------------------------- Goals -------------------------

export interface GoalSpec {
  id: string;
  tag: GoalTag;
  label: string;
  description?: string;
  // Насколько типична эта цель в локации (0–1)
  typicalWeight?: number;
}

// ------------------------- Norms -------------------------

export interface NormRule {
  id: string;
  description: string;
  appliesToTags?: string[]; // типы агентов / роли
  // штрафы к метрикам при нарушении
  penalties?: CostVector;
}

export interface NormativeBlock {
  requiredBehavior: NormRule[];
  forbiddenBehavior: NormRule[];
  // Глобальные штрафы за нарушение норм (если надо агрегировать)
  penalties: CostVector;
}

// ------------------------- State -------------------------

export interface LocationResources {
  food?: number;
  water?: number;
  medical?: number;
  energy?: number;
  [k: string]: number | undefined;
}

export interface LocationState {
  presenceAgents: AgentID[];
  resources: LocationResources;
  structuralIntegrity: number; // 0–1
  lightLevel: number; // 0–1
  noiseLevel: number; // 0–1
  enemyActivity: number; // 0–1
  temperature: number; // условные единицы
  // Произвольный пользовательский словарь
  custom: Record<string, number | string | boolean>;
}

// ------------------------- Triggers -------------------------

export type TriggerKind = "enter" | "exit" | "tick" | "custom";

export interface TriggerSpec {
  id: string;
  kind: TriggerKind;
  eventId: EventID | null;
  description?: string;
  // Условия активации, в коде ты уже реализуешь интерпретацию
  conditionTags?: string[];
}

// ------------------------- Physics -------------------------

export interface PhysicsProfile {
  mobilityCost: number; // множитель стоимости перемещения
  collisionRisk: number; // 0–1
  climbable: boolean;
  jumpable: boolean;
  crawlable: boolean;
  weightLimit: number; // условная максимальная нагрузка
  environmentalStress: number; // 0–1 (жар/холод/токсичность)
  acousticsProfile: {
    echo: number; // 0–1
    dampening: number; // 0–1
  };
  lineOfSightConstraints?: string; // описание/ID карты укрытий/дыма
}

// ------------------------- Objects -------------------------

export interface ObjectRef {
  id: ObjectID;
  name: string;
  // Подключаем свои affordances
  affordances?: Affordance[];
  // Состояние объекта (сломано/заряжено/и т.п.)
  state?: Record<string, number | string | boolean>;
  canBeHazard?: boolean;
  canBeResource?: boolean;
}

// ------------------------- Narrative tension -------------------------

export interface NarrativeTension {
  value: number; // 0–1
  growthRate: number;
  decayRate: number;
  incidentProbability: number; // 0–1
}

// ------------------------- Initiative & Conflict -------------------------

export interface InitiativeRule {
  id: string;
  description?: string;
  weightByRank?: Record<string, number>;
  weightByRoleTag?: Record<string, number>;
  weightByCharisma?: number;
}

export interface InitiativeLayer {
  defaultInitiatorTag?: string; // роль/тег по умолчанию
  rules: InitiativeRule[];
}

export interface ConflictDynamics {
  conflictThreshold: number; // 0–1
  maxViolenceLevel: number; // 0–1
  deescalationAffordances: string[]; // id affordances
  escalationFactors: string[]; // текстовые теги факторов
}

// ------------------------- ToM Modifiers -------------------------

export interface ToMModifier {
  noise: number; // 0–1
  bias?: string; // короткое описание (например, "authority_biased")
  framing?: string;
  misinterpretationChance: number; // 0–1
  authorityBias: number; // -1..+1
  privacyBias: number; // -1..+1
}

// ------------------------- Reaction / Timing -------------------------

export interface ReactionProfile {
  reactionSpeedModifier: number; // множитель
  stressReactionModifier: number; // множитель
  planningDepthModifier: number; // множитель
}

// ------------------------- Crowd -------------------------

export interface CrowdBehaviorPattern {
  id: string;
  description: string;
}

export interface CrowdProfile {
  populationDensity: number; // 0–1
  npcNoiseLevel: number; // 0–1
  behaviors: CrowdBehaviorPattern[];
}

// ------------------------- Fallback / Failover -------------------------

export interface FallbackScenario {
  id: string;
  sceneBlueprintId: SceneBlueprintID;
  description?: string;
}

export interface FailoverActions {
  affordanceIds: string[];
  neutralBehaviorMode?: string;
}

// ------------------------- Archetype & Goal hooks -------------------------

export interface GoalModifier {
  goalTag: GoalTag;
  weightDelta?: number;
  enable?: boolean;
  disable?: boolean;
}

export interface GateSpec {
  goalTag: GoalTag;
  conditionTag?: string; // условное имя условия
  penalty?: number;
}

export interface GoalEcologyHooks {
  goalModifiers: GoalModifier[];
  hardGates: GateSpec[];
  softGates: GateSpec[];
}

// ------------------------- Emotion / Affect -------------------------

export interface AffectProfile {
  anxiety: number;
  hope: number;
  shame: number;
  awe: number;
  intimacy: number;
}

// ------------------------- Roles & Scene Patterns -------------------------

export interface RoleSlot {
  id: string;
  description: string;
  allowedTraitsOrTags?: string[];
}

export interface ScenePattern {
  id: string;
  description: string;
  roleSlots: string[]; // RoleSlot.id[]
  typicalGoals: GoalSpec[];
  escalationRules?: string;
}

// ------------------------- Info / Observation -------------------------

export interface InfoChannel {
  id: string;
  type: string; // "rumor" | "official" | "panic" | ...
  quality: number; // 0–1
  bias: string;
}

export interface ObservationProfile {
  visibility: number; // 0–1
  audibility: number; // 0–1
  privacy: number; // 0–1
  discoverableFacts: FactID[];
}

// ------------------------- Ownership / Access -------------------------

export type AccessMode = "allow" | "forbid" | "restricted";

export interface AccessRule {
  id: string;
  roleOrTag: string;
  mode: AccessMode;
  description?: string;
}

export interface OwnershipBlock {
  ownerFaction: FactionID | null;
  authority: AgentID[];
  accessRights: AccessRule[];
  securityLevel: number; // 0–1
}

// ------------------------- Time Modes / Schedule -------------------------

export interface TimeMode {
  id: string;
  label: string;
  // условное имя условия; реализация в коде
  conditionTag: string;
  // patch к состоянию/режимам при включении
  diff?: {
    enabledContextModes?: ContextModeId[];
    disabledContextModes?: ContextModeId[];
    addedAffordances?: string[];
    removedAffordances?: string[];
  };
}

export interface ScheduledEvent {
  id: string;
  label: string;
  // условное имя/cron/тэг, как тебе удобнее
  scheduleTag: string;
  relatedTriggerId?: string;
}

// ------------------------- History / Overrides -------------------------

export interface LocationEventHistory {
  events: EventID[];
  lastBattleTime?: number;
  lastBetrayalTime?: number;
  lastPublicHumiliationTime?: number;
  lastCelebrationTime?: number;
  isTainted: boolean;
  isSanctuary: boolean;
}

export interface AgentOverride {
  agentId: AgentID;
  goalModifiers?: GoalModifier[];
  affectModifiers?: Partial<AffectProfile>;
  affordanceOverrides?: {
    enabledAffordances?: string[];
    disabledAffordances?: string[];
  };
}

// ------------------------- Risk / Reward & World integration -------------------------

export interface RiskRewardGeometry {
  riskIndex: number; // 0–1
  rewardIndex: number; // 0–1
  safePaths: string[]; // zoneId[]
  dangerPaths: string[]; // zoneId[]
  resourceOpportunities: string[]; // свободная семантика
}

export interface WorldIntegrationBlock {
  worldPressure: number; // 0–1
  signalQuality: number; // 0–1
  supplyState: number; // 0–1
  politicalTemperature: number; // 0–1
}

// ------------------------- Location -------------------------

export interface Location {
  id: LocationID;
  name: string;
  description: string;

  tags: string[];

  topology: Topology;
  behaviorZones: BehaviorZone[];

  physics: PhysicsProfile;

  affordances: Affordance[];
  objects: ObjectRef[];

  contextModes: ContextMode[];
  hazards: HazardSpec[];

  localGoals: GoalSpec[];
  norms: NormativeBlock;

  state: LocationState;

  triggers: TriggerSpec[];

  narrativeTension: NarrativeTension;
  initiative: InitiativeLayer;
  conflict: ConflictDynamics;

  tomModifier: ToMModifier;
  reactionProfile: ReactionProfile;
  crowd: CrowdProfile;

  fallbackScenarios: FallbackScenario[];
  failover: FailoverActions;

  archetype: LocationArchetypeID;
  goalHooks: GoalEcologyHooks;

  affect: AffectProfile;
  roleSlots: RoleSlot[];
  scenePatterns: ScenePattern[];

  infoChannels: InfoChannel[];
  observation: ObservationProfile;

  ownership: OwnershipBlock;
  timeModes: TimeMode[];
  schedule: ScheduledEvent[];

  history: LocationEventHistory;
  agentOverrides: AgentOverride[];

  riskReward: RiskRewardGeometry;
  worldIntegration: WorldIntegrationBlock;

  // New map property
  map?: LocationMap;
}

// Удобный конструктор по умолчанию
export function createEmptyLocation(id: LocationID, name: string): Location {
  return {
    id,
    name,
    description: "",
    tags: [],

    topology: {
      connections: [],
      zones: [],
      zoneGraph: {},
      visibilityMap: {},
    },
    behaviorZones: [],

    physics: {
      mobilityCost: 1,
      collisionRisk: 0,
      climbable: false,
      jumpable: false,
      crawlable: false,
      weightLimit: 1,
      environmentalStress: 0,
      acousticsProfile: { echo: 0.5, dampening: 0.5 },
    },

    affordances: [],
    objects: [],

    contextModes: [],
    hazards: [],

    localGoals: [],
    norms: {
      requiredBehavior: [],
      forbiddenBehavior: [],
      penalties: {},
    },

    state: {
      presenceAgents: [],
      resources: {},
      structuralIntegrity: 1,
      lightLevel: 0.7,
      noiseLevel: 0.3,
      enemyActivity: 0,
      temperature: 20,
      custom: {},
    },

    triggers: [],

    narrativeTension: {
      value: 0,
      growthRate: 0.05,
      decayRate: 0.05,
      incidentProbability: 0,
    },

    initiative: {
      defaultInitiatorTag: undefined,
      rules: [],
    },

    conflict: {
      conflictThreshold: 0.5,
      maxViolenceLevel: 1,
      deescalationAffordances: [],
      escalationFactors: [],
    },

    tomModifier: {
      noise: 0,
      misinterpretationChance: 0,
      authorityBias: 0,
      privacyBias: 0,
    },

    reactionProfile: {
      reactionSpeedModifier: 1,
      stressReactionModifier: 1,
      planningDepthModifier: 1,
    },

    crowd: {
      populationDensity: 0,
      npcNoiseLevel: 0,
      behaviors: [],
    },

    fallbackScenarios: [],
    failover: {
      affordanceIds: [],
      neutralBehaviorMode: undefined,
    },

    archetype: "sanctuary",
    goalHooks: {
      goalModifiers: [],
      hardGates: [],
      softGates: [],
    },

    affect: {
      anxiety: 0,
      hope: 0.5,
      shame: 0,
      awe: 0,
      intimacy: 0,
    },

    roleSlots: [],
    scenePatterns: [],

    infoChannels: [],
    observation: {
      visibility: 0.7,
      audibility: 0.7,
      privacy: 0.3,
      discoverableFacts: [],
    },

    ownership: {
      ownerFaction: null,
      authority: [],
      accessRights: [],
      securityLevel: 0,
    },

    timeModes: [],
    schedule: [],

    history: {
      events: [],
      isTainted: false,
      isSanctuary: false,
    },

    agentOverrides: [],

    riskReward: {
      riskIndex: 0,
      rewardIndex: 0,
      safePaths: [],
      dangerPaths: [],
      resourceOpportunities: [],
    },

    worldIntegration: {
      worldPressure: 0,
      signalQuality: 1,
      supplyState: 1,
      politicalTemperature: 0.5,
    },
  };
}
