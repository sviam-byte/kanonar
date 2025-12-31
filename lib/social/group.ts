

// lib/social/group.ts
import { AgentState, WorldState, CharacterGoalId, SocialActionId, ScenarioDef, GoalState } from '../../types';
import { listify } from '../utils/listify';

/**
 * Calculates how aligned an agent is with the group collective based on latent personality traits.
 * High SO (Signal Openness), CL (Network Multiplier), and EW (Ethical Weight/Care) increase alignment.
 */
export function computeGroupAlignment(agent: AgentState): number {
    const so = agent.latents?.SO ?? 0.5; // Social Orientation / Openness
    const cl = agent.latents?.CL ?? 0.5; // Coalition Loyalty
    const ew = agent.latents?.EW ?? 0.5; // Ethical Weight / Care
    
    // Weighted average favoring Coalition Loyalty
    return Math.min(1, Math.max(0, 0.3 * so + 0.5 * cl + 0.2 * ew));
}

function isGroupAction(actionId: SocialActionId, scenario: ScenarioDef | undefined): boolean {
    // Check action definition tags via simple lookup map or scenario definition
    // For now, use a hardcoded set or check logic if Action objects are available
    // Ideally, we inspect the action object. 
    // Since we only have IDs here, we rely on convention or look it up in world if possible.
    // Simpler approach: checking standard tags in IDs
    const groupActions = ['broadcast_plan', 'assign_role', 'delegate_leadership', 'coordinate_search', 'organize_evac', 'reassure_group', 'confront_leader', 'form_subgroup', 'support_leader'];
    return groupActions.includes(actionId);
}

function isSoloPreferred(actionId: SocialActionId): boolean {
    const soloActions = ['search_exit_alone', 'self_treat', 'hide', 'silent_noncompliance', 'retreat', 'protect_self', 'avoid_blame'];
    return soloActions.includes(actionId);
}

/**
 * Adjusts the utility (Q-value) of an action based on the agent's group alignment.
 * Low alignment punishes group actions and rewards solo actions.
 */
export function adjustForGroupAlignment(
    agent: AgentState,
    world: WorldState,
    actionId: SocialActionId,
    baseUtility: number,
): number {
    const align = computeGroupAlignment(agent);
    let U = baseUtility;
    
    const isDetached = agent.flags?.detachedFromGroup;

    if (isGroupAction(actionId, world.scenario)) {
        // If disconnected, group actions are heavily penalized
        if (isDetached) {
            U -= 0.5; 
        } else {
            // If just low alignment, slight penalty
            U -= (1 - align) * 0.4;
        }
    }
    
    if (isSoloPreferred(actionId)) {
        // If detached or low alignment, boost solo actions
        if (isDetached) {
             U += 0.4;
        } else {
             U += (1 - align) * 0.3;
        }
    }

    return U;
}

/**
 * Updates the 'detachedFromGroup' flag based on recent behavior.
 * If an agent consistently acts selfishly or autonomously while ignoring group cohesion, they detach.
 */
export function maybeUpdateDetachment(
    world: WorldState,
    agent: AgentState,
    chosenActionId: SocialActionId,
    topGoalId: CharacterGoalId,
): void {
    const flags = agent.flags ?? (agent.flags = {});
    const align = computeGroupAlignment(agent);

    // Check active goal weights for loyalty signals
    // Use priority instead of weight, as GoalState usually relies on priority for sorting
    // ActiveGoal (which extends GoalState) has weight, so we cast if needed or rely on priority
    const executeGoals = listify(agent.goalEcology?.execute) as (GoalState & { weight: number })[];
    
    const followOrderWeight = executeGoals.find(g => g.id === 'follow_order')?.weight ?? 0;
    const cohesionWeight = executeGoals.find(g => g.id === 'maintain_cohesion')?.weight ?? 0;

    const isStronglyIndividualGoal =
        (topGoalId === 'assert_autonomy' || topGoalId === 'self_preservation' || topGoalId === 'avoid_blame');

    // Detachment Logic:
    // Low alignment + Individual Goal + Low loyalty weights -> Detach
    if (align < 0.4 && isStronglyIndividualGoal && followOrderWeight < 0.2 && cohesionWeight < 0.2) {
        flags.detachedFromGroup = true;
    }

    // Re-attachment Logic:
    // Performing explicitly pro-social/leader-supporting actions can re-attach
    if (flags.detachedFromGroup && (chosenActionId === 'support_leader' || chosenActionId === 'aid_ally')) {
        // Stochastic re-attachment
        if (Math.random() < 0.5) {
            flags.detachedFromGroup = false;
        }
    }

    agent.flags = flags;
}
