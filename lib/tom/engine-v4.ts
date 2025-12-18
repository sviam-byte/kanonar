

import { AgentState, WorldState, SocialActionId, CharacterGoalId } from '../../types';
import { TomState } from '../../types';
import { actionGoalMap, GOAL_DEFS } from '../goals/space';

export interface TomModelAboutOther {
  targetId: string;
  goalBeliefs: Record<CharacterGoalId, number>; // Belief about target's goals
  relationEstimate: {
    trust: number;
    fear: number;
    respect: number;
  };
  predictedNextAction?: string;
}

/**
 * Predicts how another agent will react to a specific action from us.
 * Returns a simplified reaction object (e.g., impact on relation or probability of compliance).
 */
export function predictReaction(
    observer: AgentState,
    targetId: string,
    ourActionId: SocialActionId,
    world: WorldState
): { estimatedCompliance: number, estimatedRelationChange: number } {
    const tom = world.tom?.[observer.entityId]?.[targetId];
    if (!tom) return { estimatedCompliance: 0.5, estimatedRelationChange: 0 };

    const trust = tom.traits.trust;
    const obedience = tom.traits.obedience;
    const conflict = tom.traits.conflict;

    // Simple heuristic based on Trust and Goal Alignment
    if (ourActionId === 'issue_order') {
        return {
            estimatedCompliance: (trust + obedience) / 2,
            estimatedRelationChange: -0.1 * (1 - obedience) // Orders strain relations if obedience is low
        };
    }
    
    if (ourActionId === 'support_leader') {
         return { estimatedCompliance: 1.0, estimatedRelationChange: 0.2 * trust };
    }

    if (ourActionId === 'propose_plan') {
        // Compliance here means acceptance
        return {
            estimatedCompliance: trust * 0.8 + obedience * 0.2,
            estimatedRelationChange: 0.1
        };
    }
    
    if (ourActionId === 'refuse_order') {
        return {
            estimatedCompliance: 0,
            estimatedRelationChange: -0.3 * (1 + conflict)
        }
    }

    return { estimatedCompliance: 0.5, estimatedRelationChange: 0 };
}

/**
 * Bayesian update of beliefs about target's goals based on their observed action.
 */
export function updateTomFromObservation(
    observerId: string,
    targetId: string,
    observedActionId: SocialActionId,
    tomState: TomState
) {
    const belief = tomState[observerId]?.[targetId];
    if (!belief) return;

    // Likelihood P(action | goal)
    // derived from actionGoalMap
    const supported = actionGoalMap[observedActionId];
    if (!supported || supported.length === 0) return;

    const { goalIds, weights } = belief.goals;
    const alpha = 0.2; // Learning rate

    // Flatten current weights for easier manipulation
    const curr: Record<string, number> = {};
    goalIds.forEach((g, i) => { curr[g] = weights[i]; });

    // Increase weight for supported goals (Bayesian-like update)
    for (const link of supported) {
        const g = link.goalId;
        const wOld = curr[g] ?? 0;
        // Move towards support strength
        curr[g] = wOld + alpha * (link.match - wOld);
    }

    // Decrease others slightly (normalization will handle the rest, but dampening helps convergence)
    for (const g of Object.keys(curr)) {
        if (!supported.find(l => l.goalId === g)) {
            curr[g] = (1 - alpha * 0.5) * curr[g];
        }
    }

    // Normalize
    let sum = 0;
    for (const v of Object.values(curr)) sum += v;
    if (sum <= 0) sum = 1;
    
    // Update belief vector
    const newWeights = goalIds.map(g => curr[g] / sum);
    
    belief.goals.weights = newWeights;
    belief.lastUpdatedTick = (belief.lastUpdatedTick || 0) + 1;

    // --- ToM 2-го порядка: "я думаю, что ты думаешь обо мне"
    const reverse = tomState[targetId]?.[observerId];
    if (reverse) {
        // Simple proxies for 2nd order self metrics derived from the reverse view
        const perceivedTrust = reverse.traits.trust;
        const perceivedAlign = reverse.traits.align;
        
        // Mirror Index: simplified proxy for how well "they see me as I see myself"
        // Here we assume high trust/align = high accuracy of perception (optimistic bias)
        const mirrorIndex = perceivedTrust * perceivedAlign;
        
        // Self Align: how well I accept this image. 
        // If I trust them, I align with their view.
        const selfAlign = belief.traits.trust * mirrorIndex;
        
        // Shame Delta: Discrepancy (simplified)
        const shameDelta = 0; 

        belief.secondOrderSelf = {
            perceivedTrustFromTarget: perceivedTrust,
            perceivedAlignFromTarget: perceivedAlign,
            perceivedDominanceInTargetsView: reverse.traits.dominance,
            perceivedUncertaintyOfTarget: reverse.uncertainty ?? 0.5,
            mirrorIndex,
            selfAlign,
            shameDelta
        };
    }
}
