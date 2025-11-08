import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import seedrandom from 'seedrandom';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SimulationMeta, CharacterState, EntityType } from '../../types';
import { socialGraphData } from '../../data/social-graph';
import { getEntitiesByType, getEntityById } from '../../data';
import { stepCharacter } from '../../lib/sde';
// FIX: Import EdgeState to use for logical edge operations.
import { stepNetwork, EdgeState } from '../../lib/network/update';
// FIX: Import stabilityScore to calculate character stability.
import { stabilityScore } from '../../lib/simulate';
import * as formulas from '../../lib/formulas';

// --- TYPE DEFINITIONS for UI state ---
interface UINode {
    id: string;
    x: number; y: number;
    vx: number; vy: number;
}
interface UIEdge {
    source: UINode;
    target: UINode;
    w: number;
    relation: 'ally' | 'rival' | 'neutral';
    // FIX: Make 'severed' required to match its usage and fix type predicate error.
    severed: boolean;
}

// --- HELPER FUNCTIONS ---
const getStressColor = (stress: number): string => {
    const hue = 240 - stress * 2.4; // 240 (blue) -> 0 (red)
    return `hsl(${hue}, 80%, 50%)`;
};

const NetworkRunner: React.FC<{ sim: SimulationMeta }> = ({ sim }) => {
    const { days, dt, vsigmaThreshold, alpha } = sim.payload;

    // --- STATE MANAGEMENT ---
    const [day, setDay] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    
    // Simulation state
    const [characterStates, setCharacterStates] = useState<Map<string, CharacterState>>(new Map());
    const [uiNodes, setUiNodes] = useState<UINode[]>([]);
    const [uiEdges, setUiEdges] = useState<UIEdge[]>([]);

    // Analytics
    const [history, setHistory] = useState<{day: number, avgStress: number, avgStability: number}[]>([]);

    // Refs for animation and simulation logic
    const animationFrameRef = useRef<number>();
    const lastUpdateTimeRef = useRef<number>(0);
    const simulationSpeed = 150; // ms per day
    const rngs = useRef<Map<string, () => number>>(new Map());
    
    const [searchParams] = useSearchParams();
    const highlightedCharacterId = searchParams.get('characterId');

    // --- INITIALIZATION ---
    const initializeSimulation = useCallback(() => {
        const characters = getEntitiesByType(EntityType.Character);
        const initialStates = new Map<string, CharacterState>();
        const rngMap = new Map<string, () => number>();
        const width = 800, height = 600;

        const nodes = socialGraphData.nodes.map(n => {
            const entity = characters.find(c => c.entityId === n.id);
            if (!entity) return null;

            const params = Object.fromEntries(entity.parameters.map(p => [p.key, p.defaultValue]));
            // FIX: Use correct function `calculateVsigma` instead of `calculateCharacterVsigma`.
            const baseVsigma = formulas.calculateVsigma(params, { stress: 40, darkness: 10 });
            // FIX: Use correct function `calculateLambdaMon` instead of `calculateHazardLambda`.
            const baseLambdaMon = formulas.calculateLambdaMon(params, baseVsigma, 10);
            
            // FIX: Remove `drift` and add missing `E` and `Debt` to match CharacterState.
            // FIX: Use correct function `calculatePv` with trustFactor instead of `calculateCharacterPv`.
            const baseState: CharacterState = {
                stress: 40, reputation: 50, fatigue: 20, darkness: 10,
                E: 100, Debt: 0,
                vsigma: baseVsigma,
                pv: formulas.calculatePv(params, 1.0),
                influence: formulas.calculateInfluence(params),
                prMonstro: 1 - Math.exp(-baseLambdaMon),
            };
            initialStates.set(n.id, baseState);
            rngMap.set(n.id, seedrandom(n.id));

            return { id: n.id, x: width/2 + (Math.random()-0.5) * 200, y: height/2 + (Math.random()-0.5) * 200, vx: 0, vy: 0 };
        }).filter((n): n is UINode => n !== null);
        
        const edges = socialGraphData.edges.map(e => {
            const source = nodes.find(n => n.id === e.source);
            const target = nodes.find(n => n.id === e.target);
            if (!source || !target) return null;
            return { ...e, source, target, severed: false };
        }).filter((e): e is UIEdge => e !== null);

        setCharacterStates(initialStates);
        setUiNodes(nodes);
        setUiEdges(edges);
        setHistory([]);
        rngs.current = rngMap;
        setDay(0);
    }, []);

    useEffect(() => {
        initializeSimulation();
    }, [initializeSimulation]);

    // --- SIMULATION STEP LOGIC ---
    const runSimulationStep = useCallback(() => {
        // 1. Evolve each character's state individually
        const nextCharacterStates = new Map<string, CharacterState>();
        characterStates.forEach((state, id) => {
            const entity = getEntityById(id);
            if (!entity) return;
            const params = Object.fromEntries(entity.parameters.map(p => [p.key, p.defaultValue]));
            const rng = rngs.current.get(id) || Math.random;
            // FIX: Pass trustFactor as the fifth argument to stepCharacter.
            const newState = stepCharacter(params, state, dt, rng, 1.0);
            nextCharacterStates.set(id, newState);
        });

        // FIX: Convert UI edges to logical edges for the simulation step.
        const logicalEdgesForStep: EdgeState[] = uiEdges.map(ue => ({
            source: ue.source.id,
            target: ue.target.id,
            w: ue.w,
            relation: ue.relation,
            severed: ue.severed,
        }));

        // 2. Apply network effects (diffusion, link severing)
        const { nextStates: diffusedStates, updatedEdges } = stepNetwork(
            socialGraphData, 
            nextCharacterStates, 
            logicalEdgesForStep, 
            alpha, 
            vsigmaThreshold
        );
        setCharacterStates(diffusedStates);

        // 3. Update UI Edges with severing status from the logical step result.
        setUiEdges(currentEdges => currentEdges.map(uiEdge => {
            const logical = updatedEdges.find(le => le.source === uiEdge.source.id && le.target === uiEdge.target.id);
            return { ...uiEdge, severed: logical ? logical.severed : uiEdge.severed };
        }));

        // 4. Force-directed layout physics step for UI nodes
        const k_repulsion = 20000;
        const k_attraction = 0.5;
        const ideal_len = 150;
        const damping = 0.9;
        const width = 800, height = 600;

        setUiNodes(nodes => {
            // FIX: Explicitly type the Map to prevent type inference issues with 'fx' and 'fy'.
            const forces = new Map<string, { fx: number, fy: number }>(nodes.map(n => [n.id, { fx: 0, fy: 0 }]));

            // Repulsion between all nodes
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x;
                    const dy = nodes[j].y - nodes[i].y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < 1) continue;
                    const force = k_repulsion / distSq;
                    const fx = force * dx / Math.sqrt(distSq);
                    const fy = force * dy / Math.sqrt(distSq);
                    forces.get(nodes[i].id)!.fx -= fx; forces.get(nodes[i].id)!.fy -= fy;
                    forces.get(nodes[j].id)!.fx += fx; forces.get(nodes[j].id)!.fy += fy;
                }
            }

            // Attraction along edges
            uiEdges.forEach(edge => {
                if (edge.severed) return;
                const dx = edge.target.x - edge.source.x;
                const dy = edge.target.y - edge.source.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) return; // CRASH FIX: Guard against division by zero
                const force = k_attraction * (dist - ideal_len) * edge.w;
                const fx = force * dx / dist;
                const fy = force * dy / dist;
                forces.get(edge.source.id)!.fx += fx; forces.get(edge.source.id)!.fy += fy;
                forces.get(edge.target.id)!.fx -= fx; forces.get(edge.target.id)!.fy -= fy;
            });
            
            // Center gravity
            nodes.forEach(n => {
                forces.get(n.id)!.fx += (width/2 - n.x) * 0.05;
                forces.get(n.id)!.fy += (height/2 - n.y) * 0.05;
            });
            
            // Update positions
            return nodes.map(n => {
                const force = forces.get(n.id)!;
                const vx = (n.vx + force.fx) * damping;
                const vy = (n.vy + force.fy) * damping;
                return { ...n, vx, vy, x: n.x + vx, y: n.y + vy };
            });
        });

    }, [characterStates, uiEdges, alpha, vsigmaThreshold, dt]);


    // --- ANIMATION LOOP ---
    useEffect(() => {
        const animate = (timestamp: number) => {
            if (isRunning) {
                if (timestamp - lastUpdateTimeRef.current > simulationSpeed) {
                    lastUpdateTimeRef.current = timestamp;
                    setDay(d => {
                        const nextDay = d + 1;
                        if (nextDay > days) {
                            setIsRunning(false);
                            return d;
                        }
                        
                        // Run multiple simulation steps per "day"
                        for(let i=0; i < 1/dt; i++) {
                            runSimulationStep();
                        }

                        // Update analytics history once per day
                        // FIX: Explicitly type `currentStates` to resolve type inference errors.
                        setCharacterStates((currentStates: Map<string, CharacterState>) => {
                            const calculateMetricsForDay = (dayNum: number) => {
                                // FIX: Use correct map function for stability values, providing params for each character.
                                const stabilityVals = Array.from(currentStates.entries()).map(([id, state]) => {
                                    const entity = getEntityById(id);
                                    if (!entity) return 0;
                                    const params = Object.fromEntries(entity.parameters.map(p => [p.key, p.defaultValue]));
                                    return stabilityScore(state, params);
                                });
                                // FIX: No longer need type assertion for `s.stress` due to explicit typing of `currentStates`.
                                const stressVals = Array.from(currentStates.values()).map(s => s.stress);
                                setHistory(h => [...h, {
                                    day: dayNum,
                                    avgStress: stressVals.reduce((a, b) => a + b, 0) / stressVals.length,
                                    avgStability: stabilityVals.reduce((a, b) => a + b, 0) / stabilityVals.length,
                                }]);
                            };

                            if(history.length === 0) {
                                calculateMetricsForDay(0);
                            }
                            calculateMetricsForDay(nextDay);
                            
                            return currentStates;
                        });
                        return nextDay;
                    });
                }
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        if (isRunning) {
            lastUpdateTimeRef.current = performance.now();
            animationFrameRef.current = requestAnimationFrame(animate);
        }

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [isRunning, days, dt, runSimulationStep, simulationSpeed, history.length]);
    
    // --- RENDER ---
    return (
        <div className="flex flex-col xl:flex-row gap-6">
            <div className="flex-grow bg-canon-bg border border-canon-border rounded-lg" style={{ aspectRatio: '4 / 3' }}>
                <svg viewBox="0 0 800 600" className="w-full h-full">
                    {uiEdges.map((edge, i) => (
                        <line 
                            key={i}
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
                        // FIX: Type assertion is no longer needed due to proper state typing.
                        const stress = characterStates.get(node.id)?.stress || 0;
                        return (
                            <g key={node.id} transform={`translate(${node.x},${node.y})`} className="cursor-pointer group">
                                {isHighlighted && (
                                    <circle r={20} fill={getStressColor(stress)} fillOpacity={0.3}>
                                        <animate attributeName="r" from="15" to="25" dur="1.5s" repeatCount="indefinite" />
                                        <animate attributeName="fill-opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                                    </circle>
                                )}
                                <circle 
                                    r={12} 
                                    fill={getStressColor(stress)} 
                                    stroke={isHighlighted ? '#00aaff' : '#d1d1d1'}
                                    strokeWidth={isHighlighted ? 3 : 2}
                                    style={{ transition: 'fill 0.3s' }}
                                />
                                <text
                                    y={-18}
                                    textAnchor="middle"
                                    fill="#d1d1d1"
                                    fontSize="12"
                                    className="font-sans hidden group-hover:block"
                                >
                                    {getEntityById(node.id)?.title}
                                </text>
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
                    <button onClick={() => setIsRunning(!isRunning)} className="bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors">{isRunning ? 'Пауза' : 'Старт'}</button>
                    <button onClick={initializeSimulation} className="bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-red hover:text-white transition-colors">Сброс</button>
                </div>
                <div className="h-64 bg-canon-bg border border-canon-border rounded-lg p-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history} margin={{top:5, right:20, left:-10, bottom:5}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                            <XAxis dataKey="day" tick={{fill: '#888888', fontSize:12}} stroke="#444444" />
                            <YAxis yAxisId="left" domain={[0, 100]} tick={{fill: '#ff4444', fontSize:12}} stroke="#444444" />
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{fill: '#00aaff', fontSize:12}} stroke="#444444" />
                            <Tooltip contentStyle={{backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a'}} />
                            <Legend wrapperStyle={{fontSize: "12px"}}/>
                            <Line yAxisId="left" type="monotone" dataKey="avgStress" name="Ср. Стресс" stroke="#ff4444" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="avgStability" name="Ср. Стабильность" stroke="#00aaff" dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export { NetworkRunner };