
import React, { useMemo } from 'react';
import { LocationEntity, AgentState, WorldState, CharacterEntity } from '../../types';
import { hydrateLocation, calculateLocationGoalInfluence, LocationGoalImpact } from '../../lib/adapters/rich-location';
import { calculateAllCharacterMetrics } from '../../lib/metrics';
import { Branch } from '../../types';
import { GOAL_DEFS } from '../../lib/goals/space';

interface Props {
    location: LocationEntity;
    agentId?: string; // Optional: specific agent to analyze
    allAgents: CharacterEntity[];
}

const ImpactRow: React.FC<{ impact: LocationGoalImpact }> = ({ impact }) => (
    <div className="flex justify-between items-center text-xs py-1 border-b border-canon-border/20 last:border-0">
        <div className="flex flex-col">
            <span className="font-bold text-canon-text">{GOAL_DEFS[impact.goalId]?.label_ru || impact.goalId}</span>
            <div className="text-[10px] text-canon-text-light flex gap-1">
                {impact.modifiers.map((m, i) => <span key={i} className="bg-black/20 px-1 rounded">{m}</span>)}
            </div>
        </div>
        <span className={`font-mono font-bold ${impact.finalScore > 0 ? 'text-green-400' : 'text-gray-500'}`}>
            {impact.finalScore > 0 ? '+' : ''}{impact.finalScore.toFixed(2)}
        </span>
    </div>
);

export const LocationContextDebug: React.FC<Props> = ({ location, agentId, allAgents }) => {
    // 1. Hydrate to Rich Model
    const richLoc = useMemo(() => hydrateLocation(location), [location]);
    
    // 2. Resolve Agent
    const agent = useMemo(() => {
        if (!agentId && allAgents.length > 0) return allAgents[0];
        return allAgents.find(a => a.entityId === agentId);
    }, [agentId, allAgents]);

    // 3. Calculate Influence
    const influences = useMemo(() => {
        if (!agent) return [];
        // Ensure metrics are calculated for vector access
        const fullMetrics = calculateAllCharacterMetrics(agent, Branch.Current, []);
        const preparedAgent = { ...agent, ...fullMetrics.modifiableCharacter };
        
        return calculateLocationGoalInfluence(richLoc, preparedAgent as AgentState);
    }, [richLoc, agent]);

    if (!agent) return <div className="text-xs text-canon-text-light italic">Выберите агента для анализа контекста.</div>;

    return (
        <div className="space-y-4">
            <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                <h4 className="text-xs font-bold text-canon-accent uppercase mb-2">Активные Режимы (Context Modes)</h4>
                <div className="flex flex-wrap gap-2">
                    {richLoc.contextModes.length > 0 ? richLoc.contextModes.map(m => (
                        <div key={m.id} className="text-xs bg-purple-900/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded">
                            <span className="font-bold">{m.label}</span>
                            {m.tensionModifier && <span className="ml-1 opacity-70">Tension x{m.tensionModifier}</span>}
                        </div>
                    )) : <span className="text-xs text-canon-text-light italic">Нет активных режимов.</span>}
                </div>
            </div>

            <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                <h4 className="text-xs font-bold text-green-400 uppercase mb-2">Влияние на Цели ({agent.title})</h4>
                <div className="space-y-1">
                    {influences.length > 0 ? influences.map(inf => (
                        <ImpactRow key={inf.goalId} impact={inf} />
                    )) : <span className="text-xs text-canon-text-light italic">Нет явного влияния на цели.</span>}
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                    <h4 className="text-xs font-bold text-red-400 uppercase mb-2">Опасности (Hazards)</h4>
                    <ul className="text-xs text-canon-text list-disc list-inside">
                        {richLoc.hazards.length > 0 ? richLoc.hazards.map(h => (
                            <li key={h.id}>{h.type} (Int: {h.intensity})</li>
                        )) : <li className="italic text-canon-text-light">Безопасно</li>}
                    </ul>
                </div>
                <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                    <h4 className="text-xs font-bold text-blue-400 uppercase mb-2">Нормы (Norms)</h4>
                    <ul className="text-xs text-canon-text list-disc list-inside">
                        {richLoc.norms.requiredBehavior.length > 0 || richLoc.norms.forbiddenBehavior.length > 0 ? (
                            <>
                                {richLoc.norms.requiredBehavior.map(n => <li key={n.id} className="text-green-300/80">REQ: {n.description}</li>)}
                                {richLoc.norms.forbiddenBehavior.map(n => <li key={n.id} className="text-red-300/80">BAN: {n.description}</li>)}
                            </>
                        ) : <li className="italic text-canon-text-light">Нет особых норм</li>}
                    </ul>
                </div>
            </div>
        </div>
    );
};
