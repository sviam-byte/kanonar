
import React, { useState, useMemo } from 'react';
import { Tabs } from '../components/Tabs';
import { EventEditor } from '../components/events/EventEditor';
import { RichEventsList } from '../components/events/RichEventsList';
import { EventDeepDive } from '../components/events/EventDeepDive';
import { eventRegistry } from '../data/events-registry';
import { Event } from '../lib/events/types';
import { buildUnifiedEventsView } from '../lib/events/unifiedEvents';
import { getAllSocialEvents, getEntitiesByType } from '../data';
import { EntityType, CharacterEntity } from '../types';
import { arr } from '../lib/utils/arr';

// --- Subcomponent: Registry List ---

const EventStatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const colors: Record<string, string> = {
        committed: 'text-green-400 border-green-500/50 bg-green-900/20',
        hypothetical: 'text-yellow-400 border-yellow-500/50 bg-yellow-900/20',
        cancelled: 'text-red-400 border-red-500/50 bg-red-900/20',
    };
    return (
        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${colors[status] || 'text-gray-400 border-gray-600'}`}>
            {status}
        </span>
    );
};

const RegistryView: React.FC = () => {
    const [events, setEvents] = useState<Event[]>(eventRegistry.getAll());
    const [selectedId, setSelectedId] = useState<string | null>(events[0]?.id || null);

    const handleCreate = () => {
        const newEvt = eventRegistry.createDefault();
        eventRegistry.add(newEvt);
        setEvents(eventRegistry.getAll());
        setSelectedId(newEvt.id);
    };

    const handleUpdate = (updated: Event) => {
        eventRegistry.update(updated);
        setEvents(eventRegistry.getAll());
    };

    const handleDelete = (id: string) => {
        eventRegistry.remove(id);
        const remaining = eventRegistry.getAll();
        setEvents(remaining);
        if (selectedId === id) setSelectedId(remaining[0]?.id || null);
    };

    const selectedEvent = events.find(e => e.id === selectedId);

    return (
        <div className="grid grid-cols-12 gap-6 h-[80vh]">
            {/* Sidebar List */}
            <div className="col-span-3 flex flex-col bg-canon-bg-light border border-canon-border rounded-lg overflow-hidden">
                <div className="p-3 border-b border-canon-border bg-canon-bg flex justify-between items-center">
                    <h3 className="font-bold text-sm text-canon-text">Реестр Событий</h3>
                    <button 
                        onClick={handleCreate}
                        className="px-2 py-1 bg-canon-accent text-canon-bg text-xs font-bold rounded hover:bg-opacity-80"
                    >
                        + NEW
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {events.map(ev => (
                        <div 
                            key={ev.id}
                            onClick={() => setSelectedId(ev.id)}
                            className={`p-2 rounded border cursor-pointer transition-all ${
                                selectedId === ev.id 
                                ? 'bg-canon-accent/10 border-canon-accent shadow-[inset_2px_0_0_0_#00aaff]' 
                                : 'bg-canon-bg border-canon-border/50 hover:border-canon-text-light'
                            }`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-mono text-canon-text-light opacity-70">{ev.kind.toUpperCase()}</span>
                                <EventStatusBadge status={ev.status} />
                            </div>
                            <div className="text-xs font-bold text-canon-text truncate" title={ev.id}>
                                {ev.tags.length > 0 ? ev.tags.join(', ') : 'Без тегов'}
                            </div>
                            <div className="text-[9px] text-canon-text-light font-mono mt-1 truncate">
                                {ev.id}
                            </div>
                        </div>
                    ))}
                    {events.length === 0 && (
                        <div className="text-center text-canon-text-light text-xs py-8">Нет событий</div>
                    )}
                </div>
            </div>

            {/* Editor Area */}
            <div className="col-span-9 bg-canon-bg border border-canon-border rounded-lg p-1 overflow-y-auto custom-scrollbar">
                {selectedEvent ? (
                    <div className="p-4">
                        <div className="flex justify-between items-center mb-6 border-b border-canon-border pb-4">
                            <div>
                                <h2 className="text-xl font-bold text-canon-text">Редактор События</h2>
                                <p className="text-xs text-canon-text-light font-mono">{selectedEvent.id}</p>
                            </div>
                            <button 
                                onClick={() => handleDelete(selectedEvent.id)}
                                className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 px-3 py-1.5 rounded bg-red-900/10"
                            >
                                Удалить
                            </button>
                        </div>
                        <EventEditor event={selectedEvent} onChange={handleUpdate} />
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-canon-text-light opacity-50">
                        Выберите событие для редактирования
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Subcomponent: Unified Log (Rich View) ---

const UnifiedLogView: React.FC = () => {
    const socialEvents = useMemo(() => getAllSocialEvents(), []);
    // Mock system events from registry
    const systemEvents = useMemo(() => eventRegistry.getAll(), []); 

    const characters = useMemo(() => 
        (getEntitiesByType(EntityType.Character) as CharacterEntity[])
        .concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]), 
    []);

    const personalEvents = useMemo(() => {
        return characters.flatMap(c => arr(c.historicalEvents).map(ev => ({...ev, participants: ev.participants || [c.entityId]})));
    }, [characters]);

    const unifiedEvents = useMemo(() => {
        return buildUnifiedEventsView({
            characters,
            socialEvents,
            personalEvents,
            domainEvents: [],
            systemEvents // Pass the new system events
        });
    }, [characters, socialEvents, personalEvents, systemEvents]);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedEvent = unifiedEvents.find(e => e.id === selectedId);

    return (
        <div className="h-[80vh] flex border border-canon-border rounded-lg bg-canon-bg overflow-hidden shadow-2xl">
            <div className="w-80 flex-shrink-0 h-full">
                <RichEventsList events={unifiedEvents} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <div className="flex-1 h-full min-w-0">
                {selectedEvent ? (
                    <EventDeepDive event={selectedEvent} />
                ) : (
                    <div className="h-full flex items-center justify-center text-canon-text-light/50 flex-col gap-2">
                         <div className="text-4xl">📜</div>
                        <div>Select an event to view full details</div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main Page ---

export const EventsPage: React.FC = () => {
    return (
        <div className="p-8 max-w-[1800px] mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-canon-text mb-2">Система Событий</h1>
                <p className="text-canon-text-light">
                    Управление потоком изменений в мире. 
                    <span className="text-canon-accent ml-2">Event Engine v2.0 (Rich View)</span>
                </p>
            </div>

            <Tabs tabs={[
                { label: 'Хроника (Rich View)', content: <UnifiedLogView /> },
                { label: 'Реестр (System Layer)', content: <RegistryView /> },
            ]} />
        </div>
    );
};
