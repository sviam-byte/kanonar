import React from 'react';

export type ConsoleMode = 'world' | 'pipeline' | 'debug' | 'tom';

/** Compact top navigation for selecting console diagnostic mode. */
export const TopNav: React.FC<{
  mode: ConsoleMode;
  onChangeMode: (m: ConsoleMode) => void;
}> = ({ mode, onChangeMode }) => {
  const items: Array<{ id: ConsoleMode; label: string; hint: string }> = [
    { id: 'world', label: 'World', hint: 'Истина мира' },
    { id: 'pipeline', label: 'Pipeline', hint: 'Полный пайплайн и атомы' },
    { id: 'debug', label: 'Debug', hint: 'Legacy DebugShell' },
    { id: 'tom', label: 'ToM', hint: 'Диадный ToM' },
  ];

  return (
    <div className="flex-none border-b border-slate-800 bg-slate-950/60">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">Console</div>
          <div className="text-[11px] text-slate-400">Новый фронт. Старое оставляем только в Debug.</div>
        </div>
        <div className="flex gap-2 shrink-0">
          {items.map(it => (
            <button
              key={it.id}
              onClick={() => onChangeMode(it.id)}
              className={`px-3 py-1 text-[10px] rounded uppercase border transition ${
                mode === it.id
                  ? 'bg-cyan-600/25 text-cyan-200 border-cyan-500/40'
                  : 'bg-black/10 text-slate-200 border-slate-700/60 hover:border-slate-500/70'
              }`}
              title={it.hint}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
