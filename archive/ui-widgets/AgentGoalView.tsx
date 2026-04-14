
import React from 'react';
import { AgentState, ActiveGoal, GoalEcology, GoalState } from '../types';

const domainColors: Record<string, string> = {
    BODY: 'border-canon-green/50',
    IDENTITY: 'border-canon-blue/50',
    LEARN: 'border-yellow-500/50',
    SOCIAL: 'border-canon-accent/50',
    COMBAT: 'border-canon-red/50',
    DEFAULT: 'border-canon-border',
};

const GoalCard: React.FC<{ goal: ActiveGoal | GoalState, ecology: GoalEcology }> = ({ goal, ecology }) => {
    const hasConflicts = goal.conflictingGoalIds && goal.conflictingGoalIds.length > 0;
    
    const getConflictTooltip = () => {
        if (!hasConflicts || !goal.conflictingGoalIds) return "Нет конфликтов";
        const conflictingNames = goal.conflictingGoalIds
            .map(id => ecology.execute.find(g => g.id === id) || ecology.queue.find(g => g.id === id))
            .filter(Boolean)
            .map(g => g?.name);
        return `Конфликтует с: ${conflictingNames.join(', ')}`;
    };

    const domain = goal.domain || 'DEFAULT';
    const borderColorClass = domainColors[domain.toUpperCase()] || domainColors.DEFAULT;

    return (
        <div className={`bg-canon-bg p-2 rounded-md border-l-4 text-xs ${borderColorClass} ${hasConflicts ? 'bg-red-900/20' : ''}`}>
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 flex-grow min-w-0">
                    {hasConflicts && <span className="text-canon-red" title={getConflictTooltip()}>⚠️</span>}
                    <p className="font-semibold text-canon-text truncate" title={goal.name}>
                        {goal.name}
                        {(goal as any).targetId && <span className='text-canon-accent text-opacity-80'> ({(goal as any).targetId})</span>}
                    </p>
                </div>
                <div className="font-mono text-canon-accent font-bold flex-shrink-0 pl-2">
                    {(goal.priority ?? 0).toFixed(2)}
                </div>
            </div>
        </div>
    );
};

const GoalList: React.FC<{ title: string, goals: (ActiveGoal | GoalState)[], ecology: GoalEcology, colorClass: string }> = ({ title, goals, ecology, colorClass }) => (
     <div>
        <h5 className={`font-bold text-xs mb-1 ${colorClass}`}>{title} ({goals.length})</h5>
        <div className="space-y-1">
          {goals.length > 0 ? (
            goals.map(goal => <GoalCard key={`${goal.id}-${(goal as any).targetId || ''}`} goal={goal} ecology={ecology} />)
          ) : (
            <p className="text-xs text-canon-text-light italic">Пусто</p>
          )}
        </div>
      </div>
);


export const AgentGoalView: React.FC<{ agent: AgentState }> = ({ agent }) => {
    if (!agent.goalEcology) {
        return null;
    }

    const { execute, queue, drop } = agent.goalEcology;

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-3 mt-2">
             <h4 className="font-bold text-canon-text text-sm mb-2">Экология целей</h4>
             <div className="space-y-3">
                <GoalList title="К выполнению" goals={execute} ecology={agent.goalEcology} colorClass="text-canon-green" />
                <GoalList title="В очереди (конфликт)" goals={queue} ecology={agent.goalEcology} colorClass="text-yellow-400" />
                <GoalList title="Отброшено" goals={drop} ecology={agent.goalEcology} colorClass="text-canon-text-light" />
             </div>
        </div>
    );
};
