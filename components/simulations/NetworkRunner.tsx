
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SimulationMeta, CharacterState, EntityType, CharacterEntity, Branch, EssenceEntity, SimulationPoint } from '../../types';
import { socialGraphData } from '../../data/social-graph';
import { getEntitiesByType, getEntityById } from '../../data';
import { stepNetwork, EdgeState } from '../../lib/network/update';
import { calculateLatentsAndQuickStates } from '../../lib/metrics';
import { simulateCharacter } from '../../lib/simulate'; // Import the full simulator
import seedrandom from 'seedrandom';
import { flattenObject } from '../../lib/param-utils';
import { useSandbox } from '../../contexts/SandboxContext';

// --- TYPE DEFINITIONS for UI state ---
interface UINode {
    id: string;
    x: number; y: number;
    entity: CharacterEntity | EssenceEntity;
}
interface UIEdge {
    source: UINode;
    target: UINode;
    w: number;
    relation: 'ally' | 'rival' | 'neutral';
    severed: boolean;
}

// --- HELPER FUNCTIONS ---
const getStressColor = (stress: number): string => {
    const hue = 120 - stress * 1.2; // 120 (green) -> 0 (red)
    return `hsl(${hue}, 80%, 50%)`;
};

export const NetworkRunner: React.FC<{ sim: SimulationMeta }> = ({ sim }) => {
    const { days, dt, vsigmaThreshold, alpha } = sim.payload;
    const { characters: sandboxCharacters } = useSandbox();

    // --- REACT STATE for rendering ---
    const [day, setDay] = useState(0);
    const [uiNodes, setUiNodes] = useState<UINode[]>([]);
    const [uiEdges, setUiEdges] = useState<UIEdge[]>([]);
    const [history, setHistory] = useState<{day: number, avgStress: number, avgStability: number}[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // --- REFS for simulation state ---
    const characterStatesRef = useRef<Map<string, CharacterState>>(new Map());
    
    const [searchParams] = useSearchParams();
    const highlightedCharacterId = searchParams.get('characterId');

    // --- INITIALIZATION ---
    const initializeSimulation = useCallback(() => {
        setIsLoading(false);
        const baseChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
        const allCharacters = [...baseChars, ...sandboxCharacters];
        
        const initialStates = new Map<string, CharacterState>();
        const width = 800, height = 600;

        const nodes: UINode[] = socialGraphData.nodes.map((n, i) => {
            // Prioritize sandbox characters if ID matches to allow overrides, or find by ID in combined list
            const entity = allCharacters.find(c => c.entityId === n.id);
            if (!entity) return null;
            
            const simResult = simulateCharacter(entity, flattenObject(entity), { horizonDays: 1, dt: 1, ensemble: 1, rngSeed: 12345, blackSwans: [] }, 1.0);
            initialStates.set(n.id, simResult.initialState);
            
            const angle = (i / socialGraphData.nodes.length) * 2 * Math.PI;
            const radius = Math.min(width, height) / 2 - 80;

            return { 
                id: n.id, 
                entity,
                x: width / 2 + radius * Math.cos(angle), 
                y: height / 2 + radius * Math.sin(angle),
            };
        }).filter((n): n is UINode => n !== null);
        
        const edges: UIEdge[] = socialGraphData.edges.map(e => {
            const source = nodes.find(n => n.id === e.source);
            const target = nodes.find(n => n.id === e.target);
            if (!source || !target) return null;
            return { ...e, source, target, relation: e.relation as 'ally' | 'rival' | 'neutral', severed: false };
        }).filter((e): e is UIEdge => e !== null);

        characterStatesRef.current = initialStates;
        
        setUiNodes(nodes);
        setUiEdges(edges);
        setHistory([]);
        setDay(0);
    }, [setUiNodes, setUiEdges, setHistory, setDay, dt, sandboxCharacters]);

    useEffect(() => {
        initializeSimulation();
    }, [initializeSimulation]);
    
    const handleRunSimulation = useCallback(() => {
        setIsLoading(true);

        // Run simulation in a timeout to allow UI to update to 'isLoading' state
        setTimeout(() => {
            let currentStates: Map<string, CharacterState> = new Map(characterStatesRef.current);
            let logicalEdges: EdgeState[] = socialGraphData.edges.map(e => ({ ...e, relation: e.relation as 'ally' | 'rival' | 'neutral', severed: false }));
            
            const newHistory: {day: number, avgStress: number, avgStability: number}[] = [];

            for (let d = 1; d <= days; d++) {
                // Simulate each character individually for one day
                const nextDayStates = new Map<string, CharacterState>();
                currentStates.forEach((state, id) => {
                    const node = uiNodes.find(n => n.id === id);
                    if (!node) return;

                    const simResult = simulateCharacter(node.entity, flattenObject(node.entity), { horizonDays: 1, dt: 1, ensemble: 1, rngSeed: 12345 + d, blackSwans: [] }, 1.0, state);
                    nextDayStates.set(id, simResult.finalStates![0]);
                });

                // Apply network diffusion/interaction
                const { nextStates: diffusedStates, updatedEdges } = stepNetwork(socialGraphData, nextDayStates, logicalEdges, alpha, vsigmaThreshold);
                currentStates = diffusedStates;
                logicalEdges = updatedEdges;

                // Record history for the chart
                const stressVals = Array.from(currentStates.values()).map(s => s.stress);
                const stabilityVals = Array.from(currentStates.values()).map(s => s.S);
                newHistory.push({
                    day: d,
                    avgStress: stressVals.reduce((a, b) => a + b, 0) / stressVals.length,
                    avgStability: stabilityVals.reduce((a, b) => a + b, 0) / stabilityVals.length,
                });
            }

            // After the loop, update the UI
            setDay(days);
            setHistory(newHistory);
            characterStatesRef.current = currentStates; // Save final state

            setUiEdges(prevEdges => prevEdges.map(uiEdge => {
                const logical = logicalEdges.find(le => le.source === uiEdge.source.id && le.target === uiEdge.target.id);
                return { ...uiEdge, severed: logical ? logical.severed : false };
            }));
            // Force re-render of nodes to update colors based on final state
            setUiNodes(prevNodes => [...prevNodes]); 
            setIsLoading(false);
        }, 50); // Small timeout
    }, [days, dt, alpha, vsigmaThreshold, uiNodes]);
    
    // --- RENDER ---
    return (
        <div className="flex flex-col xl:flex-row gap-6">
            <div className="flex-grow bg-canon-bg border border-canon-border rounded-lg" style={{ aspectRatio: '4 / 3' }}>
                <svg viewBox="0 0 800 600" className="w-full h-full">
                    {uiEdges.map((edge, i) => (
                        <line 
                            key={`${edge.source.id}-${edge.target.id}`}
                            x1={edge.source.x} y1={edge.source.y}
                            x2={edge.target.x} y2={edge.target.y}
                            stroke={edge.relation === 'rival' ? '#ff4444' : '#3a3a3a'}
                            strokeWidth={edge.w * 3}
                            opacity={edge.severed ? 0.1 : 0.6}
                            style={{ transition: 'opacity 0.5s' }}
                        />
                    ))}
                    {uiNodes.map(node => {
                        const isHighlighted = node.id === highlightedCharacterId;
                        const state = characterStatesRef.current.get(node.id);
                        const stress = state?.stress || 0;
                        return (
                            <g key={node.id} transform={`translate(${node.x},${node.y})`} className="group">
                                {isHighlighted && (
                                    <circle r={20} fill={getStressColor(stress)} fillOpacity={0.3}>
                                        <animate attributeName="r" from="15" to="25" dur="1.5s" repeatCount="indefinite" />
                                        <animate attributeName="fill-opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                                    </circle>
                                )}
                                <Link to={`/character/${node.id}`}>
                                    <circle r={12} fill={getStressColor(stress)} stroke={isHighlighted ? '#00aaff' : '#d1d1d1'} strokeWidth={isHighlighted ? 3 : 2} style={{ transition: 'fill 0.3s' }} className="cursor-pointer hover:stroke-white" />
                                </Link>
                                <Link to={`/character/${node.id}`}>
                                    <text y={-18} textAnchor="middle" fill="#d1d1d1" fontSize="12" className="font-sans font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:fill-white hover:underline">
                                        {node.entity.title}
                                    </text>
                                </Link>
                            </g>
                        )
                    })}
                </svg>
            </div>
            <div className="w-full xl:w-80 flex-shrink-0 space-y-4">
                 <div className="text-center font-mono p-4 bg-canon-bg rounded-lg border border-canon-border">
                    <div className="text-canon-text-light text-sm">ДЕНЬ</div>
                    <div className="text-5xl font-bold">{day} / {days}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleRunSimulation} disabled={isLoading} className="col-span-2 bg-canon-accent text-canon-bg font-bold rounded px-4 py-2 hover:bg-opacity-80 transition-colors disabled:bg-canon-border disabled:cursor-wait">
                        {isLoading ? 'Расчёт...' : 'Запустить симуляцию'}
                    </button>
                    <button onClick={initializeSimulation} className="col-span-2 bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-red hover:text-white transition-colors">Сброс</button>
                </div>
                <div className="h-64 bg-canon-bg border border-canon-border rounded-lg p-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history} margin={{top:5, right:20, left:-10, bottom:5}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                            <XAxis dataKey="day" type="number" domain={[0, days]} tick={{fill: '#888888', fontSize:12}} stroke="#444444" />
                            <YAxis yAxisId="left" domain={[0, 100]} tick={{fill: getStressColor(50), fontSize:12}} stroke="#444444" />
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{fill: '#00aaff', fontSize:12}} stroke="#444444" />
                            <Tooltip contentStyle={{backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a'}} />
                            <Legend wrapperStyle={{fontSize: "12px"}}/>
                            <Line yAxisId="left" type="monotone" dataKey="avgStress" name="Ср. Стресс" stroke={getStressColor(50)} dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="avgStability" name="Ср. Стабильность" stroke="#00aaff" dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
