import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: ContextAtom[], id: string): number | null {
  const a = atoms.find(x => String((x as any)?.id || '') === id) as any;
  if (!a) return null;
  const n = Number(a.magnitude);
  return Number.isFinite(n) ? clamp01(n) : null;
}

type Row = {
  axis: string;
  baseId: string;
  finalId: string;
  prioId: string;
  base: number;
  final: number;
  prio: number;
  diff: number;
  diffPct: number | null;
};

export const ContextLensPanel: React.FC<{ atoms: ContextAtom[]; selfId: string; axes?: string[]; onJumpToAtomId?: (id: string) => void }> = ({ atoms, selfId, axes, onJumpToAtomId }) => {
  const axisList = axes ?? [
    'danger',
    'control',
    'publicness',
    'normPressure',
    'uncertainty',
    'scarcity',
    'crowd',
    'intimacy',
    'surveillance',
    'timePressure',
  ];

  const rows: Row[] = useMemo(() => {
    const a = arr<ContextAtom>(atoms);
    return axisList.map((axis) => {
      const baseId = `ctx:${axis}:${selfId}`;
      const finalId = `ctx:final:${axis}:${selfId}`;
      const prioId = `ctx:prio:${axis}:${selfId}`;

      const base = getMag(a, baseId) ?? 0;
      const fin = getMag(a, finalId) ?? base;
      const prio = getMag(a, prioId) ?? 0.5;

      const diff = fin - base;
      const diffPct = base > 1e-9 ? (diff / base) * 100 : null;
      return { axis, baseId, finalId, prioId, base, final: fin, prio, diff, diffPct };
    });
  }, [atoms, selfId, axisList.join('|')]);

  const jumpAxis = (r: Row) => {
    if (!onJumpToAtomId) return;
    // Prefer subjective final-axis atom; table tooltip still shows base → final mapping.
    onJumpToAtomId(r.finalId);
  };

  return (
    <div className="p-4 h-full overflow-auto custom-scrollbar">
      <div className="text-sm font-bold text-canon-text">Context Lens (objective → subjective)</div>
      <div className="text-[11px] text-canon-text-light mt-1">
        Сравнение <span className="font-mono">ctx:&lt;axis&gt;:{selfId}</span> и <span className="font-mono">ctx:final:&lt;axis&gt;:{selfId}</span>.
        Приоритеты берём из <span className="font-mono">ctx:prio:&lt;axis&gt;:{selfId}</span>.
      </div>

      <div className="mt-4 border border-canon-border/40 rounded overflow-hidden">
        <div className="grid grid-cols-12 bg-black/40 text-[9px] uppercase text-canon-text-light font-bold">
          <div className="col-span-3 p-2">axis</div>
          <div className="col-span-2 p-2 text-right">base</div>
          <div className="col-span-2 p-2 text-right">prio</div>
          <div className="col-span-2 p-2 text-right">final</div>
          <div className="col-span-3 p-2 text-right">Δ (%, if base&gt;0)</div>
        </div>

        {rows.map((r) => {
          const tone = r.diff > 1e-6 ? 'text-emerald-300' : r.diff < -1e-6 ? 'text-amber-300' : 'text-canon-text-light';
          return (
            <div key={r.axis} className="grid grid-cols-12 border-t border-white/5 bg-black/20 text-[10px] font-mono">
              <div className="col-span-3 p-2 truncate" title={`${r.baseId} → ${r.finalId}`}>
                {onJumpToAtomId ? (
                  <button
                    className="text-left underline decoration-white/20 hover:decoration-white/60"
                    onClick={() => jumpAxis(r)}
                  >
                    {r.axis}
                  </button>
                ) : r.axis}
              </div>
              <div className="col-span-2 p-2 text-right text-canon-accent">{r.base.toFixed(2)}</div>
              <div className="col-span-2 p-2 text-right text-canon-text">{r.prio.toFixed(2)}</div>
              <div className="col-span-2 p-2 text-right text-canon-accent">{r.final.toFixed(2)}</div>
              <div className={`col-span-3 p-2 text-right ${tone}`}> {r.diff >= 0 ? '+' : ''}{r.diff.toFixed(2)}{r.diffPct !== null ? ` (${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(0)}%)` : ''}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[11px] text-canon-text-light/80">
        Примечания: если <span className="font-mono">ctx:final:*</span> отсутствует, берём base. Если base отсутствует, base=0.
      </div>
    </div>
  );
};
