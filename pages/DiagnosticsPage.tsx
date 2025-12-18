
// pages/DiagnosticsPage.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { CharacterEntity, EntityType, EssenceEntity } from '../types';
import { getEntitiesByType } from '../data';
import { allDiagnosticScenarios } from '../data/diagnostics/scenarios';
import { DiagnosticReport } from '../lib/diagnostics/types';
import { runDiagnosticScenario } from '../lib/diagnostics/runner';
import { DiagnosticReportView } from '../components/diagnostics/DiagnosticReportView';
import { useSandbox } from '../contexts/SandboxContext';

const Checkbox: React.FC<{ id: string, label: string, checked: boolean, onChange: (id: string, checked: boolean) => void }> = ({ id, label, checked, onChange }) => (
    <div className="flex items-center">
        <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(id, e.target.checked)} className="w-4 h-4 text-canon-accent bg-canon-bg border-canon-border rounded focus:ring-canon-accent" />
        <label htmlFor={id} className="ml-2 text-sm text-canon-text">{label}</label>
    </div>
);

export const DiagnosticsPage: React.FC = () => {
    const { characters: sandboxCharacters } = useSandbox();

    const allCharacters = useMemo(() => {
        const baseChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
        const map = new Map<string, CharacterEntity>();
        baseChars.forEach(c => map.set(c.entityId, c));
        sandboxCharacters.forEach(c => map.set(c.entityId, c));
        return Array.from(map.values());
    }, [sandboxCharacters]);
    
    const [selectedAgents, setSelectedAgents] = useState<Set<string>>(() => new Set([allCharacters[0]?.entityId, allCharacters[1]?.entityId].filter(Boolean)));
    const [selectedScenarioId, setSelectedScenarioId] = useState<string>(allDiagnosticScenarios[0]?.id || '');
    
    const [report, setReport] = useState<DiagnosticReport | null>(null);
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
        const charactersToRun = allCharacters.filter(c => selectedAgents.has(c.entityId));
        const scenario = allDiagnosticScenarios.find(s => s.id === selectedScenarioId);

        if (charactersToRun.length === 0 || !scenario) {
            alert('Пожалуйста, выберите хотя бы одного персонажа и сценарий.');
            return;
        }

        setIsLoading(true);
        setReport(null);
        setTimeout(async () => {
            try {
                const res = await runDiagnosticScenario(scenario, charactersToRun, { seed: Date.now() });
                setReport(res);
            } catch (error) {
                console.error("Diagnostic run failed:", error);
                alert("Произошла ошибка во время симуляции. Проверьте консоль для деталей.");
            } finally {
                setIsLoading(false);
            }
        }, 50);
    }, [allCharacters, selectedAgents, selectedScenarioId]);

    const canRun = selectedAgents.size > 0 && selectedScenarioId;

    return (
        <div className="p-4 md:p-8">
            <div className="text-center mb-8">
                <h2 className="text-4xl font-bold mb-2">Диагностический Слой</h2>
                <p className="text-lg text-canon-text-light max-w-4xl mx-auto">
                    Лаборатория для запуска персонажей через стандартные тест-сценарии и сбора подробных отчетов о поведении под нагрузкой.
                </p>
            </div>
            
            <div className="grid grid-cols-12 gap-6">
                <aside className="col-span-12 lg:col-span-3 space-y-4">
                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h3 className="font-bold mb-3 text-canon-text">1. Выберите персонажей</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                           {allCharacters.map(c => <Checkbox key={c.entityId} id={c.entityId} label={c.title} checked={selectedAgents.has(c.entityId)} onChange={(id, chk) => handleSelectionChange(setSelectedAgents, id, chk)} />)}
                        </div>
                    </div>
                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h3 className="font-bold mb-3 text-canon-text">2. Выберите сценарий</h3>
                         <select 
                            value={selectedScenarioId} 
                            onChange={e => setSelectedScenarioId(e.target.value)}
                            className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1.5 mt-1 text-sm"
                        >
                            {allDiagnosticScenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                        <p className="text-xs text-canon-text-light mt-2">{allDiagnosticScenarios.find(s=>s.id === selectedScenarioId)?.description}</p>
                    </div>
                     <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h3 className="font-bold mb-3 text-canon-text">3. Запуск</h3>
                        <button onClick={handleRun} disabled={!canRun || isLoading} className="w-full bg-canon-accent text-canon-bg font-bold rounded p-2.5 hover:bg-opacity-80 transition-colors disabled:bg-canon-border disabled:cursor-wait">
                            {isLoading ? 'Выполнение...' : `Запустить диагностику`}
                        </button>
                    </div>
                </aside>
                
                <main className="col-span-12 lg:col-span-9">
                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 min-h-[80vh]">
                        {isLoading && <div className="h-full flex items-center justify-center text-canon-text-light">Генерация диагностического отчета...</div>}
                        {!isLoading && !report && <div className="h-full flex items-center justify-center text-canon-text-light">Настройте параметры и запустите диагностику.</div>}
                        {!isLoading && report && <DiagnosticReportView report={report} />}
                    </div>
                </main>
            </div>
        </div>
    );
};
