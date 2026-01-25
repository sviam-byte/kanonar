
// types.ts
export type { AffectState } from './lib/emotions/types';

import type { ContextualMindState } from './lib/tom/contextual/types';
export type { ContextualMindState };
import type { AgentMemory } from './lib/core/mindTypes';

// --- Enums ---
export enum EntityType {
  Character = 'character',
  Object = 'object',
  Concept = 'concept',
  Place = 'place',
  Location = 'location',
  Protocol = 'protocol',
  Event = 'event',
  Document = 'document',
  Essence = 'essence',
  SocialEvent = 'social_event',
}

export enum Branch {
  Current = 'current',
  PreRector = 'pre-rector',
  PreBorders = 'pre-borders',
}

// --- Basic Types ---
export interface Vec2 {
  x: number;
  y: number;
}

export type StoryTime = number;
export type AgentId = string;
export type LocationId = string;
export type ObjectId = string;
export type GoalId = string;
export type CharacterGoalId = string;

// --- Goal Tuning (GoalLab / SimKit) ---
export type GoalCategoryId =
  | 'survival'
  | 'rest'
  | 'social'
  | 'control'
  | 'identity'
  | 'mission'
  | 'learn'
  | 'other';

export interface GoalCurveTuning {
  /** Multiplies the goal logit (default 1). */
  slope?: number;
  /** Adds to the goal logit (default 0). */
  bias?: number;
}

export interface GoalTuningConfig {
  /** Global knobs (applies to all goals). */
  global?: GoalCurveTuning;
  /** Category-level knobs (coarse). */
  categories?: Partial<Record<GoalCategoryId, GoalCurveTuning>>;
  /** Goal-level knobs (fine). Key is goal def id (e.g. c_restore_sleep). */
  goals?: Record<string, GoalCurveTuning>;
  /** Hard veto switches. Key is goal def id. */
  veto?: Record<string, boolean>;
}
export type ActionId = string;
export type SocialActionId = string;
export type ScenarioId = string;
export type Id = string;
export type SceneRoleId = string;
export type GoalDomainId = string;
export type GoalAxisId = string;
export type EntityParams = Record<string, number>;
export type TraumaKind = 'betrayal_by_leader' | 'betrayal_by_peer' | 'mass_casualties' | 'failed_rescue' | 'random_catastrophe' | 'torture' | 'moral_compromise' | 'violence' | 'accident' | 'captivity' | 'sleep_disorder' | 'power_grab';

// Alias for VectorBase used in math libs
export type VectorBase = Record<string, number>;
export type VectorAxisId = string;

// --- Context Tuning (Moved from lib/tom/contextual/types.ts) ---
export type ContextAxisId =
  | 'danger'          // threat/hazard/violence risk
  | 'control'         // ability to steer outcomes / options / leverage
  | 'intimacy'        // privacy + closeness affordance
  | 'hierarchy'       // dominance/authority gradient
  | 'publicness'      // exposure to audience / scrutiny
  | 'normPressure'    // prescriptive pressure
  | 'surveillance'    // monitoring/oversight
  | 'scarcity'        // resource scarcity (food, meds, time, attention)
  | 'timePressure'    // urgency, deadlines, ticking bomb
  | 'uncertainty'     // information insufficiency / ambiguity
  | 'legitimacy'      // perceived legitimacy of orders/institutions
  | 'secrecy'         // need to conceal / risk of leaks
  | 'grief'           // loss salience / mourning context
  | 'pain';           // bodily pain/sickness salience

export type ContextAxesVector = Record<ContextAxisId, number>; // all 0..1

// --- Standardized Input Axes (GoalLab / Sensors) ---
// 0..1, where 0 = none/low, 1 = max/high.
export enum InputAxis {
  Temperature = 'temperature',
  Comfort = 'comfort',
  Hygiene = 'hygiene',
  CrowdDensity = 'crowdDensity',
  Privacy = 'privacy',
  AuthorityPresence = 'authorityPresence',
  Aesthetics = 'aesthetics',
  NoiseLevel = 'noiseLevel',
  Visibility = 'visibility',
  ControlLevel = 'controlLevel',
}

export type InputAxisVector = Record<InputAxis, number>;

export type ContextTuning = {
  // Global scalar (0..1): how strongly context should bias dyads/emotions vs base ToM
  gain?: number;
  // Per-axis overrides: additive bias in [-1..1] and/or multiplicative weight in [0..2]
  add?: Partial<Record<ContextAxisId, number>>;
  mul?: Partial<Record<ContextAxisId, number>>;
  // Optional axis locks: if set, axis becomes exactly this value (0..1)
  lock?: Partial<Record<ContextAxisId, number>>;
  // Optional per-target tuning (e.g., some targets are always “public” or “hierarchical”)
  perTarget?: Record<string, Omit<ContextTuning, 'perTarget'>>;
};

// --- Interfaces for Entities ---

export interface EntitySecurity {
    requiredLevel?: number;
    requiredKey?: string;
}

export interface BaseEntity {
  entityId: string;
  type: EntityType;
  title: string;
  subtitle?: string;
  description?: string;
  tags?: string[];
  versionTags?: Branch[];
  security?: EntitySecurity;
  [key: string]: any;
}

export interface AnyEntity extends BaseEntity {}

export interface Parameter {
    key: string;
    name: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    canonValue: number;
    description: string;
    category?: string;
}

export interface ObjectEntity extends BaseEntity {
    type: EntityType.Object;
    parameters?: Parameter[];
    tda?: { barcode: number[][] }; // For TSealBarcode
}

export interface ConceptEntity extends BaseEntity {
    type: EntityType.Concept;
    parameters?: Parameter[];
    smsb?: SMSBFlags;
}

export interface SMSBFlags {
    privacyCost?: number;
    fairnessDebt?: boolean;
    rollbackWindow?: string;
    hysteresis?: boolean;
    modelQuorum?: number;
    attentionBudget?: number;
}

// --- Location Interfaces ---
export interface LocationMapCell {
    x: number;
    y: number;
    walkable: boolean;
    danger: number; // 0-1
    cover: number; // 0-1
    elevation?: number;
    level?: number;
    maxOccupancy?: number;
    hazards?: any[];
    tags?: string[];
}

export interface SvgShape {
    tag: string;
    attrs: Record<string, any>;
    children?: SvgShape[];
    content?: string;
}

export interface LocationMapExit {
    x: number;
    y: number;
    targetId: string;
    label: string;
}

export interface LocationMap {
    id: string;
    width: number;
    height: number;
    cells: LocationMapCell[];
    visuals?: SvgShape[];
    exits?: LocationMapExit[];
    defaultWalkable?: boolean;
    defaultDanger?: number;
    defaultCover?: number;
}

export interface PhysicsProfile {
    mobilityCost: number;
    collisionRisk: number;
    climbable: boolean;
    jumpable: boolean;
    crawlable: boolean;
    weightLimit: number;
    environmentalStress: number;
    acousticsProfile: { echo: number; dampening: number; };
    lineOfSightConstraints?: string;
}

export interface LocationConnection {
    distance: number;
    difficulty: number;
}

export interface OwnershipBlock {
    ownerFaction: string | null;
    authority: string[];
    accessRights: any[];
    securityLevel: number;
}

export interface AffectProfile {
    anxiety: number;
    hope: number;
    shame: number;
    awe: number;
    intimacy: number;
}

export interface ToMModifier {
    noise: number;
    misinterpretationChance: number;
    authorityBias: number;
    privacyBias: number;
}

export type Vec3 = { x: number; y: number; z: number };
export type Euler = { yaw: number; pitch: number; roll: number };

export type VolumeShape =
    | { kind: 'box'; size: Vec3 }
    | { kind: 'sphere'; radius: number }
    | { kind: 'cylinder'; radius: number; height: number };

export type VolumeTransform = {
    pos: Vec3;
    rot?: Euler; // для sphere можно игнорировать
};

export type HazardVolume = {
    id: string;
    hazardKind: string;    // 'radiation' | 'toxic' | ...
    intensity: number;     // 0..1
    shape: VolumeShape;
    transform: VolumeTransform;
    falloff?: { kind: 'none' | 'linear' | 'invSq'; radius?: number };
    tags?: string[];
};

export type ZoneVolume = {
    id: string;
    name: string;
    shape: VolumeShape;
    transform: VolumeTransform;
    tags?: string[];
};

export interface LocationEntity extends BaseEntity {
    type: EntityType.Location;
    map?: LocationMap;
    physics?: PhysicsProfile;
    affordances?: { allowedActions?: string[]; forbiddenActions?: string[] };
    properties?: {
        // existing
        privacy?: 'public' | 'semi' | 'private' | string;
        control_level?: number; // 0..1
        visibility?: number;    // 0..1
        noise?: number;         // 0..1
        tags?: string[];

        // standardized InputAxis seeds (all 0..1 unless specified otherwise)
        temperature?: number;
        comfort?: number;
        hygiene?: number;
        aesthetics?: number;

        // aliases / alternative keys (kept for convenience / migrations)
        crowd_level?: number;
        crowdDensity?: number;
        authority_presence?: number;
        authorityPresence?: number;
        noise_level?: number;
        noiseLevel?: number;
    };
    state?: { locked?: boolean; damaged?: boolean; crowd_level?: number; alert_level?: number; [key: string]: any };
    connections?: Record<string, LocationConnection>;
    contextModes?: any[];
    hazards?: any[];
    norms?: any;
    ownership?: OwnershipBlock;
    affect?: AffectProfile;
    tomModifier?: ToMModifier;
    geometry?: any;
    narrativeTension?: any;
    triggers?: any[];
    crowd?: any;
    riskReward?: any;
    worldIntegration?: any;
    schedule?: any[];
    timeModes?: any[];
    history?: any;
    agentOverrides?: any[];
    scenePatterns?: any[];
    infoChannels?: any[];
    roleSlots?: any[];
    failover?: any;
    fallbackScenarios?: any[];
    initiative?: any;
    conflict?: any;
    objects?: any[];
    localGoals?: any[]; // GoalSpec[]
    behaviorZones?: any[];
    topology?: any;
    archetype?: string;
    goalHooks?: any;
    access?: any; 
    ownerIds?: string[];
    spatial?: {
        pos: Vec3;
        rot?: Euler;
        size?: Vec3; // bbox
    };
    hazardVolumes?: HazardVolume[];
    zoneVolumes?: ZoneVolume[];
}

// --- Body Interfaces ---
export interface BodyStructural {
    height_cm: number;
    mass_kg: number;
    shoulder_width_cm: number;
    pelvis_width_cm: number;
    limb_lengths: { arm_cm: number; leg_cm: number; };
    hand_span_cm: number;
    foot_length_cm: number;
    center_of_mass: { height_rel: number; depth_rel: number; };
    joint_laxity: number;
    size?: number; // derived or explicit
}

export interface BodyFunctional {
    strength_upper: number;
    strength_lower: number;
    explosive_power: number;
    aerobic_capacity: number;
    recovery_speed: number;
    strength_endurance_profile: number;
    injury_risk: { knees: number; ankles: number; lower_back: number; shoulders: number; };
}

export interface BodyAdipose {
    body_fat_percent: number;
    metabolic_reserve: number;
    fat_distribution: 'gynoid' | 'android' | 'mixed';
}

export interface BodyHormonal {
    has_cyclic_hormones: boolean;
    cycle_length_days?: number;
    cycle_phase?: number;
    cycle_effects?: any;
    androgen_baseline: number;
    androgen_circadian_amplitude: number;
    stress_sensitivity: number;
    sleep_sensitivity: number;
    baseline_testosterone?: number;
    baseline_estrogen?: number;
}

export interface BodyReproductiveState {
    can_be_pregnant: boolean;
    is_pregnant: boolean;
    gestation_week?: number;
    fatigue_penalty: number;
    heart_rate_increase: number;
    injury_risk_increase: number;
    emotional_lability: number;
}

export type SexPhenotype = 'typical_female' | 'typical_male' | 'intermediate' | 'custom';
export type FatDistribution = 'gynoid' | 'android' | 'mixed';

export interface AcuteState {
    hp: number;
    injuries_severity: number;
    pain_now: number;
    pain_current?: number;
    temperature_c: number;
    temperature_C?: number;
    tremor: number;
    reaction_time_ms: number;
    fatigue: number;
    stress: number; // 0-100 usually in UI/Legacy, but 0-1 normalized often
    stress_level?: number; // 0-1
    moral_injury: number;
    moral_trauma?: number;
    wounds?: any[];
    aggression?: number;
}

export interface ReservesState {
    energy?: number; // 0-1
    energy_store_kJ?: number;
    energy_reserve_kcal?: number;
    hydration: number;
    glycemia_mmol?: number;
    O2_margin: number;
    oxygen_reserve?: number;
    sleep_homeostat_S: number;
    circadian_phase_h: number;
    circadian_phase_hours?: number;
    sleep_debt_h: number; // hours
    sleep_debt?: number; // normalized?
    immune_tone: number;
}

export interface RegulationState {
    HPA_axis: number;
    hpa_axis_activity?: number;
    arousal: number;
}

export interface BodyModel {
    sex_phenotype: string;
    structural?: BodyStructural;
    functional?: BodyFunctional;
    adipose?: BodyAdipose;
    hormonal?: BodyHormonal;
    reproductive?: BodyReproductiveState;
    constitution?: any;
    capacity?: any;
    reserves: ReservesState;
    acute: AcuteState;
    regulation: RegulationState;
    fitness_index?: number;
    fragility_index?: number;
    hormonal_tension?: number;
}

// PhysiologyState used in SDE loops
export interface PhysiologyState {
    reserves: ReservesState;
    acute: AcuteState;
    regulation: RegulationState;
    fitness_index?: number;
    fragility_index?: number;
    hormonal_tension?: number;
}

// --- Character Interfaces ---

export interface Oath {
    key: string;
    description?: string;
    targetId?: string;
    level?: string;
}

export interface IdentityCaps {
    version_gates?: Branch[];
    hard_caps?: any[];
    param_locked?: string[];
    locks_source?: any[];
    oaths?: Oath[];
    sigils?: Record<string, boolean>;
    chain_of_command?: any[];
    clearance_level: number;
    consent_ledger?: any[];
    identity_chain_of_custody?: any[];
    sacred_set?: any[];
    self_concept?: string;
    arch_true?: number[];
    arch_self?: number[];
    arch_true_dominant_id?: string;
    arch_self_dominant_id?: string;
    arch_core?: any; // legacy index
    shadow_arch?: any; // legacy
}

export interface CharacterStaticState {
    will?: number;
    loyalty?: number;
    dark_exposure?: number;
    drift_state?: number;
    burnout_risk?: number;
    backlog_load?: number;
    overload_sensitivity?: number;
    trauma_shadow_bias?: number;
}

export interface SocialProfile {
    audience_reputation: any[];
    dynamic_ties?: any;
    coalitions?: any[];
    commitments?: any[];
    dag_node_id?: string;
    edges_out?: any[];
    causal_liability_share?: number;
    co_sign_latency?: any[];
    reciprocity_index?: number;
    betrayal_cost?: number;
    reputation_sensitivity?: number;
}

export interface TraumaTag {
    domain: 'self' | 'others' | 'world' | 'system';
    severity: number;
    kind: string;
    ageFactor?: number;
}

export interface TraumaEvent {
    kind: TraumaKind;
    severity: number;
}

export interface PersonalEvent {
    id: string;
    name: string;
    t: number;
    years_ago?: number;
    domain: string;
    tags: string[];
    valence: number;
    intensity: number;
    duration_days: number;
    surprise: number;
    controllability: number;
    responsibility_self: number;
    secrecy: string;
    participants?: string[];
    payload?: any;
    lifeGoalWeights?: Record<string, number>;
    axisWeights?: Record<string, number>;
    trauma?: TraumaTag;
    reactivations?: number;
    dark_payload?: number;
    locationId?: string;
    security?: EntitySecurity;
    effects?: any; // Unified effects
}

export interface BiographicalEvent {
  id: string;
  time: number;              
  kind: string;
  valence: number; 
  intensity: number;            
  duration?: number;            
  tags?: string[];              
  axisWeights?: Partial<Record<string, number>>;
  lifeGoalWeights?: Partial<Record<string, number>>;
  participants?: string[];
  trauma?: TraumaTag;
}

export interface Biography {
    characterId: string;
    events: BiographicalEvent[]; 
}

export interface Relationship {
    trust: number;
    align: number;
    respect: number;
    fear: number;
    bond: number;
    conflict: number;
    history: any[];
}

export type AcquaintanceTier = 'unknown' | 'seen' | 'acquaintance' | 'known' | 'intimate';

export type AcquaintanceKind =
    | 'none'
    | 'stranger'
    | 'colleague'
    | 'friend'
    | 'romance'
    | 'family'
    | 'enemy'
    | 'rival'
    | 'mentor'
    | 'subordinate';

export interface AcquaintanceEdge {
    tier: AcquaintanceTier;      // recognition level
    kind: AcquaintanceKind;      // semantic relation kind
    familiarity: number;         // 0..1
    idConfidence: number;        // 0..1
    firstMetAt?: number;
    lastSeenAt?: number;
    notes?: string[];
}

export interface UserRelation {
    trust: number;
    bond: number;
    authority: number;
}

export type UserRelations = Record<string, Record<string, UserRelation>>;

// TomState - relaxed definition for legacy/new mix
export interface TomState {
    [observerId: string]: Record<string, TomEntry> | any;
    // Legacy support
    views?: Record<string, Record<string, TomView>>;
}

export interface TomView {
    observerId: string;
    targetId: string;
    emotions: { valence: number; arousal: number; fear: number; anger: number; shame: number; trust: number; };
    roles: Record<string, number>;
    goals: Record<string, number>;
    trust: number;
    respect: number;
    alignment: number;
    bond: number;
    conflict: number;
    dominance: number;
    align?: number; // 0..1 representation
    vulnerability?: number;
    uncertainty?: number;
    lastInteractionTick?: number;
}

export type TomRelView = TomView; // Alias

export interface TomEntry {
    goals: { goalIds: string[]; weights: number[] };
    traits: TomBeliefTraits;
    uncertainty: number;
    lastUpdatedTick: number;
    lastInteractionTick: number;
    policyPrior?: any;
    repertoireMask?: any;
    arch_true_est?: number[];
    arch_stereotype?: number;
    lastActionPolarity?: number;
    believedLifeGoals?: any;
    secondOrderSelf?: any;
    epistemic?: any;
    roleProfile?: any;
    norms?: any;
    affect?: any;
    errorProfile?: any;
    stress?: { load: number };
    selfLatents?: Record<string, number>;
    biases?: any;
    evidenceCount?: number;
}

export interface TomBeliefTraits {
    trust: number;
    align: number;
    bond: number;
    competence: number;
    dominance: number;
    reliability: number;
    obedience: number;
    uncertainty: number;
    vulnerability?: number;
    conflict: number;
    respect: number;
    fear: number;
}

export interface BiographyState {
  latent: any; // BiographyLatent
  lastUpdateTime: number;
  axisDeltas: Record<string, number>;
  locationValence?: Record<string, any>;
  events: BiographicalEvent[];
}

export interface CharacterEntity extends BaseEntity {
  type: EntityType.Character | EntityType.Essence;
  vector_base?: Record<string, number>;
  body: BodyModel;
  identity: IdentityCaps;
  state?: CharacterStaticState;
  social?: SocialProfile;
  roles?: { global: string[]; relations?: { other_id: string; role: string }[] };
  historicalEvents?: PersonalEvent[];
  relationships?: Record<string, Relationship>;
  tom?: TomState;
  capabilities?: Record<string, number>;
  context?: { age?: number; faction?: string; social_history?: any[]; faction_relations?: any };
  memory?: any;
  resources?: any;
  competencies?: any;
  authority?: any;
  evidence?: any;
  observation?: any;
  compute?: any;
  sector?: any;
  repro?: any;
  goal_graph?: any;
  lifeGoals?: Record<string, number>;
  biography?: Biography;
  
  // Runtime props sometimes attached
  storyTime?: number;
  mode?: string;
  massMembership?: MassMembership;
  massNodeId?: string;
}

export interface EssenceEntity extends CharacterEntity {
    type: EntityType.Essence;
}

// --- Agent Runtime ---

export interface CharacterParams {
    T0: number;
    kappa: number;
    tau: { energy: number; stress: number; attention: number; width: number; will: number };
    sigma0: number;
    h_coeffs: { a_HPA: number; a_stress: number; a_sleep: number; a_dark: number };
    cvar_lambda: number;
    prospect: { gamma: number; delta: number; lambda_loss: number };
    rho_goals: number;
    rhoL: number;
    rhoS: number;
    zeta_belief: number;
    phi_max: number;
    phi_beta: any;
    lambda_soft_ban: number;
    shock_lambda: number;
    shock_profile_J: { stress: number; energy: number; injury: number; moral: number };
    appraisal_weights: any;
    yerkes_A_star: number;
    yerkes_sigma_A: number;
    kappa_T_sensitivity: number;
    kappa_proc_sensitivity: number;
    gumbel_beta: number;
    planningStyle: 'deliberate' | 'simple' | 'instinctive';
    archMetrics: Record<string, number>;
}

export interface PhysioParams {
    // Legacy alias if needed
}

export interface V42Metrics {
    V_t: number; A_t: number; WMcap_t: number; DQ_t: number; Habit_t: number;
    Agency_t: number; TailRisk_t: number; Rmargin_t: number; PlanRobust_t: number;
    DriveU_t: number; ExhaustRisk_t: number; Recovery_t: number;
    ImpulseCtl_t: number; InfoHyg_t: number; RAP_t: number;
}

export interface ToMDashboardMetrics {
    delegability: number;
    toM_DepthEff: number;
    toM_Quality: number;
    toM_Unc: number;
}

export interface ToMV2DashboardMetrics {
    irl_fit: number;
    kl_act: number;
    misattrib: number;
    cred_commit: number;
    coalition_cohesion: number;
    pivotality: number;
    rationality_fit: number;
    time_horizon: number;
    pragmatic_loss: number;
    decep_incentive: number;
    detect_power: number;
    tom_info_gain_rate: number;
    identifiability: number;
    order_mismatch: number;
    prototype_reliance: number;
    outlierness: number;
    norm_conflict: number;
    self_physical_capability: number;
    self_perceived_vulnerability: number;
    perceived_by_others_vulnerability: number;
}

export interface DerivedMetrics {
    rho: number;
    lambda: number;
    iota: number;
    resilience: number;
    antifragility: number;
    regulatoryGain: number;
    chaosPressure: number;
    socialFriction: number;
    reputationFragility: number;
    darkTendency: number;
    goalTension: number;
    frustration: number;
    sensoriumReliability: number;
    sleepPressure: number;
    energyMargin: number;
    Vsigma_core: number;
    Vsigma_body: number;
    Vsigma_total: number;
    body_tail_risk: number;
    load_capacity: number;
}

export interface PlanStep {
    id: string;
    actionId: string;
    targetId?: string;
    explanation?: string;
    args?: any;
    goalId?: string;
}

export interface PlanState {
    steps: PlanStep[];
    cursor: number;
    builtAtTick: number;
    horizon: number;
    status: 'active' | 'completed' | 'failed' | 'cancelled';
    origin: 'self' | 'shared' | 'assigned';
    ownerId: string;
}

export type GoalLayer = 'body' | 'security' | 'social' | 'identity' | 'mission' | 'learn' | 'legacy' | 'scenario' | 'survival' | 'impulse';

export interface GoalState {
    id: CharacterGoalId;
    layer: GoalLayer;
    name: string;
    base: number;
    dynamic: number;
    tension: number;
    frustration: number;
    sacred: boolean;
    blocked: boolean;
    priority: number;
    weight: number;
    activation_score: number;
    deonticFit: number;
    conflictingGoalIds: string[];
    domain: string;
    origin: string;
    is_active: boolean;
    satisfaction: number;
    targetId?: string;
    effect_profile?: any;
    directSupport?: number;
    contextSources?: string[];
    baseWeight?: number;
}

export interface ActiveGoal extends GoalState {
    // Alias or extension
}

export interface GoalEcology {
  execute: GoalState[];
  latent: GoalState[];
  queue: GoalState[];
  drop: GoalState[];
  tension: number;
  frustration: number;
  conflictMatrix: Record<string, string[]>;
  groupGoals: any[];
  cascade?: any;
  lifeGoalDebug?: any | null; // Broadened for complex debug objects
}

export interface AgentActionProfile {
    allowed: Set<string>;
    discouraged: Set<string>;
}

export type ArchetypeMode = 'default' | 'war' | 'social' | 'management' | 'crisis' | 'burnout';
export type ArchetypePhase = 'normal' | 'strain' | 'break' | 'radical' | 'post';

export interface ArchetypeState {
    mixture: Record<string, number>;
    actualId: string;
    actualFit: number;
    shadowId: string | null;
    shadowFit: number;
    shadowActivation: number;
    self: {
        selfMixture: Record<string, number>;
        selfId: string;
        selfConfidence: number;
        selfShadowId: string | null;
        selfShadowWeight: number;
        perceivedAxes?: Record<string, number>;
    };
    currentMode: string;
    phase: ArchetypePhase;
    history: Record<string, number>;
    viability: number;
}

export interface IdentityProfile {
    archetypeObserved: string | undefined;
    archetypeSelf: string | undefined;
    archetypePerceivedBy: Record<string, string>;
    tensionSelfObserved: number;
    tensionSelfGroup?: Record<string, number>;
}

export type AgentFailureMode = 'cognitive_collapse' | 'moral_collapse' | 'social_isolation' | 'burnout' | 'monstro_risk';

export interface AgentFailureState {
    activeModes: AgentFailureMode[];
    atRiskModes: AgentFailureMode[];
    history: { mode: AgentFailureMode; tick: number; resolved: boolean }[];
}

export interface NarrativeSlot {
    episodeId: string;
    interpretation: 'normal' | 'chaos' | 'unfair' | 'betrayal' | 'heroism' | 'order' | 'internal';
    perceivedCause: string;
    perceivedLesson: string;
    impactOnValues: any;
    impactOnToM: any;
}

export interface NarrativeIdentity {
    role: 'hero' | 'martyr' | 'savior' | 'monster' | 'tool' | 'observer' | 'victim';
    plot: 'redemption' | 'revenge' | 'duty' | 'survival' | 'decay';
    tensionWithObserved?: number;
}

export interface EpisodeMeta {
    harmDone: number;
    betrayal: number;
    deceit: number;
    selfSacrifice: number;
    savedOthers: number;
    obeyedOrder: number;
    defiedSystem: number;
    survivedAgainstOdds: number;
}

export interface Episode {
    id: string;
    ownerId: string;
    ticks: { start: number; end: number };
    mainActors: string[];
    summary: string;
    tags: string[];
    emotionalValence: number;
    intensity: number;
    observations: Observation[];
    meta?: EpisodeMeta;
}

export interface NarrativeState {
    episodes: Episode[];
    narrative: NarrativeSlot[];
    maxNarrativeLength: number;
}

export interface TraumaLoad {
    self: number;
    others: number;
    world: number;
    system: number;
}

// Deprecated in favor of lib/emotions/types.ts AffectState, but kept for legacy
export interface AffectStateLegacy {
    valence: number;
    arousal: number;
    fear: number;
    anger: number;
    shame: number;
    trustBaseline: number;
    // Computed props
    hope?: number;
    exhaustion?: number;
}

export interface MassMembership {
    [nodeId: string]: number; // weight
}

export interface ExposureTraces {
    E_threat: number;
    E_betrayal_leader: number;
    E_betrayal_peer: number;
    E_helpless: number;
    E_chaos: number;
    E_loss: number;
    E_secrecy: number;
    E_scarcity: number;
    E_humiliation: number;
    E_care_load: number;
    E_system_arbitrariness: number;
    E_mastery_success: number;
}

export interface Worldview {
    world_benevolence: number;
    people_trust: number;
    system_legitimacy: number;
    predictability: number;
    controllability: number;
    fairness: number;
    scarcity: number;
    meaning_coherence: number;
}

export interface DistortionProfile {
    trustBias: number;
    threatBias: number;
    selfBlameBias: number;
    controlIllusion: number;
    blackWhiteThinking: number;
    catastrophizing: number;
    discountingPositive: number;
    personalization: number;
    mindReading: number;
    confirmationBias?: number;
}

export interface CopingProfile {
    avoid: number;
    hyperControl: number;
    aggression: number;
    selfHarm: number;
    helper: number;
}

export interface AttachmentProfile {
    secure: number;
    anxious: number;
    avoidant: number;
    disorganized: number;
}

export interface ResilienceProfile {
    tolerancePowerlessness: number;
    futureHorizon: number;
}

export interface MoralDissonance {
    windowSize: number;
    valueBehaviorGapTotal: number;
    valueBehaviorGapSelf: number;
    valueBehaviorGapOthers: number;
    valueBehaviorGapSystem: number;
    valueBehaviorGap?: number;
    guilt: number;
    shame: number;
    perAxis: any[];
}

export interface AgentPsychState {
    coping: CopingProfile;
    distortion: DistortionProfile;
    narrative: NarrativeIdentity;
    attachment: AttachmentProfile;
    moral: MoralDissonance;
    resilience: ResilienceProfile;
    worldview: Worldview;
    exposures: ExposureTraces;
    selfGap: number;
    shame?: number;
    guilt?: number;
    shadowActivation?: number;
    sysMode: 'SYS-1' | 'SYS-2';
    trauma: TraumaLoad;
    activeGoalModifiers?: Record<string, number>;
    // --- Cognitive / activity metrics (derived, 0..1) ---
    thinking?: ThinkingProfile;
    activityCaps?: ActivityCaps;
    // Cognitive profile (character-sheet + light posterior)
    cognition?: CognitionProfile;
}

// --- Cognitive profile (characteristics shown on Character Card) ---
export type ThinkingAxisA = 'enactive' | 'imagery' | 'verbal' | 'formal';
export type ThinkingAxisB = 'deductive' | 'inductive' | 'abductive' | 'causal' | 'bayesian';
export type ThinkingAxisC = 'intuitive' | 'analytic' | 'metacognitive';
export type ThinkingAxisD = 'understanding' | 'planning' | 'critical' | 'creative' | 'normative' | 'social';

export interface ThinkingProfile {
    representation: Record<ThinkingAxisA, number>;
    inference: Record<ThinkingAxisB, number>;
    control: Record<ThinkingAxisC, number>;
    function: Record<ThinkingAxisD, number>;
    dominantA: ThinkingAxisA;
    dominantB: ThinkingAxisB;
    dominantC: ThinkingAxisC;
    dominantD: ThinkingAxisD;
    metacognitiveGain: number;
}

export interface ActivityCaps {
    operations: number;
    actions: number;
    activity: number;
    reactive: number;
    proactive: number;
    regulatory: number;
    reflective: number;
    sensorimotor: number;
    instrumental: number;
    communicative: number;
    constructor: number;
    creative: number;
    normative: number;
    existential: number;
}

// Extra scalars that drive "plan vs act now"
export interface ActionDispositionScalars {
    futureHorizon: number;           // E
    uncertaintyTolerance: number;    // F
    normPressureSensitivity: number; // G
    actionBiasVsFreeze: number;      // H (1 = act, 0 = freeze)
    // --- Thinking resources (R1–R3) ---
    confidenceCalibration: number;   // R1: how well confidence tracks reality / updates
    executiveCapacity: number;       // R2: working-memory + inhibition + sustained control
    experimentalism: number;         // R3: tendency to run small tests / probes vs theorize or freeze
}

export interface PolicyKnobs {
    planFirst: number;
    actNow: number;
    probeAndUpdate: number;
}

export interface CognitionEvidence {
    // 0..1 evidence extracted from recent observed behavior
    planRate?: number;
    actRate?: number;
    probeRate?: number;
    waitRate?: number;
    sampleSize?: number;
}

export interface CognitionProfile {
    prior: {
        thinking: ThinkingProfile;
        activityCaps: ActivityCaps;
        scalars: ActionDispositionScalars;
        policy: PolicyKnobs;
        debug?: {
            predicates?: Record<string, number>;
            repScoresRaw?: Record<string, number>;
        };
    };
    posterior?: {
        thinking: ThinkingProfile;
        activityCaps: ActivityCaps;
        scalars: ActionDispositionScalars;
        policy: PolicyKnobs;
        evidence?: CognitionEvidence;
    };
}

export interface ContextGoal {
    id: string;
    score: number;
    // ...
}

export interface AgentGoalState {
    goalId: string;
    basePriority: number;
    tension: number;
}

export interface AgentState extends CharacterEntity {
    id: string; // Cannonical ID
    pos: Vec2; // Canonical Position
    hp: number;
    S: number;
    v: number;
    mode?: string;
    behavioralParams: CharacterParams;
    rngChannels: { decide: any, physio: any, perceive: any };
    goalIds: string[];
    w_eff: number[];
    wSelfBase?: number[];
    drivingGoalId?: CharacterGoalId;
    drivingGoalState?: any;
    locationId?: string;
    position?: { x: number; y: number };
    factionId?: string;
    relationships: Record<string, Relationship>;
    acquaintances?: Record<string, AcquaintanceEdge>;
    perceivedStates: Map<string, any>;
    /**
     * Long-term memory of observed facts (optional for legacy compatibility).
     */
    memory?: AgentMemory;
    pendingProposals: any[];
    actionHistory: { id: SocialActionId, targetId?: string }[];
    v42metrics?: V42Metrics;
    tomMetrics?: ToMDashboardMetrics;
    tomV2Metrics?: ToMV2DashboardMetrics;
    derivedMetrics?: DerivedMetrics;
    latents: Record<string, number>;
    quickStates: Record<string, number>;
    fieldMetrics?: any;
    planState?: PlanState;
    cognitiveBudget?: number;
    useSystem1?: boolean;
    currentAction?: Action;
    goalEcology?: GoalEcology;
    goalWeights?: Partial<Record<CharacterGoalId, number>>;
    /**
     * Optional live-tuning overrides for goal scoring (GoalLab / SimKit).
     * Contract:
     *  - logit' = logit * slope + bias (goal-level and category-level)
     *  - veto disables a goal by forcing its logit to a large negative value
     */
    goalTuning?: GoalTuningConfig;
    contextGoals?: any[]; // AgentGoalState[] | ContextGoal[]
    actionProfile?: AgentActionProfile;
    psych?: AgentPsychState;
    archetype?: ArchetypeState;
    identityProfile?: IdentityProfile;
    failureState?: AgentFailureState;
    narrativeState?: NarrativeState;
    archetypeTension?: number;
    temperature: number;
    gumbelScale?: number;
    processNoiseSigma?: number;
    N_ema: number; H_ema: number; C_ema: number;
    xi: number; sigma_xi_sq: number;
    stress_ema_delta?: number; arousal_ema_delta?: number;
    J_ema?: number; post_shock_timer?: number; assimilation_timer?: number; J_positive_ema?: number;
    burnout_condition_days?: number; dark_condition_days?: number; apophenia_condition_days?: number; corruption_condition_days?: number;
    moral_injury_ema?: number; allostatic_load?: number; resilience_growth?: number;
    lastActionId?: SocialActionId;
    repeatCount?: number;
    lastSignificantTick?: number;
    route_belief?: number;
    route_source?: string;
    influence?: number;
    prMonstro?: number;
    W_S?: number[]; W_L?: number[]; W_S_hat?: number[]; W_L_hat?: number[]; W_S_lag?: number[]; W_L_lag?: number[];
    phiS_vec?: number[]; phiL_vec?: number[]; masksS?: number[]; masksL?: number[]; alphaL?: number[]; alphaS?: number[];
    intent_idx?: number;
    intent_idx_lag?: number;
    intent_id?: string;
    flags?: Record<string, any>;
    trauma?: TraumaLoad;
    traumaIntegration?: { processedFraction: number };
    roleDistributionSelf?: any;
    affect?: AffectState;
    effectiveRole?: string;
    massMembership?: MassMembership;
    massNodeId?: string;
    // Temp/Legacy fields
    baseTemperature?: number;
    baseSigmaProc?: number;
    kappa_T?: number;
    capabilities?: Record<string, number>; // From CharacterEntity but often accessed directly
}

export type CharacterState = AgentState; // Alias

// --- World ---

export interface LeadershipState {
    currentLeaderId: string | null;
    leaderScore: number;
    lastChangeTick: number;
    changeCount: number;
    legitimacy: number;
    contestLevel: number;
    supportScores?: Record<string, number>;
    betterStreak?: number;
    lastBestId?: string | null;
    leaderScores?: Record<string, number>;
}

export interface Faction {
    id: string;
    name: string;
    hostility?: Record<string, number>;
    leaderId?: string;
}

export interface ScenarioState {
    scenarioDef: ScenarioDef;
    metrics: SceneMetrics;
    currentPhaseId?: string;
    tick?: number;
    done?: boolean;
    outcome?: { outcome: string; summary: string };
    locationId?: string;
    contextTuning?: ContextTuning;
}

export interface ScenarioPhaseDef {
    id: string;
    label: string;
    description?: string;
    missionGoalWeights?: Record<string, number>;
    preferredActions?: string[];
    panicActions?: string[];
    allowedActionTags?: string[];
    bannedActionTags?: string[];
    entryCondition?: (m: any) => boolean;
    exitCondition?: (m: any) => boolean;
}

export interface ActionEffectDef {
    actionId: string;
    metricDelta?: Record<string, number>;
    roleBonus?: Record<string, number>;
}

export interface RoleSlotDef {
    roleId: string;
    count: number;
    capabilityProfile: any;
    goalProfile: any;
}

export interface SceneTopology {
    nodes: { id: string; label: string; description?: string }[];
    edges: { from: string; to: string; type: string }[];
}

export interface ScenarioDef {
    id: string;
    title: string;
    phases?: ScenarioPhaseDef[];
    metrics: Record<string, { min: number; max: number; initial: number }>;
    actionEffects?: ActionEffectDef[];
    evaluateOutcome?: (m: any, w: any) => any;
    sceneGoals?: any[];
    roleSlots: RoleSlotDef[];
    phasePriorities?: Record<string, string[]>;
    objectives?: Record<string, Record<string, number>>;
    topology?: SceneTopology;
    defaultRoles?: Record<string, string>;
    contextConfig?: any; // ScenarioConfig
    globalGoalModifiers?: Record<string, number>;
}

export type MassNodeId = string;

export interface MassNodeParams {
  tau: number;
  bias: number;
  gain: number;
  noiseScale: number;
}

export interface MassNodeState {
  id: MassNodeId;
  label: string;
  x: number;
  params: MassNodeParams;
}

export interface MassNetwork {
  nodes: Record<MassNodeId, MassNodeState>;
  nodeOrder: MassNodeId[];
  W: number[][]; // матрица весов [to][from]
}

export interface MassNodeParamsEI {
  tauE: number;
  tauI: number;
  biasE: number;
  biasI: number;
  gainE: number;
  gainI: number;
  noiseScaleE: number;
  noiseScaleI: number;
}

export interface MassNodeStateEI {
  id: MassNodeId;
  label: string;
  E: number;
  I: number;
  params: MassNodeParamsEI;
}

export interface MassNetworkEI {
  nodes: Record<MassNodeId, MassNodeStateEI>;
  nodeOrder: MassNodeId[];
  // Матрицы весов [to][from]
  W_EE: number[][];
  W_EI: number[][];
  W_IE: number[][];
  W_II: number[][];
}

export interface SystemEntity {
    health: number;
    stability: number;
    guardians: string[];
    // ...
}

export interface CharacterDebugSnapshot {
    id: string;
    name: string;
    stress?: number;
    prMonstro?: number;
    archetypeObserved?: string;
    archetypeSelf?: string;
    archetypePhase?: string;
    identityTension?: number;
    shadowId?: string;
    shadowActivation?: number;
    tomQuality?: number;
    tomUncertainty?: number;
    tomMode?: string;
    topRelations: { targetId: string; targetName: string; trust: number }[];
    activeFailureModes: string[];
    lastEpisodes: any[];
    psych?: any;
}

export interface WorldDebugSnapshot {
    tick: number;
    aggregates?: {
        meanStress?: number;
        meanPrMonstro?: number;
        shareStrain?: number;
        shareBreak?: number;
        meanInstitutionLegitimacy?: number;
        meanSystemStability?: number;
    };
    systems: any[];
    factions: any[];
    characters: CharacterDebugSnapshot[];
    lastWorldEpisode?: WorldEpisode;
}

export type KanonarReportKind = 'alert' | 'trend' | 'situation';

export interface KanonarRiskItem {
    id: string;
    label: string;
    level: number;
    drivers: string[];
}

export interface KanonarRecommendation {
    id: string;
    label: string;
    rationale: string;
    suggestedPolicyId?: string;
}

// Added missing KanonarMetricSnapshot definition
export interface KanonarMetricSnapshot {
    meanS: number;
    meanStress: number;
    darkShare: number;
    meanTrust?: number;
    meanConflict?: number;
    factionPolarization?: number;
    leaderChangeRate?: number;
    leaderContestLevel?: number;
    extra: Record<string, any>;
}

export interface KanonarReport {
    id: string;
    tick: number;
    kind: KanonarReportKind;
    summary: string;
    details: string;
    windowSize: number;
    metrics: KanonarMetricSnapshot;
    risks: KanonarRiskItem[];
    recommendations: KanonarRecommendation[];
}

export interface ScenarioContextState {
  atoms: any; // ContextAtomsState
  norms: any[]; // NormRule[]
  activePhase?: any; // ScenarioPhaseState
  phaseHistory: any[];
  sceneMetrics: {
      events_total?: number;
      threat_level?: number;
      social_tension?: number;
      cooperation?: number;
      disobedience_count?: number;
      [key: string]: number | undefined;
  };
}

export interface Order {
    id: string;
    tickIssued: number;
    fromId: string;
    toId: string;
    requiredActionId: string;
    linkedGoalId?: string;
    priority: number;
    deadlineTick: number;
    status: 'pending' | 'accepted' | 'refused' | 'completed' | 'expired';
    kind: string;
    summary?: string;
    createdAtTick: number;
}

export interface WorldEpisodeAction {
    actorId: string;
    actionId: string;
    targetId?: string;
    qTotal?: number;
    successProb?: number;
    successRealized?: number;
    topGoalId?: string;
}

export interface WorldEpisode {
    tick: number;
    sceneId?: string;
    phaseId?: string;
    actions: WorldEpisodeAction[];
    relationsSnapshot?: any;
    sceneMetrics?: any;
    leadership?: any;
    stabilitySummary?: {
        meanS?: number;
        meanStress?: number;
        darkShare?: number;
    };
}

export interface ScenarioLayout {
    scenarioId: string;
    zones: any[];
}

export interface ScenarioZone {
    id: string;
    locationIds: string[];
}

export interface RelationsGraphEdge {
    fromId: string;
    toId: string;
    bond?: number;
    conflict?: number;
}

export interface RelationsGraph {
    edges: RelationsGraphEdge[];
}

export interface Policy {
    id: string;
    name: string;
    effects: {
        maxPrMonstro?: number;
        resourceBias?: boolean;
    };
    legitimacyImpact?: {
        delta: number;
        target: 'global';
    };
}

export interface DecisionReport {
    policyId: string;
    deltaRisk: number;
    rationale: string[];
}

export interface HelpOffer {
    id: string;
    fromId: string;
    toId: string;
    tick: number;
    actionId: string;
    kind: 'emotional' | 'practical';
}

export interface SystemEpisode {
    tick: number;
    sceneId?: string;
    actors: string[];
    actionId?: string;
    outcome?: string;
    metrics_snapshot: {
        avgStress: number;
        avgDark: number;
        avgRisk: number;
    };
}

export interface SceneRoleSlot {
    role: string;
    holderId: string | null;
    required: boolean;
}

export interface SceneRoleState {
    groupId: string;
    slots: SceneRoleSlot[];
    structure: 'hierarchical' | 'flat' | 'anarchic';
}

// Domain Event
export interface DomainEvent {
    id: string;
    t: number;
    actorId: string;
    targetId?: string;
    actionId: string;
    intensity: number;
    domain: string;
    polarity: number;
    ctx?: {
        scenarioKind?: string;
        public?: boolean;
        locationId?: string;
    };
    meta?: any;
    locationId?: string;
    effects?: any;
    epistemics?: any;
    tags?: string[];
}

export type WorldEvent = {
  id: string;
  tick: number;
  kind: string; // broadened from EventKind to string to avoid circular or strict issues with legacy code
  actorId: string;
  targetId?: string;
  magnitude?: number;    // 0..1 severity / impact
  context?: {
    locationId?: string;
    sceneId?: string;
    protocolId?: string;
  };
  meta?: Record<string, any>;
};

export type EventLog = {
  schemaVersion: number;
  events: DomainEvent[]; // Changed from WorldEvent to DomainEvent to match engine output
};

export interface WorldState {
    tick: number;
    agents: AgentState[];
    locations: LocationEntity[];
    context?: string;
    threats?: any[];
    tom?: TomState;
    groupGoalId?: string;
    leadership: LeadershipState;
    factions?: Faction[];
    initialRelations: Record<string, any>;
    scene?: ScenarioState;
    scenario?: ScenarioDef;
    massNetwork?: MassNetwork;
    massNetwork_ei?: MassNetworkEI;
    gilParams?: any;
    observations?: Record<string, any[]>;
    systemEntities?: SystemEntity[];
    debugSnapshots?: WorldDebugSnapshot[];
    kanonarReports?: KanonarReport[];
    scenarioContext?: ScenarioContextState;
    contextEx?: any; // ContextSlice
    contextV2?: Record<string, any>;
    /** Context-conditioned ToM/emotion memory (smoothing across ticks). */
    contextualMind?: ContextualMindState;
    orders?: Order[];
    leadershipOffers?: { from: string, to: string, tick: number }[];
    actionsThisTick?: string[];
    flags?: Record<string, any>;
    worldEpisodes?: WorldEpisode[];
    maps?: LocationMap[];
    scenarioLayouts?: ScenarioLayout[];
    relations?: RelationsGraph;
    activePolicies?: string[];
    policies?: Policy[];
    meta?: any;
    helpOffers?: HelpOffer[];
    allGoals?: any[];
    engineMode?: 'legacy' | 'context' | 'hybrid';
    simulationEnded?: boolean;
    scenarioProcedures?: Record<string, Record<string, number>>;
    systemEpisodes?: SystemEpisode[];
    sceneRoles?: Record<string, SceneRoleState>;
    
    // NEW
    eventLog?: EventLog;
}

// --- Simulation Runner Types ---
export interface SimulationMeta {
  key: string;
  title: string;
  mode: string;
  description: string;
  payload: any;
  isCharacterCentric?: boolean;
}

export interface FitnessScenario {
    key: string;
    title: string;
    supportedTypes: string[];
    calculateFitness: (entity: any, metrics: any, params: any) => { score: number, status: 'ok' | 'fail' | 'warn', checks: any[] };
}

export interface ScenarioFitnessResult {
    key: string;
    title: string;
    score: number;
    status: 'ok' | 'fail' | 'warn';
    checks: { description: string, passed: boolean }[];
}

export interface CalculatedMetrics {
    S: number;
    Pv: number;
    Vsigma: number;
    v: number;
    stability: StabilityBreakdown;
    Opt: number;
    drift: number;
    topo: number;
    influence: number;
    prMonstro: number;
    monster_veto: boolean;
    dose: number;
    stress: number;
    darkness: number;
    fatigue: number;
    scenarioFitness: ScenarioFitnessResult[];
    simulationData: SimulationPoint[];
    vsigma_components?: any;
    // Extra
    E?: number;
    Debt?: number;
    analytics?: any;
    v42metrics?: V42Metrics;
    tomMetrics?: ToMDashboardMetrics;
    tomV2Metrics?: ToMV2DashboardMetrics;
    derivedMetrics?: DerivedMetrics;
    behavioralAdvice?: BehavioralAdvice;
    fieldMetrics?: any;
    donorshipPropensity?: number;
    followershipPropensity?: number;
    psych?: AgentPsychState;
    archetypeGoalBoosts?: Record<string, number>;
}

export interface StabilityBreakdown {
    R: number; H: number; K: number; M: number; U: number; O: number; Gplus: number; 
    H_core: number; H_tail: number; H_budget: number; H_misalign: number;
    S_ss: number; Pv: number; Vsigma: number; DS: number; DR: number;
    N_pillar?: number; H_pillar?: number; C_pillar?: number;
    mu?: number; kappa?: number; h?: number; S_star?: number;
    scenario_S?: number;
}

export interface SimConfig {
    horizonDays: number;
    dt: number;
    ensemble: number;
    rngSeed: number;
    blackSwans: BlackSwanEvent[];
}

export interface SimulationRun {
    seed: number;
    series: SimulationPoint[];
}

export interface SimulationOutput {
  mean: SimulationPoint[];
  runs: SimulationRun[];
  initialState: AgentState; // Specified as AgentState
  finalStates: AgentState[]; // Specified as AgentState
  analytics: any;
}

export interface SimulationPoint {
    day: number;
    S: number;
    v?: number;
    stress?: number;
    fatigue?: number;
    mu?: number;
    kappa?: number;
    h?: number;
    S_star?: number;
    N?: number;
    H_p?: number;
    C?: number;
    shock?: number;
    Pv?: number;
    Vsigma?: number;
    mode?: string;
    deltaS_inertia?: number;
    deltaS_restoring?: number;
    deltaS_destroyer?: number;
    deltaS_shock?: number;
    S_mean?: number;
    S_cvar10?: number;
    bands?: { p05: number, p50: number, p95: number };
    varianceS?: number;
    weakest_link?: string;
    allostatic_load?: number;
    resilience_growth?: number;
    debts?: { attention: number; risk: number; social: number };
}

export interface BlackSwanEvent {
    id: string;
    day: number;
    label: string;
    channels: {
        stress: number;
        dark: number;
        vislag_days: number;
        budget_overrun: number;
        topo_break: number;
    };
}

export interface BehavioralAdvice {
    recommendation: string;
    description: string;
    contributingMetrics: { name: string, value: number }[];
}

// --- Specific Simulation Types ---
export interface NegotiationScenario {
    counterparties: Counterparty[];
    missions: Mission[];
}

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
    valueModel: string;
    deadlineDays: number;
    stakes: number;
}

export interface EnvoyResult {
    id: string;
    entity: CharacterEntity;
    score: number;
    metrics: NegotiationMetrics;
}

export interface NegotiationMetrics {
    dealProb: number;
    expectedDealValue: number;
    cvar10: number;
    timeToDealAvg: number;
    scandalProb: number;
    postDelta: { pv: number; vsigma: number; stress: number; S7: number; S30: number };
    simulationRuns: any[];
}

// --- Social Graph Types ---
export interface SocialGraphNode {
    id: string;
    kind: string;
}

export interface SocialGraphEdge {
    source: string;
    target: string;
    w: number;
    relation: string;
}

export interface SocialGraph {
    nodes: SocialGraphNode[];
    edges: SocialGraphEdge[];
}

export interface Source {
    id: string;
    type: string;
    name: string;
    reliability: number;
    bias: number;
}

export interface Evidence {
    id: string;
    statement: string;
    source: { id: string; type: string };
    confidence: number;
    relevance: string[];
    date: string;
}

export interface LintIssue {
    id: string;
    entityId: string;
    entityTitle: string;
    type: string;
    severity: 'error' | 'warn' | 'info';
    message: string;
    location: string;
}

export interface CharacterGoalPreset {
    id: string;
    label: string;
    weights: Record<string, number>;
}

export interface SceneMetrics {
    tick: number;
    threat: number;
    timer: number;
    discipline: number;
    cohesion: number;
    wounded_total: number;
    wounded_unsorted: number;
    wounded_stable: number;
    wounded_evacuated: number;
    wounded_dead: number;
    evac_total: number;
    evac_done: number;
    evac_missed: number;
    route_known: number;
    conflict: number;
    legitimacy: number;
    consensus: number;
    consensus_streak?: number;
    evac_started?: number;
    structuralDamage?: number;
    panic?: number;
}

export interface ScenarioOutcome {
    outcome: string;
    summary: string;
}

export interface ActionStyleTag {
    // just string alias for now
}

// --- Goal Engine ---
export interface GoalMeta {
    id: string;
    value?: number;
    deadline?: number;
    min_lock?: number;
    tags?: string[];
    softban_lambda?: number;
    level: "L" | "S";
    oath_mask?: boolean;
    affinity?: any;
}

export interface CharacterGoalDef {
    id: CharacterGoalId;
    label_ru: string;
    kind: string;
    donatable: boolean;
    leaderBias: number;
    allowedActions: string[];
    domains: string[];
}

export interface ActionGoalLink {
    goalId: string;
    match: number;
}

export interface GoalTemplate {
    id: string;
    name?: string; // some have name
    kind: string;
    value: number;
    domain: string;
    origin: string;
    horizon: string;
    level: string;
    activation: any;
    gates: string[];
    effects_ok: any;
    effects_fail: any;
    side_effects?: any;
    p_success_components: any;
    cost: any;
    cost_model?: any;
    effect_profile?: any;
    profile_shape?: string;
    tags: string[];
    default_intensity: number;
    default_years_ago: number;
    default_valence: number;
    goal_impulses: any[];
    hard_caps?: any[];
    lifeGoalWeights?: Record<string, number>;
    deltas?: any;
}

// --- Story Card ---
export interface StoryBeat {
    from: number;
    to: number;
    z: any;
    cost_mod?: any;
    shocks?: any;
}

export interface StoryCard {
    id: string;
    title: string;
    scenarioId: string;
    horizon_steps: number;
    beats: StoryBeat[];
    resources: any;
    // ...
}

export interface RunLog {
    t: number;
    action: string;
    Q: number;
    cost: number;
    T: number;
    S: number;
    Pv: number;
    dose: number;
    D: number;
    A: number;
    control: number;
    shocks: number;
    phiSum: number;
}

export interface MatrixRunResult {
    sid: string;
    strategy: string;
    seed: number;
    logs: Record<string, RunLog[]>;
    outcome?: any;
}

export interface Strategy {
    id: string;
    patch: (agent: any) => void;
    actionBias: (Q: number, action: any, agent?: any) => number;
}

export interface QBreakdown {
    total: number;
    fromGoals: number;
    fromScenario: number;
    fromRelations: number;
    fromProcedure: number;
    fromFaction: number;
    fromLeader: number;
    fromArchetype: number;
    fromRole: number;
    fromRisk: number;
    fromPsych: number;
    cost: number;
    repetitionPenalty: number;
    stagnationPenalty: number;
    alpha: number;
    weighted?: any;
}

// --- NEW/MISSING TYPES INFERRED FROM ERRORS ---

export interface NarrativeLogLine {
    tick: number;
    text: string;
    tooltip?: string;
}

export interface DevLogLine {
    tick: number;
    category: string;
    meta: any;
}

// Simulation Events
export type SimulationEvent = 
    | { kind: 'TickStart', tick: number }
    | LeaderChangedEvent
    | ActionChosenEvent
    | ActionAppliedEvent
    | SceneMetricsUpdatedEvent
    | TomUpdatedEvent
    | RelationshipSnapshotEvent
    | RoleAssignedEvent
    | RoleClaimedEvent
    | RoleProposedEvent
    | RoleResponseEvent
    | SceneOutcomeEvent
    | KanonarReportEvent;

export interface BaseEvent {
    tick: number;
}

export interface LeaderChangedEvent extends BaseEvent {
    kind: 'LeaderChanged';
    oldLeaderId: string | null;
    newLeaderId: string;
    explanation: string;
    leaderScores?: Record<string, number>;
    score?: number;
}

export interface ActionChosenEvent extends BaseEvent {
    kind: 'ActionChosen';
    actorId: string;
    actionId: string;
    targetId?: string;
    topGoalId?: string;
    probability: number;
    goalContribs?: Record<string, number>;
    scoreBreakdown: any;
    alpha?: number;
    archetypeContext?: any;
    qTotal?: number;
    args?: any;
    planId?: string | null;
    causeAtomId?: string | null;
}

export interface ActionAppliedEvent extends BaseEvent {
    kind: 'ActionApplied';
    actorId: string;
    actionId: string;
    targetId?: string;
    success: number;
    bodyDelta?: any;
    outcome?: ActionOutcome;
    sceneDelta?: any;
    args?: any;
    planId?: string | null;
    causeAtomId?: string | null;
}

export interface SceneMetricsUpdatedEvent extends BaseEvent {
    kind: 'SceneMetricsUpdated';
    deltas: any;
}

export interface TomUpdatedEvent extends BaseEvent {
    kind: 'TomUpdated';
    observerId: string;
    targetId: string;
    newTrust?: number;
    // ...
}

export interface RelationshipSnapshotEvent extends BaseEvent {
    kind: 'RelationshipSnapshot';
    snapshot: any;
}

export interface RoleAssignedEvent extends BaseEvent {
    kind: 'RoleAssigned';
    actorId: string;
    role: string;
}

export interface RoleClaimedEvent extends BaseEvent {
    kind: 'RoleClaimed';
    actorId: string;
    role: string;
}

export interface RoleProposedEvent extends BaseEvent {
    kind: 'RoleProposed';
    fromId: string;
    toId: string;
    role: string;
}

export interface RoleResponseEvent extends BaseEvent {
    kind: 'RoleResponse';
    fromId: string;
    role: string;
    response: string;
}

export interface SceneOutcomeEvent extends BaseEvent {
    kind: 'SceneOutcome';
    meta: { success: boolean; reason: string };
}

export interface KanonarReportEvent extends BaseEvent {
    kind: 'KanonarReport';
    report: KanonarReport;
}

// Action
export interface Action {
    id: string;
    name: string;
    targetId?: string;
    tags?: string[];
    cost?: any;
    narrative_verb?: string;
    goalImpact?: Record<string, number>;
    satisfies?: any;
    targetMode?: 'character' | 'role' | 'group' | 'none';
    styleTags?: string[];
    preconditions?: ((ctx: any) => boolean)[];
    isAvailable?: (ctx: any) => boolean;
    generateArgs?: (ctx: any) => any;
    narrativeTemplate?: string;
    category?: string;
    aggression?: string;
    adequacy?: string;
    tone?: string;
    allowedFor?: string[];
    requires?: any;
    applyScene?: (ctx: any) => void;
}

export interface ActionOutcome {
    actorId: string;
    intention: Intention;
    result: string;
    description: string;
    explanation: string;
    success: number;
    sceneDelta?: any;
    bodyDelta?: any;
    ordersIssued?: Order[];
}

export interface Intention {
    id: string;
    targetId?: string;
    tags?: string[];
    name?: string;
    narrative_verb?: string;
    cost?: any;
    planId?: string | null;
    causeAtomId?: string | null;
    args?: any;
    applyScene?: any;
}

export interface Proposal {
    type: string;
    from: string;
}

// Archetype Data
export interface ArchetypeData {
    name: string;
    description: string;
    tagline?: string;
    summary?: string;
    system_gain?: number;
    pressure_relief?: number;
    goals?: { primary: ArchetypeGoalInfo };
}

export interface ArchetypeGoalInfo {
    axes: Record<GoalAxisId, number>;
    scope: string;
    time_horizon: string;
    description: string;
}

export interface FullArchetypeInfo {
    id: string;
    lambda: string;
    f: number;
    mu: string;
    data: ArchetypeData;
    metrics: Record<string, number>;
    distance: number; // for fitting
}

export interface ArchetypeLayers {
    kH: FullArchetypeInfo | null;
    kD: FullArchetypeInfo | null;
    kO: FullArchetypeInfo | null;
}

export interface ShadowMode {
    actual: FullArchetypeInfo | null;
    self: FullArchetypeInfo | null;
    shadow: FullArchetypeInfo | null;
    pressure: number;
    shadow_strength: number;
    shadow_activation_prob: number;
}

export interface AxisShift {
    axisId: string;
    direction: number;
    weight: number;
}

// Life Goal Engine Types
export interface LifeGoalComponents {
    g_traits: Record<string, number>;
    g_bio: Record<string, number>;
    g_psych: Record<string, number>;
    g_archetype_main: Record<string, number>;
    g_archetype_shadow: Record<string, number>;
    g_worldview: Record<string, number>;
    g_distortion: Record<string, number>;
    weights: { wT: number; wB: number; wP: number };
    temperature: number;
    worldview: Worldview;
    exposureTraces: ExposureTraces;
    psych_details: any;
    distortions: DistortionProfile;
}

export interface GoalComponentContrib {
    name: string;
    value: number;
    weight: number;
    contribution: number;
}

export interface RecvScoreComponent {
    name: string;
    value: number;
    weight: number;
    contribution: number;
    tooltip?: string;
}

export interface ToMReport {
    observer: CharacterEntity;
    target: CharacterEntity;
    donationProbability: number;
    recvScore: number;
    recvScoreBreakdown: RecvScoreComponent[];
    trust: number;
    goalAlignment: { cosine: number };
    normConflict: number;
}

export interface AggregatedMetrics {
    totalRuns: number;
    success_rate: number;
    avg_rescued: number;
    avg_dead: number;
    avg_t_end: number;
    outcome_dist: Record<string, number>;
}

export interface InteractionMetrics {
    trust: number;
    credibility: number;
    deceptionRisk: number;
    normConflict: number;
    goalAlignment: GoalAlignmentMetrics;
}

export interface GoalAlignmentMetrics {
    cosine: number;
    rankCorrelation: number;
    feasibleOverlap: number;
    compromiseCost: number;
    blockedMass: number;
}

export type MeetingOutcome = 'agreement' | 'partial_agreement' | 'delay' | 'refuse' | 'conflict' | 'successful_deception' | 'failed_deception' | 'coalition';

export interface MeetingResult {
    p1_id: string;
    p2_id: string;
    p1_metrics: FullCharacterMetrics;
    p2_perceived_metrics: FullCharacterMetrics;
    interaction: InteractionMetrics;
    outcomes: { probabilities: any[]; final: MeetingOutcome };
    deltas: { p1: { stress: number; reputation: number }; p2: { stress: number; reputation: number } };
    metrics_snapshot: any;
}

export interface StationaryRelationProbabilities {
    p_follow: number;
    p_donate_goals: number;
    p_task_assign: number;
    p_task_accept: number;
    p_tie_survival: number;
    p_coalition_form: number;
    p_mandate_grant: number;
    p_mandate_revoke: number;
    p_public_endorse: number;
    p_public_distance: number;
    p_deception_by_j: number;
    p_detection_by_i: number;
    p_share_sensitive: number;
    p_compromise: number;
    p_conflict_escalation: number;
    p_posterior_shift: number;
}

export interface StationaryRelation {
    perception: any;
    compatibility: GoalAlignmentMetrics;
    rapport: {
        trust_base: number;
        credcommit_base: number;
        norm_conflict: number;
        volatility: number;
        tie_survival: number;
    };
    influence: {
        edge_weight: number;
        bandwidth_eff: number;
        tx_cost: number;
    };
    probabilities: StationaryRelationProbabilities;
    scores100: {
        relation_strength: number;
        alignment_quality: number;
        relation_stability: number;
        reciprocity_balance: number;
        adopt_tendency: number;
        donate_tendency: number;
        task_assign_tendency: number;
        task_accept_tendency: number;
        tx_cost: number;
        uncertainty: number;
    };
}

export interface RelationEdge {
    // Placeholder if needed by graph, mostly handled by StationaryRelation
}

export interface MetricModifier {
    id: string;
    source: string;
    kind: 'buff' | 'debuff';
    target: { scope: string; ownerKind: string; path: string };
    label: string;
    delta?: number;
    multiplier?: number;
    description: string;
    iconId?: string;
}

export interface GoalWeightContext {
    // Context for weighting
}

export interface VisualizationPlanStep {
    t0: number;
    t1: number;
    goal: any; // GoalState
    profile_shape: GoalProfileShape;
}

export type GoalProfileShape = 'constant' | 'trapezoid' | 's-curve';

// Context V2 Types (minimal to support imports)
export interface LocalActorRef {
    id: string;
    label: string;
    kind: 'ally' | 'enemy' | 'neutral';
    role?: string;
    distance: number;
    threatLevel?: number;
    isTargetOfEnemy?: boolean;
    needsProtection?: boolean;
    isWounded?: boolean;
}

export interface ContextV2 {
    locationType: string;
    visibility: number;
    noise: number;
    panic: number;
    nearbyActors: LocalActorRef[];
    alliesCount: number;
    enemiesCount: number;
    leaderPresent: boolean;
    kingPresent: boolean;
    authorityConflict: number;
    timePressure: number;
    scenarioKind: string;
    cover: number;
    exitsNearby: number;
    obstacles: number;
    groupDensity: number;
    hierarchyPressure: number;
    structuralDamage: number;
    aggregates?: {
        threatLevel: number;
        socialSupport: number;
        primaryTargetProximity: number;
        crowding: number;
    };
    summary?: any; // Made optional to support partial construction
    atoms?: any[]; // Made optional
    domains?: any; // Made optional
    agentId?: string; // Made optional
}

export interface Sys1Analysis {
    isActive: boolean;
    pressure: number;
    threshold: number;
    breakdown: any;
}

export interface ActionSuggestion {
    // ...
}

export interface Formula {
    // ...
}

// Канонические типы контекстного фрейма берём из v4/frame
export type {
  AgentContextFrame,
  NearbyAgentSummary,
  ContextEventSummary,
  ActiveOrder,
  TomRelationView,
} from './lib/context/frame/types';

export type { ContextAtom } from './lib/context/v2/types';

export type LifeGoalId =
  | 'protect_lives'
  | 'maintain_order'
  | 'seek_status'
  | 'preserve_autonomy'
  | 'serve_authority'
  | 'pursue_truth'
  | 'maintain_bonds'
  | 'seek_comfort'
  | 'self_transcendence'
  | 'accumulate_resources'
  | 'other';

export type LifeGoalVector = Partial<Record<LifeGoalId, number>>;

export interface DialogueTask {
    id: string;
    label: string;
    description: string;
    speakerId: string;
    listenerId: string;
    communicationGoal: string;
    intentDescription: string;
    situationId: string;
}

export interface PlanningTask {
    id: string;
    label: string;
    description: string;
    actorId: string;
    targetGoalId: string;
    intentDescription: string;
    situationId: string;
}

export interface PlanningTaskV4 extends PlanningTask {
    horizon?: number;
    mode?: string;
    possibleActions?: string[];
}

export interface PlanV4 {
    steps: PlanStepV4[];
    expectedUtility: number;
    cognitiveCost: number;
    totalScore: number;
}

export interface PlanningCandidate {
    actionId: string;
    targetId?: string;
    label: string;
    qSys1: number;
    qSys2: number;
    qTotal: number;
    supportedGoals: { goalId: string; weight: number }[];
}

export interface PlanStepV4 {
    tickOffset: number;
    actionId: string;
    targetId?: string;
    expectedUtility: number;
    description: string;
}

export interface PlanningLabResult {
    chosen: PlanningCandidate;
    alternatives: PlanningCandidate[];
    bestPlan?: PlanV4;
}

export type DialogueAtomId = string;
export interface DialogueCandidate {
    atomId: DialogueAtomId;
    label: string;
    qTotal: number;
    supportsGoals: any[];
    assumedListenerGoals: any[];
    predictedEffectOnRelation: string;
}
export interface DialogueLabResult {
    chosen: DialogueCandidate;
    alternatives: DialogueCandidate[];
}

export interface EventEffects {
    worldDelta?: any;
    stateDelta?: any;
    goalDelta?: any;
    tensionDelta?: number;
    // Legacy support
    body?: any;
    vector_base?: any;
    relations?: any;
    norms?: any;
}

export interface EventEpistemics {
  witnesses: string[];
  visibility: number;
  beliefByAgent?: Record<string, {
    seen: boolean;
    confidence: number;
    interpretationTag?: string;
  }>;
  observers?: any[]; // legacy
}

export interface EventStructure {
    // ...
}

export interface EventGoalEffects {
    goal_weights_delta?: Record<string, number>;
}

export interface EventGoalLogits {
    [axis: string]: number;
}

export interface EventParticipants {
    participants: { actorId: string; role: string }[];
}

export interface EventCheck {
    type: string;
    difficulty: number;
    roll?: number;
    success: boolean;
}

export interface SituationSpec {
    id: string;
    label: string;
    description: string;
    scenarioId: string;
    initialEntities: string[];
    tags: string[];
    initialContextAtoms?: any[];
}

export interface EventTemplate {
    id: string;
    name: string;
    kind: string;
    domain: string;
    tags: string[];
    default_intensity: number;
    default_years_ago: number;
    default_valence: number;
    default_duration_days?: number;
    default_surprise?: number;
    default_controllability?: number;
    default_responsibility_self?: number;
    goal_impulses: any[];
    lifeGoalWeights?: Record<string, number>;
    deltas?: any;
}

export interface Mandate {
    id: string;
    title: string;
    family: string;
    action: string;
    scope: any;
    preconditions: string;
    limits: any;
    cost_model: any[];
    required_roles: any;
    co_signatures: any;
    veto_roles: any;
    version_gates: Branch[];
    audit_level: string;
    cooldown: string;
    rollback_window: string;
    fail_modes: string[];
}

export interface FullCharacterMetrics {
    modifiableCharacter: AgentState;
    eventAdjustedFlatParams: Record<string, number>;
    latents: Record<string, number>;
    quickStates: Record<string, number>;
    derivedMetrics: DerivedMetrics | null;
    goalEcology: GoalEcology | null;
    tomMetrics: ToMDashboardMetrics | null;
    v42metrics: V42Metrics | null;
    tomV2Metrics: ToMV2DashboardMetrics | null;
    behavioralAdvice?: BehavioralAdvice;
    fieldMetrics: any;
    donorshipPropensity: number;
    followershipPropensity: number;
    psych?: AgentPsychState;
    archetypeGoalBoosts: Record<string, number>;
    S: number; Pv: number; Vsigma: number; v: number; stability: StabilityBreakdown;
    Opt: number; drift: number; topo: number; influence: number; prMonstro: number; monster_veto: boolean; dose: number;
    stress: number; darkness: number; fatigue: number;
    scenarioFitness: any[]; simulationData: SimulationPoint[];
    E?: number; Debt?: number; analytics?: any;
}

export interface SocialEventEntity {
    entityId: string;
    t: number;
    type: EntityType.SocialEvent;
    title: string;
    domain: string;
    actorId: string;
    targetId?: string;
    witnessIds: string[];
    polarity: number;
    intensity: number;
    scope: 'private' | 'ingroup' | 'public';
    veracity: number;
    tags: string[];
    versionTags: Branch[];
    locationId?: string;
    effects?: any;
    epistemics?: any;
    structure?: any;
    goalEffects?: any;
    participants?: any;
    security?: EntitySecurity;
    delay_days?: number;
}

export interface AgentMotivationProfile {
    arousal: number;
    stress: number;
    fatigue: number;
    exploration_rate: number;
    social_safety: number;
}

export interface LocationGoalProfile {
    boosts: Record<string, number>;
    suppress: Record<string, number>;
    defaultGoals: string[];
}

export interface ContextAtomsState {
    facts: any[];
    offers: any[];
    commitments: any[];
    plans: any[];
}

export type AtomId = string;

export interface FactAtom {
    id: string;
    kind: 'fact';
    prop: string;
    label: string;
    createdTick: number;
    confidence: number;
    scope: any;
    source: any;
    expiresAt?: number;
    decayPerTick?: number;
    predicate?: string;
    value?: any;
    subjectId?: string;
    objectId?: string;
    sourceId?: string;
    tags?: string[];
    payload?: any;
}

export interface OfferAtom {
    id: string;
    kind: 'offer';
    offerKind: string;
    fromId: string;
    toId: string;
    targetId: string;
    goalId?: string;
    description?: string;
    createdTick: number;
    expiresAt?: number;
    status: string;
    tags: string[];
    scope: any;
    source: any;
    confidence: number;
    payload?: any;
    actorId?: string;
    label?: string;
}

export interface CommitmentAtom {
    id: string;
    kind: 'commitment';
    commitmentKind: string; // произвольный id вида обязательства
    fromId: string;         // кто обязался
    toId: string;           // перед кем
    description?: string;
    goalId?: string;
    strength: number;
    status: 'active' | 'fulfilled' | 'breached' | 'released';
    tags: string[];
    scope: any;
    source: any;
    confidence: number;
    createdTick: number;
    expiresAt?: number;
    dueTick?: number;
    decayPerTick?: number;
    payload?: any;
}

export interface PlanAtom {
    id: string;
    kind: 'plan';
    planId: string;
    fromId: string;
    ownerId?: string;
    toId?: string;
    goalId?: string;
    steps: any[];
    status: 'proposed' | 'accepted' | 'rejected' | 'in_progress' | 'done' | 'active' | 'failed';
    tags: string[];
    scope: any;
    source: any;
    confidence: number;
    createdTick: number;
    expiresAt?: number;
}

export interface NormGateInput {
    actorId: string;
    actionId: string;
    actionTags: string[];
    locationId?: string;
    locationTags: string[];
    roleIds: string[];
    phaseId?: string;
    atoms: any;
    norms: NormRule[];
}

export interface NormGateResult {
    decision: 'allow' | 'forbid' | 'require_authorization';
    hard: boolean;
    reasonIds: string[];
    sanctionScore: number;
    rewardScore: number;
}

export interface NormRule {
    id: string;
    appliesToAgentIds?: string[];
    appliesToRoleIds?: string[];
    actionId?: string;
    actionTag?: string;
    locationId?: string;
    locationTag?: string;
    level: NormLevel;
    sanctionWeight?: number;
    rewardWeight?: number;
}

export type NormDecision = 'allow' | 'forbid' | 'require_authorization';
export type NormLevel = 'hard_forbid' | 'soft_forbid' | 'hard_require' | 'soft_allow';

export interface Norm {
    id: string;
    name: string;
    description: string;
    issuerId: string;
    scope: 'global' | 'faction' | 'local';
    severity: 'taboo' | 'hard' | 'soft';
    violationPattern: {
        tags?: string[];
        actionType?: string;
    };
    basePenalty: number;
}

export interface ConsequenceBundle {
    domainEvents: DomainEvent[];
    notes: string[];
}

export interface ActionRequest {
    id: string;
    actorId: string;
    actionId: string;
    tags: string[];
    targetId?: string;
    t: number;
    locationId?: string;
    actorRoleIds?: string[];
    targetLocationCell?: { x: number, y: number };
}

export interface ScenarioPhaseRule {
    id: string;
    metric: string;
    min?: number;
    max?: number;
    label?: string;
    goalWeights?: Record<string, number>;
    actionMultipliers?: Record<string, number>;
    normOverrides?: NormRule[];
}

export interface ScenarioPhaseState {
    id: string;
    label: string;
    enteredAt: number;
    goalWeights: Record<string, number>;
    actionMultipliers?: Record<string, number>;
    normOverrides?: NormRule[];
}

export interface BodyState {
    hp: number;
    stamina: number;
    pain: number;
    mobility: number;
    isBleeding: boolean;
    isConscious: boolean;
}

export interface BodyAwarenessParams {
    interoceptionAccuracy: number;
    denialTrait: number;
    catastrophizingTrait: number;
}

export interface SelfBodyModel {
    hpSelf: number;
    staminaSelf: number;
    painSelf: number;
    mobilitySelf: number;
    isSeverelyWoundedSelf: boolean;
    isCombatCapableSelf: boolean;
    biasHp: number;
    biasPain: number;
    denialLevel: number;
    hypochondriaLevel: number;
}

export interface PerceivedBodyState {
    targetId: string;
    hpEstimate: number;
    staminaEstimate: number;
    painEstimate: number;
    mobilityEstimate: number;
    isSeverelyWounded: boolean;
    isCombatCapable: boolean;
    confidence: number;
}

export interface EventImpacts {
    paramDeltas: Record<string, number>;
    paramScales: Record<string, number>;
    goalActivationDeltas: Record<string, number>;
    acuteDeltas: Record<string, number>;
    relationDeltas: Record<string, number>;
}

export type CapabilityId = 
  | 'medical_skill' 
  | 'strength' 
  | 'stamina' 
  | 'command' 
  | 'calm_under_stress' 
  | 'navigation' 
  | 'logistics';

export type GoalKind = string; // Basic alias, can be expanded to union

// Narrative types
export type ObservationKind = 'action' | 'event' | 'perception' | 'neutral' | 'harm' | 'help' | 'promise' | 'betray' | 'deceive' | 'share_info' | 'obey' | 'support' | 'undermine';
export type ObservationChannel = 'direct' | 'indirect' | 'visual' | 'auditory';

export interface Observation {
    id: string;
    tick: number;
    t: number;
    observerId: string;
    subjectId?: string;
    actorId?: string;
    receiverId?: string;
    kind: ObservationKind;
    actionType?: string;
    payload?: any;
    visibility: number;
    noise?: number;
    channel?: ObservationChannel;
    intensity?: number;
    tags?: string[];
    context?: any;
    locationId?: string;
    preGoalEvidence?: any;
    salience?: number;
    success?: boolean;
    cost_self?: number;
    benefit_other?: number;
}

export interface SceneAffordance {
    id: string;
    kind: 'social' | 'physical';
    actionId: string;
    agentId: string;
    scenarioId: string;
    sceneId?: string;
    locationId?: string;
    role: string;
}
