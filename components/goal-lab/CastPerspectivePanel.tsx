import React from 'react';
import { ContextSnapshot } from '../../lib/context/v2/types';

type CastRow = {
  id: string;
  label: string;
  snapshot: ContextSnapshot | null;
};

export const CastPerspectivePanel: React.FC<{
  rows: CastRow[];
  focusId: string;
  onFocus: (id: string) => void;
}> = ({ rows, focusId, onFocus }) => {
  return (
    <div className="bg-canon-bg border border-canon-border/40 rounded p-3">
      <div className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider mb-2">
        Scene perspectives (FOCUS drives atoms/ToM)
      </div>

      <div className="flex flex-wrap gap-2">
        {rows.map(r => {
          const s = r.snapshot?.summary;
          const threat = s?.threatLevel ?? 0;
          const pressure = s?.normPressure ?? 0;
          const support = s?.socialSupport ?? 0;
          const crowd = s?.crowding ?? 0;

          const isFocus = r.id === focusId;

          return (
            <button
              key={r.id}
              onClick={() => onFocus(r.id)}
              className={`px-2 py-1 rounded border text-left min-w-[220px] ${
                isFocus ? 'border-canon-accent bg-canon-accent/10' : 'border-canon-border/30 bg-black/10'
              }`}
              title={r.id}
            >
              <div className="flex justify-between items-center gap-2">
                <div className="text-xs font-semibold text-canon-text truncate">
                  {r.label}
                  {isFocus ? '  •  FOCUS' : ''}
                </div>
                <div className="text-[9px] font-mono text-canon-text-light">{r.snapshot ? 'OK' : '—'}</div>
              </div>

              <div className="mt-1 grid grid-cols-4 gap-2 text-[9px] text-canon-text-light">
                <div>
                  <div className="opacity-70">Threat</div>
                  <div className="font-mono text-canon-text">{threat.toFixed(2)}</div>
                </div>
                <div>
                  <div className="opacity-70">Pressure</div>
                  <div className="font-mono text-canon-text">{pressure.toFixed(2)}</div>
                </div>
                <div>
                  <div className="opacity-70">Support</div>
                  <div className="font-mono text-canon-text">{support.toFixed(2)}</div>
                </div>
                <div>
                  <div className="opacity-70">Crowd</div>
                  <div className="font-mono text-canon-text">{crowd.toFixed(2)}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
