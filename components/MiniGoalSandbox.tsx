
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterEntity, EntityType } from '../types';
import { createInitialWorld } from '../lib/world/initializer';
import { buildContextSnapshot } from '../lib/context/v2/builder';
import { scoreContextualGoals } from '../lib/context/v2/scoring';
import { GOAL_DEFS } from '../lib/goals/space';

interface Props {
    character: CharacterEntity;
}

function MiniSlider({ label, value, setValue, min = 0, max = 1, step = 0.1, tooltip }: { label: string, value: number, setValue: (v: number) => void, min?: number, max?: number, step?: number, tooltip?: string }) {
  return (
    <div className="mb-2 group relative">
      <div className="flex justify-between items-baseline mb-0.5 text-[10px]">
          <div className="flex items-center gap-1 cursor-help">
              <span className="text-canon-text-light">{label}</span>
              {tooltip && <span className="text-[9px] opacity-50">(?)</span>}
          </div>
          <span className="font-mono text-canon-text">{(value ?? 0).toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? 0}
        onChange={(e) => setValue(parseFloat(e.target.value))}
        className="w-full h-1 bg-canon-border rounded-lg appearance-none cursor-pointer accent-canon-accent"
      />
      {tooltip && (
          <div className="absolute bottom-full left-0 w-48 p-2 bg-black border border-canon-border text-[10px] text-canon-text-light rounded hidden group-hover:block z-50 shadow-xl mb-1">
              {tooltip}
          </div>
      )}
    </div>
  );
}

export const MiniGoalSandbox: React.FC<Props> = ({ character }) => {
    const navigate = useNavigate();
    
    // UI State
    const [stress, setStress] = useState(0.2);
    const [threat, setThreat] = useState(0.2);
    const [leaderPresent, setLeaderPresent] = useState(false);
    const [woundedPresent, setWoundedPresent] = useState(false);
    
    // Derived State (V2 Pipeline)
    const { context, goals, topGoals } = useMemo(() => {
        // 1. Create lightweight world
        // We inject the character into a dummy scenario 'cave_rescue' to get basic structures
        const world = createInitialWorld(Date.now(), [character], 'cave_rescue', {}, {});
        if (!world) return { context: null, goals: [], topGoals: [] };
        
        const agent = world.agents[0];
        
        // 2. Apply UI Overrides to Agent & World
        if (agent.body?.acute) {
            agent.body.acute.stress = stress * 100;
        }
        
        // Apply Manual Atoms to simulate context directly
        const manualAtoms = [];
        
        if (threat > 0.1) {
            manualAtoms.push({
                id: 'man_threat', kind: 'physical_risk', source: 'manual', 
                magnitude: threat, label: 'Manual Threat'
            } as const);
        }
        
        if (leaderPresent) {
             manualAtoms.push({
                id: 'man_leader', kind: 'authority_presence', source: 'manual', 
                magnitude: 1.0, label: 'Leader Present'
            } as const);
            // Also inject into world context
            world.leadership.currentLeaderId = 'mock_leader';
        }
        
        if (woundedPresent) {
             manualAtoms.push({
                id: 'man_wounded', kind: 'care_need', source: 'manual', 
                magnitude: 0.8, label: 'Wounded Present'
            } as any); // kind cast to any to allow flex
        }
        
        // 3. Build Context
        const ctx = buildContextSnapshot(world, agent, { manualAtoms });
        
        // 4. Score
        const scores = scoreContextualGoals(agent, world, ctx);
        const top = scores.filter(s => s.probability > 0.05).slice(0, 5);
        
        return { context: ctx, goals: scores, topGoals: top };
    }, [character, stress, threat, leaderPresent, woundedPresent]);

    const handleOpenInLab = () => {
        // Serialize state to URL params
        const params = new URLSearchParams();
        params.set('agentId', character.entityId);
        params.set('stress', stress.toString());
        params.set('threat', threat.toString());
        if (leaderPresent) params.set('leader', 'true');
        if (woundedPresent) params.set('wounded', 'true');
        
        navigate(`/goal-lab?${params.toString()}`);
    };

    return (
        <div className="bg-canon-bg border border-canon-border rounded-lg p-3 mt-4">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-canon-border/30">
                <div className="flex flex-col">
                    <h4 className="text-xs font-bold text-canon-accent uppercase">Goal Sim (Quick)</h4>
                    <div className="flex gap-1 mt-0.5">
                        {threat > 0.5 && <span className="text-[9px] px-1 bg-red-900/30 text-red-300 rounded border border-red-500/30">HIGH THREAT</span>}
                        {stress > 0.6 && <span className="text-[9px] px-1 bg-orange-900/30 text-orange-300 rounded border border-orange-500/30">STRESS</span>}
                        {leaderPresent && <span className="text-[9px] px-1 bg-purple-900/30 text-purple-300 rounded border border-purple-500/30">AUTH</span>}
                    </div>
                </div>
                <button 
                    onClick={handleOpenInLab}
                    className="text-[10px] bg-canon-bg-light border border-canon-border px-2 py-1 rounded hover:bg-canon-accent hover:text-black transition-colors"
                >
                    Open in Lab ↗
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <MiniSlider 
                        label="Stress" value={stress} setValue={setStress} 
                        tooltip="Усиливает краткосрочные цели (выживание), подавляет сложные планы." 
                    />
                    <MiniSlider 
                        label="Threat" value={threat} setValue={setThreat} 
                        tooltip="Повышает приоритет физической безопасности и агрессии."
                    />
                </div>
                <div className="flex flex-col gap-1 text-[10px] pt-1">
                    <label className="flex items-center gap-2 cursor-pointer hover:text-canon-text transition-colors">
                        <input type="checkbox" checked={leaderPresent} onChange={e => setLeaderPresent(e.target.checked)} className="accent-canon-accent"/>
                        Leader Present
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-canon-text transition-colors">
                        <input type="checkbox" checked={woundedPresent} onChange={e => setWoundedPresent(e.target.checked)} className="accent-canon-accent"/>
                        Wounded Ally
                    </label>
                </div>
            </div>
            
            <div className="space-y-2">
                {topGoals.map(g => {
                    const goalDef = GOAL_DEFS[g.goalId];
                    const label = goalDef?.label_ru || g.goalId;
                    
                    // Find largest contributor for explanation
                    const topContrib = g.contributions.reduce((prev, curr) => Math.abs(curr.value) > Math.abs(prev.value) ? curr : prev, g.contributions[0]);
                    
                    return (
                        <div key={g.goalId} className="flex flex-col gap-0.5 group">
                            <div className="flex justify-between items-end text-xs">
                                <span className="font-bold text-canon-text truncate pr-2">{label}</span>
                                <span className="font-mono text-canon-accent">{(g.probability * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-canon-bg-light rounded-full overflow-hidden">
                                <div className="h-full bg-canon-blue" style={{ width: `${g.probability * 100}%` }}></div>
                            </div>
                            <div className="text-[9px] text-canon-text-light opacity-50 flex justify-between">
                                <span>{g.goalId}</span>
                                <span>{topContrib.source}: {topContrib.value > 0 ? '+' : ''}{topContrib.value.toFixed(1)}</span>
                            </div>
                        </div>
                    )
                })}
                {topGoals.length === 0 && <div className="text-[10px] italic text-canon-text-light text-center">No active goals</div>}
            </div>
        </div>
    );
}