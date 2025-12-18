
import { Branch, CharacterEntity, EntityParams, FullCharacterMetrics, SocialEventEntity, V42Metrics, ToMDashboardMetrics, ToMV2DashboardMetrics, BehavioralAdvice, GoalEcology, AgentState, ArchetypeMode, GoalAxisId } from '../types';
import { flattenObject, setNestedValue, getNestedValue } from './param-utils';
import { latentSchema } from '../data/latent-schema';
import { calculatePrMonstroDay } from './formulas';
import { calculateV42Metrics, normalizeParamsForV42 } from './character-metrics-v4.2';
import { calculateToMMetrics } from './tom-metrics';
import { calculateTomV2Metrics } from './tom-v2-metrics';
import { calculateDerivedMetrics } from './derived-metrics';
import { calculateBehavioralAdvice } from './behavioral-advisor';
import { deriveGoalCatalog } from './goals/generate';
import { calculateEventImpacts } from './events';
import { calculateSocialEventImpacts } from './social-events';
import { applyToMFeedback } from './tom/feedback';
import { applyGlobalRoles } from './social/roles';
import { calculateFieldMetrics } from './archetypes/structural-metrics';
import { recomputeAgentPsychState } from './metrics/psych-layer';
import { computePsychGoalBoosts } from './goals/psych-modifiers';
import { computeArchetypeEffects } from './archetypes/effects';
import { calculateArchetypeMetricsFromVectorBase, METRIC_NAMES } from './archetypes/metrics';
import { allArchetypes, GOAL_AXIS_NAMES } from '../data/archetypes';

// Unified Life Goals & Biography Modules
import { computeBiographyLatent, BiographyLatent } from './biography/lifeGoalsEngine';
import { computeEffectiveVector, mapPersonalToBio } from './biography';
import { computeLifeGoalsLogits, GoalLogits, ArchetypePack } from './life-goals/life-engine';
import { mapCharacterToBehaviorParams } from './core/character_mapper';
import { makeZeroGoalLogits } from './life-goals/psych-to-goals';
import { computeTraitLogits } from './life-goals/life-from-traits';
import { LifeGoalVector, LifeGoalId } from './life-goals/types-life';
import { normalize } from './util/math';
import { computeConcreteGoals } from './life-goals/v4-engine'; 

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// Helper to mix manual goals with calculated goals
function mixLifeGoals(g_manual: LifeGoalVector | undefined, g_calc: LifeGoalVector): LifeGoalVector {
    if (!g_manual || Object.keys(g_manual).length === 0) return g_calc;
    
    const alpha = 0.5; // 50% Manual, 50% Calculated
    const out: LifeGoalVector = {};
    const allKeys = new Set([...Object.keys(g_manual), ...Object.keys(g_calc)]) as Set<LifeGoalId>;
    
    for (const id of allKeys) {
        const s = g_manual[id] ?? 0;
        const c = g_calc[id] ?? 0;
        out[id] = s * alpha + c * (1 - alpha);
    }
    
    // Normalize
    let sum = 0;
    for(const k in out) sum += out[k as LifeGoalId]!;
    if (sum > 0) {
        for(const k in out) out[k as LifeGoalId]! /= sum;
    }
    
    return out;
}

// Helper to get archetype goal logits
function getArchetypeLogits(archId: string | undefined): GoalLogits {
    const z = makeZeroGoalLogits();
    if (!archId) return z;
    
    const arch = allArchetypes.find(a => a.id === archId);
    if (arch && arch.data.goals?.primary?.axes) {
        const axes = arch.data.goals.primary.axes;
        // Copy values from archetype definition to logits
        // Map 0..1 -> -1..1 for stronger impact and scale
        for(const key in axes) {
            const k = key as GoalAxisId;
            if (axes[k] !== undefined) {
                z[k] = (axes[k]! - 0.5) * 4.0;
            }
        }
    }
    return z;
}

export function applyAging(character: CharacterEntity): CharacterEntity {
    const agedChar = JSON.parse(JSON.stringify(character));
    const age = agedChar.context?.age || 30;
    const ageFactor = Math.max(0, (age - 30) / 50);

    if (agedChar.body) {
        if (agedChar.body.constitution) {
            agedChar.body.constitution.strength_max = (agedChar.body.constitution.strength_max ?? 0.5) * (1 - 0.2 * ageFactor);
            agedChar.body.constitution.endurance_max = (agedChar.body.constitution.endurance_max ?? 0.5) * (1 - 0.3 * ageFactor);
        }
        if (agedChar.body.capacity) {
            agedChar.body.capacity.VO2max = (agedChar.body.capacity.VO2max ?? 50) * (1 - 0.4 * ageFactor);
        }
    }

    return agedChar;
}

export function calculateLatentsAndQuickStates(flatParams: EntityParams): { latents: Record<string, number>, quickStates: Record<string, number> } {
    const latents: Record<string, number> = {};

    // Calculate Latents
    for (const [key, schema] of Object.entries(latentSchema)) {
        let sum = 0;
        let count = 0;
        for (const comp of schema.components) {
             const fullKey = `vector_base.${comp.key}`;
             const val = flatParams[fullKey] ?? flatParams[comp.key] ?? 0.5;

             if (comp.weight > 0) {
                 sum += val;
             } else {
                 sum += (1 - val);
             }
             count++;
        }
        latents[key] = count > 0 ? sum / count : 0.5;
    }

    // Calculate Quick States
    const quickStates: Record<string, number> = {};

    // Social Support Proxy (for PrMonstro)
    const rec = flatParams['vector_base.C_reciprocity_index'] ?? 0.5;
    const loy = flatParams['vector_base.C_coalition_loyalty'] ?? 0.5;
    const sec = flatParams['vector_base.A_Transparency_Secrecy'] ?? 0.5;
    quickStates['social_support_proxy'] = (rec + loy + (1 - sec)) / 3;

    // Decision Readiness (DR)
    const disc = flatParams['vector_base.B_cooldown_discipline'] ?? 0.5;
    const goalC = flatParams['vector_base.B_goal_coherence'] ?? 0.5;
    const cal = flatParams['vector_base.E_Model_calibration'] ?? 0.5;
    quickStates['DR'] = (disc + goalC + cal) / 3;

    // Stability Index (SI)
    const trad = flatParams['vector_base.A_Tradition_Continuity'] ?? 0.5;
    const leg = flatParams['vector_base.A_Legitimacy_Procedure'] ?? 0.5;
    const stab = flatParams['vector_base.A_Safety_Care'] ?? 0.5;
    quickStates['SI'] = (trad + leg + stab) / 3;

    // Dark Susceptibility
    const sens = flatParams['vector_base.C_reputation_sensitivity'] ?? 0.5;
    const dark = (flatParams['state.dark_exposure'] ?? 0) / 100;
    const trauma = (flatParams['body.acute.moral_injury'] ?? 0) / 100;
    quickStates['dark_susceptibility'] = (sens + dark + trauma) / 3;

    // Phys Fitness
    const str = flatParams['body.functional.strength_upper'] ?? 0.5;
    const end = flatParams['body.functional.aerobic_capacity'] ?? 0.5;
    quickStates['phys_fitness'] = (str + end) / 2;

    // Phys Fragility
    const knee = flatParams['body.functional.injury_risk.knees'] ?? 0.5;
    const back = flatParams['body.functional.injury_risk.lower_back'] ?? 0.5;
    quickStates['phys_fragility'] = (knee + back) / 2;

    // Hormone Tension
    const hpa = flatParams['body.regulation.HPA_axis'] ?? 0.5;
    const stress = (flatParams['body.acute.stress'] ?? 0) / 100;
    quickStates['hormone_tension'] = (hpa + stress) / 2;

    // ToM Quality proxy (for SDE loop)
    const meta = flatParams['vector_base.G_Metacog_accuracy'] ?? 0.5;
    const ch = latents['CH'] ?? 0.5;
    quickStates['ToM_Q'] = (meta + ch) / 2;

    // Topology (for SDE)
    const topo = flatParams['vector_base.E_KB_topos'] ?? 0.5;
    quickStates['T_topo'] = topo;

    // PrMonstro Calculation (Quick)
    const s = {
        stress: flatParams['body.acute.stress'] ?? 0,
        fatigue: flatParams['body.acute.fatigue'] ?? 0,
        darkness: flatParams['state.dark_exposure'] ?? 0
    };
    quickStates['prMonstro'] = calculatePrMonstroDay(flatParams, s, latents, quickStates);

    return { latents, quickStates };
}

export function calculateAllCharacterMetrics(
    character: CharacterEntity,
    branch: Branch,
    socialEvents: SocialEventEntity[]
): FullCharacterMetrics {
    
    // 0. Calculate Effective Vector Base (Bio-Distorted)
    const bioEvents = character.historicalEvents || [];
    const bioLatentObj = computeBiographyLatent(bioEvents);
    
    const bioVector = [
        Math.tanh((bioLatentObj.traumaSelf + bioLatentObj.traumaOthers + bioLatentObj.traumaWorld + bioLatentObj.traumaSystem) / 4), 
        Math.tanh(bioLatentObj.socialBondPositive - bioLatentObj.socialLossNegative),
        Math.tanh(bioLatentObj.leadershipEpisodes * 0.2),
        Math.tanh(bioLatentObj.rescueSuccess * 0.3 - bioLatentObj.rescueFailure * 0.3),
        Math.tanh(bioLatentObj.subordinationEpisodes * 0.2),
        Math.tanh(bioLatentObj.traumaWorld * 0.5)
    ];
    
    const effectiveVectorBase = computeEffectiveVector(character.vector_base || {}, bioVector);
    
    const effectiveCharacter = {
        ...character,
        vector_base: effectiveVectorBase
    };

    // 1. Flatten & Apply Events
    let flatParams = flattenObject(effectiveCharacter);
    const eventImpacts = calculateEventImpacts(effectiveCharacter, effectiveCharacter.historicalEvents || [], flatParams);

    const eventAdjustedFlatParams = { ...flatParams };
    for (const [key, delta] of Object.entries(eventImpacts.paramDeltas)) {
        eventAdjustedFlatParams[key] = clamp01((eventAdjustedFlatParams[key] || 0) + delta);
    }

    const socialImpacts = calculateSocialEventImpacts(effectiveCharacter, socialEvents, eventAdjustedFlatParams);
    for (const [key, delta] of Object.entries(socialImpacts.paramDeltas)) {
        eventAdjustedFlatParams[key] = clamp01((eventAdjustedFlatParams[key] || 0) + delta);
    }

    const goalActivationDeltas = { ...eventImpacts.goalActivationDeltas };
    for (const [key, delta] of Object.entries(socialImpacts.goalActivationDeltas)) {
        goalActivationDeltas[key] = (goalActivationDeltas[key] || 0) + delta;
    }

    // Handle lifeGoalWeights from events
    if (effectiveCharacter.historicalEvents) {
        for (const event of effectiveCharacter.historicalEvents) {
            if (event.lifeGoalWeights) {
                if (!effectiveCharacter.lifeGoals) effectiveCharacter.lifeGoals = {};
                for (const [goal, weight] of Object.entries(event.lifeGoalWeights)) {
                    effectiveCharacter.lifeGoals[goal] = (effectiveCharacter.lifeGoals[goal] || 0) + (weight || 0);
                }
            }
        }
    }

    // 2. Latents & Quick States
    const { latents, quickStates } = calculateLatentsAndQuickStates(eventAdjustedFlatParams);

    // 3. V4.2 Metrics
    const normParams = normalizeParamsForV42(eventAdjustedFlatParams);
    let v42metrics = calculateV42Metrics(normParams, latents, 0);

    // 4. ToM Metrics
    let tomMetrics = calculateToMMetrics(eventAdjustedFlatParams, latents, v42metrics, null);
    let tomV2Metrics = calculateTomV2Metrics(effectiveCharacter, latents, v42metrics, tomMetrics);

    const feedbackLatents = applyToMFeedback(latents, tomV2Metrics);
    v42metrics = calculateV42Metrics(normParams, feedbackLatents, 0, tomV2Metrics);
    tomMetrics = calculateToMMetrics(eventAdjustedFlatParams, feedbackLatents, v42metrics, tomV2Metrics);

    // 5. Derived Metrics
    const derivedMetrics = calculateDerivedMetrics(eventAdjustedFlatParams, feedbackLatents, quickStates, null);

    // 6. Field Metrics
    const fieldMetrics = calculateFieldMetrics(effectiveCharacter, (character as any).trauma || {self:0, others:0, world:0, system:0});

    // 7. Psych Layer
    const psych = recomputeAgentPsychState(
        (character as AgentState).psych,
        effectiveCharacter,
        fieldMetrics,
        (character as AgentState).identityProfile?.archetypeObserved || null,
        (character as AgentState).archetype?.phase || 'normal',
        (character as AgentState).narrativeState?.episodes || []
    );

    // 8. Archetype Goal Boosts
    const archetypeGoalBoosts = computeArchetypeEffects(character as AgentState).goalMods || {};
    const psychGoalBoosts = computePsychGoalBoosts(character as AgentState);

    // 9. Role & Global Effects
    const { baseGoalBoosts } = applyGlobalRoles(character);

    (effectiveCharacter as any).psych = psych;

    // --- NEW: DYNAMIC LIFE GOALS (V3 ENGINE) ---
    const z_traits = computeTraitLogits(effectiveVectorBase);
    const archTrueId = character.identity?.arch_true_dominant_id;
    const archShadowId = character.identity?.arch_self_dominant_id; 
    const archePack: ArchetypePack = {
        main: getArchetypeLogits(archTrueId),
        shadow: getArchetypeLogits(archShadowId)
    };
    
    const { finalVector: calculatedLifeGoals, debug: lifeGoalDebug } = computeLifeGoalsLogits(
        effectiveCharacter,
        z_traits,
        makeZeroGoalLogits(), 
        makeZeroGoalLogits(), 
        archePack,
        psych,
        character.entityId
    );
    
    // --- NEW: V4 CONCRETE GOALS ENGINE ---
    const z_total = makeZeroGoalLogits();
    if (lifeGoalDebug) {
        for (const k of Object.keys(lifeGoalDebug.g_traits)) {
            const axis = k as GoalAxisId;
            z_total[axis] = 
                 lifeGoalDebug.weights.wT * (lifeGoalDebug.g_traits[axis] || 0) + 
                 lifeGoalDebug.weights.wB * (lifeGoalDebug.g_bio[axis] || 0) +
                 lifeGoalDebug.weights.wP * ((lifeGoalDebug.g_psych[axis] || 0) + (lifeGoalDebug.g_distortion?.[axis] || 0));
        }
    }

    // Cast effectiveCharacter to AgentState for the goal engine, which may require state properties
    const concreteGoals = computeConcreteGoals(effectiveCharacter as AgentState, z_total, undefined); 
    
    if (lifeGoalDebug) {
        (lifeGoalDebug as any).concreteGoals = concreteGoals;
    }

    const effectiveLifeGoals = mixLifeGoals(character.lifeGoals, calculatedLifeGoals);
    effectiveCharacter.lifeGoals = effectiveLifeGoals;
    
    // 10. Goal Ecology - Pass V4 Concrete Goals
    const goalEcology = deriveGoalCatalog(
        effectiveCharacter,
        eventAdjustedFlatParams,
        feedbackLatents,
        quickStates,
        v42metrics,
        goalActivationDeltas,
        baseGoalBoosts,
        psychGoalBoosts,
        archetypeGoalBoosts,
        tomV2Metrics,
        undefined, // WorldState
        concreteGoals // NEW ARGUMENT
    );
    
    if (goalEcology) {
        goalEcology.lifeGoalDebug = lifeGoalDebug;
    }

    const behavioralAdvice = calculateBehavioralAdvice(v42metrics, tomMetrics);

    const donorshipPropensity = (latents.CL ?? 0.5) * 0.6 + (latents.EW ?? 0.5) * 0.4;
    const followershipPropensity = (getNestedValue(effectiveCharacter, 'vector_base.C_coalition_loyalty') ?? 0.5) * 0.7 + (1 - (latents.SD ?? 0.5)) * 0.3;
    
    const archMetrics = calculateArchetypeMetricsFromVectorBase(effectiveCharacter);
    const metricKeys = Object.keys(METRIC_NAMES);
    const arch_true = metricKeys.map(key => archMetrics[key] ?? 0.5);
    
    const modifiableCharacter = { ...effectiveCharacter };
    if (!modifiableCharacter.identity) modifiableCharacter.identity = {} as any;
    modifiableCharacter.identity.arch_true = arch_true;

    const bp = mapCharacterToBehaviorParams(effectiveCharacter);
    (modifiableCharacter as AgentState).behavioralParams = bp;
    
    // Calculated metrics fillers (Simulation placeholders)
    const S = 50; 
    const Pv = 50;
    const Vsigma = 50;
    const v = 0;
    const stability = { R:0, H:0, K:0, M:0, U:0, O:0, Gplus:0, H_core:0, H_tail:0, H_budget:0, H_misalign:0, S_ss: S, Pv, Vsigma, DS:0, DR:0 };

    return {
        modifiableCharacter: modifiableCharacter as AgentState,
        eventAdjustedFlatParams,
        latents: feedbackLatents,
        quickStates,
        derivedMetrics,
        goalEcology,
        tomMetrics,
        v42metrics,
        tomV2Metrics,
        behavioralAdvice,
        fieldMetrics,
        donorshipPropensity,
        followershipPropensity,
        psych,
        archetypeGoalBoosts,
        
        // CalculatedMetrics interface implementation (Placeholders for static view)
        S, Pv, Vsigma, v, stability, 
        Opt: 0, drift: 0, topo: 0, influence: 0, prMonstro: 0, monster_veto: false, dose: 0,
        stress: 0, darkness: 0, fatigue: 0, 
        scenarioFitness: [], simulationData: []
    };
}
