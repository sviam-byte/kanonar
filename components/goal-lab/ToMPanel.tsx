
import React, { useMemo } from 'react';
import { ContextAtom } from '../../lib/context/v2/types';

export const ToMPanel: React.FC<{ atoms: ContextAtom[] }> = ({ atoms }) => {
    const data = useMemo(() => {
        const base = atoms.filter(a => a.id.startsWith('tom:base:') || a.id.startsWith('tom:dyad:'));
        const ctx = atoms.filter(a => a.id.startsWith('tom:ctx:') || a.id.startsWith('tom:bias:'));
        const effective = atoms.filter(a => a.id.startsWith('tom:effective:') || a.id.startsWith('tom:priorApplied:'));
        
        return { base, ctx, effective };
    }, [atoms]);

    const renderList = (title: string, list: ContextAtom[]) => (
        <div className="mb-4">
            <h4 className="text-xs font-bold text-canon-accent uppercase mb-2 border-b border-canon-border/30 pb-1">{title} ({list.length})</h4>
            <div className="space-y-1">
                {list.length === 0 && <div className="text-[10px] italic text-canon-text-light">None</div>}
                {list.map(a => (
                    <div key={a.id} className="flex justify-between items-center text-xs p-1 hover:bg-white/5 rounded">
                        <span className="truncate flex-1 mr-2" title={a.id}>{a.label || a.id}</span>
                        <span className="font-mono text-canon-blue font-bold">{(a.magnitude ?? 0).toFixed(2)}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="h-full min-h-0 bg-canon-bg text-canon-text p-4 overflow-auto custom-scrollbar">
            {renderList("Base / Dyad", data.base)}
            {renderList("Context / Bias", data.ctx)}
            {renderList("Effective / Prior Applied", data.effective)}
        </div>
    );
};
