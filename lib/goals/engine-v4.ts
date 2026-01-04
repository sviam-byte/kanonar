
// lib/goals/engine-v4.ts

import { CharacterGoalId, WorldState, AgentState, GoalDomainId, SceneMetrics, GoalAxisId, AgentPsychState, ExposureTraces, Worldview, GoalComponentContrib, ContextV2, Sys1Analysis, ActionSuggestion, Formula, ContextGoal, LocalActorRef, Action, AgentContextFrame, ContextAtom } from '../../types';
import { GOAL_DEFS, actionGoalMap } from './space';
import { computeTraitLogits } from '../life-goals/life-from-traits';
import { computeBioLogitsV3 } from '../life-goals/life-from-biography';
import { makeZeroGoalLogits } from '../life-goals/psych-to-goals';
import { mapAxesToLifeGoals, computeTemperatureV3, computeLifeGoalsLogits, ArchetypePack } from '../life-goals/life-engine';
import { GOAL_AXES } from '../life-goals/v3-params';
import { computeDomainFromNearbyActors, buildContextV2FromWorld } from './context-v2';
import { socialActions } from '../../data/actions-social';
import { V4_GOAL_DEFINITIONS, V4_TARGETED_GOAL_DEFINITIONS } from '../life-goals/v4-params';
import { GoalContribDetail, ConcreteGoalInstance, ConcreteGoalId, BioFeatureId, TargetedGoalDef, RelationalBioFeatureId, TargetKind, GoalSandboxSnapshot } from '../life-goals/v4-types';
import { extractBioFeatures, extractRelationalBioFeatures } from '../biography/features';
import { getNestedValue } from '../param-utils';
// FIX: Removed missing import getLocationGoalProfileForAgent.
import { getLocationForAgent } from "../world/locations";
import { GOAL_CATALOG } from "../../data/goals/catalog";
import { hydrateLocation, calculateLocationGoalInfluence } from '../adapters/rich-location';
import { calculateAllCharacterMetrics } from '../metrics';
import { Branch } from '../../types';
import { system1Weight } from '../psych/system1';
import { computeEffectiveBehaviorProfile } from '../archetypes/behavior';
import { computeQ } from '../choice/qvalue';
import { listPossibleActions } from '../systems/DecisionSystem';
import { buildFullAgentContextFrame } from '../context/v4/build';
import { hasLocalWounded } from '../context/v2/nearbyWounded';
import { buildAtomsFromFrame } from '../context/v4/atoms';
import { extractTargetCandidates } from './targeting';
import { getRelationshipFromTom } from '../tom/rel';

export interface EvaluateGoalsRequestV4 {
  world: WorldState;
  agent: AgentState;
  sys1Config?: any; // Placeholder
  frame?: AgentContextFrame;
}

export interface EvaluateGoalsResultV4 {
  chosenGoals: any[]; // GoalState[] or similar
  sys1: Sys1Analysis;
  ctxV2: ContextV2;
  frame?: AgentContextFrame;   // полная структура “кто/где/что/как/почему”
  contextAtoms?: ContextAtom[]; // атомизированный контекст для дебага/аналитики
}

// Helper: Calculate Sys1
function calculateSys1Analysis(agent: AgentState, context: ContextV2): Sys1Analysis {
    const stress = (agent.body?.acute?.stress ?? 0) / 100;
    const alpha = system1Weight(stress);
    
    return {
        isActive: alpha > 0.5,
        pressure: stress,
        threshold: 0.6,
        breakdown: {
            pressure: { equation: "Stress", vars: { stress }, result: stress },
            threshold: { equation: "Constant", vars: {}, result: 0.6 }
        }
    };
}

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
    nearbyActors: LocalActorRef[] = [],
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

        // If relationships are missing/uninitialized, fall back to dyadic ToM.
        // This prevents "romance/close bond" pairs from behaving like strangers.
        if (!rel && world) {
          rel = getRelationshipFromTom({ world, agent, selfId: agent.entityId, otherId: targetId }) || rel;
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
         
         const relMetrics: Record<string, number> = {
             Trust: rel?.trust ?? 0.5,
             Bond: rel?.bond ?? 0.1,
             Fear: rel?.fear ?? 0.1,
             Respect: rel?.respect ?? 0.5,
             Conflict: rel?.conflict ?? 0.1,
             Align: rel?.align ?? 0.5,
             Significance: (rel?.bond ?? 0) * 0.7 + Math.abs((rel?.align ?? 0.5) - 0.5),
             Dominance: role === 'leader' ? 0.8 : 0.5,
             Legitimacy: role === 'leader' ? 0.9 : 0.5,
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

export function snapshotGoals(
    world: WorldState,
    agent: AgentState,
    params: { scenarioId?: string, tick?: number, agentId?: string }
): GoalSandboxSnapshot {
     // Reconstruct z_total from debug components
     let z_total = makeZeroGoalLogits();
     
     if (agent.goalEcology?.lifeGoalDebug) {
         const { g_traits, g_bio, g_psych, g_distortion, weights, g_archetype_main } = agent.goalEcology.lifeGoalDebug;
         const wA = 2.0; 

         for (const axis of GOAL_AXES) {
              z_total[axis] = 
                  weights.wT * (g_traits[axis] || 0) + 
                  weights.wB * (g_bio[axis] || 0) + 
                  weights.wP * ((g_psych[axis] || 0) + (g_distortion?.[axis] || 0)) +
                  wA * (g_archetype_main[axis] || 0);
          }
     }
     
     // To generate a snapshot with full context, we need to build the frame.
     // If this is called from within a loop where frame is not available, we build it.
     const frame = buildFullAgentContextFrame(world, agent.entityId);
     const atoms = frame ? buildAtomsFromFrame(frame, world.tick, world) : [];

     const concreteGoals = computeConcreteGoals(agent, z_total, world, [], frame || undefined, atoms);
     
     return {
         scenarioId: params.scenarioId || 'unknown',
         tick: params.tick || world.tick,
         agentId: agent.entityId,
         contextGoals: concreteGoals,
         frame: frame || undefined,
         atoms
     };
}

export function computeContextGoalsForAgent(world: WorldState, agentId: string): GoalSandboxSnapshot | null {
    const agent = world.agents.find(a => a.entityId === agentId);
    if(!agent) return null;
    return snapshotGoals(world, agent, { agentId });
}

export function evaluateGoalsV4(req: EvaluateGoalsRequestV4): EvaluateGoalsResultV4 {
  const { world, agent, sys1Config } = req;

  const frame = req.frame ?? buildFullAgentContextFrame(world, agent.entityId);

  // t можно взять из world.storyTime / world.tick / world.time — подгони под свою модель
  const t = (world as any).tick ?? (world as any).time ?? 0;
  const contextAtoms = frame ? buildAtomsFromFrame(frame, t, world) : [];
  
  const ctxV2 = buildContextV2FromWorld(world, agent);
  const sys1 = calculateSys1Analysis(agent, ctxV2);
  
  // пример: получение таргет-кандидатов для дальнейших целей
  const targetCandidates = extractTargetCandidates(agent.entityId, contextAtoms, {
    minDistanceNorm: 0.2,
  });

  // V4 goal computation integrated here in future if we replace deriveGoalCatalog
  
  return {
    chosenGoals: [], // populated elsewhere or by V3 for now
    sys1,
    ctxV2,
    frame: frame || undefined,
    contextAtoms,
  };
}
