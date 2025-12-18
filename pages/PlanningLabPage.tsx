

import React, { useState, useCallback } from 'react';
import { computePlan } from '../lib/planning/planner-v4';
import { createInitialWorld } from '../lib/world/initializer';
import { useSandbox } from '../contexts/SandboxContext';
import { getEntitiesByType } from '../data';
import { EntityType, CharacterEntity } from '../types';

export const PlanningLabPage: React.FC = () => {
    const { characters } = useSandbox();
    const [selectedAgentId, setSelectedAgentId] = useState<string>('');
    const [targetGoal, setTargetGoal] = useState<string>('maintain_legitimacy');
    const [sys1Level, setSys1Level] = useState(1.0);
    const [sys2Level, setSys2Level] = useState(0.5);
    const [planResult, setPlanResult] = useState<any>(null);

    const handlePlan = useCallback(() => {
        // Mock world setup
        const allChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(characters);
        const agentChar = allChars.find(c => c.entityId === selectedAgentId);
        if (!agentChar) return;

        // Create mock world with some context
        const world = createInitialWorld(Date.now(), [agentChar], 'council_simple', {}, {});
        if (!world) return;
        
        // Inject some metrics to make it interesting
        if (world.scene) {
            world.scene.metrics.legitimacy = 40; // Low legitimacy to drive goal
            world.scene.metrics.threat = 20;
        }
        
        const agent = world.agents[0];
        
        const result = computePlan(agent, world, {
            id: 'manual_plan_task',
            label: 'Manual Plan',
            description: 'Manual planning request',
            actorId: agent.entityId,
            targetGoalId: targetGoal,
            intentDescription: 'Generated via Lab',
            situationId: 'manual',
            horizon: 3,
            mode: 'tactics'
        }, { sys1Level, sys2Level, tomMode: 'full' });
        
        setPlanResult(result);

    }, [selectedAgentId, targetGoal, sys1Level, sys2Level, characters]);

    return (
        <div className="p-8 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="bg-canon-bg-light border border-canon-border rounded-lg p-5 space-y-4">
                <h2 className="text-xl font-bold text-canon-text">Planning Lab</h2>
                <input 
                    className="w-full bg-canon-bg border border-canon-border rounded p-2 text-sm" 
                    placeholder="Agent ID" 
                    value={selectedAgentId} 
                    onChange={e => setSelectedAgentId(e.target.value)}
                />
                <input 
                    className="w-full bg-canon-bg border border-canon-border rounded p-2 text-sm" 
                    placeholder="Target Goal ID" 
                    value={targetGoal} 
                    onChange={e => setTargetGoal(e.target.value)}
                />
                <div>
                    <label className="text-xs text-canon-text-light">System 1 (Intuition) - {sys1Level}</label>
                    <input type="range" min="0" max="1" step="0.1" value={sys1Level} onChange={e => setSys1Level(parseFloat(e.target.value))} className="w-full"/>
                </div>
                <div>
                    <label className="text-xs text-canon-text-light">System 2 (Reasoning) - {sys2Level}</label>
                    <input type="range" min="0" max="1" step="0.1" value={sys2Level} onChange={e => setSys2Level(parseFloat(e.target.value))} className="w-full"/>
                </div>
                <button onClick={handlePlan} className="w-full bg-canon-accent text-canon-bg font-bold rounded p-2">Generate Plan</button>
             </div>

             <div className="lg:col-span-2 bg-canon-bg-light border border-canon-border rounded-lg p-5">
                 <h3 className="font-bold mb-4">Results</h3>
                 {planResult ? (
                     <div className="space-y-4">
                         <div className="p-3 bg-canon-bg border border-canon-accent rounded">
                             <h4 className="font-bold text-canon-accent">Chosen Action: {planResult.chosen.label}</h4>
                             <div className="text-xs font-mono mt-1">Q_Total: {planResult.chosen.qTotal.toFixed(2)} (S1: {planResult.chosen.qSys1.toFixed(2)}, S2: {planResult.chosen.qSys2.toFixed(2)})</div>
                         </div>
                         
                         {planResult.bestPlan && (
                             <div>
                                 <h4 className="font-bold text-sm text-canon-text-light mb-2">Sys2 Plan Trace (Horizon: 3)</h4>
                                 <div className="space-y-2">
                                     {planResult.bestPlan.steps.map((s: any, i: number) => (
                                         <div key={i} className="flex gap-4 text-sm border-l-2 border-canon-border pl-2">
                                             <span className="font-mono text-canon-text-light">T+{s.tickOffset}</span>
                                             <span className="font-bold text-canon-text">{s.actionId}</span>
                                             <span className="text-canon-text-light italic">{s.description}</span>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         )}
                         
                         <div>
                             <h4 className="font-bold text-sm text-canon-text-light mb-2">Alternatives</h4>
                             {planResult.alternatives.map((a: any) => (
                                 <div key={a.actionId} className="text-xs flex justify-between border-b border-canon-border/30 py-1">
                                     <span>{a.label}</span>
                                     <span className="font-mono">{a.qTotal.toFixed(2)}</span>
                                 </div>
                             ))}
                         </div>
                     </div>
                 ) : <div className="text-canon-text-light italic">No plan generated yet.</div>}
             </div>
        </div>
    );
};