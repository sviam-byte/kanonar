import React, { useState, useCallback, useMemo } from 'react';
import { runCase } from '../lib/solver/case_engine';
import { CaseCard, Agent, LogEntry } from '../lib/solver/types';
import cardData from '../data/cards/case/evac-bridge';
import { ArchetypeBuilder } from '../components/ArchetypeBuilder';
import { getEntitiesByType } from '../data';
import { CharacterEntity, EntityType } from '../types';
import { characterEntityToAgent } from '../lib/solver/mapper';

const LogStep: React.FC<{ entry: LogEntry }> = ({ entry }) => {
    return (
        <div className="border-b border-canon-border/50 py-3 px-4">
            <div className="flex items-start gap-4">
                <span className="font-mono text-xs text-canon-text-light w-12 text-right pt-0.5">t={entry.t}</span>
                <div className="flex-grow">
                    <div className="flex items-baseline gap-3">
                        <span className="font-bold text-sm text-canon-accent w-28 flex-shrink-0">{entry.step.toUpperCase()}</span>
                        <p className="text-sm font-semibold">{entry.brief}</p>
                    </div>
                    <div className="mt-2 pl-4 border-l-2 border-canon-border space-y-1">
                        {entry.explain.map((line, i) => (
                            <p key={i} className="text-xs text-canon-text-light font-mono">- {line}</p>
                        ))}
                        {entry.contribs && entry.contribs.length > 0 && (
                            <div className="pt-2">
                                <h5 className="text-xs font-bold text-canon-text-light">Contributions:</h5>
                                <pre className="text-xs bg-canon-bg p-2 rounded mt-1 font-mono max-w-md overflow-x-auto">
                                    {entry.contribs.map((c, i) => `${(c.name || 'unknown').padEnd(20, ' ')}: ${(c.value || 0).toFixed(3)}`).join('\n')}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SolverPage: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Agent selection state
    const baseCharacters = useMemo(() => 
        (getEntitiesByType(EntityType.Character) as CharacterEntity[])
        .concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]), 
    []);
    const [addedArchetypes, setAddedArchetypes] = useState<CharacterEntity[]>([]);
    const availableAgents = useMemo(() => [...baseCharacters, ...addedArchetypes], [baseCharacters, addedArchetypes]);
    const [selectedAgentId, setSelectedAgentId] = useState<string>(availableAgents[0]?.entityId || '');

    const handleAddArchetype = useCallback((archetype: CharacterEntity) => {
        setAddedArchetypes(prev => {
            if (prev.some(a => a.entityId === archetype.entityId)) return prev;
            return [...prev, archetype];
        });
        setSelectedAgentId(archetype.entityId);
    }, []);

    const handleRun = useCallback(() => {
        const selectedAgent = availableAgents.find(a => a.entityId === selectedAgentId);
        if (!selectedAgent) {
            alert('Пожалуйста, выберите агента для симуляции.');
            return;
        }

        setIsLoading(true);
        setLogs(null);
        setTimeout(() => {
            const agent = characterEntityToAgent(selectedAgent);
            const cardCopy = JSON.parse(JSON.stringify(cardData));
            const result = runCase(cardCopy as CaseCard, agent, 12345);
            setLogs(result.logs);
            setIsLoading(false);
        }, 50);
    }, [selectedAgentId, availableAgents]);
    
    const selectedAgentName = availableAgents.find(a => a.entityId === selectedAgentId)?.title || '...';

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-2">Решатель (Solver)</h2>
            <p className="text-canon-text-light mb-6">Запуск одного эпизода симуляции с детальным пошаговым логом для отладки и анализа принятия решений агентом.</p>
            
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 mb-6 space-y-4">
                <div>
                    <h3 className="font-bold text-lg text-canon-accent">1. Выберите агента</h3>
                    <select 
                        value={selectedAgentId} 
                        onChange={e => setSelectedAgentId(e.target.value)}
                        className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1.5 mt-1 text-sm"
                    >
                        <optgroup label="Персонажи">
                            {baseCharacters.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                        </optgroup>
                        {addedArchetypes.length > 0 && (
                            <optgroup label="Архетипы">
                                {addedArchetypes.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                            </optgroup>
                        )}
                    </select>
                </div>
                 <div className="border-t border-canon-border/50 pt-4">
                    <h4 className="font-bold text-sm text-canon-text-light mb-2">Или создайте нового архетипа</h4>
                     <ArchetypeBuilder onAddArchetype={handleAddArchetype} />
                </div>
            </div>

            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 mb-6">
                <h3 className="font-bold text-lg text-canon-accent">2. Запустите симуляцию</h3>
                <p className="text-xs mt-1 text-canon-text-light">Сценарий: {(cardData as CaseCard).title} | Горизонт: {(cardData as CaseCard).horizon_steps} шагов. | Агент: {selectedAgentName}</p>
                 <button onClick={handleRun} disabled={isLoading || !selectedAgentId} className="mt-4 w-full bg-canon-accent text-canon-bg font-bold rounded p-2 hover:bg-opacity-80 transition-colors disabled:bg-canon-border disabled:cursor-wait">
                    {isLoading ? 'Симуляция...' : 'Запустить'}
                </button>
            </div>

             <div className="bg-canon-bg-light border border-canon-border rounded-lg">
                <h3 className="text-lg font-bold p-4 border-b border-canon-border">Лог выполнения</h3>
                 <div className="max-h-[70vh] overflow-y-auto">
                    {isLoading && <div className="p-8 text-center text-canon-text-light">Выполнение симуляции...</div>}
                    {!isLoading && !logs && <div className="p-8 text-center text-canon-text-light">Выберите агента и нажмите "Запустить".</div>}
                    {logs && logs.map((entry, index) => <LogStep key={index} entry={entry} />)}
                 </div>
             </div>
        </div>
    );
};
