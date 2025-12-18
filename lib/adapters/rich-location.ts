
import { LocationEntity, WorldState, AgentState } from '../../types';
import { Location, createEmptyLocation, GoalSpec, ContextMode, HazardSpec, NormRule } from '../location/types';
import { calculateArchetypeMetricsFromVectorBase } from '../archetypes/metrics';
import { normalizeCellOccupancy } from '../world/mapNormalize';

/**
 * Hydrates a lightweight LocationEntity (from WorldState) into a fully functional Rich Location Model.
 * If the entity already contains rich fields (physics, norms, etc.), they are preserved.
 * Otherwise, defaults are applied.
 */
export function hydrateLocation(entity: LocationEntity): Location {
    const base = createEmptyLocation(entity.entityId, entity.title || entity.entityId);
    
    let map = entity.map;
    if (map && Array.isArray(map.cells)) {
        map = {
            ...map,
            cells: map.cells.map(normalizeCellOccupancy)
        };
    }

    return {
        ...base,
        description: entity.description || base.description,
        tags: entity.tags || base.tags,
        // Merge complex blocks if they exist on the entity
        physics: entity.physics ? { ...base.physics, ...entity.physics } : base.physics,
        ownership: entity.ownership ? { ...base.ownership, ...entity.ownership } : base.ownership,
        affect: entity.affect ? { ...base.affect, ...entity.affect } : base.affect,
        tomModifier: entity.tomModifier ? { ...base.tomModifier, ...entity.tomModifier } : base.tomModifier,
        // Map legacy arrays to rich types if needed
        contextModes: (entity.contextModes as any[]) || base.contextModes,
        hazards: (entity.hazards as any[]) || base.hazards,
        // Ensure map is carried over (normalized)
        map: map,
        topology: {
            ...base.topology,
            // If entity has a visual map, we could theoretically map cells to zones here
        },
        // Merge legacy state properties (like crowd_level) into the rich state object
        state: entity.state ? { ...base.state, ...(entity.state as any) } : base.state,
        // Ensure norms are carried over
        norms: entity.norms ? { ...base.norms, ...entity.norms } : base.norms
    };
}

export interface LocationGoalImpact {
    goalId: string;
    baseWeight: number;
    modifiers: string[];
    finalScore: number;
}

/**
 * Calculates the specific influence of a Rich Location on an Agent's goals.
 * Considers: Context Modes, Local Norms, Hazards, and Explicit Goal Specs.
 */
export function calculateLocationGoalInfluence(
    location: Location, 
    agent: AgentState
): LocationGoalImpact[] {
    const impacts: Record<string, LocationGoalImpact> = {};
    const agentArchetype = calculateArchetypeMetricsFromVectorBase(agent);

    // Helper to get or create impact
    const getImpact = (gid: string) => {
        if (!impacts[gid]) impacts[gid] = { goalId: gid, baseWeight: 0, modifiers: [], finalScore: 0 };
        return impacts[gid];
    };

    // 1. Context Modes (e.g. "Strategic Planning" boosts "maintain_order")
    location.contextModes.forEach((mode: ContextMode) => {
        if (mode.goalWeightModifiers) {
            Object.entries(mode.goalWeightModifiers).forEach(([goalTag, mod]) => {
                // Heuristic: map tag to specific goals or domains
                const targetGoals = mapTagToGoals(goalTag);
                targetGoals.forEach(gid => {
                    const imp = getImpact(gid);
                    imp.modifiers.push(`Mode ${mode.id}: ${mod > 0 ? '+' : ''}${mod}`);
                    imp.finalScore += mod;
                });
            });
        }
    });

    // 2. Explicit Local Goals (GoalSpec)
    location.localGoals.forEach((spec: GoalSpec) => {
        const gid = spec.id;
        // Check if agent matches criteria (optional logic could go here)
        const imp = getImpact(gid);
        const w = spec.typicalWeight ?? 0.5;
        imp.modifiers.push(`Local Priority: +${w}`);
        imp.finalScore += w;
    });

    // 3. Hazards -> Safety Goals
    location.hazards.forEach((hz: HazardSpec) => {
        const intensity = hz.intensity;
        if (intensity > 0.1) {
            // High hazard boosts survival goals
            ['protect_self', 'avoid_pain', 'c_avoid_pain_phys'].forEach(gid => {
                const imp = getImpact(gid);
                const boost = intensity * 1.5;
                imp.modifiers.push(`Hazard (${hz.type}): +${boost.toFixed(2)}`);
                imp.finalScore += boost;
            });
            // Reduces comfort/rest goals
            ['seek_comfort', 'rest_and_recover', 'c_restore_energy'].forEach(gid => {
                const imp = getImpact(gid);
                const pen = -intensity * 1.0;
                imp.modifiers.push(`Hazard (${hz.type}): ${pen.toFixed(2)}`);
                imp.finalScore += pen;
            });
        }
    });

    // 4. Norms (Penalties create avoidance/compliance goals)
    if (location.norms) {
        // Required behaviors -> Boost compliance goals
        if (location.norms.requiredBehavior.length > 0) {
            const boost = location.norms.requiredBehavior.length * 0.5;
            ['maintain_order', 'follow_rules', 'c_maintain_order', 'c_obey_legit_auth'].forEach(gid => {
                const imp = getImpact(gid);
                imp.modifiers.push(`Required Norms: +${boost.toFixed(2)}`);
                imp.finalScore += boost;
            });
        }
        
        // Forbidden behaviors -> Boost avoidance/blame goals
        if (location.norms.forbiddenBehavior.length > 0) {
             const boost = location.norms.forbiddenBehavior.length * 0.4;
             ['avoid_blame', 'c_preserve_self_integrity'].forEach(gid => {
                 const imp = getImpact(gid);
                 imp.modifiers.push(`Strict Norms: +${boost.toFixed(2)}`);
                 imp.finalScore += boost;
             });
        }
    }

    return Object.values(impacts).sort((a,b) => b.finalScore - a.finalScore);
}

function mapTagToGoals(tag: string): string[] {
    const map: Record<string, string[]> = {
        'status': ['seek_status', 'maintain_legitimacy', 'c_increase_status'],
        'safety': ['protect_self', 'avoid_pain', 'c_find_safe_place'],
        'order': ['maintain_order', 'follow_order', 'c_maintain_order'],
        'truth': ['seek_information', 'pursue_truth', 'c_seek_truth'],
        'care': ['help_wounded', 'protect_others', 'c_protect_close_ones'],
        'survival': ['survive', 'escape', 'c_leave_situation']
    };
    return map[tag] || [];
}
