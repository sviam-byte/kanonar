
import React from 'react';
import { AccessDecision } from '../../lib/access/types';
import { arr } from '../../lib/utils/arr';

export const AccessPanel: React.FC<{ decisions?: AccessDecision[] }> = ({ decisions }) => {
  const d = arr(decisions);
  
  return (
    <div className="h-full min-h-0 flex flex-col bg-canon-bg text-canon-text">
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Access Control</div>
        <div className="text-xs text-canon-text-light mt-1">Derived decisions based on capabilities, norms and location locks.</div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {d.length === 0 && <div className="p-4 text-xs text-canon-text-light italic text-center">No access decisions recorded.</div>}
        
        {d.map((x, i) => (
          <div key={i} className="p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors">
            <div className="flex justify-between items-center mb-1">
                 <div className="text-sm font-bold text-canon-text capitalize">{x.kind.replace('_', ' ')}</div>
                 <div className="flex items-center gap-2">
                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${x.allowed ? 'text-green-300 border-green-500/50 bg-green-900/20' : 'text-red-300 border-red-500/50 bg-red-900/20'}`}>
                         {x.allowed ? 'ALLOWED' : 'DENIED'}
                     </span>
                     <span className="text-xs font-mono text-canon-accent">{Math.round((x.score ?? 0) * 100)}%</span>
                 </div>
            </div>
            
            <div className="text-xs text-canon-text-light mt-1 mb-2">{x.reason}</div>
            
            {arr(x.usedAtomIds).length > 0 && (
              <div className="bg-black/20 p-2 rounded border border-canon-border/20">
                  <div className="text-[9px] text-canon-text-light uppercase font-bold mb-1">Contributors</div>
                  <div className="flex flex-wrap gap-1">
                      {arr(x.usedAtomIds).map(id => (
                          <span key={id} className="text-[9px] font-mono bg-canon-bg px-1 rounded border border-canon-border/30 text-canon-text-light/80">
                              {id}
                          </span>
                      ))}
                  </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
