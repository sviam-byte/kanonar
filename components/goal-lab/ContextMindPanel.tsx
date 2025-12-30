
import React, { useState, useMemo } from 'react';
import { computeContextMindScoreboard } from '../../lib/contextMind/scoreboard';
import { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

export const ContextMindPanel: React.FC<{ cm?: any; atoms: ContextAtom[]; selfId?: string }> = ({ cm, atoms, selfId = 'unknown' }) => {
  
  const computedCm = useMemo(() => {
      if (cm) return cm;
      if (atoms.length > 0) return computeContextMindScoreboard({ selfId, atoms });
      return null;
  }, [cm, atoms, selfId]);
  
  const [sel, setSel] = useState(0);
  const metrics = arr(computedCm?.metrics);
  const cur = metrics[sel] || null;

  return (
    <div className="h-full min-h-0 flex bg-canon-bg text-canon-text">
      <div className="w-72 border-r border-canon-border overflow-auto custom-scrollbar flex-shrink-0">
        <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
          <div className="text-sm font-semibold">ContextMind</div>
          <div className="text-xs text-canon-text-light mt-1">{cm ? 'from snapshot' : 'computed from atoms'}</div>
        </div>

        {arr(metrics).map((m: any, i: number) => (
          <button
            key={m.key || i}
            className={`w-full text-left p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors ${i===sel ? 'bg-canon-bg-light/10 border-l-2 border-l-canon-accent' : ''}`}
            onClick={() => setSel(i)}
          >
            <div className="text-sm font-bold text-canon-text">{m.label}</div>
            <div className="text-xs font-mono text-canon-accent mt-1">
              {Math.round((m.value || 0) * 100) / 100}
            </div>
          </button>
        ))}
        {metrics.length === 0 && <div className="p-4 text-xs text-canon-text-light italic text-center">No metrics available.</div>}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 custom-scrollbar">
        {!cur ? <div className="text-sm text-canon-text-light italic text-center p-8">No metric selected</div> : (
          <div className="space-y-4">
            <div>
                <h3 className="text-xl font-bold text-canon-text mb-1">{cur.label}</h3>
                <div className="text-sm font-mono text-canon-accent">value: {String(Math.round((cur.value||0)*1000)/1000)}</div>
            </div>

            <div className="p-3 rounded bg-black/20 border border-canon-border/30 text-xs">
              <div className="font-bold text-canon-text-light mb-2 uppercase tracking-wider">Parts</div>
              <pre className="font-mono text-[10px] text-green-400 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(cur.parts || {}, null, 2)}
              </pre>
            </div>

            <div className="p-3 rounded bg-black/20 border border-canon-border/30 text-xs">
              <div className="font-bold text-canon-text-light mb-2 uppercase tracking-wider">Used Atoms</div>
              <div className="font-mono text-[10px] text-canon-text-light break-all leading-relaxed">
                {arr(cur.usedAtomIds).slice(0, 80).join('  ')}
                {arr(cur.usedAtomIds).length > 80 && ' ...'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
