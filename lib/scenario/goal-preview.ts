
import { WorldState, AgentId } from '../../types';
import { computeContextGoalsForAgent } from '../goals/engine-v4';

export interface AgentGoalPreview {
    agentId: AgentId;
    dominantGoalId: string | null;
    goals: { id: string; score: number; label: string; targetId?: string }[];
}

export function previewGoalsForAgents(
    world: WorldState,
    agentIds: AgentId[]
): AgentGoalPreview[] {
    const result: AgentGoalPreview[] = [];

    for (const id of agentIds) {
        const snapshot = computeContextGoalsForAgent(world, id);
        if (!snapshot) {
            result.push({ agentId: id, dominantGoalId: null, goals: [] });
            continue;
        }

        const goals = snapshot.contextGoals;

        result.push({
            agentId: id,
            dominantGoalId: goals[0]?.id ?? null,
            goals: goals.map(g => ({
                id: g.id,
                score: g.score,
                label: g.label,
                targetId: g.targetId,
            })),
        });
    }

    return result;
}
