
import React, { useState } from 'react';
import { useSandbox } from '../contexts/SandboxContext';
import { decodeSnippetToCharacter } from '../lib/character-snippet';
import { decodeDyadPreset } from '../lib/presets/encoding';
import { importDyadPreset } from '../lib/presets/importer';
import { EntityType, CharacterEntity } from '../types';
import { TEST_SCENES, ScenePreset } from '../data/presets/scenes';
import { getEntityById } from '../data';

export const UniversalLoader: React.FC = () => {
    const { addCharacter, setDyadConfigFor, reset } = useSandbox();
    const [input, setInput] = useState('');
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

    const handleLoadCode = () => {
        const code = input.trim();
        if (!code) return;
        setStatus(null);

        try {
            if (code.startsWith('KANONAR4-CHAR::')) {
                // 1. Character Import
                const char = decodeSnippetToCharacter(code);
                const safeId = char.entityId || `runtime-${(char.title || 'character').toLowerCase().replace(/\s+/g, '-')}`;
                const withId: CharacterEntity = { ...char, entityId: safeId, type: EntityType.Character };
                
                addCharacter(withId);
                setStatus({ type: 'success', text: `Персонаж "${char.title}" добавлен в сессию.` });
                setInput('');

            } else if (code.startsWith('KANONAR4-REL::')) {
                // 2. Relation Preset Import
                const preset = decodeDyadPreset(code);
                const result = importDyadPreset(preset);
                
                result.characters.forEach(c => addCharacter(c));
                Object.entries(result.configs).forEach(([id, cfg]) => setDyadConfigFor(id, cfg));

                setStatus({ type: 'success', text: result.message });
                setInput('');

            } else {
                throw new Error('Неизвестный формат кода. Ожидается KANONAR4-CHAR или KANONAR4-REL.');
            }
        } catch (e: any) {
            setStatus({ type: 'error', text: e.message || 'Ошибка импорта' });
        }
    };

    const loadScene = (scene: ScenePreset) => {
        reset(); // Clear existing session for clean test
        
        let loadedCount = 0;
        
        // 1. Load Characters from Registry
        scene.characters.forEach(id => {
            const char = getEntityById(id);
            if (char && (char.type === EntityType.Character || char.type === EntityType.Essence)) {
                addCharacter(char as CharacterEntity);
                loadedCount++;
            } else {
                console.warn(`Character ${id} not found in registry.`);
            }
        });

        // 2. Apply Configs
        Object.entries(scene.configs).forEach(([id, cfg]) => {
            setDyadConfigFor(id, cfg);
        });

        setStatus({ 
            type: 'success', 
            text: `Сцена "${scene.title}" загружена. Персонажей: ${loadedCount}. Локация: ${scene.locationId}` 
        });
    };

    return (
        <div className="space-y-4">
            {/* Code Import */}
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-canon-text">Универсальный импорт (Код)</h3>
                    {status && (
                        <span className={`text-xs font-medium ${status.type === 'success' ? 'text-canon-green' : status.type === 'error' ? 'text-canon-red' : 'text-canon-blue'}`}>
                            {status.text}
                        </span>
                    )}
                </div>
                <div className="relative group">
                    <textarea
                        className="w-full h-24 border border-canon-border rounded px-3 py-2 font-mono text-[10px] bg-canon-bg text-canon-text focus:border-canon-accent outline-none placeholder:text-canon-text-light/50 resize-none transition-colors break-all whitespace-pre-wrap overflow-y-auto"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Вставьте код персонажа (KANONAR4-CHAR::...) или код сцены (KANONAR4-REL::...)"
                        spellCheck={false}
                    />
                    <div className="absolute bottom-2 right-2 flex gap-2">
                        {input && (
                            <button 
                                onClick={() => setInput('')}
                                className="px-2 py-1 bg-canon-bg border border-canon-border rounded text-[10px] text-canon-text-light hover:text-canon-red transition-colors"
                            >
                                Очистить
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex justify-end">
                    <button
                        onClick={handleLoadCode}
                        disabled={!input}
                        className="px-4 py-2 rounded bg-canon-blue text-canon-bg font-bold text-xs hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                        Загрузить код
                    </button>
                </div>
            </div>

            {/* Test Scenes */}
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 space-y-3 shadow-sm">
                <h3 className="text-sm font-bold text-canon-text">Тестовые Сцены (Пресеты)</h3>
                <div className="grid grid-cols-1 gap-2">
                    {TEST_SCENES.map(scene => (
                        <button
                            key={scene.id}
                            onClick={() => loadScene(scene)}
                            className="text-left group flex flex-col bg-canon-bg border border-canon-border/50 rounded p-2 hover:border-canon-accent/50 transition-all"
                        >
                            <div className="flex justify-between items-baseline">
                                <span className="text-xs font-bold text-canon-text group-hover:text-canon-accent transition-colors">{scene.title}</span>
                                <span className="text-[9px] font-mono text-canon-text-light">{scene.characters.length} chars</span>
                            </div>
                            <p className="text-[10px] text-canon-text-light mt-1">{scene.description}</p>
                            <div className="text-[9px] font-mono text-canon-text-light/50 mt-1 truncate">Loc: {scene.locationId}</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
