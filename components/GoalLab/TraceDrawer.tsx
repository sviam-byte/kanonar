import React from 'react';

type Atom = {
  id: string;
  m: number;
  c: number;
  o: 'world' | 'obs' | 'override' | 'derived';
  meta?: {
    trace?: {
      usedAtomIds?: string[];
      parts?: { name: string; value: number; weight?: number }[];
      formulaId?: string;
      notes?: string;
    };
    [k: string]: any;
  };
};

export function TraceDrawer({
  atom,
  index,
  onJump,
}: {
  atom: Atom | null;
  index?: Record<string, Atom>;
  onJump?: (id: string) => void;
}) {
  if (!atom) {
    return <div className="p-8 text-center text-canon-text-light italic text-xs">Выберите атом для просмотра трассировки.</div>;
  }
  const tr = atom.meta?.trace;
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="bg-canon-bg p-4 rounded border border-canon-border">
        <div className="text-[10px] font-bold text-canon-accent uppercase mb-2">Selected Atom</div>
        <div className="font-mono text-sm font-bold text-white break-all mb-4">{atom.id}</div>
        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
          <div className="p-2 bg-black/40 rounded border border-white/5">
             <div className="text-[9px] text-canon-text-light uppercase mb-1">Magnitude</div>
             <div className="text-canon-accent text-lg font-bold">{atom.m.toFixed(3)}</div>
          </div>
          <div className="p-2 bg-black/40 rounded border border-white/5">
             <div className="text-[9px] text-canon-text-light uppercase mb-1">Confidence</div>
             <div className="text-white text-lg font-bold">{atom.c.toFixed(3)}</div>
          </div>
          <div className="p-2 bg-black/40 rounded border border-white/5">
             <div className="text-[9px] text-canon-text-light uppercase mb-1">Origin</div>
             <div className="text-canon-text text-lg font-bold uppercase">{atom.o}</div>
          </div>
        </div>
        {tr?.formulaId && <div className="mt-3 text-[10px] font-mono text-canon-text-light">Formula: <span className="text-green-400">{tr.formulaId}</span></div>}
        {tr?.notes && <div className="mt-2 p-2 bg-blue-900/10 border border-blue-500/20 rounded text-[11px] text-blue-200">ℹ️ {tr.notes}</div>}
      </div>

      <div>
        <h4 className="text-[10px] font-bold text-canon-text-light uppercase mb-2 px-1">Derivation Path (Used Atoms)</h4>
        <div className="space-y-1">
          {(tr?.usedAtomIds ?? []).length === 0 && <div className="text-xs text-canon-text-light italic px-2">None</div>}
          {(tr?.usedAtomIds ?? []).map(id => {
            const exists = index?.[id];
            return (
              <div key={id} className="flex gap-2 items-center bg-canon-bg border border-canon-border/30 p-2 rounded hover:bg-canon-bg-light/30 transition-colors">
                <button
                  onClick={() => onJump?.(id)}
                  className="px-1.5 py-0.5 rounded bg-canon-accent text-black font-bold text-[9px] uppercase hover:bg-opacity-80"
                >
                  Jump
                </button>
                <span className="font-mono text-[10px] flex-1 truncate text-canon-text" title={id}>{id}</span>
                {exists ? (
                  <span className="font-mono text-[10px] text-canon-accent font-bold">m={exists.m.toFixed(2)}</span>
                ) : (
                  <span className="font-mono text-[9px] text-red-500 italic">(missing)</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-bold text-canon-text-light uppercase mb-2 px-1">Weight Breakdown (Parts)</h4>
        <div className="border border-canon-border rounded-lg overflow-hidden bg-canon-bg">
          <table className="w-full text-xs text-left">
            <thead className="bg-black/40 font-bold text-[9px] uppercase text-canon-text-light">
                <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2 w-16 text-right">Val</th>
                    <th className="p-2 w-16 text-right">Weight</th>
                </tr>
            </thead>
            <tbody>
                {(tr?.parts ?? []).map((p, i) => (
                    <tr key={i} className="border-t border-canon-border/30 hover:bg-white/5">
                        <td className="p-2 truncate max-w-[120px]" title={p.name}>{p.name}</td>
                        <td className="p-2 text-right font-mono text-canon-accent">{(p.value ?? 0).toFixed(2)}</td>
                        <td className="p-2 text-right font-mono text-canon-text-light">{(p.weight ?? 1).toFixed(1)}</td>
                    </tr>
                ))}
            </tbody>
          </table>
          {(tr?.parts ?? []).length === 0 && <div className="p-4 text-center text-xs text-canon-text-light italic">No parts trace available.</div>}
        </div>
      </div>
    </div>
  );
}
