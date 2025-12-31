// lib/social/orders.ts
import { WorldState, AgentState, Order, CharacterGoalId, SocialActionId, Intention } from '../../types';
import { computeGroupAlignment } from './group';
import { listify } from '../utils/listify';

// Helpers to analyze group state
function computeGroupStats(world: WorldState) {
    const wounded = world.agents.filter(a => a.hp < 70).length;
    const critical = world.agents.filter(a => a.hp < 40).length;
    // Simple stress average from available body state
    const avgStress = world.agents.reduce((s, a) => s + (a.body?.acute?.stress ?? 0), 0) / Math.max(world.agents.length, 1);
    return { wounded, critical, avgStress };
}

function isSafeLocation(world: WorldState, locId?: string | null): boolean {
    if (!locId) return false;
    const loc = world.locations.find(l => l.entityId === locId);
    if (!loc) return false;

    const tags: string[] = listify((loc as any).tags);
    const riskIndex = (loc as any).riskReward?.riskIndex ?? 0;
    const alert = (loc as any).state?.alert_level ?? 0;

    // A location is safe if private/residential and has low alert/risk levels
    const isPrivate = tags.includes('private') || tags.includes('residential') || tags.includes('module_only');
    return isPrivate && riskIndex < 0.3 && alert < 0.3;
}

export function getActiveOrdersFor(world: WorldState, agentId: string): Order[] {
    if (!world.orders) return [];
    
    const agent = world.agents.find(a => a.entityId === agentId);
    if (!agent) return [];

    return world.orders.filter(o =>
        o.status === 'pending' &&
        (o.toId === agentId || o.toId === 'ALL' || (o.toId.startsWith('ROLE:') && agent.effectiveRole === o.toId.slice(5)))
    );
}

export function hasActiveOrder(world: WorldState, agentId: string): boolean {
    return getActiveOrdersFor(world, agentId).length > 0;
}

// The "Brain" of the Leader: decides which orders to issue based on the situation
export function planLeaderStep(world: WorldState): void {
    const leaderId = world.leadership.currentLeaderId;
    if (!leaderId) return;

    const leader = world.agents.find(a => a.entityId === leaderId);
    if (!leader) return;
    
    if ((leader.hp ?? 0) < 10 || (leader.body?.acute?.stress ?? 0) > 90) return;
}

/**
 * Generates a specific, contextual order object when a leader performs 'issue_order'.
 */
export function createOrderForLeader(
    agent: AgentState,
    intention: Intention,
    world: WorldState
): Order | null {
    if (!intention.targetId) return null; // Orders need a target
    
    const targetId = intention.targetId;
    const target = world.agents.find(a => a.entityId === targetId);
    
    // Determine the content of the order based on context
    const scene = world.scene?.metrics;
    const threat = scene?.threat ?? 0;
    const woundedCount = scene?.wounded_unsorted ?? 0;

    const safeHere = isSafeLocation(world, agent.locationId);

    let requiredAction: SocialActionId = 'wait';
    let kind = 'generic';
    let summary = 'Ожидать дальнейших указаний';
    let goalId: CharacterGoalId = 'maintain_cohesion';

    // Logic: Do not issue high-stakes combat/medical orders in safe private quarters
    if (threat > 50 && !safeHere) {
        requiredAction = 'protect_exit';
        kind = 'defense';
        summary = 'Занять оборону и защищать выход!';
        goalId = 'contain_threat';
    } else if (!safeHere && woundedCount > 0 && (target?.capabilities?.medical_skill ?? 0) > 0.5) {
        requiredAction = 'triage_wounded';
        kind = 'medical';
        summary = 'Немедленно заняться ранеными!';
        goalId = 'help_wounded';
    } else if (!safeHere && (scene?.route_known ?? 100) < 80) {
        requiredAction = 'search_route';
        kind = 'scout';
        summary = 'Найти безопасный путь!';
        goalId = 'go_to_surface';
    } else {
        requiredAction = 'support_leader';
        kind = 'discipline';
        summary = 'Держать строй и поддерживать порядок.';
        goalId = 'maintain_legitimacy';
    }

    // Override based on driving goal of the leader
    if (agent.drivingGoalId === 'immediate_compliance') {
         summary = 'Немедленно подчиниться и доложить!';
    }

    return {
        id: `ord-${world.tick}-${agent.entityId}-${targetId}`,
        tickIssued: world.tick,
        fromId: agent.entityId,
        toId: targetId,
        requiredActionId: requiredAction,
        linkedGoalId: goalId,
        priority: 0.8,
        deadlineTick: world.tick + 10,
        status: 'pending',
        kind,
        createdAtTick: world.tick,
        summary
    };
}

// Calculates how much an order influences an agent's decision utility (Q)
export function computeOrderInfluence(
    world: WorldState,
    agent: AgentState,
    actionId: string,
): { qFromProcedure: number; hasMatchingOrder: boolean } {
    if (!world.orders || !world.orders.length) {
        return { qFromProcedure: 0, hasMatchingOrder: false };
    }

    // Filter relevant orders using the helper to ensure consistency
    const relevant = getActiveOrdersFor(world, agent.entityId);

    if (!relevant.length) {
        return { qFromProcedure: 0, hasMatchingOrder: false };
    }

    // Agent personality factors
    const obedience = agent.vector_base?.A_Legitimacy_Procedure ?? 0.5;
    const autonomy = agent.vector_base?.A_Liberty_Autonomy ?? 0.5;
    
    // Leader stats
    const legitimacy = world.leadership.legitimacy ?? 0.5;

    let boost = 0;
    let hasMatchingOrder = false;

    for (const ord of relevant) {
        if (ord.requiredActionId === actionId) {
            hasMatchingOrder = true;
            const base = ord.priority;
            
            boost += base * (0.5 + obedience) * legitimacy * (1 - 0.3 * autonomy);
        }
    }

    return { qFromProcedure: boost, hasMatchingOrder };
}
