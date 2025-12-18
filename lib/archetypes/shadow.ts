


import { CharacterEntity, FullArchetypeInfo, ArchetypeLayers, ShadowMode, EntityParams, AgentState } from '../../types';
import { allArchetypes, FUNCTION_NAMES } from '../../data/archetypes';
import { calculateArchetypeMetricsFromVectorBase } from './metrics';
import { getNestedValue } from '../param-utils';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

function euclideanDistance(vec1: number[], vec2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec1.length; i++) {
        sum += Math.pow((vec1[i] || 0) - (vec2[i] || 0), 2);
    }
    return Math.sqrt(sum);
}

function getFullInfo(archId: string | null): FullArchetypeInfo | null {
    if (!archId) return null;
    const arch = allArchetypes.find(a => a.id === archId);
    if (!arch) return null;
    return {
        ...arch,
        distance: 0, // Distance is relative, irrelevant for direct lookup
    };
}

// Helper to calculate conflict between two metric vectors
function calculateVectorConflict(vec1: number[], vec2: number[]): number {
    let diffSum = 0;
    for(let i=0; i<vec1.length; i++) {
        diffSum += Math.abs(vec1[i] - vec2[i]);
    }
    return diffSum / vec1.length;
}

export function calculateCharacterArchetypeInfo(character: CharacterEntity, flatParams: EntityParams, stability: number): { layers: ArchetypeLayers, shadow: ShadowMode } | null {
    if (!character || !character.vector_base) return null;

    // --- 1. Structural Layers (H/D/O) ---
    // These represent the static "makeup" of the character's soul/function.
    
    const charMetrics = calculateArchetypeMetricsFromVectorBase(character);
    const charMetricsVector = Object.values(charMetrics) as number[];

    const archetypeDistances: FullArchetypeInfo[] = allArchetypes.map(arch => {
        const archMetricsVector = Object.values(arch.metrics) as number[];
        const distance = euclideanDistance(charMetricsVector, archMetricsVector);
        return { ...arch, distance };
    });

    const findClosest = (lambda: string) => {
        return archetypeDistances
            .filter(a => a.lambda === lambda)
            .sort((a, b) => a.distance - b.distance)[0] || null;
    };

    const layers: ArchetypeLayers = {
        kH: findClosest('H'),
        kD: findClosest('D'),
        kO: findClosest('O'),
    };

    // --- 2. Dynamic Shadow Mode (Self vs Actual vs Shadow) ---
    // These represent the current psychological state and conflict.

    let actual: FullArchetypeInfo | null = null;
    let self: FullArchetypeInfo | null = null;
    let shadow: FullArchetypeInfo | null = null;
    let shadow_activation_prob = 0;
    let shadow_strength = 0;
    let pressure = 0;

    // Check if the character has a running simulation state (AgentState properties)
    const agentState = character as AgentState;

    if (agentState.archetype) {
        // Simulation is running, use the dynamic state
        actual = getFullInfo(agentState.archetype.actualId);
        self = getFullInfo(agentState.archetype.self.selfId);
        shadow = getFullInfo(agentState.archetype.shadowId); // Use shadowId, NOT selfShadowId (which is subjective)
        shadow_activation_prob = agentState.archetype.shadowActivation;
        shadow_strength = agentState.archetype.shadowFit; 
    } else {
        // Static analysis fallback (robust calculation)
        
        // Actual: The closest archetype overall
        actual = archetypeDistances.sort((a, b) => a.distance - b.distance)[0];

        // Self: Derived from 'G_Self_concept_strength' and 'G_Identity_rigidity' biasing towards 'SN' (Norm) or 'SR' (Hero)
        // For static analysis, we assume Self is slightly idealized version of Actual
        // or relies on global roles.
        // Simple heuristic: Self is the closest non-shadow archetype (SN/ON/SR)
        self = archetypeDistances
            .filter(a => a.mu !== 'OR') // Filter out "Glitch" archetypes for Self-image
            .sort((a, b) => a.distance - b.distance)[0];
            
        // Shadow: High capability similarity (f), but opposite value (mu)
        // Specifically looking for high conflict with Self/Actual
        const candidates = archetypeDistances.filter(a => a.id !== actual?.id && a.id !== self?.id);
        
        let maxShadowScore = -1;
        for (const cand of candidates) {
            const candVec = Object.values(cand.metrics) as number[];
            const conflict = calculateVectorConflict(charMetricsVector, candVec);
            const relevance = 1 / (1 + cand.distance); // Proximity
            
            // Shadow is relevant (close) but conflicting.
            // We also bias towards 'OR' (Anomaly) and 'SR' (Radical) for shadow.
            let bias = 1.0;
            if (cand.mu === 'OR') bias = 1.5;
            if (cand.mu === 'SR') bias = 1.2;

            const score = relevance * conflict * bias;
            if (score > maxShadowScore) {
                maxShadowScore = score;
                shadow = cand;
            }
        }
        
        // Estimate probabilities for static view
        const pressureProfile: Record<string, number> = {
            P_stress: flatParams['body.acute.stress'] ?? 0,
            P_moral: flatParams['body.acute.moral_injury'] ?? 0,
            P_dark: flatParams['state.dark_exposure'] ?? 0,
        };
        pressure = (0.4 * pressureProfile.P_stress + 0.3 * pressureProfile.P_moral + 0.2 * pressureProfile.P_dark) / 100;
        
        const S_norm = stability / 100;
        const self_control = (flatParams['vector_base.B_cooldown_discipline'] ?? 0.5);
        const trauma_bias = flatParams['state.trauma_shadow_bias'] ?? 0;
        
        // Re-using the formula from system.ts roughly
        const alpha = -2.0 + 3.0 * pressure - 1.5 * S_norm - 1.0 * self_control + 1.5 * trauma_bias;
        shadow_activation_prob = sigmoid(alpha);
        shadow_strength = maxShadowScore;
    }

    return {
        layers,
        shadow: {
            actual,
            self,
            shadow,
            pressure,
            shadow_strength,
            shadow_activation_prob,
        }
    };
}
