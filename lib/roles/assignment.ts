
// lib/roles/assignment.ts

import { AgentState, ScenarioDef, UserRelations, CharacterGoalId, SceneRoleId, WorldState } from "../../types";

const dotProduct = (v1: Record<string, number>, v2: Partial<Record<string, number>>): number => {
    let sum = 0;
    for (const key in v2) {
        sum += (v1[key] || 0) * (v2[key] || 0);
    }
    return sum;
};

/**
 * Assigns roles to agents based on suitability for a given scenario.
 * @param agents List of participating agents.
 * @param scenario The scenario definition with role slots.
 * @returns A map of agentId to their assigned SceneRoleId.
 */
export function assignRoles(
    agents: AgentState[],
    scenario: ScenarioDef,
    world: WorldState
): Record<string, SceneRoleId> {
    
    // 0. Pre-fill with default roles if defined in the scenario
    const assignedRoles: Record<string, SceneRoleId> = {};
    const availableAgentIds = new Set(agents.map(a => a.entityId));

    if (scenario.defaultRoles) {
        for (const [agentId, role] of Object.entries(scenario.defaultRoles)) {
            if (availableAgentIds.has(agentId)) {
                assignedRoles[agentId] = role as SceneRoleId;
                availableAgentIds.delete(agentId);
            }
        }
    }

    // 1. Calculate leader bonus for all agents (only needed for remaining unassigned)
    const leaderBonuses: Record<string, number> = {};
    for (const agentId of availableAgentIds) {
        const agent = agents.find(a => a.entityId === agentId);
        if (!agent) continue;
        
        let totalAuthority = 0;
        let totalTrust = 0;
        let count = 0;
        for (const observer of agents) {
            if (observer.entityId === agent.entityId) continue;
            totalAuthority += world.initialRelations[observer.entityId]?.[agent.entityId]?.authority ?? 0.4;
            totalTrust += world.initialRelations[observer.entityId]?.[agent.entityId]?.trust ?? 0.4;
            count++;
        }
        leaderBonuses[agent.entityId] = count > 0 ? (totalAuthority / count + totalTrust / count) / 2 : 0;
    }

    // 2. Build suitability matrix suit[agentId][roleId]
    const suitMatrix: Record<string, Record<string, number>> = {};
    const alpha = 0.5; // Weight for goal similarity
    const beta = 0.3;  // Weight for leader bonus

    // Only compute for agents not yet assigned
    for (const agentId of availableAgentIds) {
        const agent = agents.find(a => a.entityId === agentId)!;
        suitMatrix[agent.entityId] = {};
        
        for (const roleSlot of scenario.roleSlots) {
            const roleId = roleSlot.roleId;

            // Part 1: Capability score
            let capScore = 0;
            const agentCaps = agent.capabilities || {};
            const roleCaps = roleSlot.capabilityProfile;
            for (const capKey in roleCaps) {
                const profileReq = roleCaps[capKey as keyof typeof roleCaps] ?? 0;
                const agentSkill = agentCaps[capKey as keyof typeof agentCaps] ?? 0;
                capScore += agentSkill * profileReq;
            }

            // Part 2: Goal similarity score
            const agentGoals = agent.goalWeights || {};
            const roleGoals = roleSlot.goalProfile;
            const goalSim = dotProduct(agentGoals, roleGoals);

            // Part 3: Leader bonus
            let leaderBonus = 0;
            if (roleId === 'leader' || roleId === 'incident_leader') {
                leaderBonus = leaderBonuses[agent.entityId];
            }

            suitMatrix[agent.entityId][roleId] = capScore + alpha * goalSim + beta * leaderBonus;
        }
    }

    // 3. Assign roles greedily for remaining slots
    
    // Identify which slots are already "filled" by default assignments to avoid overfilling?
    // Simplified approach: The roleSlots defines *generic* slots. Default assignments take precedence.
    // We should decrement counts from roleSlots based on defaults.
    
    const remainingRoleCounts: Record<string, number> = {};
    scenario.roleSlots.forEach(slot => {
        remainingRoleCounts[slot.roleId] = slot.count;
    });

    // Subtract already assigned defaults
    for (const role of Object.values(assignedRoles)) {
        if (remainingRoleCounts[role]) {
            remainingRoleCounts[role] = Math.max(0, remainingRoleCounts[role] - 1);
        }
    }

    // Create a flat list of remaining role slots to fill
    const allRoleSlots = scenario.roleSlots.flatMap(slot => {
        const count = remainingRoleCounts[slot.roleId] || 0;
        return Array(count).fill(slot.roleId);
    });

    for (const roleId of allRoleSlots) {
        let bestAgentId: string | null = null;
        let maxSuit = -Infinity;

        for (const agentId of availableAgentIds) {
            const suit = suitMatrix[agentId][roleId];
            if (suit > maxSuit) {
                maxSuit = suit;
                bestAgentId = agentId;
            }
        }

        if (bestAgentId) {
            assignedRoles[bestAgentId] = roleId as SceneRoleId;
            availableAgentIds.delete(bestAgentId);
        }
    }

    // Assign 'no_role' to remaining agents
    availableAgentIds.forEach(id => {
        assignedRoles[id] = 'no_role';
    });

    return assignedRoles;
}