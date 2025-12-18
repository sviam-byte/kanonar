
import React, { useMemo } from 'react';
import { getAllSocialEvents, getEntitiesByType } from '../data';
import { CharacterEntity, EntityType } from '../types';
import { buildUnifiedEventsView } from '../lib/events/unifiedEvents';
import { EventsPanel } from '../components/events/EventsPanel';

export const SocialEventsListPage: React.FC = () => {
    // 1. Get Data
    const socialEvents = getAllSocialEvents();
    
    const characters = useMemo(() => 
        (getEntitiesByType(EntityType.Character) as CharacterEntity[])
        .concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]), 
    []);

    // 2. Aggregate Personal Events from Characters
    const personalEvents = useMemo(() => {
        return characters.flatMap(c => (c.historicalEvents || []).map(ev => ({...ev, participants: ev.participants || [c.entityId]})));
    }, [characters]);

    // 3. Build Unified View
    const unifiedEvents = useMemo(() => {
        return buildUnifiedEventsView({
            characters,
            socialEvents,
            personalEvents,
            domainEvents: [] // No global domain events storage yet aside from simulation logs
        });
    }, [characters, socialEvents, personalEvents]);

    return (
        <div className="p-6 h-[calc(100vh-64px)] flex flex-col pb-10">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-canon-text">Глобальная Лента Событий</h2>
                    <p className="text-canon-text-light text-sm">Хроника всех социальных и личных событий в системе.</p>
                </div>
                <div className="text-right text-xs text-canon-text-light font-mono">
                    Всего событий: {unifiedEvents.length}
                </div>
            </div>
            
            <div className="flex-1 min-h-0">
                <EventsPanel events={unifiedEvents} />
            </div>
        </div>
    );
};
