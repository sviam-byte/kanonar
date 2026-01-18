
// lib/systems/PerceptionSystem.ts

import { AgentState, WorldState } from '../../types';
import type { AgentMemory, MentalAtom } from '../core/mindTypes';

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

        const visibleAgents = world.agents.filter((a) => a.entityId !== agent.entityId);
        const visibleThreats = world.threats ?? [];

        // Update persistent memory from what is visible this tick.
        // This avoids stale closures and keeps beliefs across ticks with decay.
        const memory = ensureAgentMemory(agent);
        const currentTick = Number(world.tick ?? 0);
        const visibleAtoms = buildVisibleAtoms(visibleAgents, visibleThreats, currentTick);
        decayMemory(memory, currentTick);
        mergeVisibleAtoms(memory, visibleAtoms, currentTick);

        return {
            visible_agents: visibleAgents,
            visible_threats: visibleThreats,
        };
    }
};

function ensureAgentMemory(agent: AgentState): AgentMemory {
    if (agent.memory) return agent.memory;
    const memory: AgentMemory = {
        facts: new Map<string, MentalAtom>(),
        objectLocations: new Map<string, { x: number; y: number; locId: string }>(),
    };
    agent.memory = memory;
    return memory;
}

function buildVisibleAtoms(visibleAgents: AgentState[], visibleThreats: any[], currentTick: number): MentalAtom[] {
    const atoms: MentalAtom[] = [];

    for (const other of visibleAgents) {
        const key = `agent:seen:${String(other.entityId)}`;
        const atom = {
            id: String(other.entityId),
            kind: 'agent',
            tags: ['agent', 'visible'],
            locId: other.locationId ?? other.location?.entityId ?? null,
            position: other.position ?? other.pos ?? null,
        };
        atoms.push({
            key,
            atom,
            lastObservedTick: currentTick,
            confidence: 1,
            source: 'vision',
        });
    }

    for (const threat of visibleThreats) {
        const threatId = String(threat?.id ?? threat?.entityId ?? 'unknown');
        const key = `threat:seen:${threatId}`;
        atoms.push({
            key,
            atom: threat,
            lastObservedTick: currentTick,
            confidence: 1,
            source: 'vision',
        });
    }

    return atoms;
}

function decayMemory(memory: AgentMemory, currentTick: number) {
    for (const [key, fact] of memory.facts) {
        const age = currentTick - fact.lastObservedTick;
        if (age > 100) {
            fact.confidence *= 0.95;
        }
        if (fact.confidence < 0.1) {
            memory.facts.delete(key);
        }
    }
}

function mergeVisibleAtoms(memory: AgentMemory, atoms: MentalAtom[], currentTick: number) {
    for (const fact of atoms) {
        memory.facts.set(fact.key, {
            ...fact,
            lastObservedTick: currentTick,
            confidence: 1,
            source: 'vision',
        });

        // Cache object locations when we can infer them.
        const atom: any = fact.atom;
        const id = String(atom?.id ?? atom?.entityId ?? fact.key);
        const pos = atom?.position ?? atom?.pos;
        const locId = String(atom?.locId ?? atom?.locationId ?? '');
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && locId) {
            memory.objectLocations.set(id, { x: Number(pos.x), y: Number(pos.y), locId });
        }
    }
}
    
