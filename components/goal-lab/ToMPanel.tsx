// components/goal-lab/ToMPanel.tsx
import React, { useMemo } from 'react';
import { ContextAtom } from '../../lib/context/v2/types';

function getTargetFromDyadId(id: string): string | null {
  // expected: tom:dyad:<selfId>:<target>:trust
  const parts = id.split(':');
  // ["tom","dyad",selfId,target,metric]
  if (parts.length >= 5 && parts[0] === 'tom' && parts[1] === 'dyad') return parts[3] || null;
  // tom:effective:dyad:<selfId>:<target>:trust
  if (parts.length >= 6 && parts[0] === 'tom' && parts[1] === 'effective' && parts[2] === 'dyad') return parts[4] || null;
  return null;
}

function groupByTarget(list: ContextAtom[]) {
  const map = new Map<string, ContextAtom[]>();
  for (const a of list) {
    const t = getTargetFromDyadId(a.id) || '—';
    const arr = map.get(t) || [];
    arr.push(a);
    map.set(t, arr);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export const ToMPanel: React.FC<{ atoms: ContextAtom[] }> = ({ atoms }) => {
  const data = useMemo(() => {
    const baseDyads = atoms.filter(a => a.id.startsWith('tom:dyad:') && (a.id.endsWith(':trust') || a.id.endsWith(':threat')));
    const ctxDyads = atoms.filter(a => a.id.startsWith('tom:dyad:') && (a.id.endsWith(':trust_ctx') || a.id.endsWith(':threat_ctx')));
    const bias = atoms.filter(a => a.id.startsWith('tom:ctx:') || a.id.includes(':bias:') || a.id.startsWith('tom:bias:'));
    const effective = atoms.filter(a => a.id.startsWith('tom:effective:'));

    return {
      baseDyads,
      ctxDyads,
      bias,
      effective,
    };
  }, [atoms]);

  const renderGrouped = (title: string, list: ContextAtom[]) => {
    const groups = groupByTarget(list);
    return (
      <div className="mb-5">
        <h4 className="text-xs font-bold text-canon-accent uppercase mb-2 border-b border-canon-border/30 pb-1">
          {title} ({list.length})
        </h4>
        {list.length === 0 && <div className="text-[10px] italic text-canon-text-light">None</div>}
        <div className="space-y-3">
          {groups.map(([target, items]) => (
            <div key={target} className="border border-canon-border/30 rounded p-2 bg-black/10">
              <div className="text-[10px] font-bold text-canon-text-light mb-1 truncate" title={target}>
                {target}
              </div>
              <div className="space-y-1">
                {items
                  .slice()
                  .sort((a, b) => (a.id.localeCompare(b.id)))
                  .map(a => (
                    <div key={a.id} className="flex justify-between items-center text-xs p-1 hover:bg-white/5 rounded">
                      <span className="truncate flex-1 mr-2" title={a.id}>{a.label || a.id}</span>
                      <span className="font-mono text-canon-blue font-bold">{(a.magnitude ?? 0).toFixed(2)}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFlat = (title: string, list: ContextAtom[]) => (
    <div className="mb-5">
      <h4 className="text-xs font-bold text-canon-accent uppercase mb-2 border-b border-canon-border/30 pb-1">
        {title} ({list.length})
      </h4>
      <div className="space-y-1">
        {list.length === 0 && <div className="text-[10px] italic text-canon-text-light">None</div>}
        {list.map(a => (
          <div key={a.id} className="flex justify-between items-center text-xs p-1 hover:bg-white/5 rounded">
            <span className="truncate flex-1 mr-2" title={a.id}>{a.label || a.id}</span>
            <span className="font-mono text-canon-blue font-bold">{(a.magnitude ?? 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 bg-canon-bg text-canon-text p-4 overflow-auto custom-scrollbar">
      {renderGrouped('Dyads (base)', data.baseDyads)}
      {renderGrouped('Dyads (ctx adjusted)', data.ctxDyads)}
      {renderGrouped('Dyads (effective)', data.effective)}
      {renderFlat('Bias / Context', data.bias)}
    </div>
  );
};
