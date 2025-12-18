
import React, { useState } from 'react';
import { ActiveGoal, GoalEcology, GoalState } from '../types';
import { entityMap } from '../data';

interface GoalEcologyDisplayProps {
  ecology: GoalEcology;
  onExecuteGoal?: (goal: ActiveGoal) => void;
}

const domainColors: Record<string, string> = {
    BODY: 'border-canon-green/50',
    IDENTITY: 'border-canon-blue/50',
    LEARN: 'border-yellow-500/50',
    SOCIAL: 'border-canon-accent/50',
    CIVIC: 'border-gray-400/50',
    JUSTICE: 'border-gray-400/50',
    POWER: 'border-red-400/50',
    RITUAL: 'border-purple-400/50',
    TOPOS: 'border-purple-400/50',
    EVIDENCE: 'border-blue-300/50',
    DARK: 'border-gray-600/50',
    CAUSAL: 'border-yellow-300/50',
    MISSION: 'border-orange-400/50',
    SURVIVAL: 'border-red-600/50',
    IMPULSE: 'border-fuchsia-500/50',
    default: 'border-canon-border',
};

const Metric: React.FC<{ name: string, value: string, color?: string, tooltip?: string }> = ({ name, value, color = 'text-canon-text', tooltip }) => (
    <div className="text-center" title={tooltip}>
        <div className={`font-mono font-bold text-lg ${color}`}>{value}</div>
        <div className="text-xs text-canon-text-light -mt-1">{name}</div>
    </div>
);


const GoalCard: React.FC<{ goal: ActiveGoal | GoalState; status: 'execute' | 'queue' | 'drop'; ecology: GoalEcology; onExecute?: (goal: ActiveGoal) => void; }> = ({ goal, status, ecology, onExecute }) => {
    const [expanded, setExpanded] = useState(false);
    
    const domain = goal.domain || 'default';
    const getBorderColor = () => {
        return domainColors[domain.toUpperCase()] || domainColors.default;
    };
    
    const borderColor = getBorderColor();
    
    const targetId = (goal as any).targetId;
    const targetName = targetId ? (entityMap.get(targetId)?.title || targetId) : null;

    const support = goal.directSupport || 0;
    const supportPct = (support * 100).toFixed(0);
    
    // Access detailed breakdown if available (V4 engine only)
    // The goal state itself might not carry it directly if it went through `deriveGoalCatalog`, 
    // but we can try to find it in lifeGoalDebug.concreteGoals if it exists.
    const concreteGoal = (ecology.lifeGoalDebug as any)?.concreteGoals?.find((cg: any) => cg.id === goal.id);

    return (
        <div className={`bg-canon-bg p-3 rounded-md border-l-4 ${borderColor} ${status === 'drop' ? 'opacity-50' : ''}`} title={goal.name}>
            <div className="flex justify-between items-start">
                <div className="flex-grow">
                    <div className="flex items-center gap-2">
                         {goal.sacred && <span className="text-yellow-400" title="Sacred Goal">✨</span>}
                        <h5 className="font-bold text-canon-text">
                            {goal.name} 
                            {targetName && <span className="text-canon-accent ml-1">→ {targetName}</span>}
                        </h5>
                    </div>
                    <div className="text-xs text-canon-text-light mt-1 flex gap-2 items-center">
                        <span className="font-mono bg-canon-bg-light px-1.5 py-0.5 rounded text-canon-accent">{goal.layer.toUpperCase()}</span>
                        {support > 0 && <span className="text-green-400" title="Goal supported by available actions">Action Support: {supportPct}%</span>}
                        {concreteGoal && (
                             <button 
                                onClick={() => setExpanded(!expanded)}
                                className="ml-2 px-1.5 py-0.5 rounded bg-canon-bg border border-canon-border text-[10px] font-serif italic text-canon-text-light hover:text-canon-accent hover:border-canon-accent transition-colors"
                                title="Показать формулу расчета"
                             >
                                 ƒ
                             </button>
                        )}
                    </div>
                </div>
                 <div className="flex items-center gap-4 pl-4">
                    {status === 'execute' && onExecute && (
                        <button 
                            onClick={() => onExecute(goal as ActiveGoal)}
                            className="text-sm bg-canon-bg-light border border-canon-border rounded px-3 py-1 hover:bg-canon-green hover:text-canon-bg transition-colors"
                        >
                            Выполнить
                        </button>
                    )}
                    <Metric name="Logit" value={goal.activation_score ? goal.activation_score.toFixed(2) : goal.base.toFixed(2)} color="text-canon-blue" tooltip="Raw score before normalization (Sum of weights * params)" />
                    <Metric name="Prob %" value={(goal.priority * 100).toFixed(1) + '%'} color="text-canon-accent" tooltip="Final probability after Softmax" />
                </div>
            </div>
            {support > 0 && (
                <div className="mt-2 w-full bg-canon-bg-light h-1 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500/50" style={{width: `${Math.min(100, support*100)}%`}} title={`Direct Support: ${support.toFixed(2)}`}></div>
                </div>
            )}
            
            {expanded && concreteGoal && concreteGoal.breakdown && (
                <div className="mt-3 pt-3 border-t border-canon-border/30 text-xs">
                    {concreteGoal.formula && (
                        <div className="mb-2 p-2 bg-black/20 rounded font-mono text-[10px] text-canon-text-light overflow-x-auto whitespace-nowrap">
                            <span className="font-bold text-canon-accent">Logit = </span>{concreteGoal.formula}
                        </div>
                    )}
                    <div className="mb-2 font-bold text-canon-text-light flex justify-between">
                        <span>Параметр</span>
                        <span className="w-16 text-right">Знач.</span>
                        <span className="w-16 text-right">Вес</span>
                        <span className="w-16 text-right">Вклад</span>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        {concreteGoal.breakdown.sort((a: any, b: any) => Math.abs(b.contribution) - Math.abs(a.contribution)).map((item: any, i: number) => (
                            <div key={i} className="flex justify-between hover:bg-canon-bg-light/30 p-0.5 rounded">
                                <span className="truncate flex-1 text-canon-text-light" title={`${item.category}: ${item.key}`}>
                                    <span className="opacity-50 mr-1">[{item.category}]</span>
                                    {item.key}
                                </span>
                                <span className="w-16 text-right font-mono opacity-70">{item.agentValue.toFixed(2)}</span>
                                <span className="w-16 text-right font-mono opacity-70">{item.weight.toFixed(2)}</span>
                                <span className={`w-16 text-right font-mono font-bold ${item.contribution > 0 ? 'text-green-400' : item.contribution < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                    {item.contribution > 0 ? '+' : ''}{item.contribution.toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-canon-border/30 flex justify-end gap-4 font-mono text-canon-text">
                         <span>Sum Logit: {concreteGoal.logit.toFixed(2)}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

const GoalList: React.FC<{ title: string, goals: (ActiveGoal | GoalState)[], status: 'execute' | 'queue' | 'drop', ecology: GoalEcology, defaultMessage: string, onExecute?: (goal: ActiveGoal) => void }> = ({ title, goals, status, ecology, defaultMessage, onExecute }) => (
     <div>
        <h4 className="text-lg font-bold text-canon-text mb-3 border-b border-canon-border pb-1">{title} ({goals.length})</h4>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {goals.length > 0 ? (
            goals.map(goal => <GoalCard key={goal.id} goal={goal} status={status} ecology={ecology} onExecute={onExecute}/>)
          ) : (
            <p className="text-sm text-canon-text-light italic">{defaultMessage}</p>
          )}
        </div>
      </div>
);

export const GoalGraphDisplay: React.FC<GoalEcologyDisplayProps> = ({ ecology, onExecuteGoal }) => {
  if (!ecology) {
    return <div className="p-4 text-canon-text-light">Экология целей не рассчитана.</div>;
  }
  
  const { execute, latent } = ecology;

  return (
    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 max-w-4xl space-y-6">
       <div>
        <div className="flex justify-between items-start">
            <div>
                <h3 className="text-xl font-bold text-canon-accent mb-2">Экология Целей v2</h3>
                <p className="text-sm text-canon-text-light">Динамический расчет приоритетов на основе контекста, тела и отношений.</p>
            </div>
            <div className="text-right">
                 <div className="mt-2 text-xs font-mono text-canon-text-light">
                    {execute.length} Active | {latent.length} Latent
                 </div>
            </div>
        </div>
      </div>

      <GoalList title="Активные (Execute)" goals={execute} status="execute" ecology={ecology} defaultMessage="Нет активных целей." onExecute={onExecuteGoal} />
      <GoalList title="Латентные (Low Priority)" goals={latent} status="queue" ecology={ecology} defaultMessage="Нет латентных целей." />
      
    </div>
  );
};
