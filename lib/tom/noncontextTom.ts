
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * NON-CONTEXT ToM (General) — Beliefs i -> j in a transparent math form.
 */

import { clamp01, normalizeL1Safe, logitsFromProbs } from './math';
import { allArchetypes } from '../../data/archetypes';
import { METRIC_NAMES } from '../archetypes/metrics';
import { computeSecondOrderSelf, TomSecondOrderSelf } from './second_order';
import { LIFE_TO_PREGOAL } from '../life-goals/life-to-pregoal';
import { listify } from '../utils/listify';

// --- Type Definitions ---

export type Id = string;

export interface VectorAxis {
  id: string;
  labelLeft: string;
  labelRight: string;
  value: number;
}

export interface VectorFingerprint {
  values: VectorAxis[];
}

export interface TomStructuralDiagnosis {
  SELF: { subjectivity: number; cohesion: number; alignment: number; split: number; };
  WORLD: { acceptance: number; threat: number; fairness: number; radicalism: number; };
  OTHERS: { care: number; trust: number; dependence: number; threat: number; };
  SYSTEM: { formalism: number; loyalty: number; critic: number; sacred: number; };
}

export interface TomStressProfile {
  state: { cognitiveLoad: number; emotionalDepletion: number; bodyReserve: number; overcontrol: number; volatility: number; };
  trait: { traumaLoad: number; hypervigilance: number; stressTolerance: number; };
  coping: { avoidance: number; aggression: number; rescue: number; overcontrol: number; };
}

export interface ProfileSummary {
  vector: VectorFingerprint;
  structural: TomStructuralDiagnosis;
  stress: TomStressProfile;
}

export interface TomErrorProfile {
  paranoia: number;
  naivete: number;
  cynicism: number;
  self_blame: number;
}

export interface CharacterDossier {
  metadata: { id: Id; name: string; version?: string };
  raw_data: {
    vector_base?: Record<string, number>;
    tags?: string[];
    roles?: string[];
    identity?: {
        sacred_set?: any[];
        self_concept?: string;
        arch_true_dominant_id?: string;
        arch_self?: number[];
    };
    history?: Array<{
      id: string;
      name: string;
      years_ago: number;
      domain?: string;
      tags?: string[];
      valence?: number;
      intensity?: number;
      participants?: Id[];
      lifeGoalWeights?: Record<string, number>;
      traumaTags?: string[];
    }>;
    body?: any;
  };
  analysis?: {
    field_metrics?: Record<string, number>;
    derived_metrics?: Record<string, number>;
    quick_states?: Record<string, number>;
    latents?: Record<string, number>; 
    v42_metrics?: Record<string, number>;
    worldview?: { people_trust?: number; world_benevolence?: number };
    psych_profile?: {
      distortion?: Record<string, number>;
      attachment?: Record<string, number>;
      trauma?: Record<string, number>;
      coping?: Record<string, number>;
      social_orientation?: { egoism: number; altruism: number };
      affect?: { fear: number; anger: number; shame: number; hope: number; exhaustion: number };
      shadowActivation?: number;
    };
    archetype_state?: {
        actualId?: string;
        shadowId?: string;
        selfId?: string;
    };
    goal_truth_vec?: Record<string, number>;
    goal_truth_logits?: Record<string, number>;
    type_truth_vec?: Record<string, number>;
    type_truth_logits?: Record<string, number>;
    life_goals_probs?: Record<string, number>;
    life_goals_logits?: Record<string, number>;
    profile_summary?: any;
  };
  explainability?: {
    goal_definitions?: Array<{
      id: string;
      preGoalWeights?: Record<string, number>;
    }>;
    type_space?: string[];
  };
}

export interface Observation {
  t: number;
  actorId: Id;
  receiverId?: Id;
  kind: string;
  tags: string[];
  intensity: number; 
  salience?: number; 
  success?: boolean;
  cost_self?: number;
  benefit_other?: number;
  context?: Record<string, number>;
  locationId?: Id;
  preGoalEvidence?: Record<string, number>;
  typeEvidence?: Record<string, number>;
}

export interface BetaState { alpha: number; beta: number; }
export interface DirichletState { labels: string[]; alpha: number[]; }
export interface KalmanDiagState { labels: string[]; mu: number[]; sigmaDiag: number[]; }

export interface EvidenceItem {
  t: number;
  kind: Observation["kind"];
  tags: string[];
  intensity: number;
  weight_w: number;
  goalsTop: Array<{ preGoal: string; deltaMu: number }>;
}

export interface NormProfile {
  system: number;
  human: number;
  autonomy: number;
  harshness: number;
  egoism: number;
  altruism: number;
}

export interface ArchetypeInfo {
  id: string; 
  label: string; 
  score: number; 
  description?: string; 
  lambda?: string; 
  mu?: string; 
  f?: number;
  latents?: Record<string, number>;
}

export interface ArchetypeProjection {
  selfWeight: number;
  targetWeight: number;
  projectedType?: string;
  projectedArchetype?: ArchetypeInfo;
}

export interface ProjectionBreakdown {
    wSelf: number;
    wShadow: number;
    wRole: number;
    wTrauma: number;
    components: {
        self: Record<string, number>;
        shadow: Record<string, number>;
        role: Record<string, number>;
        trauma: Record<string, number>;
    };
    resultVector: Record<string, number>;
}

export interface TomCharacterModel {
  perceivedGoals: { preGoals: Array<{ id: string; p: number }>; lifeGoals: Array<{ id: string; p: number }>; };
  perceivedTypes: Array<{ type: string; p: number }>;
  perceivedArchetype?: ArchetypeInfo;
  perceivedLatents: Record<string, number>; 
  perceivedNorms: NormProfile;
  alignment: { goalsBelief: number; goalsTruth: number | null; normsBelief: number; normsTruth: number | null; };
  riskProfile: { betrayRisk: number; escalationRisk: number; tieSurvival: number; deceptionRisk: number; dominanceByI?: number; };
  relationshipRole: { label: string; confidence: number; };
  egoism: number;
  altruism: number;
  
  archetypeProjection?: ArchetypeProjection;
  
  trueLatents?: Record<string, number>;
  projectedLatentsPure?: Record<string, number>;
  archetypeLatentsPure?: Record<string, number>;
  projectedLatentsMixed?: Record<string, number>;
  trueArchetype?: string;
  
  projectionBreakdown?: ProjectionBreakdown;
}

export interface TomVectorAxis { id: string; labelLeft: string; labelRight: string; value: number; }
export interface TomVectorFingerprint { axes: TomVectorAxis[]; }

export interface ArchetypeMatchCandidate {
    id: string;
    name: string;
    dist6: number; // Distance by 6 latents
    dist9: number; // Distance by 9 metrics
}

export interface ProjectionDebugInfo {
    perceivedCandidates: ArchetypeMatchCandidate[];
    perceivedError: number;
    priorCandidates?: ArchetypeMatchCandidate[];
    posteriorMatches?: ArchetypeMatchCandidate[];
    dist_prior?: number;
    mix_penalty?: number;
}

export interface TomOutputs {
  trustBase: number; trustVar: number; deceptionRisk: number; promiseCredibility: number;
  goalAlignment: number; goalAlignment_truth?: number;
  approval: number; edgeWeight: number; bandwidth: number; transactionCost: number;
  normConflict: number; normConflict_truth?: number; 
  egoism: number; altruism: number;
  
  P_Follow: number; P_DonateGoals: number; P_TaskAssign: number; P_TaskAccept: number;
  P_CoalitionForm: number; P_Compromise: number; P_MandateGrant: number; P_MandateRevoke: number;
  P_PublicEndorse: number; P_PublicDistance: number; P_ConflictEscalation: number; P_TieSurvival: number;
  P_DeceptionByJ: number; P_DetectionByI: number; P_ShareSensitive: number; P_PosteriorShift: number;

  breakdowns: Record<string, any[]>;
  topReasons: Array<{ label: string; score: number }>;
  topGoalsDriving: Array<{ preGoal: string; score: number }>;
  sensitivity: { trustShare: number; uncShare: number };
  toM_Unc: number; evidenceCount: number;
  trustContribution: number; uncertaintyContribution: number;
  topGoalsForCooperation: Array<{ preGoal: string; weight: number }>;
  topGoalsForConflict: Array<{ preGoal: string; weight: number }>;
  
  characterModel?: TomCharacterModel; 
  tomVectorFingerprint: TomVectorFingerprint;
  tomStructuralDiagnosis: TomStructuralDiagnosis;
  tomStressProfile: TomStressProfile;
  errorProfile?: TomErrorProfile;
  
  secondOrderSelf?: TomSecondOrderSelf;
  tomConfidence: number; tomEntropyPreGoals: number; tomEntropyTypes: number;
  biases?: Record<string, number>;
  archetypeProjection?: ArchetypeProjection;
  projectedTypes?: number[];
  projectionError?: number;
  affectBelief?: { fear: number; anger: number; shame: number; hope: number; };
  summary?: string;
  effectiveNorms?: { system: number; human: number; autonomy: number; harshness: number; };
  projectionDebug?: ProjectionDebugInfo;
}

export interface TomNormDiff {
    key: string;
    label: string;
    truth: number;
    belief: number;
    delta: number;
}

export interface TomTruthVsBelief {
  truthPreGoals?: Array<{ preGoal: string; truth: number; belief: number; delta: number; }>;
  truthTypes?: Array<{ type: string; truth: number; belief: number; delta: number; }>;
  truthLatents?: Array<{ key: string; truth: number; belief: number; delta: number; }>;
  truthLifeGoals?: Array<{ goalId: string; truth: number; belief: number; delta: number }>;
  truthNorms?: TomNormDiff[];
}

export interface TomEntryGeneral {
  observerId: Id; targetId: Id;
  trust: BetaState; honesty: BetaState;
  preGoals: KalmanDiagState; types?: DirichletState;
  latents: Record<string, number>; 
  lifeGoals?: KalmanDiagState;
  toM_Unc: number; evidenceCount: number;
  outputs: TomOutputs;
  truthVsBelief?: TomTruthVsBelief;
  evidenceLog: EvidenceItem[];
  errorProfile?: TomErrorProfile;
  secondOrderSelf?: TomSecondOrderSelf;
  affect?: { fear: number; anger: number; shame: number; hope: number; exhaustion?: number; };
}

export interface TomParams {
  trustPriorMean: number; trustPriorStrength: number;
  honestyPriorMean: number; honestyPriorStrength: number;
  epsFP_trust: number; epsFN_trust: number; epsFP_hon: number; epsFN_hon: number;
  lambdaForget: number; availabilityGain: number; negativityBoost: number; positivityDiscount: number;
  confirmationDownWeight: number; confirmationUpWeight: number;
  w_trait_update: number; w_ctx_explained: number;
  baseIntentionality: number; intentFromThreat: number;
  anchoringStrength: number; insufficientAdjustment: number;
  goalSigma2Base: number; goalProcessNoise: number; goalPriorVarBase: number;
  priorSelfWeight: number; priorTargetWeight: number; priorUniformWeight: number;
  uncSuppression: number;
  anxious: number; avoidant: number;
  affectNegShift: number; authorityBias: number; ingroupBias: number;
  maxLog: number;
  biases: Partial<Record<string, number>>;
  goalTagWeights?: Record<string, Record<string, number>>;
  typeTagWeights?: Record<string, Record<string, number>>;
}

export interface DyadFeatures {
  bond: number; betrayal: number; sharedCombat: number; dependence: number;
  perceivedAuthorityOfTarget: number; ingroup: number; outgroup: number;
  traumaLinked: number; isIngroup: boolean; isOutgroup: boolean;
  dominanceByI: number; conflict: number;
}

const LATENT_KEYS: readonly string[] = [
  'CH', 'SD', 'RP', 'SO', 'EW', 'CL'
];

const ACTION_TYPE_KEYS: readonly string[] = [
  'AGENCY', 'ACCEPT', 'ACTION', 'RADICAL', 'SCOPE', 'TRUTH', 'CARE', 'MANIP', 'FORMAL'
];

const ROLE_ARCHETYPES: Record<string, string> = {
  'commander': 'H-15-SN', 'leader': 'H-15-SN', 'advisor': 'H-3-SN',
  'operative': 'H-12-ON', 'guard': 'H-5-SN', 'medic': 'H-16-SN',
  'scout': 'H-10-SR', 'default': 'H-1-ON'
};

function getIdealLatentsForArchetype(archId: string): Record<string, number> {
    const arch = allArchetypes.find(a => a.id === archId);
    if (!arch) return {};
    const m = arch.metrics;
    
    return {
        CH: m.TRUTH ?? 0.5,
        SD: m.ACCEPT ?? 0.5,
        RP: m.RADICAL ?? 0.5,
        SO: m.SCOPE ?? 0.5,
        EW: m.CARE ?? 0.5,
        CL: m.AGENCY ?? 0.5,
        
        AGENCY: m.AGENCY ?? 0.5,
        ACCEPT: m.ACCEPT ?? 0.5,
        ACTION: m.ACTION ?? 0.5,
        RADICAL: m.RADICAL ?? 0.5,
        SCOPE: m.SCOPE ?? 0.5,
        TRUTH: m.TRUTH ?? 0.5,
        CARE: m.CARE ?? 0.5,
        MANIP: m.MANIP ?? 0.5,
        FORMAL: m.FORMAL ?? 0.5,
    };
}

// Maps latent values (0-1) to Goal Axis Logits (-X to +X)
// Heuristic mapping based on concept
function latentsToGoalLogits(latents: Record<string, number>): Record<string, number> {
    const logits: Record<string, number> = {};
    const get = (k: string) => latents[k] ?? 0.5;
    
    const SCALE = 2.0; // Strength of projection
    
    // AGENCY -> Power/Control/Freedom
    logits['power_status'] = (get('AGENCY') - 0.5) * SCALE;
    logits['free_flow'] = (get('AGENCY') - 0.5) * SCALE;
    
    // CARE -> Care/Bonds
    logits['care'] = (get('CARE') - 0.5) * SCALE * 1.5;
    logits['group_cohesion'] = (get('CARE') - 0.5) * SCALE;
    
    // FORMAL -> Order/Efficiency
    logits['preserve_order'] = (get('FORMAL') - 0.5) * SCALE;
    logits['efficiency'] = (get('FORMAL') - 0.5) * SCALE;
    
    // RADICAL -> Change/Fix
    logits['chaos_change'] = (get('RADICAL') - 0.5) * SCALE;
    logits['fix_world'] = (get('RADICAL') - 0.5) * SCALE;
    
    // TRUTH -> Truth
    logits['truth'] = (get('TRUTH') - 0.5) * SCALE * 1.5;
    
    // MANIP -> Control (Dark)
    logits['control'] = (get('MANIP') - 0.5) * SCALE;
    
    // ACCEPT -> Order/Peace
    logits['preserve_order'] += (get('ACCEPT') - 0.5) * SCALE * 0.5;
    logits['care'] += (get('ACCEPT') - 0.5) * SCALE * 0.3;

    return logits;
}

// --- Core Logic Functions ---
export function extractPreGoalSpace(dossier: CharacterDossier): string[] {
    if (!dossier.explainability?.goal_definitions) return [];
    const set = new Set<string>();
    for (const def of dossier.explainability.goal_definitions) {
        if (def.preGoalWeights) {
            for (const k of Object.keys(def.preGoalWeights)) set.add(k);
        }
    }
    return Array.from(set).sort();
}

export function extractSelfPreGoalVector(dossier: CharacterDossier, labels: string[]): number[] {
    const truth = dossier.analysis?.goal_truth_vec;
    if (truth) return normalizeL1Safe(labels.map(l => truth[l] ?? 0));
    return labels.map(() => 1 / Math.max(1, labels.length));
}

export function buildTargetTruthPreGoalsVec(target: CharacterDossier, labels: string[]): number[] {
  const vec: number[] = [];
  for (const label of labels) vec.push(target.analysis?.goal_truth_vec?.[label] ?? 0);
  const sum = vec.reduce((a,b)=>a+b,0);
  if (sum <= 1e-9) return vec.map(()=>1/vec.length);
  return vec.map(x=>x/sum);
}

function read01(obj: Record<string, any> | undefined, k: string, fb: number): number {
  const v = obj?.[k];
  return clamp01(typeof v === "number" && Number.isFinite(v) ? v : fb);
}

export function deriveDyadFeaturesFromObserverHistory(observer: CharacterDossier, targetId: Id): DyadFeatures {
  const hist = listify(observer.raw_data?.history);
  let bond=0, betrayal=0, sharedCombat=0, dependence=0, traumaLinked=0, conflict=0, perceivedAuthority=0;
  for (const e of hist) {
    const part = listify(e.participants);
    if (!part.includes(targetId)) continue;
    const inten = clamp01(e.intensity ?? 0.5);
    const val = Math.max(-1, Math.min(1, e.valence ?? 0));
    const tags = listify(e.tags);
    if (val > 0) bond += inten * val;
    if (val < 0) {
        conflict += inten * (-val);
        if (tags.includes("betrayal") || tags.includes("punishment")) betrayal += inten * (-val);
    }
    if (tags.includes("combat") || tags.includes("defense")) sharedCombat += inten;
    if (tags.includes("oath") || tags.includes("service")) dependence += inten;
    if (listify(e.traumaTags).length > 0 || tags.includes("trauma")) traumaLinked += inten;
    if (tags.includes("leader") || tags.includes("mentor")) perceivedAuthority += inten;
  }
  bond = 1 - Math.exp(-bond); betrayal = 1 - Math.exp(-betrayal); sharedCombat = 1 - Math.exp(-sharedCombat);
  dependence = 1 - Math.exp(-dependence); traumaLinked = 1 - Math.exp(-traumaLinked); conflict = 1 - Math.exp(-conflict);
  perceivedAuthority = 1 - Math.exp(-perceivedAuthority);
  
  const isIngroup = hist.some(e => listify(e.participants).includes(targetId) && listify(e.tags).includes("ingroup"));
  const myClearance = observer.raw_data?.identity?.self_concept ? 3 : 1;
  const dominanceByI = myClearance > 2 ? 0.6 : 0.4;
  return { bond, betrayal, sharedCombat, dependence, perceivedAuthorityOfTarget: perceivedAuthority, ingroup: isIngroup?1:0, outgroup: isIngroup?0:0.5, traumaLinked, isIngroup, isOutgroup: !isIngroup, dominanceByI, conflict };
}

export function deriveTomParams(observer: CharacterDossier, dyad: DyadFeatures, maxLog = 240): TomParams {
  const psych = observer.analysis?.psych_profile;
  const dist = psych?.distortion || {};
  const coping = psych?.coping || {};
  const biases: Record<string, number> = {};

  // Map Psychology to Biases
  biases.hostile_attribution = clamp01(dist.threatBias * 0.6 + (coping.aggression || 0) * 0.4);
  biases.cynicism = clamp01(dist.trustBias * 0.8 + (1 - (observer.analysis?.worldview?.people_trust || 0.5)) * 0.2);
  biases.confirmation = clamp01(dist.blackWhiteThinking * 0.7 + (dist.controlIllusion || 0) * 0.3);
  biases.anchoring = clamp01(dist.personalization * 0.5 + (1 - (observer.analysis?.v42_metrics?.DQ_t || 0.5)) * 0.3);
  biases.trauma_reenactment = clamp01(psych?.trauma?.self || 0);
  biases.idealization = clamp01((coping.helper || 0) * 0.5 + (psych?.attachment?.anxious || 0) * 0.4);
  biases.self_serving = clamp01(dist.selfBlameBias < 0.2 ? 0.5 : 0);

  return {
    trustPriorMean: 0.5, trustPriorStrength: 2, honestyPriorMean: 0.7, honestyPriorStrength: 2,
    epsFP_trust: 0.1, epsFN_trust: 0.1, epsFP_hon: 0.1, epsFN_hon: 0.1,
    lambdaForget: 0.05, availabilityGain: 1.0, negativityBoost: 0.5, positivityDiscount: 0.1,
    confirmationDownWeight: 0.5, confirmationUpWeight: 1.2, w_trait_update: 1.0, w_ctx_explained: 1.0,
    baseIntentionality: 0.5, intentFromThreat: 0.5, anchoringStrength: 0.2, insufficientAdjustment: 0.2,
    goalSigma2Base: 0.2, goalProcessNoise: 0.05, goalPriorVarBase: 0.3, priorSelfWeight: 0.3, priorTargetWeight: 0.3, priorUniformWeight: 0.4,
    uncSuppression: 0, anxious: 0.3, avoidant: 0.3, affectNegShift: 0.1, authorityBias: 0.1, ingroupBias: 0.1, maxLog,
    biases
  };
}

function betaMean(b: BetaState): number { return b.alpha / (b.alpha + b.beta + 1e-12); }
function betaVar(b: BetaState): number { return 0.05; }

export function computeEgoismAltruism(vb: Record<string, number> = {}): { egoism: number, altruism: number } {
    const get = (k: string) => vb[k] ?? 0.5;
    const altruism_raw = 0.35*get('A_Safety_Care') + 0.25*get('C_dominance_empathy') + 0.25*get('C_reciprocity_index') + 0.15*get('C_coalition_loyalty');
    const egoism_raw = 0.4*get('A_Power_Sovereignty') + 0.3*get('A_Liberty_Autonomy') + 0.3*get('C_reputation_sensitivity');
    const sum = egoism_raw + altruism_raw + 1e-9;
    return { egoism: egoism_raw / sum, altruism: altruism_raw / sum };
}


function computeProjectedArchetypeVector(
    observer: CharacterDossier,
    dyad: DyadFeatures,
    trust: number
): { vector: Record<string, number>, breakdown: ProjectionBreakdown } {
    
    const selfVecRaw = observer.raw_data.identity?.arch_self;
    let L_self: Record<string, number> = {};
    
    // Calculate self metrics from vector base if not already present
    if (selfVecRaw && selfVecRaw.length === LATENT_KEYS.length + ACTION_TYPE_KEYS.length) {
         L_self = getIdealLatentsForArchetype(observer.analysis?.archetype_state?.selfId || 'H-1-ON');
    } else {
        // Fallback to archetype definition
        L_self = getIdealLatentsForArchetype(observer.analysis?.archetype_state?.selfId || 'H-1-ON');
    }

    // L_shadow, L_role, L_trauma
    const shadowId = observer.analysis?.archetype_state?.shadowId || 'H-2-OR';
    const L_shadow = getIdealLatentsForArchetype(shadowId);

    const role = observer.raw_data.roles?.[0] || 'default';
    const roleArchId = ROLE_ARCHETYPES[role] || ROLE_ARCHETYPES['default'];
    const L_role = getIdealLatentsForArchetype(roleArchId);

    const L_trauma = getIdealLatentsForArchetype('H-16-OR');

    // Weights
    const shadowActivation = observer.analysis?.psych_profile?.shadowActivation ?? 0;
    const threat = Math.max(0, 0.6 * dyad.conflict + 0.4 * (1 - trust));
    const roleSalience = 0.5 * (1 - shadowActivation) + 0.3 * (1 - threat);

    const u_self = Math.max(0, 0.6 - 0.5 * shadowActivation - 0.2 * threat); 
    const u_shadow = 0.2 + 0.6 * shadowActivation + 0.4 * threat;
    const u_role = 0.3 + 0.7 * roleSalience;
    
    const traumaLoad = observer.analysis?.psych_profile?.trauma?.self ?? 0;
    const u_trauma = (0.1 + 0.8 * shadowActivation) * traumaLoad;

    const sumU = u_self + u_shadow + u_role + u_trauma + 1e-9;
    const wSelf = u_self / sumU;
    const wShadow = u_shadow / sumU;
    const wRole = u_role / sumU;
    const wTrauma = u_trauma / sumU;

    const mixedVec: Record<string, number> = {};
    for (const key of [...LATENT_KEYS, ...ACTION_TYPE_KEYS]) {
        mixedVec[key] = 
            wSelf * (L_self[key] ?? 0.5) +
            wShadow * (L_shadow[key] ?? 0.5) +
            wRole * (L_role[key] ?? 0.5) +
            wTrauma * (L_trauma[key] ?? 0.5);
        mixedVec[key] = clamp01(mixedVec[key]);
    }

    return {
        vector: mixedVec,
        breakdown: {
            wSelf, wShadow, wRole, wTrauma,
            components: { self: L_self, shadow: L_shadow, role: L_role, trauma: L_trauma },
            resultVector: mixedVec
        }
    };
}

function applyEvidenceToLatents(
    baseLatents: Record<string, number>,
    observations: Observation[],
    params: TomParams
): Record<string, number> {
    const result = { ...baseLatents };
    const alpha = 0.05; 
    
    for (const obs of observations) {
        const tags = obs.tags || [];
        
        if (tags.includes('leadership') || tags.includes('command')) {
            result.AGENCY = result.AGENCY * (1 - alpha) + alpha * 1.0;
            result.CL = result.CL * (1 - alpha) + alpha * 0.8;
        }
        if (tags.includes('passive') || tags.includes('wait')) {
            result.ACTION = result.ACTION * (1 - alpha) + alpha * 0.2;
        }
        if (tags.includes('INFO') || tags.includes('truth')) {
            result.TRUTH = result.TRUTH * (1 - alpha) + alpha * 0.9;
            result.CH = result.CH * (1 - alpha) + alpha * 0.8;
        }
        if (tags.includes('care') || tags.includes('help')) {
            result.CARE = result.CARE * (1 - alpha) + alpha * 0.9;
            result.EW = result.EW * (1 - alpha) + alpha * 0.8;
        }
        if (tags.includes('harm') || tags.includes('attack')) {
            result.CARE = result.CARE * (1 - alpha) + alpha * 0.1;
            result.EW = result.EW * (1 - alpha) + alpha * 0.2;
            result.RP = result.RP * (1 - alpha) + alpha * 0.8; 
        }
        if (tags.includes('deception') || tags.includes('manipulation')) {
            result.MANIP = result.MANIP * (1 - alpha) + alpha * 0.9;
            result.TRUTH = result.TRUTH * (1 - alpha) + alpha * 0.2;
        }
        if (tags.includes('hierarchy') || tags.includes('protocol')) {
            result.FORMAL = result.FORMAL * (1 - alpha) + alpha * 0.8;
            result.SD = result.SD * (1 - alpha) + alpha * 0.8;
        }
        if (tags.includes('rebellion') || tags.includes('chaos')) {
            result.RADICAL = result.RADICAL * (1 - alpha) + alpha * 0.9;
            result.SD = result.SD * (1 - alpha) + alpha * 0.2;
        }
    }
    return result;
}


function calculateProjectedLatents(
    targetTruth: CharacterDossier | undefined,
    selfLatents: Record<string, number>,
    biases: Record<string, number>,
    dyad: DyadFeatures,
    trust: number,
    uncertainty: number,
    normConflict: number
): { projected: Record<string, number>, debug: any } {
    
    const trueLatents = targetTruth?.analysis?.latents ?? {};
    const self = selfLatents;

    const targetRole = targetTruth?.raw_data?.roles?.[0] || 'default';
    const stereotypeArchId = ROLE_ARCHETYPES[targetRole] || ROLE_ARCHETYPES['default'];
    const stereotypeLatents = getIdealLatentsForArchetype(stereotypeArchId);

    let w_truth = (1 - uncertainty); 
    const remaining = 1 - w_truth;
    
    const narcissism = biases.self_serving ?? 0;
    const paranoia = biases.hostile_attribution ?? 0;
    
    let w_self = remaining * (0.2 + 0.2 * narcissism + 0.1 * paranoia);
    let w_stereo = remaining - w_self;
    
    w_truth = clamp01(w_truth);
    w_self = clamp01(w_self);
    w_stereo = clamp01(w_stereo);

    const result: Record<string, number> = {};
    
    const bias_hostile = paranoia * 0.3;
    const bias_cynical = (biases.cynicism ?? 0) * 0.3;
    const bias_idealize = (biases.idealization ?? 0) * 0.3;
    
    for(const key of [...LATENT_KEYS, ...ACTION_TYPE_KEYS]) {
        const noise = (Math.random() - 0.5) * 0.1;
        const tVal = (trueLatents[key] ?? 0.5) + noise; 
        const sVal = self[key] ?? 0.5;
        const stVal = stereotypeLatents[key] ?? 0.5;
        
        let val = w_truth * tVal + w_self * sVal + w_stereo * stVal;
        
        if (key === 'RP' || key === 'MANIP' || key === 'RADICAL') {
             val += bias_hostile + bias_cynical;
        }
        if (key === 'CARE' || key === 'TRUTH' || key === 'EW') {
             val -= bias_hostile;
             if (dyad.bond > 0.6) val += bias_idealize;
        }
        if (key === 'AGENCY' && dyad.dominanceByI > 0.6) {
             val -= 0.2; 
        }
        
        result[key] = clamp01(val);
    }
    
    const k_proj = 1 - w_truth;

    return {
        projected: result,
        debug: { k_projection: k_proj, w_truth, w_self, w_stereo, trueLatents, selfLatents: self, stereotypeLatents }
    };
}

function findTopArchetypes(latents: Record<string, number>) {
    const candidates = allArchetypes.map(arch => {
        const ideal = getIdealLatentsForArchetype(arch.id);
        
        let dist6Sq = 0;
        let dist9Sq = 0;

        // 6 Latents
        for (const key of LATENT_KEYS) {
            const v1 = latents[key] ?? 0.5;
            const v2 = ideal[key] ?? 0.5;
            dist6Sq += (v1 - v2) ** 2;
        }
        
        // 9 Metrics
        for (const key of ACTION_TYPE_KEYS) {
            const v1 = latents[key] ?? 0.5;
            const v2 = ideal[key] ?? 0.5;
            dist9Sq += (v1 - v2) ** 2;
        }

        return { 
            id: arch.id, 
            name: arch.data.name,
            dist6: Math.sqrt(dist6Sq),
            dist9: Math.sqrt(dist9Sq)
        };
    });

    // Sort by dist6 as primary heuristic for psychological fit
    candidates.sort((a, b) => a.dist6 - b.dist6);
    
    const top3 = candidates.slice(0, 3);
    const best = top3[0];

    const bestArch = allArchetypes.find(a => a.id === best.id);

    return { 
        arch: bestArch,
        distance: best.dist6, 
        top3 
    };
}

function buildTomStructuralDiagnosisFrom(
  norms: NormProfile,
  latents: Record<string, number>,
  goalAlign: number,
  normConflict: number,
  preGoals: KalmanDiagState
): TomStructuralDiagnosis {
    const getGoal = (id: string) => {
        const idx = preGoals.labels.indexOf(id);
        return idx >= 0 ? preGoals.mu[idx] : 0.5;
    };
    
    const systemLoyalty = (latents.CL ?? 0.5) * 0.6 + getGoal('preserve_order') * 0.4;
    const humanCare = (latents.CARE ?? 0.5) * 0.6 + getGoal('care') * 0.4;
    const radicalism = (latents.RP ?? 0.5) * 0.6 + getGoal('chaos_change') * 0.4;
    const truthSeeking = (latents.TRUTH ?? 0.5) * 0.6 + getGoal('truth') * 0.4;
    
    // Dynamic Norm Profile
    const perceivedNorms = {
        system: (latents.FORMAL ?? 0.5) * 0.6 + getGoal('maintain_order') * 0.4,
        human: humanCare,
        autonomy: (latents.AGENCY ?? 0.5) * 0.6 + getGoal('free_flow') * 0.4,
        harshness: (latents.MANIP ?? 0.5) * 0.6 + getGoal('power_status') * 0.4,
        egoism: (latents.AGENCY ?? 0.5) * 0.7 + getGoal('escape_transcend') * 0.3,
        altruism: (latents.CARE ?? 0.5)
    };
    
    return {
        SELF: { 
            subjectivity: latents.AGENCY ?? 0.5, 
            cohesion: latents.SD ?? 0.5, 
            alignment: goalAlign, 
            split: latents.SD ? (1 - latents.SD) : 0.5 
        },
        WORLD: { 
            acceptance: 1.0 - radicalism, 
            threat: latents.RP ?? 0.5, 
            fairness: getGoal('fix_world'), 
            radicalism: radicalism 
        },
        OTHERS: { 
            care: humanCare, 
            trust: 1 - (latents.RP ?? 0.5), 
            dependence: 1 - (latents.AGENCY ?? 0.5), 
            threat: latents.RP ?? 0.5 
        },
        SYSTEM: { 
            formalism: latents.FORMAL ?? 0.5, 
            loyalty: systemLoyalty, 
            critic: normConflict, 
            sacred: getGoal('truth') 
        }
    };
}

function buildTomStressProfileFrom(latents: Record<string, number>): TomStressProfile {
  return {
    state: { cognitiveLoad: latents.CH ?? 0.5, emotionalDepletion: latents.SD ? (1 - latents.SD) : 0.5, bodyReserve: 1 - (latents.RP ?? 0.5), overcontrol: latents.SO ? (1 - latents.SO) : 0.5, volatility: latents.CL ?? 0.5 },
    trait: { traumaLoad: 0.5, hypervigilance: latents.CH ?? 0.5, stressTolerance: latents.SD ?? 0.5 },
    coping: { avoidance: latents.SO ? (1 - latents.SO) : 0.5, aggression: latents.RP ?? 0.5, rescue: latents.CARE ?? 0.5, overcontrol: latents.FORMAL ?? 0.5 }
  };
}

function buildTomVectorFingerprintFrom(
  entry: TomEntryGeneral,
  norms: NormProfile,
  preGoals: KalmanDiagState
): TomVectorFingerprint {
    const getG = (id: string) => {
        const idx = preGoals.labels.indexOf(id);
        return idx >= 0 ? preGoals.mu[idx] : 0.5;
    };
    
    const l = entry.latents;

    // Care/Power: (Care + EW) vs (PowerGoal + Manip)
    const carePower = 0.5 + 0.5 * ((getG('power_status') + (l.MANIP??0.5)) - (getG('care') + (l.CARE??0.5))) / 2;
    
    // Order/Chaos: (Formal + SD + PreserveOrder) vs (Radical + ChaosChange)
    const orderChaos = 0.5 + 0.5 * ((getG('chaos_change') + (l.RADICAL??0.5)) - (getG('preserve_order') + (l.FORMAL??0.5))) / 2;
    
    // Sacrifice/Ego: (Care + Truth) vs (Agency + Escape)
    const sacrificeEgo = 0.5 + 0.5 * (((l.AGENCY??0.5) + getG('escape_transcend')) - ((l.CARE??0.5) + getG('fix_world'))) / 2;
    
    // Dominance: Control + Agency - Acceptance
    const dominance = clamp01(0.5 + 0.5 * (getG('control') + (l.AGENCY??0.5) - (l.ACCEPT??0.5)));
    
    // Affiliation: Reciprocity/Bond (CL) vs Isolation
    const affiliation = clamp01((l.CL ?? 0.5) * 0.6 + getG('care') * 0.4);
    
    // Manipulation: Secrecy (Inverse Truth) + Manip
    const manipulation = clamp01((l.MANIP ?? 0.5) * 0.7 + (1 - (l.TRUTH ?? 0.5)) * 0.3);

  const axes: TomVectorAxis[] = [
    { id: 'care_power', labelLeft: 'Care', labelRight: 'Power', value: clamp01(carePower) },
    { id: 'order_chaos', labelLeft: 'Order', labelRight: 'Chaos', value: clamp01(orderChaos) },
    { id: 'sacrifice_ego', labelLeft: 'Sacrifice', labelRight: 'Ego', value: clamp01(sacrificeEgo) },
    { id: 'dominance', labelLeft: 'Sub', labelRight: 'Dom', value: clamp01(dominance) },
    { id: 'affiliation', labelLeft: 'Solo', labelRight: 'Group', value: clamp01(affiliation) },
    { id: 'manipulation', labelLeft: 'Direct', labelRight: 'Manip', value: clamp01(manipulation) }
  ];
  return { axes };
}

function computeCompositeUncertainty(entry: TomEntryGeneral, params: TomParams): number {
    // Simple aggregate
    const trustUnc = 1 - betaMean(entry.trust); // Proxy
    // Decay factor
    const decay = Math.max(0, entry.toM_Unc - 0.01 * entry.evidenceCount); 
    return clamp01(0.5 * trustUnc + 0.5 * decay);
}

// ... (Helper functions for beta, cosine, etc. remain same as previously defined or imported)
function dot(a: number[], b: number[]) { return a.reduce((s, v, i) => s + v * b[i], 0); }
function norm2(a: number[]) { return Math.sqrt(dot(a, a)); }
function cosineSim(a: number[], b: number[]) { return dot(a, b) / (norm2(a) * norm2(b) + 1e-9); }
function shiftToNonNegative(v: number[]) { return v.map(x=>Math.max(0,x)); }

function dummyOutputs(): TomOutputs {
    return {
        trustBase: 0.5, trustVar: 0.1, deceptionRisk: 0.5, promiseCredibility: 0.5, goalAlignment: 0.5, approval: 0.5, edgeWeight: 0.5, bandwidth: 0.5, transactionCost: 0.5, normConflict: 0.5, egoism: 0.5, altruism: 0.5,
        P_Follow: 0.5, P_DonateGoals: 0.5, P_TaskAssign: 0.5, P_TaskAccept: 0.5, P_CoalitionForm: 0.5, P_Compromise: 0.5, P_MandateGrant: 0.5, P_MandateRevoke: 0.5, P_PublicEndorse: 0.5, P_PublicDistance: 0.5, P_ConflictEscalation: 0.5, P_TieSurvival: 0.5, P_DeceptionByJ: 0.5, P_DetectionByI: 0.5, P_ShareSensitive: 0.5, P_PosteriorShift: 0.5,
        breakdowns: {}, topReasons: [], topGoalsDriving: [], sensitivity: { trustShare: 0, uncShare: 0 }, toM_Unc: 1, evidenceCount: 0, trustContribution: 0, uncertaintyContribution: 0, topGoalsForCooperation: [], topGoalsForConflict: [],
        tomVectorFingerprint: { axes: [] },
        tomStructuralDiagnosis: { SELF: { subjectivity: 0.5, cohesion: 0.5, alignment: 0.5, split: 0.5 }, WORLD: { acceptance: 0.5, threat: 0.5, fairness: 0.5, radicalism: 0.5 }, OTHERS: { care: 0.5, trust: 0.5, dependence: 0.5, threat: 0.5 }, SYSTEM: { formalism: 0.5, loyalty: 0.5, critic: 0.5, sacred: 0.5 } },
        tomStressProfile: { state: { cognitiveLoad: 0.5, emotionalDepletion: 0.5, bodyReserve: 0.5, overcontrol: 0.5, volatility: 0.5 }, trait: { traumaLoad: 0.5, hypervigilance: 0.5, stressTolerance: 0.5 }, coping: { avoidance: 0.5, aggression: 0.5, rescue: 0.5, overcontrol: 0.5 } },
        tomConfidence: 0, tomEntropyPreGoals: 1, tomEntropyTypes: 1
    };
}

function computeTruthVsBelief(belief: TomEntryGeneral, truth: CharacterDossier): TomTruthVsBelief {
  const res: TomTruthVsBelief = { truthPreGoals: [], truthTypes: [], truthLatents: [], truthLifeGoals: [], truthNorms: [] };
  
  // 1. Pre-Goals
  if (belief.preGoals) {
    const truthVec = buildTargetTruthPreGoalsVec(truth, belief.preGoals.labels);
    res.truthPreGoals = belief.preGoals.labels.map((label, i) => ({ preGoal: label, truth: truthVec[i], belief: belief.preGoals.mu[i], delta: belief.preGoals.mu[i] - truthVec[i] }));
  }
  
  // 2. Types / Latents
  if (belief.latents && truth.analysis?.latents) {
    // Use all keys including action types
    res.truthLatents = [...LATENT_KEYS, ...ACTION_TYPE_KEYS].map(key => {
      const tVal = read01(truth.analysis!.latents, key, 0.5);
      return { key, truth: tVal, belief: belief.latents[key], delta: belief.latents[key] - tVal };
    });
  }
  
  // 3. Action Types (Subset of Latents)
  const typeKeys = ACTION_TYPE_KEYS;
  res.truthTypes = typeKeys.map(t => {
      const tVal = read01(truth.analysis!.latents, t, 0.5);
      return { type: t, truth: tVal, belief: belief.latents[t] ?? 0.5, delta: (belief.latents[t] ?? 0.5) - tVal };
  });

  // 4. Norms
  const truthNorms = buildTomStructuralDiagnosisFrom(
      { system: 0.5, human: 0.5, autonomy: 0.5, harshness: 0.5, egoism: 0.5, altruism: 0.5 },
      truth.analysis?.latents || {},
      0.5, 0, // placehodlers
      { labels: belief.preGoals.labels, mu: buildTargetTruthPreGoalsVec(truth, belief.preGoals.labels), sigmaDiag: [] }
  );
  
  // Construct diffs for Norms (using SELF, WORLD etc blocks as proxies or just flattening structure?)
  // The UI expects a list of { key, label, truth, belief, delta }. 
  // Let's calculate the 6-axis NormProfile equivalent.
  
  // Calculate True Norm Profile
  const trueLatents = truth.analysis?.latents || {};
  const trueGoals = buildTargetTruthPreGoalsVec(truth, belief.preGoals.labels);
  const getTrueGoal = (id: string) => {
        const idx = belief.preGoals.labels.indexOf(id);
        return idx >= 0 ? trueGoals[idx] : 0.5;
  };

  const normKeys = ['system', 'human', 'autonomy', 'harshness', 'egoism', 'altruism'];
  const trueNormValues: Record<string, number> = {
        system: (trueLatents.FORMAL ?? 0.5) * 0.6 + getTrueGoal('maintain_order') * 0.4,
        human: (trueLatents.CARE ?? 0.5) * 0.6 + getTrueGoal('care') * 0.4,
        autonomy: (trueLatents.AGENCY ?? 0.5) * 0.6 + getTrueGoal('free_flow') * 0.4,
        harshness: (trueLatents.MANIP ?? 0.5) * 0.6 + getTrueGoal('power_status') * 0.4,
        egoism: (trueLatents.AGENCY ?? 0.5) * 0.7 + getTrueGoal('escape_transcend') * 0.3,
        altruism: (trueLatents.CARE ?? 0.5)
  };
  
  const believedNorms = belief.outputs.effectiveNorms as any || {}; // Or characterModel.perceivedNorms

  res.truthNorms = normKeys.map(k => ({
      key: k,
      label: k.charAt(0).toUpperCase() + k.slice(1),
      truth: trueNormValues[k] || 0.5,
      belief: believedNorms[k] || 0.5,
      delta: (believedNorms[k] || 0.5) - (trueNormValues[k] || 0.5)
  }));

  
  // 5. Check Life Goals
  if (truth.analysis?.life_goals_probs) {
       const lgTruth = truth.analysis.life_goals_probs;
       const predictedLifeGoals: Record<string, number> = {};
       for(const lgId in LIFE_TO_PREGOAL) {
           let score = 0;
           const weights = LIFE_TO_PREGOAL[lgId];
           for(const pgId in weights) {
               const idx = belief.preGoals.labels.indexOf(pgId);
               if(idx >= 0) score += belief.preGoals.mu[idx] * (weights[pgId as any] ?? 0);
           }
           predictedLifeGoals[lgId] = score;
       }
       
       res.truthLifeGoals = Object.keys(lgTruth).map(lgId => ({
           goalId: lgId,
           truth: lgTruth[lgId] ?? 0,
           belief: predictedLifeGoals[lgId] ?? 0,
           delta: (predictedLifeGoals[lgId] ?? 0) - (lgTruth[lgId] ?? 0)
       }));
  }
  
  return res;
}

function computeActionTypeBeliefs(latents: Record<string, number>): Array<{type: string, p: number}> {
    // Just return values since we populate them in latents now
    const keys = ACTION_TYPE_KEYS;
    const raw = keys.map(k => latents[k] ?? 0.5);
    const sum = raw.reduce((a,b)=>a+b,0) || 1;
    return keys.map((k, i) => ({ type: k, p: raw[i]/sum }));
}

function computeOutputs(
  observer: CharacterDossier,
  entry: TomEntryGeneral,
  params: TomParams,
  dyad: DyadFeatures,
  targetTruth?: CharacterDossier
): TomOutputs {
  const trustBase = betaMean(entry.trust);
  const trustVar = betaVar(entry.trust);
  const deceptionRisk = 1 - betaMean(entry.honesty);

  const selfGoals = extractSelfPreGoalVector(observer, entry.preGoals.labels);
  const believedGoals = normalizeL1Safe(shiftToNonNegative(entry.preGoals.mu));
  const goalAlignment = cosineSim(selfGoals, believedGoals);
  
  let goalAlignment_truth = 0;
  if (targetTruth) {
     const truthGoals = buildTargetTruthPreGoalsVec(targetTruth, entry.preGoals.labels);
     goalAlignment_truth = cosineSim(selfGoals, truthGoals);
  }

  const obsLatents = observer.analysis?.latents ?? {};
  const belLatents = entry.latents;
  let distSum = 0;
  let count = 0;
  for (const k of LATENT_KEYS) {
      const v1 = obsLatents[k] ?? 0.5;
      const v2 = belLatents[k] ?? 0.5;
      distSum += Math.abs(v1 - v2);
      count++;
  }
  const normConflict = count > 0 ? clamp01(distSum / count) : 0;
  
  const perceivedTypes = computeActionTypeBeliefs(belLatents);
  
  const { arch: perceivedArch, distance: percDist, top3: perceivedTop3 } = findTopArchetypes(belLatents);
  
  // Calculate Perceived Norms based on Latents & Goals
  const perceivedNorms = {
        system: (belLatents.FORMAL ?? 0.5) * 0.6 + believedGoals[entry.preGoals.labels.indexOf('preserve_order')] * 0.4,
        human: (belLatents.CARE ?? 0.5) * 0.6 + believedGoals[entry.preGoals.labels.indexOf('care')] * 0.4,
        autonomy: (belLatents.AGENCY ?? 0.5) * 0.6 + believedGoals[entry.preGoals.labels.indexOf('free_flow')] * 0.4,
        harshness: (belLatents.MANIP ?? 0.5) * 0.6 + believedGoals[entry.preGoals.labels.indexOf('power_status')] * 0.4,
        egoism: (belLatents.AGENCY ?? 0.5) * 0.7 + believedGoals[entry.preGoals.labels.indexOf('escape_transcend')] * 0.3,
        altruism: (belLatents.CARE ?? 0.5)
  };

  const characterModel: TomCharacterModel = {
      perceivedGoals: { 
          preGoals: entry.preGoals.labels.map((l, i) => ({ id: l, p: believedGoals[i] })),
          lifeGoals: [] 
      },
      perceivedTypes,
      perceivedLatents: belLatents,
      perceivedNorms,
      alignment: { goalsBelief: goalAlignment, goalsTruth: targetTruth ? goalAlignment_truth : null, normsBelief: 1-normConflict, normsTruth: null },
      riskProfile: { betrayRisk: deceptionRisk, escalationRisk: 0, tieSurvival: 0, deceptionRisk },
      relationshipRole: { label: 'unknown', confidence: 0.5 },
      egoism: 0.5, 
      altruism: 0.5
  };
  
  if (perceivedArch) {
      characterModel.perceivedArchetype = {
          id: perceivedArch.id,
          label: perceivedArch.data.name,
          score: 1.0,
          latents: getIdealLatentsForArchetype(perceivedArch.id)
      };
  }

  const biases = params.biases || {};
  const errorProfile: TomErrorProfile = {
      paranoia: clamp01((biases.hostile_attribution || 0) * 0.7 + (biases.trauma_reenactment || 0) * 0.6),
      naivete: clamp01((1 - (biases.cynicism || 0)) * 0.5),
      cynicism: clamp01((biases.cynicism || 0) * 0.8 + (biases.confirmation || 0) * 0.4),
      self_blame: clamp01((biases.anchoring || 0) * 0.3)
  };

  const tomStructuralDiagnosis = buildTomStructuralDiagnosisFrom(characterModel.perceivedNorms, belLatents, goalAlignment, normConflict, entry.preGoals);
  const tomStressProfile = buildTomStressProfileFrom(belLatents);
  const tomVectorFingerprint = buildTomVectorFingerprintFrom(entry, characterModel.perceivedNorms, entry.preGoals);

  const P_Follow = clamp01(trustBase * 0.5 + (belLatents.CL ?? 0.5) * 0.3 + (belLatents.SD ?? 0.5) * 0.2);
  const P_DonateGoals = clamp01(trustBase * 0.4 + (belLatents.EW ?? 0.5) * 0.4 + (1 - normConflict) * 0.2);
  const P_ConflictEscalation = clamp01(normConflict * 0.6 + (belLatents.RP ?? 0.5) * 0.4 - trustBase * 0.3);
  const P_TieSurvival = clamp01(trustBase * 0.7 + dyad.bond * 0.3 - P_ConflictEscalation * 0.5);

  const outputs: TomOutputs = {
      trustBase, trustVar, deceptionRisk, promiseCredibility: trustBase * (1-deceptionRisk),
      goalAlignment, goalAlignment_truth,
      approval: 0.5, edgeWeight: 0.5, bandwidth: 0.5, transactionCost: 0.5,
      normConflict, normConflict_truth: 0, egoism: 0.5, altruism: 0.5,
      
      P_Follow, P_DonateGoals, P_TaskAssign: 0.5, P_TaskAccept: 0.5,
      P_CoalitionForm: 0.5, P_Compromise: 0.5, P_MandateGrant: 0.5, P_MandateRevoke: 0.5,
      P_PublicEndorse: 0.5, P_PublicDistance: 0.5, P_ConflictEscalation, P_TieSurvival,
      P_DeceptionByJ: deceptionRisk, P_DetectionByI: 0.5, P_ShareSensitive: 0.5, P_PosteriorShift: 0.5,
      
      breakdowns: {}, topReasons: [], topGoalsDriving: [],
      sensitivity: { trustShare: 0, uncShare: 0 },
      toM_Unc: entry.toM_Unc, evidenceCount: entry.evidenceCount,
      trustContribution: 0, uncertaintyContribution: 0,
      topGoalsForCooperation: [], topGoalsForConflict: [],
      
      characterModel,
      tomVectorFingerprint,
      tomStructuralDiagnosis,
      tomStressProfile,
      errorProfile,
      
      tomConfidence: 1 - entry.toM_Unc,
      tomEntropyPreGoals: 0, tomEntropyTypes: 0,
      biases,
      
      effectiveNorms: characterModel.perceivedNorms as any,
      archetypeProjection: undefined,
      projectedTypes: [],
      projectionError: percDist,
      projectionDebug: {
          perceivedCandidates: perceivedTop3,
          perceivedError: percDist
      }
  };
  
  outputs.secondOrderSelf = computeSecondOrderSelf({
      observerDossier: observer,
      tomOutputs: outputs,
      characterModel,
      biases,
      errorProfile,
      affect: entry.affect
  });
  
  return outputs;
}

export function initTomGeneral(
    observer: CharacterDossier, 
    targetId: Id, 
    opts: { preGoalSpace?: string[]; targetTruthPreGoalsVec?: number[]; maxLog?: number; targetTruthDossier?: CharacterDossier; } = {}
): TomEntryGeneral {
  const observerId = observer.metadata.id;
  const dyad = deriveDyadFeaturesFromObserverHistory(observer, targetId);
  const params = deriveTomParams(observer, dyad, opts.maxLog ?? 240);
  const preGoals = opts.preGoalSpace ?? extractPreGoalSpace(observer);
  
  const initialLatents = { CH: 0.5, SD: 0.5, RP: 0.5, SO: 0.5, EW: 0.5, CL: 0.5, AGENCY: 0.5, SCOPE: 0.5, MANIP: 0.5, ACCEPT: 0.5, ACTION: 0.5, RADICAL: 0.5, TRUTH: 0.5, CARE: 0.5, FORMAL: 0.5 };
  
  const trustVal = 0.5; 
  const { vector: archetypeLatents, breakdown } = computeProjectedArchetypeVector(observer, dyad, trustVal);
  
  for (const k in initialLatents) {
      if (archetypeLatents[k] !== undefined) initialLatents[k as keyof typeof initialLatents] = archetypeLatents[k];
  }
  
  // Initialize Pre-Goals belief based on Project Archetype (NOT FLAT!)
  const archetypeGoalLogits = latentsToGoalLogits(archetypeLatents);
  const mu0Raw = preGoals.map(id => Math.max(0, (archetypeGoalLogits[id] ?? 0) + 1.0)); // Shift to positive range
  const sumMu = mu0Raw.reduce((a,b) => a+b, 0) || 1;
  const mu0 = mu0Raw.map(v => v / sumMu);
  const sigma0 = preGoals.map(() => params.goalPriorVarBase);

  const { projected: pureProj } = calculateProjectedLatents(
        opts.targetTruthDossier, 
        observer.analysis?.latents ?? {},
        params.biases || {},
        dyad,
        trustVal,
        1.0, 
        0.5
  );

  const entry: TomEntryGeneral = {
    observerId, targetId, 
    trust: { alpha: 1, beta: 1 }, honesty: { alpha: 1, beta: 1 },
    preGoals: { labels: preGoals, mu: mu0, sigmaDiag: sigma0 },
    latents: initialLatents, 
    toM_Unc: 1, evidenceCount: 0,
    outputs: dummyOutputs(), evidenceLog: [],
    affect: { fear: 0, anger: 0, shame: 0, hope: 0, exhaustion: 0 }
  };
  
  const outputs = computeOutputs(observer, entry, params, dyad, opts.targetTruthDossier);
  
  // Use findTopArchetypes for Prior matches
  const { arch: bestPriorArch, top3: priorTop3 } = findTopArchetypes(archetypeLatents);

  outputs.archetypeProjection = {
      selfWeight: breakdown.wSelf,
      targetWeight: 1 - breakdown.wSelf,
      projectedType: bestPriorArch?.data.name ?? '?',
      projectedArchetype: bestPriorArch ? {
          id: bestPriorArch.id,
          label: bestPriorArch.data.name,
          score: 1.0,
          description: bestPriorArch.data.tagline,
          lambda: bestPriorArch.lambda,
          mu: bestPriorArch.mu,
          f: bestPriorArch.f,
          latents: getIdealLatentsForArchetype(bestPriorArch.id)
      } : undefined
  };
  
  outputs.projectionDebug = {
      ...outputs.projectionDebug,
      priorCandidates: priorTop3, // Top 3 for Prior
  };

  outputs.characterModel = {
      ...outputs.characterModel!,
      projectedLatentsPure: pureProj,
      archetypeLatentsPure: archetypeLatents,
      projectedLatentsMixed: initialLatents,
      projectionBreakdown: breakdown
  };

  entry.outputs = outputs;
  entry.secondOrderSelf = outputs.secondOrderSelf;
  entry.errorProfile = outputs.errorProfile;

  return entry;
}

export function updateTomGeneral(
    observer: CharacterDossier, 
    prev: TomEntryGeneral, 
    observations: Observation[], 
    opts: { maxLog?: number; targetTruthDossier?: CharacterDossier; } = {}
): TomEntryGeneral {
  const targetId = prev.targetId;
  const dyad = deriveDyadFeaturesFromObserverHistory(observer, targetId);
  const params = deriveTomParams(observer, dyad, opts.maxLog ?? 240);
  const next: TomEntryGeneral = JSON.parse(JSON.stringify(prev)); 

  for (const obs of observations.slice().sort((a, b) => a.t - b.t)) {
    if (obs.actorId !== targetId) continue;
    next.evidenceCount += 1;
  }
  
  // NEW: Update Pre-Goals based on evidence
  if (observations.length > 0) {
        const currentMu = [...next.preGoals.mu];
        const labels = next.preGoals.labels;
        let changed = false;
        
        for (const obs of observations) {
             if (obs.preGoalEvidence) {
                 for (const [gId, weight] of Object.entries(obs.preGoalEvidence)) {
                     const idx = labels.indexOf(gId);
                     if (idx >= 0) {
                         // Simple additive update + normalization later
                         // Weight depends on observation intensity/salience
                         const delta = weight * (obs.intensity ?? 0.5) * 0.2; // Learning rate
                         currentMu[idx] += delta;
                         changed = true;
                     }
                 }
             }
        }

        if (changed) {
             // Softmax/Normalize
             const sum = currentMu.reduce((a, b) => a + Math.max(0, b), 0) || 1;
             next.preGoals.mu = currentMu.map(v => Math.max(0, v) / sum);
        }
  }
  
  // Recalculate Uncertainty
  next.toM_Unc = computeCompositeUncertainty(next, params);
  const U = next.toM_Unc;
  const trustVal = betaMean(next.trust);
  const normConf = next.outputs.normConflict;

  // 1. Calculate Projected Pure (L_proj)
  const { projected: projectedLatentsPure } = calculateProjectedLatents(
      opts.targetTruthDossier, 
      observer.analysis?.latents ?? {},
      params.biases || {},
      dyad,
      trustVal,
      U, 
      normConf
  );

  // 2. Apply Evidence to Latents if Truth is missing
  let workingLatents = { ...projectedLatentsPure };
  if (!opts.targetTruthDossier) {
      workingLatents = applyEvidenceToLatents(workingLatents, observations, params);
  }

  // === ARCHETYPE FEEDBACK LOOP (Stereotype Nudge) ===
  const { arch: posteriorArch, distance: postDist } = findTopArchetypes(workingLatents);

  if (posteriorArch) {
      const N_min = 3;
      const count = next.evidenceCount;
      
      // Confidence based on distance (closer = more confident)
      // Distance is usually 0.5 - 1.5 range.
      const archConfidence = 1 / (1 + postDist * 2); 

      if (count >= N_min && archConfidence > 0.4) {
           const biasFactor = 0.5 + (params.biases?.confirmation ?? 0) + (params.biases?.anchoring ?? 0) * 0.5;
           const historyFactor = 1 - Math.exp(-(count - N_min) / 4);
           const betaMax = 0.2;
           
           const feedbackWeight = clamp01(betaMax * historyFactor * archConfidence * biasFactor);
           
           if (feedbackWeight > 0.01) {
               const idealLatents = getIdealLatentsForArchetype(posteriorArch.id);
               for (const key of [...LATENT_KEYS, ...ACTION_TYPE_KEYS]) {
                   const current = workingLatents[key] ?? 0.5;
                   const ideal = idealLatents[key] ?? 0.5;
                   workingLatents[key] = (1 - feedbackWeight) * current + feedbackWeight * ideal;
               }
           }
      }
  }
  // ================================================

  // 3. Calculate Mixed Projected Archetype Vector (L_prior / L_arch)
  const { vector: archetypeLatents, breakdown: priorBreakdown } = computeProjectedArchetypeVector(observer, dyad, trustVal);
  
  // Prior Top 3
  const { arch: bestPriorArch, distance: distPrior, top3: priorTop3 } = findTopArchetypes(archetypeLatents);
  
  const interactionCount = next.evidenceCount;
  const hasHistory = interactionCount > 0;
  
  let archetypeMixWeight = 0;
  if (hasHistory) {
       const historyFactor = 1 - Math.exp(-interactionCount / 3); 
       archetypeMixWeight = clamp01(0.1 + 0.5 * U) * historyFactor;
  }

  for (const key of [...LATENT_KEYS, ...ACTION_TYPE_KEYS]) {
      const rawVal = workingLatents[key] ?? 0.5; 
      const archVal = archetypeLatents[key] ?? 0.5; 
      const mixedVal = (1 - archetypeMixWeight) * rawVal + archetypeMixWeight * archVal;
      next.latents[key] = mixedVal; 
  }
  
  // --- Blend Pre-Goals towards Archetype Belief if uncertainty is high ---
  // If we have few observations, our belief about goals should align with our belief about personality
  if (U > 0.6) {
      const archetypeGoalLogits = latentsToGoalLogits(next.latents);
      const archMuRaw = next.preGoals.labels.map(id => Math.max(0, (archetypeGoalLogits[id] ?? 0) + 1.0));
      const archSum = archMuRaw.reduce((a,b) => a+b, 0) || 1;
      const archMu = archMuRaw.map(v => v / archSum);
      
      // Blend factor: higher uncertainty -> more archetype reliance
      const blendFactor = (U - 0.6) * 0.5; // Max 0.2 mixing per tick
      
      next.preGoals.mu = next.preGoals.mu.map((v, i) => v * (1 - blendFactor) + archMu[i] * blendFactor);
  }

  // Posterior Top 3 (on mixed latents)
  const { top3: posteriorTop3 } = findTopArchetypes(next.latents);

  const outputs = computeOutputs(observer, next, params, dyad, opts.targetTruthDossier);
  outputs.egoism = prev.outputs.egoism; 
  outputs.altruism = prev.outputs.altruism;
  
  outputs.archetypeProjection = {
      selfWeight: priorBreakdown.wSelf,
      targetWeight: 1 - priorBreakdown.wSelf,
      projectedType: bestPriorArch?.data.name ?? '?',
      projectedArchetype: bestPriorArch ? {
          id: bestPriorArch.id,
          label: bestPriorArch.data.name,
          score: 1.0,
          description: bestPriorArch.data.tagline,
          lambda: bestPriorArch.lambda,
          mu: bestPriorArch.mu,
          f: bestPriorArch.f,
          latents: getIdealLatentsForArchetype(bestPriorArch.id)
      } : undefined
  };
  
  outputs.projectionDebug = {
      ...outputs.projectionDebug,
      priorCandidates: priorTop3,
      posteriorMatches: posteriorTop3, // Matches for Mixed
      dist_prior: distPrior,
      mix_penalty: (1 - archetypeMixWeight)
  };

  outputs.characterModel = {
      ...outputs.characterModel!,
      projectedLatentsPure: workingLatents,
      archetypeLatentsPure: archetypeLatents,
      projectedLatentsMixed: next.latents,
      projectionBreakdown: priorBreakdown
  };

  next.outputs = outputs;
  next.secondOrderSelf = outputs.secondOrderSelf;
  next.errorProfile = outputs.errorProfile;

  if (opts.targetTruthDossier) {
    next.truthVsBelief = computeTruthVsBelief(next, opts.targetTruthDossier);
  }
  return next;
}
