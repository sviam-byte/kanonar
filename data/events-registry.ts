
import { Event } from '../lib/events/types';
import { createEventFactory } from '../lib/events/factory';
import { listify } from '../lib/utils/listify';

// Инициализируем фабрику с простым генератором ID
const factory = createEventFactory({
    makeId: () => `sys-evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    now: () => Date.now(),
    schemaVersion: 1,
    defaultChannel: 'world'
});

// Начальный набор событий для демонстрации
const initialEvents: Event[] = [
    factory.makeSceneTransition({
        sceneId: 'council_simple',
        transition: { from: 'debate', to: 'voting' },
        tags: ['system', 'automatic'],
        importance: 0.8
    }),
    factory.makePerception({
        observer: 'character-tegan-nots',
        observedEventId: 'evt-betrayal-001',
        confidence: 0.6,
        interpretationTag: 'insubordination'
    })
];

// Простое хранилище (в реальном приложении это было бы в Context или Redux)
export const eventRegistry = {
    events: initialEvents,
    
    getAll: () => listify(eventRegistry.events),
    
    add: (evt: Event) => {
        eventRegistry.events = [...listify(eventRegistry.events), evt];
    },
    
    update: (updated: Event) => {
        eventRegistry.events = listify(eventRegistry.events).map(e => e.id === updated.id ? updated : e);
    },
    
    remove: (id: string) => {
        eventRegistry.events = listify(eventRegistry.events).filter(e => e.id !== id);
    },
    
    createDefault: () => factory.makeBase({ kind: 'system', tags: ['new'] })
};
