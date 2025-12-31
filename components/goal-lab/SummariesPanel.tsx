
// components/goal-lab/SummariesPanel.tsx
import React, { useMemo } from 'react';
import { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';
import { listify } from '../../lib/utils/listify';

type Props = {
  atoms: ContextAtom[];
  onSelectAtomId?: (id: string) => void;
  className?: string;
};

function isBanner(a: ContextAtom) {
  return arr(a.tags).includes('banner') || a.id.endsWith(':banner') || a.id.includes(':banner:') || a.id === 'ctx:banner' || a.id === 'threat:banner' || a.id === 'emo:banner';
}

export const SummariesPanel: React.FC<Props> = ({ atoms, onSelectAtomId, className }) => {
  const banners = useMemo(() => {
    const next = listify(atoms).filter(isBanner).sort((a, b) => (a.ns || '').localeCompare(b.ns || ''));
    return listify(next);
  }, [atoms]);

  const tomBanners = useMemo(() => {
    const next = listify(banners).filter(b => b.id.startsWith('tom:banner:'));
    return listify(next);
  }, [banners]);

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Summaries</div>
        <div className="text-xs text-canon-text-light mt-1">Banner atoms are stable UI + scenario triggers.</div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {banners.length === 0 && <div className="p-4 text-xs text-canon-text-light italic text-center">No summaries generated.</div>}

        {/* Global Banners */}
        {listify(banners).filter(b => !b.id.startsWith('tom:banner:')).map((b, idx) => (
          <div key={idx} className="p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-canon-accent font-bold uppercase tracking-wider">{b.ns}</span>
              <button
                onClick={() => onSelectAtomId?.(b.id)}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-canon-bg border border-canon-border hover:bg-canon-accent hover:text-black transition-colors"
                title="Jump to Atom"
              >
                {b.id}
              </button>
            </div>
            <div className="text-sm font-medium">{b.label}</div>
            <div className="mt-1 w-full bg-canon-bg rounded-full h-1.5 border border-canon-border/30">
                <div className="h-full bg-canon-blue transition-all duration-300" style={{ width: `${(b.magnitude ?? 0) * 100}%` }}></div>
            </div>
          </div>
        ))}

        {/* ToM Banners Section */}
        {tomBanners.length > 0 && (
          <div className="p-2 bg-canon-bg-light/10 border-y border-canon-border/30 mt-2">
            <div className="text-xs font-bold text-canon-text-light uppercase tracking-wider px-2">ToM per-target</div>
          </div>
        )}

        {listify(tomBanners).map((b, idx) => (
          <div key={`tom-${idx}`} className="p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-purple-400 font-bold uppercase tracking-wider">tom</span>
              <button
                onClick={() => onSelectAtomId?.(b.id)}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-canon-bg border border-canon-border hover:bg-canon-accent hover:text-black transition-colors"
              >
                {b.id}
              </button>
              {(b as any).target && <span className="text-[10px] text-canon-text-light italic ml-auto">Target: {(b as any).target}</span>}
            </div>
            <div className="text-sm font-medium">{b.label}</div>
             <div className="mt-1 w-full bg-canon-bg rounded-full h-1.5 border border-canon-border/30">
                <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${(b.magnitude ?? 0) * 100}%` }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
