
import { SimulationEvent, CharacterEntity, AgentState, WorldState, ActionAppliedEvent, TomUpdatedEvent, LeaderChangedEvent, SceneMetricsUpdatedEvent } from '../../types';
import { UnifiedEventView, UnifiedEventKind } from './unifiedEvents';

const resolveName = (id: string, agents: AgentState[]): string => {
    const agent = agents.find(a => a.entityId === id);
    return agent ? agent.title : id;
};

/**
 * Converts a raw simulation event (from the engine loop) into a formatted Unified View.
 * This bridges the gap between the engine's internal event log and the UI's need for structured data.
 */
export function mapSimulationEventsToUnified(
    events: SimulationEvent[], 
    world: WorldState, 
    characters: CharacterEntity[]
): UnifiedEventView[] {
    
    return events.map((ev, index) => {
        const baseId = `sim-ev-${ev.tick}-${index}`;
        
        // 1. Action Applied -> Social Event
        if (ev.kind === 'ActionApplied') {
            const actionEv = ev as ActionAppliedEvent;
            const actionId = actionEv.actionId;
            const actorName = resolveName(actionEv.actorId, world.agents);
            
            // Construct Effects from BodyDelta / SceneDelta
            const effects: any = {};
            if (actionEv.bodyDelta) {
                effects.body = {
                    delta_reserves: {
                        stress: actionEv.bodyDelta.stress,
                        energy: actionEv.bodyDelta.fatigue ? -actionEv.bodyDelta.fatigue : undefined
                    }
                };
            }

            return {
                id: baseId,
                kind: 'social',
                t: ev.tick,
                label: actionId,
                domain: 'social',
                tags: ['action', 'simulation'],
                actorId: actionEv.actorId,
                targetId: actionEv.targetId,
                actorName: actorName,
                targetName: actionEv.targetId ? resolveName(actionEv.targetId, world.agents) : undefined,
                intensity: actionEv.success,
                valence: actionEv.success > 0.5 ? 1 : -1,
                effects: effects,
                raw: ev as any
            } as UnifiedEventView;
        }

        // 2. ToM Update -> Personal Event (Internal Change)
        if (ev.kind === 'TomUpdated') {
            const tomEv = ev as TomUpdatedEvent;
            return {
                id: baseId,
                kind: 'personal',
                t: ev.tick,
                label: 'Обновление ToM',
                domain: 'cognition',
                tags: ['tom', 'learning'],
                actorId: tomEv.observerId,
                actorName: resolveName(tomEv.observerId, world.agents),
                targetId: tomEv.targetId,
                targetName: resolveName(tomEv.targetId, world.agents),
                intensity: Math.abs((tomEv.newTrust ?? 0.5) - 0.5) * 2,
                effects: {
                    relations: {
                        delta_trust: { [tomEv.targetId]: tomEv.newTrust ? 0.1 : 0 }
                    }
                },
                raw: ev as any
            } as UnifiedEventView;
        }

        // 3. Scene Metrics -> Domain Event
        if (ev.kind === 'SceneMetricsUpdated') {
            // SceneMetricsUpdatedEvent type check implied by kind
             return {
                id: baseId,
                kind: 'domain',
                t: ev.tick,
                label: 'Изменение Сцены',
                domain: 'physics',
                tags: ['environment'],
                actorId: 'SYSTEM',
                actorName: 'Сценарий',
                effects: {
                    // Map raw deltas to readable effects?
                    // For now we just dump raw
                },
                raw: ev as any
             } as UnifiedEventView;
        }
        
        // 4. Leader Change -> Social/Domain
        if (ev.kind === 'LeaderChanged') {
            const leaderEv = ev as LeaderChangedEvent;
            return {
                id: baseId,
                kind: 'social',
                t: ev.tick,
                label: 'Смена Лидера',
                domain: 'hierarchy',
                tags: ['politics', 'leadership'],
                actorId: leaderEv.newLeaderId || 'NONE',
                actorName: leaderEv.newLeaderId ? resolveName(leaderEv.newLeaderId, world.agents) : 'Никто',
                targetId: leaderEv.oldLeaderId || undefined,
                targetName: leaderEv.oldLeaderId ? resolveName(leaderEv.oldLeaderId, world.agents) : undefined,
                intensity: 1.0,
                raw: ev as any
            } as UnifiedEventView;
        }

        // Default Fallback
        return {
            id: baseId,
            kind: 'domain',
            t: ev.tick,
            label: ev.kind,
            domain: 'system',
            tags: ['debug'],
            raw: ev as any
        } as UnifiedEventView;
    });
}
