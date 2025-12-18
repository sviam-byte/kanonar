
// components/goal-lab/ValidatorPanel.tsx
import React, { useMemo } from 'react';
import { ValidationReport } from '../../lib/context/v2/types';

type Props = {
  report?: ValidationReport | null;
  onSelectAtomId?: (atomId: string) => void;
  className?: string;
};

function badge(sev: string) {
  if (sev === 'error') return 'bg-red-500/20 border-red-500/40 text-red-200';
  if (sev === 'warn') return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200';
  return 'bg-blue-500/20 border-blue-500/40 text-blue-200';
}

export const ValidatorPanel: React.FC<Props> = ({ report, onSelectAtomId, className }) => {
  const issues = report?.issues || [];
  const counts = report?.counts || { error: 0, warn: 0, info: 0 };

  const sorted = useMemo(() => {
    const w = (s: string) => (s === 'error' ? 0 : s === 'warn' ? 1 : 2);
    return [...issues].sort((a, b) => w(a.severity) - w(b.severity));
  }, [issues]);

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Validator</div>
        <div className="text-xs text-canon-text-light mt-1">
          errors: {counts.error} · warns: {counts.warn} · info: {counts.info}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {sorted.length === 0 ? (
          <div className="p-4 text-sm text-canon-text-light italic text-center">No issues found.</div>
        ) : (
          sorted.map((it, idx) => (
            <div key={idx} className="p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded border ${badge(it.severity)}`}>{it.severity}</span>
                <span className="text-xs text-canon-text-light font-mono truncate">{it.id}</span>
              </div>

              <div className="text-xs mb-2">{it.message}</div>

              {it.atomId && (
                <button
                  onClick={() => onSelectAtomId?.(it.atomId!)}
                  className="px-2 py-1 text-[10px] rounded bg-canon-bg border border-canon-border hover:bg-canon-accent hover:text-canon-bg font-mono transition-colors"
                >
                  jump: {it.atomId}
                </button>
              )}

              {it.details !== undefined && (
                <pre className="mt-2 text-[10px] bg-black/30 border border-canon-border/30 rounded p-2 overflow-auto whitespace-pre-wrap font-mono text-canon-text-light/70">
                  {JSON.stringify(it.details, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
