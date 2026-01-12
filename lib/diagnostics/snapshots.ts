
import { WorldState, AgentState, CharacterDebugSnapshot, WorldDebugSnapshot } from '../../types';
import { getTomView } from '../tom/view';

export function makeCharacterDebugSnapshot(agent: AgentState, world: WorldState): CharacterDebugSnapshot {
    const topRelations = world.agents
        .filter(other => other.entityId !== agent.entityId)
        .map(other => {
            const view = getTomView(world, agent.entityId, other.entityId);
            return { targetId: other.entityId, targetName: other.title, trust: view.trust };
        })
        .sort((a, b) => b.trust - a.trust)
        .slice(0, 3);

    return {
        id: agent.entityId,
        name: agent.title,
        stress: (agent.body?.acute?.stress ?? 0) / 100,
        prMonstro: agent.prMonstro,
        archetypeObserved: agent.identityProfile?.archetypeObserved,
        archetypeSelf: agent.identityProfile?.archetypeSelf,
        archetypePhase: agent.archetype?.phase,
        identityTension: agent.identityProfile?.tensionSelfObserved,
        shadowId: agent.archetype?.shadowId,
        shadowActivation: agent.archetype?.shadowActivation,
        tomQuality: agent.tomMetrics?.toM_Quality,
        tomUncertainty: agent.tomMetrics?.toM_Unc,
        tomMode: agent.mode,
        topRelations,
        activeFailureModes: agent.failureState?.activeModes || [],
        lastEpisodes: [], // Placeholder as episode tracking is heavy
        psych: agent.psych ? {
            selfGap: agent.psych.selfGap ?? 0,
            narrative: agent.psych.narrative,
            moral: agent.psych.moral,
            coping: agent.psych.coping,
            distortions: agent.psych.distortion,
            thinking: agent.psych.thinking,
            activityCaps: agent.psych.activityCaps
        } : undefined
    };
}

export function makeWorldDebugSnapshot(world: WorldState): WorldDebugSnapshot {
    const { agents } = world;
    
    const meanStress = agents.reduce((s, a) => s + (a.body?.acute?.stress ?? 0), 0) / Math.max(1, agents.length);
    const meanPrMonstro = agents.reduce((s, a) => s + (a.prMonstro ?? 0), 0) / Math.max(1, agents.length);
    const shareStrain = agents.filter(a => a.archetype?.phase === 'strain').length / Math.max(1, agents.length);
    const shareBreak = agents.filter(a => a.archetype?.phase === 'break').length / Math.max(1, agents.length);
    
    // Assuming legitimacy is global in scene metrics for now
    const meanInstitutionLegitimacy = world.scene?.metrics?.legitimacy ? world.scene.metrics.legitimacy / 100 : 0.7;
    const meanSystemStability = 0.8; // Placeholder

    const systems: any[] = world.systemEntities?.map(s => ({
        id: 'sys-1', // Mock
        name: 'Oxygen',
        kind: 'resource',
        health: s.health,
        stability: s.stability,
        complexity: 0.5
    })) || [];

    const factions = world.factions?.map(f => ({
        id: f.id,
        name: f.name,
        legitimacy: 0.8, // Mock
        leaderId: f.leaderId,
        membersCount: agents.filter(a => a.factionId === f.id).length,
        hostility: f.hostility
    })) || [];

    const characters = agents.map(a => makeCharacterDebugSnapshot(a, world));

    const lastWorldEpisode = world.worldEpisodes && world.worldEpisodes.length > 0
        ? world.worldEpisodes[world.worldEpisodes.length - 1]
        : undefined;

    return {
        tick: world.tick,
        aggregates: {
            meanStress,
            meanPrMonstro,
            shareStrain,
            shareBreak,
            meanInstitutionLegitimacy,
            meanSystemStability,
        },
        systems,
        factions,
        characters,
        lastWorldEpisode
    };
}
