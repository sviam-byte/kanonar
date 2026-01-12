
import React, { useState, useMemo } from 'react';
import { CharacterEntity, PersonalEvent, EntityType } from '../types';
import { getEntitiesByType } from '../data';
import { BiographyAnalysis } from '../components/BiographyAnalysis';
import { HistoricalEventEditor } from '../components/HistoricalEventEditor';
import { encodeCharacterToSnippet } from '../lib/character-snippet';
import { ThinkingSimilarityPanel } from '../components/ThinkingSimilarityPanel';

export const BiographyLabPage: React.FC = () => {
    const allCharacters = useMemo(() => (getEntitiesByType(EntityType.Character) as CharacterEntity[]), []);
    const [selectedCharId, setSelectedCharId] = useState<string>(allCharacters[0]?.entityId || '');
    
    const [events, setEvents] = useState<PersonalEvent[]>([]);

    // Load events when char changes, but only if not dirty? 
    // Simpler: just reload events from char when char changes
    React.useEffect(() => {
        const char = allCharacters.find(c => c.entityId === selectedCharId);
        if (char) {
            setEvents(char.historicalEvents || []);
        }
    }, [selectedCharId, allCharacters]);

    const selectedChar = allCharacters.find(c => c.entityId === selectedCharId);

    const handleEventsChange = (newEvents: PersonalEvent[]) => {
        setEvents(newEvents);
    };

    // Create a temporary character object with updated events for visualization
    const previewChar: CharacterEntity | null = selectedChar ? {
        ...selectedChar,
        historicalEvents: events
    } : null;

    const copySnippet = () => {
        if (!previewChar) return;
        const code = encodeCharacterToSnippet({
            meta: { id: previewChar.entityId, title: previewChar.title },
            vector_base: previewChar.vector_base || {},
            body: previewChar.body,
            identity: previewChar.identity,
            events: events
        });
        navigator.clipboard.writeText(code);
        alert('Код персонажа с обновленной биографией скопирован!');
    };

    return (
        <div className="p-8 h-[calc(100vh-64px)] flex flex-col">
            <header className="mb-8 flex justify-between items-start">
                <div>
                     <h1 className="text-3xl font-bold text-canon-text">Лаборатория Биографии</h1>
                     <p className="text-sm text-canon-text-light">Симуляция влияния жизненного пути на вектор личности.</p>
                </div>
                <div className="flex gap-4 items-center">
                     <select 
                        value={selectedCharId} 
                        onChange={e => setSelectedCharId(e.target.value)}
                        className="bg-canon-bg border border-canon-border rounded px-3 py-2 text-sm"
                     >
                         {allCharacters.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                     </select>
                     <button 
                        onClick={copySnippet}
                        className="bg-canon-accent text-canon-bg font-bold rounded px-4 py-2 text-sm hover:bg-opacity-80 transition-colors"
                    >
                        Экспорт Кода
                    </button>
                </div>
            </header>
            
            {previewChar ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow overflow-hidden">
                    {/* Left: Event Editor */}
                    <div className="lg:col-span-4 bg-canon-bg-light border border-canon-border rounded-lg p-4 flex flex-col overflow-hidden">
                        <h3 className="font-bold text-canon-text mb-4">Хроника Событий</h3>
                        <HistoricalEventEditor 
                            character={previewChar}
                            events={events}
                            onEventsChange={handleEventsChange}
                        />
                    </div>
                    
                    {/* Right: Analysis */}
                    <div className="lg:col-span-8 overflow-y-auto space-y-4">
                        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                            <h3 className="font-bold text-canon-text mb-4">Матрица Влияния</h3>
                            <BiographyAnalysis character={previewChar} events={events} />
                        </div>

                        <ThinkingSimilarityPanel
                          characters={allCharacters}
                          anchorId={selectedCharId}
                          onAnchorIdChange={setSelectedCharId}
                          k={6}
                          title="Похожие по мышлению (био слой)"
                        />
                    </div>
                </div>
            ) : (
                <div className="text-center text-canon-text-light mt-20">Выберите персонажа.</div>
            )}
        </div>
    );
};
