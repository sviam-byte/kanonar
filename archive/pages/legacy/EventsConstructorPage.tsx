
import React, { useState, useMemo, useCallback } from 'react';
import { WorldState, CharacterEntity, EntityType, ScenarioId, ScenarioDef, AgentState, NarrativeLogLine, DevLogLine } from '../types';
import { getEntitiesByType, getEntityById } from '../data';
import { runSimulationTick } from '../lib/engine/loop';
import { buildLogs } from '../lib/narrative/log_builder';
import { allScenarioDefs } from '../data/scenarios/index';
import { createInitialWorld } from '../lib/world/initializer';
import { EventsPanel } from '../components/events/EventsPanel';
import { DevLogView } from '../components/DevLogView';
import { ScenarioMetricsDisplay } from '../components/ScenarioMetricsDisplay';
import { ArchetypeBuilder } from '../components/ArchetypeBuilder';
import { Tabs } from '../components/Tabs';
import { ScenarioSimulatorPanel } from '../components/social/ScenarioSimulatorPanel';
import { mapSimulationEventsToUnified } from '../lib/events/simulation-bridge';
import { AgentStateView } from '../components/AgentStateView';
import { AgentNarrativeView } from '../components/AgentNarrativeView';
import { AgentGoalView } from '../components/AgentGoalView';
import { ToMDisplay } from '../components/ToMDisplay';
// import { generateToMReport } from '../lib/tom/report'; // Removed legacy
import { ToMReportModal } from '../components/ToMReportModal';
import { SocialEventImpactModal } from '../components/SocialEventImpactModal';
import { PlannerDisplay } from '../components/PlannerDisplay';
import { useNavigate } from 'react-router-dom';
import { useSandbox } from '../contexts/SandboxContext';
import { TEST_SCENES, ScenePreset } from '../data/presets/scenes';

export const EventsConstructorPage: React.FC = () => {
    const { addCharacter, characters: sandboxCharacters, setDyadConfigFor, reset } = useSandbox();
    const navigate = useNavigate();

    const [world, setWorld] = useState<WorldState | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [scenarioId, setScenarioId] = useState<string>('cave_rescue');
    const [simulationSpeed, setSimulationSpeed] = useState(500);
    const [viewMode, setViewMode] = useState<'single_run' | 'ensemble'>('single_run');

    const [narrativeLog, setNarrativeLog] = useState<NarrativeLogLine[]>([]);
    const [devLog, setDevLog] = useState<DevLogLine[]>([]);

    const allCharacters = useMemo(() => {
        const baseChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
        return [...baseChars, ...sandboxCharacters];
    }, [sandboxCharacters]);
    
    const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set(['character-krystar-mann', 'character-tegan-nots', 'master-gideon']));
    
    // Inspector Selection
    const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
    const activeAgent = world?.agents.find(a => a.entityId === activeAgentId);

    // ToM Report Modal State
    const [tomReport, setTomReport] = useState<any | null>(null);

    const handleInitialize = useCallback(() => {
        const selectedAgents = allCharacters.filter(c => selectedAgentIds.has(c.entityId));
        if (selectedAgents.length === 0) {
            alert("Выберите хотя бы одного агента.");
            return;
        }

        const newWorld = createInitialWorld(
            Date.now(), 
            selectedAgents, 
            scenarioId as ScenarioId,
            {},
            {}
        );
        
        if (newWorld) {
            setWorld(newWorld);
            setNarrativeLog([]);
            setDevLog([]);
            if (!activeAgentId) {
                setActiveAgentId(selectedAgents[0].entityId);
            }
        }
    }, [allCharacters, selectedAgentIds, scenarioId, activeAgentId]);

    const handleLoadScene = useCallback((scene: ScenePreset) => {
        if (confirm(`Загрузить сцену "${scene.title}"? Текущая сессия будет сброшена.`)) {
            reset(); // Clear existing session
            
            // 1. Add Characters to Session
            const newSelectedIds = new Set<string>();
            
            scene.characters.forEach(id => {
                const char = getEntityById(id);
                if (char && (char.type === EntityType.Character || char.type === EntityType.Essence)) {
                    addCharacter(char as CharacterEntity);
                    newSelectedIds.add(id);
                }
            });

            // 2. Apply Configs
            Object.entries(scene.configs).forEach(([id, cfg]) => {
                setDyadConfigFor(id, cfg);
            });
            
            // 3. Update UI State
            setSelectedAgentIds(newSelectedIds);
            setScenarioId(scene.suggestedScenarioId);
            
            // 4. Reset World (Wait for user to init, or auto-init?)
            // Let's just reset world so user presses Init with new settings
            setWorld(null);
            
            // Optional: Auto-select first agent
            if (scene.characters.length > 0) {
                setActiveAgentId(scene.characters[0]);
            }
        }
    }, [reset, addCharacter, setDyadConfigFor]);

    const handleStep = useCallback(async () => {
        if (!world) return;
        
        // Run tick
        const events = await runSimulationTick(world);
        const { narrative, dev } = buildLogs(events);
        
        setNarrativeLog(prev => [...prev, ...narrative]);
        setDevLog(prev => [...prev, ...dev]);
        
        // Force update world state reference to trigger re-renders
        setWorld({ ...world });
    }, [world]);

    // Loop
    React.useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isRunning && world) {
            interval = setInterval(() => {
                if (world.simulationEnded) {
                    setIsRunning(false);
                    return;
                }
                handleStep();
            }, simulationSpeed);
        }
        return () => clearInterval(interval);
    }, [isRunning, world, simulationSpeed, handleStep]);

    const handleToggleAgent = (id: string) => {
        setSelectedAgentIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    
    const handleAddArchetype = (char: CharacterEntity) => {
        addCharacter(char);
        setSelectedAgentIds(prev => new Set(prev).add(char.entityId));
    };

    const unifiedEvents = useMemo(() => {
        if (!world) return [];
        return []; 
    }, [world]);

    const handleGenerateToMReport = useCallback((targetId: string) => {
        alert("Отчет ToM временно недоступен в связи с обновлением ядра (Legacy ToM удален). Используйте Инспектор ToM (Dyad) в Лаборатории.");
    }, [world, activeAgent]);

    const agentInspectorTabs = useMemo(() => {
        if (!activeAgent || !world) return [];
        return [
            { label: 'State', content: <AgentStateView agent={activeAgent} world={world} /> },
            { label: 'Narrative', content: <AgentNarrativeView agent={activeAgent} /> },
            { label: 'Goals', content: <AgentGoalView agent={activeAgent} /> },
            { label: 'Social / ToM', content: (
                <ToMDisplay 
                    observer={activeAgent} 
                    allCharacters={world.agents} 
                    onAddSocialEvent={() => {}} // Placeholder, real sim handles events internally via loop
                    onGenerateToMReport={handleGenerateToMReport}
                /> 
            )},
            { label: 'Planner', content: <PlannerDisplay character={activeAgent} /> }
        ];
    }, [activeAgent, world, handleGenerateToMReport]);

    const mainTabs = useMemo(() => {
         return [
             { 
                 label: 'События (Unified)', 
                 content: (
                    <div className="h-[80vh]">
                         <EventsPanel events={unifiedEvents} />
                    </div>
                 )
             },
             { 
                 label: `Логи (Тик: ${world?.tick ?? 0})`, 
                 content: <DevLogView narrativeLog={narrativeLog} devLog={devLog} /> 
             },
             {
                 label: 'Scenario Engine',
                 content: <ScenarioSimulatorPanel defaultScenarioId="cave_rescue" />
             }
         ];
    }, [unifiedEvents, narrativeLog, devLog, world]);

    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto grid grid-cols-12 gap-6">
            {tomReport && <ToMReportModal report={tomReport} onClose={() => setTomReport(null)} />}

            <div className="col-span-12 lg:col-span-3 space-y-4">
               {/* Sidebar content */}
                
                {/* 1. Quick Scenes Loader (NEW) */}
                {TEST_SCENES.length > 0 && (
                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h3 className="font-bold mb-3 text-canon-accent text-sm uppercase tracking-wider">Готовые Сцены</h3>
                        <div className="space-y-2">
                            {TEST_SCENES.map(scene => (
                                <button
                                    key={scene.id}
                                    onClick={() => handleLoadScene(scene)}
                                    className="w-full text-left bg-canon-bg border border-canon-border/50 rounded p-2 hover:border-canon-accent hover:bg-canon-bg/80 transition-all group"
                                >
                                    <div className="text-xs font-bold text-canon-text group-hover:text-white">{scene.title}</div>
                                    <div className="text-[10px] text-canon-text-light mt-0.5 truncate">{scene.characters.length} chars • {scene.locationId}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                    <h2 className="text-xl font-bold mb-3 text-canon-text">Социальный симулятор</h2>
                    <div className="mb-4">
                        <label className="text-xs text-canon-text-light">Сценарий</label>
                        <select value={scenarioId} onChange={e => setScenarioId(e.target.value)} className="w-full bg-canon-bg border border-canon-border rounded p-1.5 mt-1 text-sm">
                            {Object.values(allScenarioDefs).map((s: ScenarioDef) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select>
                    </div>
                     <div className="grid grid-cols-2 gap-2">
                         <button onClick={() => setIsRunning(!isRunning)} disabled={!world} className="bg-canon-accent text-canon-bg font-bold rounded p-2 hover:bg-opacity-80 transition-colors disabled:bg-canon-border disabled:cursor-not-allowed">{isRunning ? 'Пауза' : 'Старт'}</button>
                         <button onClick={handleStep} disabled={!world || isRunning} className="bg-canon-bg border border-canon-border rounded p-2 hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:opacity-50">Шаг</button>
                         <button onClick={handleInitialize} className="col-span-2 bg-canon-bg border border-canon-border rounded p-2 hover:bg-canon-blue hover:text-canon-bg transition-colors">{world ? 'Перезапустить' : 'Инициализировать'}</button>
                     </div>
                     <div className="mt-4">
                        <label className="text-xs text-canon-text-light">Скорость (мс/тик): {simulationSpeed}</label>
                        <input type="range" min="100" max="2000" step="100" value={simulationSpeed} onChange={e => setSimulationSpeed(Number(e.target.value))} className="w-full h-2 bg-canon-border rounded-lg appearance-none cursor-pointer" />
                     </div>
                </div>
                {world?.scene && viewMode === 'single_run' && <ScenarioMetricsDisplay scene={world.scene} />}
                 <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                     <h3 className="font-bold mb-3 text-canon-text">Участники и Цели</h3>
                     <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                        {allCharacters.map(char => (
                             <div key={char.entityId} className="flex items-start">
                                <input type="checkbox" id={char.entityId} checked={selectedAgentIds.has(char.entityId)} onChange={() => handleToggleAgent(char.entityId)} className="w-4 h-4 text-canon-accent bg-canon-bg border-canon-border rounded focus:ring-canon-accent mt-1" />
                                <label htmlFor={char.entityId} className="ml-2 text-sm text-canon-text font-bold">{char.title}</label>
                            </div>
                        ))}
                     </div>
                      <div className="mt-4 pt-4 border-t border-canon-border space-y-2">
                        <button 
                            onClick={() => navigate('/builder')}
                            className="w-full bg-canon-bg border border-canon-border rounded p-2 text-sm font-bold text-canon-text hover:bg-canon-accent hover:text-canon-bg transition-colors"
                        >
                            + Создать нового персонажа
                        </button>
                        <h4 className="font-bold text-sm mb-2 text-canon-text-light">Добавить архетип (быстро)</h4>
                        <ArchetypeBuilder onAddArchetype={handleAddArchetype} />
                     </div>
                 </div>
            </div>
            
            <div className="col-span-12 lg:col-span-9">
                <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-12 lg:col-span-7">
                         <Tabs tabs={mainTabs} />
                    </div>
                    <div className="col-span-12 lg:col-span-5">
                        <h3 className="font-bold mb-3 text-canon-text">Инспектор Агентов</h3>
                            {world && world.agents.length > 0 ? (
                            <>
                                <select 
                                    onChange={(e) => setActiveAgentId(e.target.value)} 
                                    value={activeAgentId ?? ''}
                                    className="w-full bg-canon-bg-light border border-canon-border rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-canon-accent"
                                >
                                    {world.agents.map(agent => (
                                        <option key={agent.entityId} value={agent.entityId}>{agent.title} ({agent.effectiveRole})</option>
                                    ))}
                                </select>
                                {activeAgent && (
                                    <Tabs tabs={agentInspectorTabs} syncKey="tab" />
                                )}
                            </>
                            ) : (
                            <div className="text-center text-sm text-canon-text-light pt-10">Инициализируйте симуляцию для выбора агента.</div>
                            )}
                    </div>
                </div>
            </div>
        </div>
    );
};
