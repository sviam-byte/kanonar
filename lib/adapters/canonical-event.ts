
import { Event, EventKind, EventChannel } from '../events/types';
import { DomainEvent, SocialEventEntity, PersonalEvent } from '../../types';

export type AnyEventType = DomainEvent | Event | SocialEventEntity | PersonalEvent;

/**
 * Converts any diverse event type into the unified Canonical Event structure
 * used by the advanced simulation engines.
 */
export function toCanonicalEvent(e: AnyEventType): Event {
    // If it's already a System Event, return as is (with cast)
    if ((e as any).schemaVersion !== undefined) {
        return e as Event;
    }

    const legacy = e as any;
    
    // Default structure
    const canonical: Event = {
        id: legacy.id || legacy.entityId || `evt-${Date.now()}`,
        kind: mapKind(legacy),
        channel: 'world',
        schemaVersion: 1,
        timestamp: legacy.t ?? legacy.tick ?? 0,
        locationId: legacy.locationId || null,
        
        actors: legacy.actorId ? [legacy.actorId] : (legacy.participants || []),
        targets: legacy.targetId ? [legacy.targetId] : [],
        objects: [],
        
        tags: legacy.tags || [],
        facts: [],
        goalTags: [], // Would need inference
        
        effects: {
            worldDelta: legacy.effects?.worldDelta || {},
            stateDelta: legacy.effects?.stateDelta || {},
            goalDelta: legacy.goalEffects?.goal_weights_delta ? 
                { [legacy.actorId || 'unknown']: legacy.goalEffects.goal_weights_delta } : {},
            tensionDelta: legacy.effects?.tensionDelta || 0
        },
        
        epistemics: {
            witnesses: legacy.witnessIds || legacy.epistemics?.observers?.map((o:any) => o.actorId) || [],
            visibility: 1,
        },
        
        lifecycleStage: 'completed',
        status: 'committed',
        validationStatus: 'unchecked',
        priority: 0,
        isAtomic: true,
        payload: legacy.payload || legacy,

        causedBy: [],
        causes: [],
        importance: legacy.intensity ?? 0.5,
        validationErrors: [],
        orderKey: legacy.id || `evt-${Date.now()}`,
    };

    return canonical;
}

function mapKind(e: any): EventKind {
    if (e.type === 'social_event') return 'interaction';
    if (e.domain === 'perception') return 'perception';
    if (e.actionId) return 'action';
    return 'system';
}
