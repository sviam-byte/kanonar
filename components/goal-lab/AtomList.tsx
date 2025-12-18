
import React from 'react';
import { ContextAtom, ContextAtomKind } from '../../lib/context/v2/types';

interface Props {
    atoms: ContextAtom[];
}

const ATOM_STYLES: Record<string, { bg: string, text: string, border: string }> = {
    'physical_risk': { bg: 'bg-red-900/20', text: 'text-red-300', border: 'border-red-500/30' },
    'threat': { bg: 'bg-red-900/30', text: 'text-red-200', border: 'border-red-500/50' },
    'proximity_friend': { bg: 'bg-emerald-900/20', text: 'text-emerald-300', border: 'border-emerald-500/30' },
    'proximity_enemy': { bg: 'bg-orange-900/20', text: 'text-orange-300', border: 'border-orange-500/30' },
    'social_support': { bg: 'bg-green-900/20', text: 'text-green-300', border: 'border-green-500/30' },
    'care_need': { bg: 'bg-teal-900/20', text: 'text-teal-300', border: 'border-teal-500/30' },
    'authority_presence': { bg: 'bg-purple-900/20', text: 'text-purple-300', border: 'border-purple-500/30' },
    'safe_zone_hint': { bg: 'bg-blue-900/20', text: 'text-blue-300', border: 'border-blue-500/30' },
    'default': { bg: 'bg-canon-bg', text: 'text-canon-text-light', border: 'border-canon-border/30' }
};

const getStyle = (kind: string) => ATOM_STYLES[kind] || ATOM_STYLES['default'];

export const AtomList: React.FC<Props> = ({ atoms }) => {
    if (atoms.length === 0) {
        return <div className="text-xs text-canon-text-light italic p-4 text-center border border-dashed border-canon-border/30 rounded">No active context atoms.</div>;
    }

    const sorted = [...atoms].sort((a,b) => b.magnitude - a.magnitude);

    return (
        <div className="overflow-x-auto bg-canon-bg border border-canon-border/30 rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
                <thead className="text-[10px] text-canon-text-light uppercase tracking-wider bg-black/20 border-b border-canon-border/30">
                    <tr>
                        <th className="p-2 w-16 text-center">Mag</th>
                        <th className="p-2 w-32">Kind</th>
                        <th className="p-2">Label / ID</th>
                        <th className="p-2 w-24">Source</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-canon-border/10">
                    {sorted.map(atom => {
                        const style = getStyle(atom.kind);
                        return (
                            <tr key={atom.id} className={`hover:bg-white/5 transition-colors`}>
                                <td className="p-2 font-mono font-bold text-canon-text text-center">
                                    {atom.magnitude.toFixed(2)}
                                </td>
                                <td className="p-2">
                                    <span className={`px-1.5 py-0.5 rounded border text-[10px] whitespace-nowrap ${style.bg} ${style.text} ${style.border}`}>
                                        {atom.kind}
                                    </span>
                                </td>
                                <td className="p-2">
                                    <div className="font-medium text-canon-text">{atom.label || atom.id}</div>
                                    <div className="text-[9px] text-canon-text-light font-mono opacity-50 truncate max-w-[200px]" title={atom.id}>{atom.id}</div>
                                </td>
                                <td className="p-2 text-canon-text-light text-[10px]">
                                    {atom.source}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
