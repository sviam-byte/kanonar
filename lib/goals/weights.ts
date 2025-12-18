
// /lib/goals/weights.ts
import { CharacterGoalId as GoalId, GoalWeightContext, CharacterEntity, CharacterGoalId } from "../../types";
import { GOAL_DEFS } from './space';
import { calculateArchetypeMetricsFromVectorBase } from '../archetypes/metrics';

export function baseGoalWeights(
  goalIds: GoalId[],
  ctx: GoalWeightContext
): number[] {
    // This function can be used to provide default or baseline weights
    // if a user doesn't provide any overrides.
    return new Array(goalIds.length).fill(1 / goalIds.length);
}

/**
 * Computes default goal weights for a character based on their archetype metrics.
 * Uses the vector_base to calculate archetype scores (CARE, RADICAL, etc.) and maps them to goals.
 */
export function computeCharacterGoalWeights(character: CharacterEntity): Partial<Record<CharacterGoalId, number>> {
    // Calculate metrics dynamically from the character's vector base
    // This ensures we work even if ARCH_* params haven't been injected into vector_base yet
    const metrics = calculateArchetypeMetricsFromVectorBase(character);
    
    const care = metrics.CARE ?? 0.5;
    const radical = metrics.RADICAL ?? 0.5;
    const manip = metrics.MANIP ?? 0.5;
    const accept = metrics.ACCEPT ?? 0.5;
    const agency = metrics.AGENCY ?? 0.5;
    const truth = metrics.TRUTH ?? 0.5;
    const formal = metrics.FORMAL ?? 0.5;

    const weights: Partial<Record<CharacterGoalId, number>> = {};
    const goalIds = Object.keys(GOAL_DEFS) as CharacterGoalId[];
    
    const isDevoted = character.roles?.global?.includes('devoted') || character.tags?.includes('devoted');

    for (const goalId of goalIds) {
        const def = GOAL_DEFS[goalId];
        let weight = 0.1; // Default base weight

        // 1. Specific Logic overrides
        switch (goalId) {
            case 'help_wounded':
            case 'protect_other':
                weight = 0.1 + 0.7 * care;
                break;
            case 'maintain_cohesion':
                weight = 0.1 + 0.5 * (care + accept) / 2;
                break;
            case 'maintain_legitimacy':
                weight = 0.1 + 0.5 * accept;
                break;
            case 'assert_autonomy':
                weight = 0.1 + 0.7 * radical;
                break;
            case 'protect_self':
                weight = 0.2 + 0.5 * (1 - care);
                if (isDevoted) weight = 0.0; // Devoted characters strictly ignore self-preservation base weight
                break;
            case 'avoid_blame':
                weight = 0.1 + 0.6 * manip;
                if (isDevoted) weight *= 0.1;
                break;
            case 'seek_information':
                weight = 0.1 + 0.6 * truth;
                break;
            case 'follow_order':
            case 'immediate_compliance':
            case 'acknowledge_order':
                weight = 0.1 + 0.7 * accept;
                break;
            case 'issue_order':
            case 'challenge_leader':
                weight = 0.1 + 0.7 * agency;
                break;
            case 'support_leader':
                weight = 0.1 + 0.5 * (accept + care) / 2;
                if (isDevoted) weight += 0.5;
                break;
            case 'faction_loyalty':
                weight = 0.1 + 0.6 * accept;
                break;
            case 'contain_enemy':
                weight = 0.1 + 0.5 * agency;
                break;
        }
        
        // 2. Generic Logic based on Goal Kind if not specifically handled above with high weight
        if (weight <= 0.15) {
            switch(def.kind) {
                case 'care': weight += 0.4 * care; break;
                case 'discipline': weight += 0.4 * formal; break;
                case 'status': weight += 0.4 * agency; break;
                case 'power': weight += 0.4 * agency; break;
                case 'epistemic': weight += 0.4 * truth; break;
                case 'identity': weight += 0.4 * radical; break;
                case 'social': weight += 0.3 * accept; break;
                default: break;
            }
        }

        weights[goalId] = weight;
    }

    return weights;
}
