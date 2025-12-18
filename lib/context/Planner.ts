
import { AgentState, WorldState, PlanStep, SocialActionId, Action, PlanState, CharacterGoalId } from '../../types';
import { socialActions } from '../../data/actions-social';
import { createPlanFromSteps } from '../planning/engine';
import { actionGoalMap } from '../goals/space';

// Helper to find an action that satisfies a requirement
function findSatisfyingAction(requirement: { fact?: string, offer?: boolean }, world: WorldState): Action | null {
    if (requirement.fact) {
        // Ищем действие, которое создает (satisfies) этот факт
        return socialActions.find(a => a.satisfies?.prop === requirement.fact) || null;
    }
    return null;
}

function findBestTarget(agent: AgentState, world: WorldState, actionId: string, goalId?: string): string | undefined {
    // Heuristic target selection
    
    // 1. If action is 'refuse_help' or 'accept_help', target is the offerer
    if (actionId === 'refuse_help' || actionId === 'accept_help') {
        const offer = world.helpOffers?.find(o => o.toId === agent.entityId);
        return offer?.fromId;
    }
    
    // 2. If action is 'refuse_order' or 'accept_order', target is the leader/issuer
    if (actionId === 'refuse_order' || actionId === 'accept_order' || actionId === 'acknowledge_order') {
        // Try to find active order
        const order = world.orders?.find(o => o.toId === agent.entityId && o.status === 'pending');
        if (order) return order.fromId;
        return world.leadership?.currentLeaderId || undefined;
    }

    // 3. Use ToM / Relationships for generic actions
    // Filter out self
    const candidates = world.agents.filter(a => a.entityId !== agent.entityId);
    if (candidates.length === 0) return undefined;

    // For 'support_leader' or 'challenge_leader', target is leader
    if (actionId === 'support_leader' || actionId === 'challenge_leader' || actionId === 'confront_leader') {
        return world.leadership?.currentLeaderId || candidates[0].entityId;
    }
    
    // Default: Pick someone with highest trust or random
    return candidates[0].entityId;
}

// Backward Chaining Planner
export function planForGoal(
    agent: AgentState, 
    world: WorldState, 
    goalId: CharacterGoalId, 
    horizon: number = 4
): PlanState | null {
    
    // 1. Find actions that DIRECTLY satisfy the goal (Direct Support)
    // Use actionGoalMap as the source of truth
    const candidates = socialActions.filter(a => {
        const links = actionGoalMap[a.id as SocialActionId];
        if (!links) return false;
        return links.some(l => l.goalId === goalId && l.match > 0);
    });

    if (candidates.length === 0) {
        console.warn(`Planner: No actions found for goal ${goalId}`);
        return null;
    }

    // Sort by impact
    candidates.sort((a,b) => {
        const matchA = actionGoalMap[a.id as SocialActionId]?.find(l => l.goalId === goalId)?.match ?? 0;
        const matchB = actionGoalMap[b.id as SocialActionId]?.find(l => l.goalId === goalId)?.match ?? 0;
        return matchB - matchA;
    });

    // Limit search width
    const topCandidates = candidates.slice(0, 5);

    for (const bestAction of topCandidates) {
        // Check strict preconditions for specific actions
        if (bestAction.id === 'refuse_order' || bestAction.id === 'accept_order') {
             const hasOrder = world.orders?.some(o => o.toId === agent.entityId && o.status === 'pending');
             // Allow planning 'refuse_order' if we have an order. 
             // If NOT, skip this action.
             if (!hasOrder) continue; 
        }

        // Check generic availability
        const isAvailable = !bestAction.isAvailable || bestAction.isAvailable({ actor: agent, world });
        
        // Find target
        const targetId = bestAction.targetMode === 'character' ? findBestTarget(agent, world, bestAction.id, goalId) : undefined;
        
        // Base Step
        const finalStep: PlanStep = { 
            id: `step-${world.tick}-final`,
            actionId: bestAction.id, 
            targetId,
            goalId,
            explanation: `Directly supports ${goalId}`
        };

        if (isAvailable) {
            return createPlanFromSteps(agent, world, [finalStep]);
        }

        // Not available -> Check requirements (backward chaining)
        if (bestAction.requires && horizon > 1) {
            const planSegments: PlanStep[] = [];
            
            // Requirement 1: Fact
            if (bestAction.requires.fact) {
                const satisfyingAction = findSatisfyingAction({ fact: bestAction.requires.fact }, world);
                
                if (satisfyingAction) {
                     // Check if pre-req is available
                     const preReqAvailable = !satisfyingAction.isAvailable || satisfyingAction.isAvailable({ actor: agent, world });
                     
                     if (preReqAvailable) {
                         const preReqTarget = satisfyingAction.targetMode === 'character' ? findBestTarget(agent, world, satisfyingAction.id) : undefined;
                         
                         const preStep: PlanStep = {
                             id: `step-${world.tick}-pre`,
                             actionId: satisfyingAction.id,
                             targetId: preReqTarget,
                             explanation: `Satisfies requirement '${bestAction.requires.fact}' for ${bestAction.id}`
                         };
                         
                         planSegments.push(preStep);
                         planSegments.push(finalStep);
                         
                         return createPlanFromSteps(agent, world, planSegments);
                     }
                }
            }
        }
    }
    
    return null;
}
