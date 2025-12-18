
import { AgentState, WorldState, GoalEcology } from '../../types';
import { updateGoalEcology } from './scoring';

// Wrapper to use the new engine in contexts that expect tick_planning (like Profile view)
export function tick_planning(
    agent: AgentState,
    world: WorldState
): GoalEcology {
    
    // We reuse updateGoalEcology which now uses computeGoalPriorities
    // We work on a clone if we don't want to mutate the agent passed in (for view-only)
    // But AgentState is usually mutable in these contexts.
    
    // For safety in "View" mode (EntityDetailPage), we should probably clone
    // But updateGoalEcology modifies agent.goalEcology.
    
    const agentClone = { ...agent }; // Shallow copy to protect root refs
    
    // Ensure goalEcology structure exists for updateGoalEcology to read from (prev state)
    if (!agentClone.goalEcology) {
        agentClone.goalEcology = { execute: [], latent: [], queue: [], drop: [], tension: 0, frustration: 0, conflictMatrix: {}, groupGoals: [] };
    }
    
    updateGoalEcology(agentClone, world);
    
    return agentClone.goalEcology!;
}
