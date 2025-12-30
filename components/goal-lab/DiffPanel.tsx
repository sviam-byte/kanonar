
import React from 'react';
import { AtomDiff } from '../../lib/snapshot/diffAtoms';
import { arr } from '../../lib/utils/arr';

export const DiffPanel: React.FC<{ diffs: AtomDiff[] }> = ({ diffs }) => {
  if (!diffs || diffs.length === 0) {
      return <div className="p-4 text-xs text-canon-text-light italic text-center">No changes between snapshots.</div>;
  }

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar p-2 space-y-1">
      {arr(diffs).map((d) => {
          let color = 'text-canon-text';
          let bg = 'bg-canon-bg';
          let sign = '';
          
          if (d.type === 'added') { color = 'text-green-400'; bg = 'bg-green-900/10'; sign='+'; }
          if (d.type === 'removed') { color = 'text-red-400'; bg = 'bg-red-900/10'; sign='-'; }
          if (d.type === 'changed') { color = 'text-yellow-400'; bg = 'bg-yellow-900/10'; sign='~'; }

          return (
            <div key={d.id} className={`p-2 rounded border border-canon-border/30 text-xs flex justify-between items-center ${bg}`}>
               <div className="flex flex-col overflow-hidden mr-2 min-w-0">
                   <span className={`font-bold ${color} uppercase text-[9px] mb-0.5`}>{sign} {d.type}</span>
                   <span className="truncate font-mono text-canon-text" title={d.id}>{d.label || d.id}</span>
               </div>
               <div className="text-right font-mono text-[10px] text-canon-text-light whitespace-nowrap ml-2">
                   {d.before !== undefined && <div className="opacity-50 line-through">{d.before.toFixed(2)}</div>}
                   {d.after !== undefined && <div className="font-bold">{d.after.toFixed(2)}</div>}
               </div>
            </div>
          );
      })}
    </div>
  );
};
