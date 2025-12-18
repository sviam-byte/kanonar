
// hooks/useCharacterCalculations.ts

import { useMemo } from 'react';
import { Branch, CharacterEntity, EntityType, FullCharacterMetrics, SocialEventEntity, AgentState, WorldState } from '../types';
import { calculateAllCharacterMetrics, applyAging } from '../lib/metrics';
import { calculateArchetypeMetricsFromVectorBase, METRIC_NAMES } from '../lib/archetypes/metrics';
import { setNestedValue } from '../lib/param-utils';
import { allArchetypes } from '../data/archetypes';
import { computeDistortionProfile } from '../lib/metrics/psych-layer';
import { computeSelfArchetypeVector } from '../lib/archetypes/system';
import { tick_planning } from '../lib/goals/pipeline';
import { FACTIONS } from '../data/factions';
import { computeBiographyLatent } from '../lib/biography/lifeGoalsEngine';
import { computeExposureTraces, computeWorldview } from '../lib/biography/exposure';

// The order of metrics for distance calculation
const ARCHETYPE_METRIC_ORDER = Object.keys(METRIC_NAMES);

function findDominantArchetype(metricsVector: number[], archetypePrototypes: typeof allArchetypes): string | undefined {
    if (!metricsVector || metricsVector.length === 0) {
        return undefined;
    }

    let minDistance = Infinity;
    let dominantArchetypeId: string | undefined = undefined;

    for (const prototype of archetypePrototypes) {
        // Convert prototype metrics record to an array in the correct order
        const prototypeMetricsVector = ARCHETYPE_METRIC_ORDER.map(key => prototype.metrics[key] ?? 0.5);

        // Calculate squared Euclidean distance
        let distanceSq = 0;
        for (let i = 0; i < metricsVector.length; i++) {
            distanceSq += Math.pow(metricsVector[i] - prototypeMetricsVector[i], 2);
        }

        if (distanceSq < minDistance) {
            minDistance = distanceSq;
            dominantArchetypeId = prototype.id;
        }
    }

    return dominantArchetypeId;
}


export const useCharacterCalculations = (
    character: CharacterEntity | undefined,
    branch: Branch,
    socialEvents: SocialEventEntity[]
): FullCharacterMetrics | { 
    modifiableCharacter: null, 
    eventAdjustedFlatParams: Record<string, never>, 
    latents: Record<string, never>, 
    quickStates: Record<string, never>, 
    derivedMetrics: null, 
    goalEcology: null, 
    tomMetrics: null, 
    v42metrics: null, 
    tomV2Metrics: null, 
    behavioralAdvice: undefined,
    fieldMetrics: null,
    donorshipPropensity: number,
    followershipPropensity: number,
    psych: undefined,
    archetypeGoalBoosts: Record<string, number>,
    S: number, Pv: number, Vsigma: number, v: number, stability: any, 
    Opt: number, drift: number, topo: number, influence: number, prMonstro: number, monster_veto: boolean, dose: number,
    stress: number, darkness: number, fatigue: number, 
    scenarioFitness: any[], simulationData: any[]
} => {

    return useMemo(() => {
        if (!character || (character.type !== EntityType.Character && character.type !== EntityType.Essence)) {
            return { 
                modifiableCharacter: null, 
                eventAdjustedFlatParams: {}, 
                latents: {}, 
                quickStates: {}, 
                derivedMetrics: null, 
                goalEcology: null, 
                tomMetrics: null, 
                v42metrics: null, 
                tomV2Metrics: null, 
                behavioralAdvice: undefined,
                fieldMetrics: null,
                donorshipPropensity: 0,
                followershipPropensity: 0,
                psych: undefined,
                archetypeGoalBoosts: {},
                S: 50, Pv: 0, Vsigma: 0, v: 0, stability: { R:0, H:0, K:0, M:0, U:0, O:0, Gplus:0, H_core:0, H_tail:0, H_budget:0, H_misalign:0, S_ss: 50, Pv:0, Vsigma:0, DS:0, DR:0 }, 
                Opt: 0, drift: 0, topo: 0, influence: 0, prMonstro: 0, monster_veto: false, dose: 0,
                stress: 0, darkness: 0, fatigue: 0, 
                scenarioFitness: [], simulationData: []
            };
        }
        
        const agedCharacter = applyAging(character);

        // --- Archetype Calculation ---
        if (!agedCharacter.identity) {
            agedCharacter.identity = {} as any;
        }
        const archMetrics = calculateArchetypeMetricsFromVectorBase(agedCharacter);
        
        // Store named metrics in vector_base for simulation engine (e.g., loop.ts, mapper.ts)
        for (const key of Object.keys(METRIC_NAMES)) {
            setNestedValue(agedCharacter, `vector_base.ARCH_${key}`, archMetrics[key]);
        }

        // Store ordered array in identity.arch_true
        const metricKeys = Object.keys(METRIC_NAMES);
        agedCharacter.identity.arch_true = metricKeys.map(key => archMetrics[key as keyof typeof archMetrics]);

        // Initialize self-perception (arch_self) based on distortions and trauma
        if (!agedCharacter.identity.arch_self || agedCharacter.identity.arch_self.length !== agedCharacter.identity.arch_true.length) {
             // Compute bioLatent explicitly for initial self calculation
             const bioEvents = agedCharacter.historicalEvents || [];
             const bioLatent = computeBiographyLatent(bioEvents);
             const exposures = computeExposureTraces(bioEvents);
             const worldview = computeWorldview(exposures);
             
             const distortions = computeDistortionProfile(agedCharacter, worldview, bioLatent);
             const trauma = (agedCharacter as AgentState).trauma || { self:0, others:0, world:0, system:0 };
             const moral = (agedCharacter as AgentState).psych?.moral || { 
                 guilt: 0, 
                 shame: 0, 
                 valueBehaviorGap: 0, 
                 valueBehaviorGapTotal: 0, 
                 valueBehaviorGapSelf: 0, 
                 valueBehaviorGapOthers: 0, 
                 valueBehaviorGapSystem: 0, 
                 windowSize: 20,
                 perAxis: []
             };
             
             agedCharacter.identity.arch_self = computeSelfArchetypeVector(
                 agedCharacter.identity.arch_true,
                 distortions,
                 trauma,
                 moral,
                 bioLatent
             );
        }
        
        // Find dominant archetypes
        agedCharacter.identity.arch_true_dominant_id = findDominantArchetype(agedCharacter.identity.arch_true, allArchetypes);
        agedCharacter.identity.arch_self_dominant_id = findDominantArchetype(agedCharacter.identity.arch_self!, allArchetypes);
        
        let maxVal = -1;
        let maxIdx = -1;
        agedCharacter.identity.arch_self.forEach((val, i) => {
            if (val > maxVal) {
                maxVal = val;
                maxIdx = i;
            }
        });
        agedCharacter.identity.arch_core = maxIdx;


        // --- Core Calculation ---
        // This calculates everything, including V4 goals, and puts them in metrics.goalEcology
        const metrics = calculateAllCharacterMetrics(agedCharacter, branch, socialEvents);
        
        return {
            ...metrics,
            // We use the goalEcology from calculateAllCharacterMetrics directly
            // No need to call tick_planning again as it would revert to V3 if not configured carefully
        };
        
    }, [character, branch, socialEvents]);
};
