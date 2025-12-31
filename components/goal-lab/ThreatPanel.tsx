
import React, { useMemo } from 'react';
import { ContextAtom } from '../../lib/context/v2/types';
import { MetricBar } from '../tom/MetricBar';
import { listify } from '../../lib/utils/listify';

export const ThreatPanel: React.FC<{ atoms: ContextAtom[] }> = ({ atoms }) => {
  const data = useMemo(() => {
    const atomList = listify(atoms);
    const threatFinal = atomList.find(a => String(a.id).startsWith(`threat:final`))?.magnitude ?? 0;
    const channels = atomList.filter(a => String(a.id).startsWith('threat:ch:')).sort((a,b) => (b.magnitude||0) - (a.magnitude||0));
    return { threatFinal, channels: listify(channels) };
  }, [atoms]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-canon-bg text-canon-text p-4 overflow-auto custom-scrollbar">
       <div className="mb-6">
           <h3 className="text-lg font-bold text-canon-accent mb-2">Threat Analysis</h3>
           <MetricBar label="Total Threat" value={data.threatFinal} />
       </div>
       
       <div className="space-y-4">
           <h4 className="text-sm font-semibold text-canon-text-light">Threat Channels</h4>
           {data.channels.length === 0 && <div className="text-xs italic text-canon-text-light">No active threat channels.</div>}
           {listify(data.channels).map(ch => (
               <div key={ch.id} className="p-2 border border-canon-border/30 rounded bg-canon-bg/30">
                   <MetricBar label={ch.label || ch.id} value={ch.magnitude ?? 0} />
                   <div className="text-[10px] text-canon-text-light font-mono mt-1">{ch.id}</div>
               </div>
           ))}
       </div>
    </div>
  );
};
