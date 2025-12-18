import React, { useState, useMemo } from 'react';
import { SimulationInspector } from "../components/sim/SimulationInspector";
import { WorldState, CharacterEntity, EntityType, EssenceEntity } from '../types';
import { getEntitiesByType } from '../data';
import { runSimulationTick } from '../lib/engine/loop';
import { allScenarioDefs } from '../data/scenarios/index';
import { FACTIONS } from '../data/factions';
import { assignRoles } from '../lib/roles/assignment';
import { mapCharacterToCapabilities } from '../lib/capabilities';
import { mapCharacterToBehaviorParams } from '../lib/core/character_mapper';
import { makeAgentRNG } from '../lib/core/noise';
import { initTomForCharacters } from '../lib/tom/init';
import { constructGil } from '../lib/gil/apply';
import { GOAL_DEFS } from '../lib/goals/space';
import { calculateAllCharacterMetrics } from '../lib/metrics';
import { flattenObject } from '../lib/param-utils';
import { Branch } from '../types';
import { computeCharacterGoalWeights } from '../lib/goals/weights';
import { useSandbox } from '../contexts/SandboxContext';
import { buildDefaultMassNetwork } from '../lib/mass/build';
import { defaultBody } from '../lib/character-snippet';

// Sidebar Component for Agent Selection
const AgentSelector: React.FC<{ 
    allCharacters: CharacterEntity[], 
    selectedIds: Set<string>, 
    onToggle: (id: string) => void,
    onSelectAll: () => void,
    onDeselectAll: () => void
}> = ({ allCharacters, selectedIds, onToggle, onSelectAll, onDeselectAll }) => {
    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold text-canon-text-light uppercase tracking-wider">Participants</h3>
                <div className="flex gap-2 text-[10px]">
                    <button onClick={onSelectAll} className="text-canon-accent hover:underline">All</button>
                    <button onClick={onDeselectAll} className="text-canon-text-light hover:underline">None</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-canon-bg border border-canon-border/30 rounded p-2 space-y-1">
                {allCharacters.map(char => (
                    <label key={char.entityId} className="flex items-center gap-2 cursor-pointer hover:bg-canon-bg-light/50 p-1 rounded transition-colors">
                        <input 
                            type="checkbox" 
                            checked={selectedIds.has(char.entityId)}
                            onChange={() => onToggle(char.entityId)}
                            className="w-3.5 h-3.5 rounded border-canon-border bg-canon-bg text-canon-accent focus:ring-0 focus:ring-offset-0"
                        />
                        <span className={`text-xs truncate ${selectedIds.has(char.entityId) ? 'text-canon-text font-medium' : 'text-canon-text-light'}`}>
                            {char.title}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
};

export const SimulationInspectorPage: React.FC = () => {
    const { characters: sandboxCharacters } = useSandbox();
    const [history, setHistory] = useState<WorldState[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    
    // Default selection
    const allCharacters = useMemo(() => {
        const baseChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
        const charMap = new Map<string, CharacterEntity>();
        [...baseChars, ...sandboxCharacters].forEach(c => charMap.set(c.entityId, c));
        return Array.from(charMap.values());
    }, [sandboxCharacters]);

    const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set(['character-krystar-mann', 'character-tegan-nots', 'master-gideon']));

    const handleToggleAgent = (id: string) => {
        setSelectedAgentIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleRun = async () => {
        if (selectedAgentIds.size === 0) {
            alert("Please select at least one agent.");
            return;
        }

        setIsLoading(true);
        setProgress(0);
        setHistory([]);

        const selectedAgents = allCharacters.filter(c => selectedAgentIds.has(c.entityId));

        // Init logic moved inside handleRun to be async
        const scenarioDef = allScenarioDefs['cave_rescue'];
        const scenarioState = {
            scenarioDef,
            metrics: { tick: 0, ...Object.fromEntries(Object.entries(scenarioDef.metrics).map(([k, v]) => [k, (v as any).initial])) } as any,
            currentPhaseId: scenarioDef.phases?.[0].id,
            tick: 0 // Added tick explicitly
        };

        const agents = selectedAgents.map(c => {
            // 1. Calculate full metrics including Psych, Latents, etc.
            const fullMetrics = calculateAllCharacterMetrics(c, Branch.Current, []);
            const { latents, quickStates, psych, tomMetrics, v42metrics, tomV2Metrics } = fullMetrics;
            
            const bp = mapCharacterToBehaviorParams(c);
            const goalWeights = computeCharacterGoalWeights(c);

            // 2. Initialize Archetype Runtime State
            const archetypeState = {
                 mixture: {},
                 actualId: c.identity.arch_true_dominant_id || 'H-1-SR',
                 actualFit: 0,
                 shadowId: null,
                 shadowFit: 0,
                 shadowActivation: 0,
                 self: {
                     selfMixture: {},
                     selfId: c.identity.arch_self_dominant_id || 'H-1-SR',
                     selfConfidence: 1,
                     perceivedAxes: {},
                     selfShadowId: null,
                     selfShadowWeight: 0
                 },
                 currentMode: 'default',
                 phase: 'normal',
                 history: {},
                 viability: 1
            };

            return {
                ...JSON.parse(JSON.stringify(c)),
                hp: c.body?.acute?.hp ?? 100,
                S: 50,
                temperature: bp.T0,
                gumbelScale: bp.gumbel_beta,
                processNoiseSigma: bp.sigma0,
                baseTemperature: bp.T0,
                kappa_T: bp.kappa_T_sensitivity,
                baseSigmaProc: bp.sigma0,
                rngChannels: { decide: makeAgentRNG(c.entityId, 1), physio: makeAgentRNG(c.entityId, 2), perceive: makeAgentRNG(c.entityId, 3) },
                behavioralParams: bp,
                capabilities: mapCharacterToCapabilities(c),
                w_eff: [], relationships: {}, perceivedStates: new Map(),
                goalWeights, 
                goalIds: Object.keys(GOAL_DEFS),
                wSelfBase: Object.keys(GOAL_DEFS).map(id => goalWeights[id as keyof typeof GOAL_DEFS] || 0),
                actionHistory: [],
                body: { ...defaultBody, ...(c.body || {}) },
                state: c.state || { dark_exposure: 0 },
                
                // Injected Metrics
                tomMetrics: tomMetrics || { toM_Quality: 0.5, toM_Unc: 0.5 },
                v42metrics,
                tomV2Metrics,
                prMonstro: quickStates.prMonstro || 0,
                latents,
                quickStates,
                psych,
                archetype: archetypeState,
                
                // Identity & Narrative tracking
                identityProfile: {
                    archetypeObserved: c.identity.arch_true_dominant_id,
                    archetypeSelf: c.identity.arch_self_dominant_id,
                    tensionSelfObserved: 0,
                    archetypePerceivedBy: {}
                },
                failureState: { activeModes: [], atRiskModes: [], history: [] },
                narrativeState: { episodes: [], narrative: [], maxNarrativeLength: 20 },
                
            } as any;
        });

        const tempWorld = { 
            tick: 0,
            agents,
            context: 'sim',
            threats: [],
            tom: {} as any,
            groupGoalId: 'help_wounded', 
            leadership: { currentLeaderId: null, leaderScore: 0, lastChangeTick: 0, changeCount: 0, legitimacy: 0.7, contestLevel: 0.1 },
            factions: FACTIONS,
            initialRelations: {},
            scene: scenarioState,
            scenario: scenarioDef,
            massNetwork: buildDefaultMassNetwork(Branch.Current),
            locations: [],
        };

        const roles = assignRoles(agents, scenarioDef, tempWorld as WorldState);
        agents.forEach((a: any) => a.effectiveRole = roles[a.entityId]);
        
        const tom = initTomForCharacters(agents, tempWorld as WorldState);
        const gil = constructGil(agents);

        const world: WorldState = { ...tempWorld, tom: tom as any, gilParams: gil, tick: 1 };

        const newHistory: WorldState[] = [JSON.parse(JSON.stringify(world))];
        const TOTAL_TICKS = 120;

        try {
            for(let i=0; i<TOTAL_TICKS; i++) {
                await runSimulationTick(world);
                newHistory.push(JSON.parse(JSON.stringify(world)));
                
                if (i % 5 === 0) {
                    setProgress(Math.round((i / TOTAL_TICKS) * 100));
                    await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
                }
                
                if (world.simulationEnded) break;
            }
            setHistory(newHistory);
        } catch (error) {
            console.error("Simulation failed", error);
            alert("Simulation failed. Check console.");
        } finally {
            setIsLoading(false);
            setProgress(100);
        }
    };

    return (
        <div className="h-[calc(100vh-64px)] bg-canon-bg flex overflow-hidden">
            {/* LEFT SIDEBAR: CONFIG */}
            <div className="w-72 flex-shrink-0 border-r border-canon-border bg-canon-bg-light p-4 flex flex-col gap-4">
                <div>
                     <h2 className="text-lg font-bold text-canon-text flex items-center gap-2">
                        <span className="text-canon-accent">👁</span> Inspector
                    </h2>
                    <p className="text-xs text-canon-text-light mt-1">Deep dive into social dynamics and internal states.</p>
                </div>

                {/* Agent Selector */}
                <div className="flex-1 min-h-0">
                     <AgentSelector 
                        allCharacters={allCharacters}
                        selectedIds={selectedAgentIds}
                        onToggle={handleToggleAgent}
                        onSelectAll={() => setSelectedAgentIds(new Set(allCharacters.map(c => c.entityId)))}
                        onDeselectAll={() => setSelectedAgentIds(new Set())}
                    />
                </div>

                {/* Controls */}
                <div className="space-y-3 pt-4 border-t border-canon-border/50">
                    <div>
                        <label className="text-xs font-bold text-canon-text-light uppercase">Scenario</label>
                        <select className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1 mt-1 text-sm text-canon-text">
                            <option value="cave_rescue">Cave Rescue</option>
                        </select>
                    </div>
                    
                    <button 
                        onClick={handleRun} 
                        disabled={isLoading} 
                        className={`
                            w-full h-10 font-bold text-sm text-white transition-all duration-200
                            bg-gradient-to-r from-canon-blue to-canon-accent
                            rounded shadow-lg
                            hover:shadow-cyan-500/20 hover:scale-[1.02]
                            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                        `}
                    >
                        {isLoading ? `Simulating... ${progress}%` : 'RUN SIMULATION'}
                    </button>
                    
                    {isLoading && (
                        <div className="w-full h-1.5 bg-canon-bg rounded-full overflow-hidden">
                            <div className="h-full bg-canon-accent transition-all duration-100" style={{ width: `${progress}%` }}></div>
                        </div>
                    )}
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 min-w-0 bg-black/20 relative">
                {history.length > 0 ? (
                    <div className="h-full p-4">
                        <SimulationInspector worldHistory={history} />
                    </div>
                ) : (
                     <div className="h-full flex flex-col items-center justify-center text-canon-text-light gap-4 p-8 text-center opacity-50">
                        <div className="text-6xl">⚛</div>
                        <p className="max-w-md">Select agents from the sidebar and click RUN to generate a world history timeline.</p>
                    </div>
                )}
            </div>
        </div>
    );
};