
import React, { useMemo } from 'react';
import { GoalEcology, CharacterEntity } from '../types';
import { allArchetypes } from '../data/archetypes';
import { computeArchetypeEffects } from '../lib/archetypes/effects';
import { GOAL_DEFS } from '../lib/goals/space';

interface Props {
    character: CharacterEntity;
    ecology: GoalEcology | null;
}

const FitBar: React.FC<{ goalName: string, score: number, bonus: number }> = ({ goalName, score, bonus }) => {
    const total = score;
    const isPositive = bonus > 0;
    
    return (
        <div className="flex items-center justify-between text-xs py-1 border-b border-canon-border/30">
            <span className="text-canon-text truncate w-1/2">{goalName}</span>
            <div className="flex items-center gap-2 w-1/2 justify-end">
                <div className="w-24 h-1.5 bg-canon-bg rounded-full overflow-hidden border border-canon-border/50 relative">
                    <div className="h-full bg-canon-text-light/30" style={{ width: `${Math.min(1, score) * 100}%` }}></div>
                    {bonus !== 0 && (
                         <div 
                            className={`absolute top-0 h-full ${isPositive ? 'bg-green-400' : 'bg-red-400'}`} 
                            style={{ 
                                left: isPositive ? `${(score-bonus)*100}%` : `${score*100}%`,
                                width: `${Math.abs(bonus)*100}%` 
                            }}
                        />
                    )}
                </div>
                <span className={`font-mono font-bold w-8 text-right ${isPositive ? 'text-green-400' : bonus < 0 ? 'text-red-400' : 'text-canon-text-light'}`}>
                    {bonus > 0 ? '+' : ''}{bonus.toFixed(2)}
                </span>
            </div>
        </div>
    )
}

export const ArchetypeGoalAlignment: React.FC<Props> = ({ character, ecology }) => {
    const archId = character.identity?.arch_true_dominant_id;
    const archetype = allArchetypes.find(a => a.id === archId);
    
    const effects = useMemo(() => {
        // Need to cast character to AgentState to satisfy type for computeArchetypeEffects
        // Assuming minimal required fields are present or defaulted safely
        const agentState: any = { 
            ...character, 
            archetype: { 
                actualId: archId, 
                shadowActivation: 0, // Static view assumes no shadow activation unless simulated
                shadowId: null 
            } 
        };
        return computeArchetypeEffects(agentState);
    }, [character, archId]);

    if (!ecology || !archetype) return null;

    const activeGoals = ecology.execute.slice(0, 6);

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="font-bold text-sm text-canon-accent uppercase tracking-wider">Архетипическое Выравнивание</h3>
                    <p className="text-xs text-canon-text-light">Как цели соответствуют ядру {archetype.data.name} ({archetype.mu})</p>
                </div>
                <div className="text-xs font-mono bg-canon-bg p-1 rounded border border-canon-border">
                    {archetype.id}
                </div>
            </div>
            
            <div className="space-y-1">
                {activeGoals.map(g => {
                    const bonus = effects.goalMods[g.id as any] ?? 0;
                    return (
                        <FitBar 
                            key={g.id} 
                            goalName={GOAL_DEFS[g.id as any]?.label_ru || g.name} 
                            score={g.priority}
                            bonus={bonus}
                        />
                    )
                })}
                {activeGoals.length === 0 && <div className="text-canon-text-light italic text-xs">Нет активных целей</div>}
            </div>

            <div className="mt-4 pt-3 border-t border-canon-border/50">
                <h4 className="text-[10px] font-bold text-canon-text-light uppercase mb-2">Предпочтения Архетипа</h4>
                <div className="flex flex-wrap gap-2">
                    {effects.preferredTags.map(t => <span key={t} className="px-1.5 py-0.5 bg-green-900/30 text-green-400 border border-green-500/30 rounded text-[10px]">+{t}</span>)}
                    {effects.avoidedTags.map(t => <span key={t} className="px-1.5 py-0.5 bg-red-900/30 text-red-400 border border-red-500/30 rounded text-[10px]">-{t}</span>)}
                </div>
            </div>
        </div>
    );
};
