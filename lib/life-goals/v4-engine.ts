
import { AgentState, WorldState, CharacterGoalId, DistortionProfile, AgentPsychState, GoalAxisId, V42Metrics, MoralDissonance, AcuteState, CopingProfile, LocalActorRef } from '../../types';
import { ConcreteGoalId, ConcreteGoalDef, ConcreteGoalInstance, BioFeatureId, TargetedGoalDef, RelationalBioFeatureId, TargetKind, GoalContribDetail, GoalSandboxSnapshot } from './v4-types';
import { V4_GOAL_DEFINITIONS, V4_TARGETED_GOAL_DEFINITIONS } from './v4-params';
import { extractBioFeatures, extractRelationalBioFeatures } from '../biography/features';
import { GOAL_AXES } from '../life-goals/v3-params';
import { getNestedValue } from '../param-utils';
import { socialActions } from '../../data/actions-social';
import { actionGoalMap } from '../goals/space';
import { AgentContextFrame } from '../context/frame/types';
import { ContextAtom } from '../context/v2/types';
import { extractTargetCandidates } from '../goals/targeting';
import { getDyadMag } from '../tom/layers';

// Type for standardized metrics input including flattened psych/latent/field states
interface MetricInput {
    // Core V4.2
    Stress: number;
    Exhaust: number;
    SleepDebt: number;
    PainPhys: number;
    PainPsych: number;
    V: number;
    A: number;
    WMcap: number;
    DQ: number;
    Habit: number;
    Agency: number;
    TailRisk: number;
    Rmargin: number;
    PlanRobust: number;
    DriveU: number;
    InfoHyg: number;
    ImpulseCtl: number;
    Recovery: number;

    // Coping
    cop_avoid: number;
    cop_hyper: number;
    cop_aggr: number;
    cop_auto: number;
    cop_rescue: number;

    // Distortions
    mistrust: number;
    threat: number;
    self_blame: number;
    illus_control: number;
    black_white: number;
    catastroph: number;
    discount: number;
    personal: number;
    mindread: number;

    // Moral / Gaps
    SelfGap: number;
    OthersGap: number;
    SystemGap: number;
    MoralDiss: number;
    Guilt: number;
    Shame: number;
    Resilience: number;
    MeaningGap: number;

    // Fields
    SelfAgencyField: number;
    SelfCoherence: number;
    WorldAcceptance: number;
    WorldRadicalism: number;
    OthersCareField: number;
    OthersDepend: number;
    SystemFormalism: number;
    SystemLoyalty: number;

    // Latents
    Leadership: number;
    RiskLatent: number;
    Stability: number;
    Cruelty: number;
    EmpathyLatent: number;
    LoyaltyLatent: number;
    AutonomyLatent: number;
    SecrecyLatent: number;
    CooperationLatent: number;
    
    // Attachment
    att_sec: number;
    att_anx: number;
    att_av: number;
    att_dis: number;

    // Context
    ThreatToGroup: number;
    Threat: number;
    ChaosLevel: number;
    FearOfRejection: number;
    PerceivedExternalControl: number;
    
    // Narrative
    is_role_savior: number;
    is_role_leader: number;
    is_role_survivor: number;
    is_role_rebel: number;
    is_plot_survival: number;
    is_plot_duty: number;
    is_plot_revenge: number;
    is_plot_redemption: number;
    is_plot_mission: number;
    
    // Shadow
    ShadowStress: number;
    ShadowGuilt: number;
    
    // Modes
    ImpulseShare: number;
}

function clamp01(x: number) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
}

// Universal Targeted Goal Computer
function computeUniversalTargetedGoal(
    def: TargetedGoalDef,
    targetId: string,
    agent: AgentState,
    preGoalLogits: Record<GoalAxisId, number>,
    relBio: Record<RelationalBioFeatureId, number>,
    relMetrics: Record<string, number>
): ConcreteGoalInstance | null {

    let logit = def.baseLogit;
    let c_pre = 0;
    let c_met = 0;
    let c_bio = 0;
    
    const details: GoalContribDetail[] = [];
    const formulaParts: string[] = [`${def.baseLogit.toFixed(2)}`];
    
    details.push({ category: 'Base', key: 'Base Logit', agentValue: 1, weight: def.baseLogit, contribution: def.baseLogit });

    // 1. Pre-Goal Weights (Global Personality Axis)
    for (const [axis, w] of Object.entries(def.preGoalWeights)) {
        const val = preGoalLogits[axis as GoalAxisId] || 0;
        const weight = w ?? 0;
        const contrib = weight * val;
        c_pre += contrib;
        details.push({ category: 'Trait/Archetype', key: axis, agentValue: val, weight: weight, contribution: contrib });
        if (Math.abs(contrib) > 0.05) formulaParts.push(`${weight > 0 ? '+' : ''}${(weight as number).toFixed(1)}*${axis}(${val.toFixed(1)})`);
    }

    // 2. Relational Metrics (Trust, Fear, etc.)
    for (const [key, w] of Object.entries(def.relationalMetricWeights)) {
        const val = relMetrics[key] ?? 0;
        const weight = w ?? 0;
        const contrib = weight * val;
        c_met += contrib;
        details.push({ category: 'Relational', key: key, agentValue: val, weight: weight, contribution: contrib });
        if (Math.abs(contrib) > 0.05) formulaParts.push(`${weight > 0 ? '+' : ''}${(weight as number).toFixed(1)}*${key}(${val.toFixed(1)})`);
    }

    // 3. Relational Bio Features
    for (const [key, w] of Object.entries(def.relationalBioWeights)) {
        const val = relBio[key as RelationalBioFeatureId] ?? 0;
        const weight = w ?? 0;
        const contrib = weight * val;
        c_bio += contrib;
        if (Math.abs(contrib) > 0.01) {
             details.push({ category: 'Bio/History', key: key, agentValue: val, weight: weight, contribution: contrib });
             formulaParts.push(`${weight > 0 ? '+' : ''}${(weight as number).toFixed(1)}*${key}(${val.toFixed(1)})`);
        }
    }

    logit += c_pre + c_met + c_bio;

    // Threshold for inclusion
    if (logit <= -2.0) return null;

    return {
        id: `${def.id}_${targetId}`,
        defId: def.id,
        label: def.labelTemplate.replace('{target}', targetId), 
        logit,
        score: 0, // Normalized later
        layer: def.layer,
        domain: def.domain,
        targetId,
        targetKind: 'PERSON',
        contribs: {
            base: def.baseLogit,
            preGoals: c_pre,
            metrics: c_met,
            bio: c_bio
        },
        breakdown: details,
        formula: formulaParts.join(' ')
    };
}

export function computeConcreteGoals(
    agent: AgentState,
    preGoalLogits: Record<GoalAxisId, number>, 
    world?: WorldState,
    nearbyActors: LocalActorRef[] = [], // Allow passing sandbox actors
    frame?: AgentContextFrame,
    contextAtoms?: ContextAtom[] // Add ContextAtoms for improved targeting
): ConcreteGoalInstance[] {
    
    const bioFeatures = extractBioFeatures(agent.historicalEvents || []);
    const goals: ConcreteGoalInstance[] = [];

    // Prioritize frame-based facts if available
    const localWoundedCount = frame ? frame.what.localWoundedCount : (world ? ((world as any).localWoundedForce ?? nearbyActors.filter(a => a.isWounded).length) : 0);
    const hasLocalWoundedDetected = localWoundedCount > 0;
    const isThreatPresent = frame ? (frame.derived?.threatIndex ?? 0) > 0.3 : (world?.scene?.metrics?.threat ? world.scene.metrics.threat > 40 : false);

    // 1. Static Definitions Loop (Self-Goals)
    for (const def of V4_GOAL_DEFINITIONS) {
        let logit = def.baseLogit;
        let c_pre = 0;
        let c_bio = 0;
        
        const details: GoalContribDetail[] = [];
        const formulaParts: string[] = [`${def.baseLogit.toFixed(2)}`];
        
        details.push({ category: 'Base', key: 'Base Logit', agentValue: 1, weight: def.baseLogit, contribution: def.baseLogit });

        for (const [axis, w] of Object.entries(def.preGoalWeights)) {
            const val = preGoalLogits[axis as GoalAxisId] || 0;
            const weight = w ?? 0;
            const contrib = weight * val;
            c_pre += contrib; 
            details.push({ category: 'Trait/Archetype', key: axis, agentValue: val, weight: weight, contribution: contrib });
            if (Math.abs(contrib) > 0.05) formulaParts.push(`${weight > 0 ? '+' : ''}${weight.toFixed(1)}*${axis}(${val.toFixed(1)})`);
        }

        for (const [bKey, w] of Object.entries(def.bioWeights)) {
            const val = bioFeatures[bKey as any] ?? 0;
            const weight = w ?? 0;
            const contrib = weight * val;
            c_bio += contrib;
             if (Math.abs(contrib) > 0.01) {
                details.push({ category: 'Bio/History', key: bKey, agentValue: val, weight: weight, contribution: contrib });
                formulaParts.push(`${weight > 0 ? '+' : ''}${weight.toFixed(1)}*${bKey}(${val.toFixed(1)})`);
            }
        }

        logit += c_pre + c_bio;

        // Contextual gating based on simplified formalized context
        if (def.id === 'c_preserve_group_safety' || def.id === 'c_fix_local_injustice') {
             if (!hasLocalWoundedDetected) {
                  logit -= 5.0; 
                  details.push({ category: 'State/Metric', key: 'Gate: No Local Wounded', agentValue: 0, weight: -5.0, contribution: -5.0 });
                  formulaParts.push(" - 5.0 (No local wounded)");
             }
        }
        
        if (def.id === 'c_find_safe_place') {
            if (!isThreatPresent) {
                 logit -= 3.0;
                 formulaParts.push(" - 3.0 (Low threat)");
            }
        }

        goals.push({
            id: def.id,
            defId: def.id,
            label: def.label,
            logit,
            score: 0,
            layer: def.layer,
            domain: def.domain,
            contribs: { base: def.baseLogit, preGoals: c_pre, metrics: 0, bio: c_bio },
            breakdown: details,
            formula: formulaParts.join(' ')
        });
    }

    // 2. Targeted Goals
    const targets = new Set<string>();
    
    // --- Target Selection Using Atoms (New Mechanism) ---
    // This allows better filtering than just iterating all agents
    if (contextAtoms) {
        // Use the helper to extract candidates
        const candidates = extractTargetCandidates(agent.entityId, contextAtoms, { minDistanceNorm: 0.1 });
        candidates.forEach(c => targets.add(c.id));
    } else {
        // Fallback to legacy extraction if atoms not present (e.g. static view)
        if (world) world.agents.forEach(a => { if (a.entityId !== agent.entityId) targets.add(a.entityId); });
        nearbyActors.forEach(a => targets.add(a.id));
        if (agent.relationships) Object.keys(agent.relationships).forEach(id => targets.add(id));
        agent.historicalEvents?.forEach(e => {
            if (e.participants) e.participants.forEach(p => targets.add(p));
            if ((e.payload as any)?.targetId) targets.add((e.payload as any).targetId);
            if ((e.payload as any)?.otherId) targets.add((e.payload as any).otherId);
        });
    }

    // STRICT SELF-TARGETING PREVENTION
    targets.delete(agent.entityId);

    for(const targetId of targets) {
         // Try to get relation from world/agent, or construct from nearbyActors data
         let rel = agent.relationships?.[targetId];
         let role: string | undefined;
         let threatLevel = 0;
         
         const nearby = nearbyActors.find(a => a.id === targetId);
         if (nearby) {
             role = nearby.role;
             threatLevel = nearby.threatLevel ?? 0;
         }
         
         // Mock relation if missing based on sandbox role
         if (!rel && nearby) {
             rel = {
                 trust: nearby.kind === 'ally' ? 0.8 : 0.1,
                 conflict: nearby.kind === 'enemy' ? 0.9 : 0.1,
                 bond: nearby.role === 'leader' ? 0.5 : 0.1,
                 align: 0.5,
                 fear: nearby.kind === 'enemy' ? 0.6 : 0.1,
                 respect: nearby.role === 'leader' ? 0.8 : 0.5,
                 history: []
             };
         }
         
         const relBio = extractRelationalBioFeatures(agent.historicalEvents || [], targetId);
         
        // Prefer dyad ToM atoms when present; fallback to stored relationship state.
        // This ensures targeted ToM goals respond to the contextual ToM pipeline.
        const dyad = (metric: string, fb: number) => {
            try {
                const v = getDyadMag(contextAtoms as any, agent.entityId, targetId, metric, NaN as any);
                return Number.isFinite(v) ? v : fb;
            } catch {
                return fb;
            }
        };

        const trust = dyad('trust', rel?.trust ?? 0.5);
        const threat = dyad('threat', rel?.fear ?? 0.1);
        const intimacy = dyad('intimacy', rel?.bond ?? 0.1);
        const alignment = dyad('alignment', rel?.align ?? 0.5);
        const respect = dyad('respect', rel?.respect ?? 0.5);
        const dominance = dyad('dominance', rel?.dominance ?? (role === 'leader' ? 0.8 : 0.5));

        const relMetrics: Record<string, number> = {
            Trust: trust,
            Bond: intimacy,
            Fear: threat,
            Respect: respect,
            Conflict: Math.max(threat, dyad('uncertainty', rel?.conflict ?? 0.1)),
            Align: alignment,
            Significance: clamp01(intimacy * 0.7 + alignment * 0.3),
            Dominance: dominance,
            Legitimacy: dyad('support', rel?.legitimacy ?? (role === 'leader' ? 0.9 : respect)),
        };

         for (const def of V4_TARGETED_GOAL_DEFINITIONS) {
             const inst = computeUniversalTargetedGoal(def, targetId, agent, preGoalLogits, relBio, relMetrics);
             if (inst) {
                 // Apply Contextual Boosts
                 if (nearby) {
                     if (nearby.role === 'wounded' && inst.defId === 'c_protect_target') {
                         inst.logit += 2.0;
                         inst.breakdown.push({ category: 'State/Metric', key: 'Wounded Status', agentValue: 1, weight: 2.0, contribution: 2.0 });
                         inst.formula += " + 2.0(Wounded)";
                     }
                     if (nearby.role === 'leader' && inst.defId === 'c_obey_target') {
                         inst.logit += 1.5;
                         inst.breakdown.push({ category: 'State/Metric', key: 'Leader Status', agentValue: 1, weight: 1.5, contribution: 1.5 });
                         inst.formula += " + 1.5(Leader)";
                     }
                 }
                 goals.push(inst);
             }
         }
    }

    // 3. Softmax & Sorting
    const maxLogit = Math.max(...goals.map(g => g.logit));
    let sumExp = 0;
    const T = 1.0; 

    for(const g of goals) {
        const ex = Math.exp((g.logit - maxLogit) / T);
        g.score = ex;
        sumExp += ex;
    }
    
    for(const g of goals) {
        g.score = g.score / sumExp;
    }

    return goals.sort((a, b) => b.score - a.score);
}
