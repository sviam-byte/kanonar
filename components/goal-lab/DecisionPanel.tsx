// components/goal-lab/DecisionPanel.tsx
import React, { useMemo, useState } from 'react';
import { arr } from '../../lib/utils/arr';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function pct(x: number) {
  return Math.round(clamp01(x) * 100);
}

export const DecisionPanel: React.FC<{ decision: any }> = ({ decision }) => {
  const ranked = useMemo(() => arr(decision?.ranked), [decision]);
  const bestId = decision?.best?.p?.id || decision?.best?.id || null;
  const [showDetails, setShowDetails] = useState(false);
  const [sel, setSel] = useState(0);

  const current = ranked[sel] || null;
  const labelWithTarget = (a: any) => {
    const targetId = a?.p?.targetId || a?.targetId || null;
    return `${a?.label || a?.p?.id || 'Untitled action'}${targetId ? ` → ${targetId}` : ''}`;
  };

  return (
    <div className="h-full min-h-0 flex bg-canon-bg text-canon-text">
      <div className="w-80 border-r border-canon-border overflow-auto custom-scrollbar flex-shrink-0">
        <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
          <div className="text-sm font-semibold">What I’ll do</div>
          <div className="text-xs text-canon-text-light mt-1">Ranked actions</div>
        </div>
        {ranked.map((a: any, i: number) => {
          const isBest = (a?.p?.id || a?.id) === bestId;
          const allowed = Boolean(a?.allowed);
          return (
            <button
              key={a.id || i}
              className={`w-full text-left p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors ${
                i === sel ? 'bg-canon-accent/10 border-l-2 border-l-canon-accent' : ''
              }`}
              onClick={() => setSel(i)}
            >
              <div className="flex items-center justify-between">
                <div className={`text-sm font-bold ${allowed ? 'text-canon-text' : 'text-canon-text-light/50'}`}>
                  {labelWithTarget(a)}
                </div>
                {isBest ? (
                  <span className="text-[10px] uppercase tracking-wide text-canon-accent">best</span>
                ) : null}
              </div>
              <div className="text-[10px] font-mono mt-1 text-canon-text-light">
                score={pct(a.score || 0)} cost={pct(a.cost || 0)} {allowed ? '' : 'BLOCKED'}
              </div>
            </button>
          );
        })}
        {ranked.length === 0 && (
          <div className="p-4 text-xs text-canon-text-light italic text-center">No actions ranked.</div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 custom-scrollbar">
        {!current ? (
          <div className="text-sm text-canon-text-light italic text-center p-8">No action selected</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-canon-text mb-1">{labelWithTarget(current)}</h3>
                <div className="text-xs font-mono text-canon-text-light">id: {current.id}</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-canon-text-light">
                <input
                  type="checkbox"
                  checked={showDetails}
                  onChange={e => setShowDetails(e.target.checked)}
                />
                Show details
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-canon-bg border border-canon-border rounded">
                <span className="text-canon-text-light block">Score</span>
                <span className="font-bold font-mono text-canon-accent">{Number(current.score || 0).toFixed(3)}</span>
              </div>
              <div className="p-2 bg-canon-bg border border-canon-border rounded">
                <span className="text-canon-text-light block">Cost</span>
                <span className="font-bold font-mono text-orange-400">{Number(current.cost || 0).toFixed(3)}</span>
              </div>
              <div className="p-2 bg-canon-bg border border-canon-border rounded">
                <span className="text-canon-text-light block">Allowed</span>
                <span className={`font-bold font-mono ${current.allowed ? 'text-green-400' : 'text-red-400'}`}>
                  {String(current.allowed).toUpperCase()}
                </span>
              </div>
            </div>

            {current.why?.blockedBy?.length > 0 && (
              <div className="p-3 rounded bg-red-900/10 border border-red-500/30 text-xs">
                <div className="font-bold text-red-300 mb-2 uppercase tracking-wider">Blocked by</div>
                <div className="font-mono text-red-200">{current.why.blockedBy.join('  ')}</div>
              </div>
            )}

            {showDetails ? (
              <>
                <div className="p-3 rounded bg-black/20 border border-canon-border/30 text-xs">
                  <div className="font-bold text-canon-text-light mb-2 uppercase tracking-wider">Why (parts)</div>
                  <pre className="font-mono text-[10px] text-green-400 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(current.why?.parts || {}, null, 2)}
                  </pre>
                </div>

                <div className="p-3 rounded bg-black/20 border border-canon-border/30 text-xs">
                  <div className="font-bold text-canon-text-light mb-2 uppercase tracking-wider">Used Atoms</div>
                  <div className="font-mono text-[10px] text-canon-text-light break-all leading-relaxed">
                    {arr(current.why?.usedAtomIds).slice(0, 80).join('  ')}
                    {arr(current.why?.usedAtomIds).length > 80 && ' ...'}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
