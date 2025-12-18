
import React, { useState, useCallback, useMemo } from 'react';
import { getEntitiesByType } from '../data';
import { allStories } from '../data/stories';
import { STRATEGIES } from '../lib/choice/strategies';
import { runMatrix } from '../lib/runner/experiments';
import { CharacterEntity, EntityType, RunLog, MatrixRunResult } from '../types';
import { MultiLineChart } from '../components/charts/MultiLineChart';
import { ActionDistributionChart } from '../components/charts/ActionDistributionChart';
import { Tabs } from '../components/Tabs';
import { useSandbox } from '../contexts/SandboxContext';

const Checkbox: React.FC<{ id: string, label: string, checked: boolean, onChange: (id: string, checked: boolean) => void }> = ({ id, label, checked, onChange }) => (
    <div className="flex items-center">
        <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(id, e.target.checked)} className="w-4 h-4 text-canon-accent bg-canon-bg border-canon-border rounded focus:ring-canon-accent" />
        <label htmlFor={id} className="ml-2 text-sm text-canon-text">{label}</label>
    </div>
);

export const RunnerPage: React.FC = () => {
    const { characters: sandboxCharacters } = useSandbox();
    
    const characters = useMemo(() => {
        const baseChars = getEntitiesByType(EntityType.Character).concat(getEntitiesByType(EntityType.Essence)) as CharacterEntity[];
        const map = new Map<string, CharacterEntity>();
        baseChars.forEach(c => map.set(c.entityId, c));
        sandboxCharacters.forEach(c => map.set(c.entityId, c));
        return Array.from(map.values());
    }, [sandboxCharacters]);
    
    const [selectedAgents, setSelectedAgents] = useState<Set<string>>(() => new Set([characters[0]?.entityId].filter(Boolean)));
    const [selectedStories, setSelectedStories] = useState<Set<string>>(() => new Set(['surface-egress']));
    const [selectedStrategies, setSelectedStrategies] = useState<Set<string>>(() => new Set(['cautious', 'bold']));
    
    const [results, setResults] = useState<MatrixRunResult[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    const handleSelectionChange = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, checked: boolean) => {
        set(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(id);
            else newSet.delete(id);
            return newSet;
        });
    };
    
    const handleRun = useCallback(async () => {
        setIsLoading(true);
        setResults(null);
        // Run in a timeout to allow the UI to update to the loading state
        setTimeout(async () => {
            const res = await runMatrix({
                stories: Array.from(selectedStories),
                agents: Array.from(selectedAgents),
                seeds: [1, 2, 3], // Using a small number of seeds for UI performance
                strategyIds: Array.from(selectedStrategies),
            });
            setResults(res);
            setIsLoading(false);
        }, 50);
    }, [selectedAgents, selectedStories, selectedStrategies]);
    
    const canRun = selectedAgents.size > 0 && selectedStories.size > 0 && selectedStrategies.size > 0;
    const runCount = selectedStories.size * selectedStrategies.size * 3;

    const resultTabs = useMemo(() => {
        if (!results || results.length === 0) return [];
        return [
            {
                label: "Динамика Стабильности (S)",
                content: <MultiLineChart results={results} dataKey="S" title="Динамика Стабильности (S)" />
            },
            {
                label: "Динамика Q-Value",
                content: <MultiLineChart results={results} dataKey="Q" title="Динамика Q-Value (усредненное)" />
            },
            {
                label: "Распределение Действий",
                content: <ActionDistributionChart results={results} />
            }
        ];
    }, [results]);

    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            <div className="grid grid-cols-12 gap-6">
                <aside className="col-span-12 lg:col-span-3 space-y-4">
                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h2 className="text-xl font-bold mb-3 text-canon-accent">Матричный симулятор</h2>
                        <p className="text-xs text-canon-text-light mb-4">Настройте и запустите матрицу симуляций для анализа и сравнения поведения персонажей в различных сценариях.</p>
                        <button onClick={handleRun} disabled={!canRun || isLoading} className="w-full bg-canon-accent text-canon-bg font-bold rounded p-2.5 hover:bg-opacity-80 transition-colors disabled:bg-canon-border disabled:cursor-wait">
                            {isLoading ? 'Выполнение...' : `Запустить ${runCount} прогонов`}
                        </button>
                    </div>

                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h3 className="font-bold mb-3 text-canon-text">Персонажи</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                           {characters.map(c => <Checkbox key={c.entityId} id={c.entityId} label={c.title} checked={selectedAgents.has(c.entityId)} onChange={(id, chk) => handleSelectionChange(setSelectedAgents, id, chk)} />)}
                        </div>
                    </div>

                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h3 className="font-bold mb-3 text-canon-text">Истории (Сценарии)</h3>
                        <div className="space-y-2">
                            {Object.values(allStories).map(s => <Checkbox key={s.id} id={s.id} label={s.title} checked={selectedStories.has(s.id)} onChange={(id, chk) => handleSelectionChange(setSelectedStories, id, chk)} />)}
                        </div>
                    </div>

                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h3 className="font-bold mb-3 text-canon-text">Стратегии (Политики)</h3>
                        <div className="space-y-2">
                           {STRATEGIES.map(s => <Checkbox key={s.id} id={s.id} label={s.id} checked={selectedStrategies.has(s.id)} onChange={(id, chk) => handleSelectionChange(setSelectedStrategies, id, chk)} />)}
                        </div>
                    </div>
                </aside>
                
                <main className="col-span-12 lg:col-span-9">
                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 h-[85vh]">
                        {isLoading && <div className="h-full flex items-center justify-center text-canon-text-light">Генерация симуляционных данных...</div>}
                        {!isLoading && !results && <div className="h-full flex items-center justify-center text-canon-text-light">Настройте параметры и запустите симуляцию.</div>}
                        {!isLoading && results && results.length === 0 && <div className="h-full flex items-center justify-center text-canon-red">Не удалось сгенерировать результаты. Проверьте консоль.</div>}
                        {!isLoading && results && results.length > 0 && (
                            <Tabs tabs={resultTabs} />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};
