
// components/goal-lab/EpistemicPanel.tsx
import React, { useMemo, useState } from 'react';
import { ContextAtom } from '../../lib/context/v2/types';

type Layer = 'world' | 'obs' | 'belief' | 'override' | 'derived';

type Props = {
  atoms: ContextAtom[];
  provenance?: Array<[string, Layer]>; // snapshot.epistemic.provenance
  onSelectAtomId?: (id: string) => void;
  className?: string;
};

function layerBadge(layer: Layer) {
  switch (layer) {
    case 'world': return 'bg-green-500/20 border-green-500/40 text-green-200';
    case 'obs': return 'bg-blue-500/20 border-blue-500/40 text-blue-200';
    case 'belief': return 'bg-purple-500/20 border-purple-500/40 text-purple-200';
    case 'override': return 'bg-orange-500/20 border-orange-500/40 text-orange-200';
    case 'derived': return 'bg-gray-500/20 border-gray-500/40 text-gray-200';
    default: return 'bg-gray-700/20 border-gray-600/40 text-gray-300';
  }
}

export const EpistemicPanel: React.FC<Props> = ({ atoms, provenance, onSelectAtomId, className }) => {
  const provMap = useMemo(() => new Map(provenance || []), [provenance]);
  const [filter, setFilter] = useState<Layer | 'all'>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return atoms
      .map(a => ({ a, layer: (provMap.get(a.id) || (a.origin as Layer) || 'derived') as Layer }))
      .filter(r => filter === 'all' ? true : r.layer === filter)
      .filter(r => {
        if (!s) return true;
        return (r.a.id || '').toLowerCase().includes(s) || (r.a.label || '').toLowerCase().includes(s);
      })
      .sort((x, y) => x.layer.localeCompare(y.layer) || (x.a.id || '').localeCompare(y.a.id || ''));
  }, [atoms, provMap, filter, q]);

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Epistemic Layers</div>
        <div className="text-xs text-canon-text-light mt-1">Shows which layer “wins” for each atom id.</div>

        <div className="flex gap-2 mt-3">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as any)}
            className="px-2 py-2 rounded bg-canon-bg border border-canon-border text-xs focus:outline-none focus:border-canon-accent"
          >
            <option value="all">all</option>
            <option value="world">world</option>
            <option value="obs">obs</option>
            <option value="belief">belief</option>
            <option value="override">override</option>
            <option value="derived">derived</option>
          </select>

          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            className="flex-1 px-2 py-2 rounded bg-canon-bg border border-canon-border text-xs font-mono focus:outline-none focus:border-canon-accent"
            placeholder="search id/label"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {rows.length === 0 && (
            <div className="p-4 text-xs text-canon-text-light italic text-center">No atoms found for this layer/filter.</div>
        )}
        {rows.map(({ a, layer }, idx) => (
          <div key={idx} className="p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-[9px] uppercase font-bold rounded border ${layerBadge(layer)}`}>{layer}</span>
              <button
                onClick={() => onSelectAtomId?.(a.id)}
                className="text-xs font-mono px-2 py-0.5 rounded bg-canon-bg border border-canon-border hover:bg-canon-accent hover:text-canon-bg transition-colors"
                title="Jump to details"
              >
                {a.id}
              </button>
              <span className="text-xs text-canon-text-light/50 ml-auto">{a.ns}</span>
            </div>
            <div className="text-sm mt-1 flex justify-between items-center">
              <span>{a.label || a.kind}</span>
              <div className="flex gap-3 text-xs font-mono">
                  <span className="text-canon-text-light">m={Math.round((a.magnitude ?? 0) * 100)}%</span>
                  {a.confidence !== undefined && (
                    <span className={a.confidence < 0.5 ? 'text-yellow-500' : 'text-green-500'}>
                        c={Math.round((a.confidence ?? 0) * 100)}%
                    </span>
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
