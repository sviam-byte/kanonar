
// components/goal-lab/CoveragePanel.tsx
import React, { useMemo, useState } from 'react';

export const CoveragePanel: React.FC<{ coverage: any }> = ({ coverage }) => {
  const [groupIdx, setGroupIdx] = useState(0);

  const groups = coverage?.groups || [];
  const cur = groups[groupIdx] || null;

  const header = useMemo(() => {
    const total = coverage?.total ?? 0;
    const ok = coverage?.ok ?? 0;
    const missing = coverage?.missing ?? 0;
    return { total, ok, missing };
  }, [coverage]);

  return (
    <div className="h-full min-h-0 flex bg-canon-bg text-canon-text">
      <div className="w-80 border-r border-canon-border overflow-auto custom-scrollbar flex-shrink-0">
        <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
          <div className="text-sm font-semibold">Atom Coverage</div>
          <div className="text-xs text-canon-text-light mt-1">
            ok {header.ok}/{header.total} · missing {header.missing}
          </div>
        </div>

        {groups.map((g: any, i: number) => {
          const miss = (g.hits || []).filter((h: any) => !h.ok).length;
          const isSelected = i === groupIdx;
          return (
            <button
              key={g.groupId || i}
              className={`w-full text-left p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors ${isSelected ? 'bg-canon-accent/10 border-l-2 border-l-canon-accent' : ''}`}
              onClick={() => setGroupIdx(i)}
            >
              <div className={`text-sm font-bold ${isSelected ? 'text-canon-text' : 'text-canon-text-light/80'}`}>{g.title}</div>
              <div className="text-xs text-canon-text-light opacity-70 mt-1">missing: <span className={miss > 0 ? 'text-red-400 font-bold' : 'text-green-400'}>{miss}</span></div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 custom-scrollbar">
        {!cur ? <div className="text-sm text-canon-text-light italic text-center p-8">No coverage data available.</div> : (
          <>
            <div className="text-lg font-bold text-canon-accent mb-4 border-b border-canon-border/30 pb-2">{cur.title}</div>
            <div className="space-y-2">
              {(cur.hits || []).map((h: any, idx: number) => (
                <div key={h.expectationId || idx} className={`p-3 rounded border ${h.ok ? 'border-green-500/20 bg-green-900/10' : 'border-red-500/20 bg-red-900/10'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                         <span className="text-lg">{h.ok ? '✅' : '❌'}</span>
                         <span className={`text-sm font-bold ${h.ok ? 'text-green-300' : 'text-red-300'}`}>{h.label}</span>
                    </div>
                    <div className={`text-xs px-2 py-0.5 rounded uppercase font-bold ${h.severity === 'error' ? 'bg-red-500 text-white' : h.severity === 'warn' ? 'bg-yellow-500 text-black' : 'bg-blue-500 text-white'}`}>
                        {h.severity}
                    </div>
                  </div>

                  {h.ok ? (
                    <div className="mt-2 text-[10px] font-mono text-green-400/70 break-all bg-black/20 p-1.5 rounded">
                      {h.matchedAtomIds.slice(0, 10).join(',  ')}
                      {h.matchedAtomIds.length > 10 && ' ...'}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-red-400/70 italic">
                      Atom matching criteria not found in context.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
