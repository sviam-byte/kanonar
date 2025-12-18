
import React, { useState, useMemo } from 'react';
import { UnifiedEventView } from '../../lib/events/unifiedEvents';

interface Props {
    events: UnifiedEventView[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

type SortMode = 'time' | 'intensity' | 'importance';

export const RichEventsList: React.FC<Props> = ({ events, selectedId, onSelect }) => {
    const [sortMode, setSortMode] = useState<SortMode>('time');
    const [search, setSearch] = useState('');

    const filteredAndSorted = useMemo(() => {
        let res = [...events];
        
        if (search) {
            const s = search.toLowerCase();
            res = res.filter(e => 
                e.label.toLowerCase().includes(s) || 
                e.domain.toLowerCase().includes(s) ||
                e.actorName?.toLowerCase().includes(s)
            );
        }
        
        res.sort((a, b) => {
            if (sortMode === 'time') return b.t - a.t;
            if (sortMode === 'intensity') return (b.intensity || 0) - (a.intensity || 0);
            if (sortMode === 'importance') return (b.importance || 0) - (a.importance || 0);
            return 0;
        });
        
        return res;
    }, [events, sortMode, search]);

    return (
        <div className="flex flex-col h-full bg-canon-bg border-r border-canon-border">
            {/* Toolbar */}
            <div className="p-3 border-b border-canon-border space-y-2 bg-canon-bg-light/50">
                <input 
                    type="text" 
                    placeholder="Search events..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1 text-xs focus:border-canon-accent outline-none"
                />
                <div className="flex gap-1 text-[10px]">
                    <button onClick={() => setSortMode('time')} className={`flex-1 py-1 rounded border ${sortMode === 'time' ? 'bg-canon-accent text-black border-canon-accent' : 'border-canon-border hover:bg-white/5'}`}>Time</button>
                    <button onClick={() => setSortMode('intensity')} className={`flex-1 py-1 rounded border ${sortMode === 'intensity' ? 'bg-canon-accent text-black border-canon-accent' : 'border-canon-border hover:bg-white/5'}`}>Int</button>
                    <button onClick={() => setSortMode('importance')} className={`flex-1 py-1 rounded border ${sortMode === 'importance' ? 'bg-canon-accent text-black border-canon-accent' : 'border-canon-border hover:bg-white/5'}`}>Imp</button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {filteredAndSorted.map(ev => {
                    const isSelected = selectedId === ev.id;
                    const hasEffects = ev.effects && (Object.keys(ev.effects.stateDelta || {}).length > 0 || Object.keys(ev.effects.worldDelta || {}).length > 0);
                    
                    let borderClass = 'border-l-4 border-l-canon-border';
                    if (ev.kind === 'system') borderClass = 'border-l-4 border-l-purple-500';
                    if (ev.kind === 'domain') borderClass = 'border-l-4 border-l-yellow-500';
                    if (ev.kind === 'social') borderClass = 'border-l-4 border-l-blue-500';
                    if (ev.check && !ev.check.success) borderClass = 'border-l-4 border-l-red-500';

                    return (
                        <div 
                            key={ev.id}
                            onClick={() => onSelect(ev.id)}
                            className={`
                                p-2 rounded cursor-pointer transition-all text-xs border border-transparent hover:border-canon-border/50
                                ${isSelected 
                                    ? 'bg-canon-bg-light shadow-md' 
                                    : 'bg-transparent opacity-80 hover:opacity-100'}
                                ${borderClass}
                            `}
                        >
                            <div className="flex justify-between items-center mb-1 text-[10px] text-canon-text-light font-mono">
                                <span>T:{ev.t}</span>
                                <span className="uppercase">{ev.domain}</span>
                            </div>
                            <div className={`font-bold truncate mb-1 ${ev.check && !ev.check.success ? 'text-red-400' : 'text-canon-text'}`}>
                                {ev.label}
                            </div>
                            <div className="flex justify-between items-end">
                                <div className="text-[10px] text-canon-text-light truncate max-w-[70%]">
                                    {ev.actorName || ev.actorId}
                                    {ev.targetName && <span className="opacity-70"> → {ev.targetName}</span>}
                                </div>
                                <div className="flex gap-1">
                                    {hasEffects && <span className="text-[8px] px-1 rounded bg-green-900/40 text-green-400 border border-green-500/30">FX</span>}
                                    {ev.epistemics && <span className="text-[8px] px-1 rounded bg-blue-900/40 text-blue-400 border border-blue-500/30">👁</span>}
                                </div>
                            </div>
                        </div>
                    )
                })}
                <div className="h-16" />
            </div>
        </div>
    );
};
