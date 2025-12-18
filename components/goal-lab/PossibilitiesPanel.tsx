
import React from 'react';
import { Possibility } from '../../lib/context/possibilities/types';

interface Props {
    possibilities?: Possibility[];
    onJumpToAtom?: (id: string) => void;
}

interface ItemProps {
  p: Possibility;
  onJumpToAtom?: (id: string) => void;
}

const Item: React.FC<ItemProps> = ({ p, onJumpToAtom }) => (
    <div className={`p-2 border-b border-canon-border/30 last:border-0 ${p.enabled ? 'hover:bg-green-900/10' : 'opacity-60 hover:bg-red-900/10'}`}>
        <div className="flex justify-between items-start mb-1">
            <div className="font-bold text-xs text-canon-text">{p.label}</div>
            <div className="flex gap-2 text-[10px] font-mono">
                    <span className={p.enabled ? 'text-green-400' : 'text-gray-500'}>Avail: {(p.magnitude*100).toFixed(0)}%</span>
                    {p.cost !== undefined && (
                        <span className="text-orange-400">Cost: {(p.cost*100).toFixed(0)}%</span>
                    )}
            </div>
        </div>
        
        <div className="flex flex-wrap gap-1 mt-1">
            {p.whyAtomIds?.map(id => (
                <span key={id} className="text-[9px] bg-blue-900/20 text-blue-200 px-1 rounded border border-blue-500/30 cursor-pointer hover:bg-blue-900/40" onClick={() => onJumpToAtom?.(id)}>
                    {id}
                </span>
            ))}
            {p.blockedBy?.map(id => (
                <span key={id} className="text-[9px] bg-red-900/20 text-red-200 px-1 rounded border border-red-500/30 cursor-pointer hover:bg-red-900/40" onClick={() => onJumpToAtom?.(id)}>
                    ⛔ {id}
                </span>
            ))}
            {p.costAtomId && (
                    <span className="text-[9px] bg-orange-900/20 text-orange-200 px-1 rounded border border-orange-500/30 cursor-pointer hover:bg-orange-900/40" onClick={() => onJumpToAtom?.(p.costAtomId!)}>
                    💰 {p.costAtomId}
                </span>
            )}
        </div>
    </div>
);

export const PossibilitiesPanel: React.FC<Props> = ({ possibilities, onJumpToAtom }) => {
    const list = possibilities || [];
    const enabled = list.filter(p => p.enabled).sort((a,b) => b.magnitude - a.magnitude);
    const disabled = list.filter(p => !p.enabled).sort((a,b) => b.magnitude - a.magnitude);

    return (
        <div className="h-full min-h-0 flex flex-col bg-canon-bg text-canon-text">
            <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
                <div className="text-sm font-semibold">Possibility Graph</div>
                <div className="text-xs text-canon-text-light mt-1">
                    Potential actions filtered by access, norms, and cost.
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                {list.length === 0 && <div className="p-4 text-xs italic text-center">No possibilities derived.</div>}
                
                {enabled.length > 0 && (
                    <div>
                        <div className="bg-green-900/20 px-3 py-1 text-[10px] font-bold text-green-300 uppercase tracking-wider">Available</div>
                        {enabled.map(p => <Item key={p.id} p={p} onJumpToAtom={onJumpToAtom} />)}
                    </div>
                )}
                
                {disabled.length > 0 && (
                     <div>
                        <div className="bg-red-900/20 px-3 py-1 text-[10px] font-bold text-red-300 uppercase tracking-wider mt-2">Blocked / Unavailable</div>
                        {disabled.map(p => <Item key={p.id} p={p} onJumpToAtom={onJumpToAtom} />)}
                    </div>
                )}
            </div>
        </div>
    );
};
