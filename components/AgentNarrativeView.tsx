
import React from 'react';
import { AgentState } from '../types';
import { getEntityById } from '../data';

export const AgentNarrativeView: React.FC<{ agent: AgentState }> = ({ agent }) => {
    if (!agent.narrativeState || agent.narrativeState.narrative.length === 0) {
        return <div className="text-xs text-canon-text-light italic p-4">Нарратив пуст. Запустите симуляцию.</div>;
    }

    // Show last 10 narrative slots, reversed
    const slots = [...agent.narrativeState.narrative].reverse().slice(0, 10);

    return (
        <div className="bg-canon-bg border border-canon-border rounded-lg p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            <h4 className="font-bold text-sm text-canon-accent sticky top-0 bg-canon-bg pb-2 border-b border-canon-border">
                Внутренний Нарратив: {agent.title}
            </h4>
            {slots.map((slot, i) => {
                
                const isInternal = slot.interpretation === 'internal';

                if (isInternal) {
                     return (
                        <div key={`thought-${i}`} className="p-3 rounded border-l-4 border-canon-accent bg-canon-accent/5 text-xs italic text-canon-text-light">
                            <div className="flex justify-between mb-1">
                                 <span className="font-bold text-canon-accent opacity-70">Внутренний Монолог</span>
                            </div>
                             <p className="text-canon-text font-serif text-sm">"{slot.perceivedLesson}"</p>
                             <div className="mt-1 text-[10px] opacity-50">Trigger: {slot.perceivedCause}</div>
                        </div>
                    );
                }

                // External Event Logic
                const episode = agent.narrativeState!.episodes.find(e => e.id === slot.episodeId);
                if (!episode) return null;

                let borderColor = 'border-canon-border/30';
                if (slot.interpretation === 'betrayal' || slot.interpretation === 'unfair') borderColor = 'border-canon-red';
                if (slot.interpretation === 'heroism') borderColor = 'border-canon-green';

                return (
                    <div key={slot.episodeId} className={`p-3 rounded border-l-4 ${borderColor} bg-canon-bg-light/20 text-xs`}>
                        <div className="flex justify-between mb-1">
                             <span className="font-bold text-canon-text">{episode.summary}</span>
                             <span className="text-canon-text-light font-mono">{episode.ticks.start}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <span className="text-canon-text-light block">Интерпретация:</span>
                                <span className="font-mono text-canon-accent">{slot.interpretation}</span>
                            </div>
                            <div>
                                <span className="text-canon-text-light block">Причина:</span>
                                <span className="italic">{slot.perceivedCause}</span>
                            </div>
                        </div>
                        {slot.perceivedLesson && slot.perceivedLesson !== 'none' && (
                            <div className="mt-2 pt-2 border-t border-canon-border/20 text-yellow-400">
                                "Урок: {slot.perceivedLesson}"
                            </div>
                        )}
                        {episode.tags.length > 0 && (
                            <div className="mt-2 flex gap-1">
                                {episode.tags.map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 bg-canon-bg rounded text-[10px] text-canon-text-light border border-canon-border/30">{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
