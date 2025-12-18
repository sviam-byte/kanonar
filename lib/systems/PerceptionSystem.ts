
// lib/systems/PerceptionSystem.ts

import { AgentState, WorldState } from '../../types';

// Define local Precept interface if needed or use inferred type
interface Precept {
    visible_agents: AgentState[];
    visible_threats: any[];
}

export const PerceptionSystem = {
    /**
     * Generates a precept for an agent based on the world state.
     * This is where perception errors (due to fatigue, stress, biases) would be introduced.
     * @param agent The perceiving agent.
     * @param world The current state of the world.
     * @returns A Precept object representing what the agent perceives.
     */
    perceive: (agent: AgentState, world: WorldState): Precept => {
        // Placeholder logic: For now, perception is perfect.
        // A real implementation would filter world state based on agent's senses,
        // apply noise based on fatigue, stress, or cognitive biases.
        
        // Example of imperfect perception:
        const observationNoise = agent.observation.noise || 0;
        const rng = agent.rngChannels.perceive || agent.rngChannels.physio;
        if (rng.nextFloat() < observationNoise * (agent.body.acute.fatigue / 100)) {
            // Agent is tired and misses something
            return {
                visible_agents: [],
                visible_threats: [],
            };
        }

        return {
            visible_agents: world.agents.filter(a => a.entityId !== agent.entityId),
            visible_threats: world.threats,
        };
    }
};
    