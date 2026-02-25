/**
 * DecisionAnatomyPanel — Q(a) = Σ_g E_g × Δg(a) − cost − 0.4|Q|(1−conf)
 * Every component annotated with ƒ() formula labels.
 */
import React, { useMemo, useState } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';
const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

type Props = { decision: any; atoms: ContextAtom[]; selfId: string; actorLabels?: Record<string, string> };

export const DecisionAnatomyPanel: React.FC<Props> = ({ decision, atoms, selfId, actorLabels = {} }) => {
  const ranked = useMemo(() => arr(decision?.ranked), [decision]);
  const [oi, setOi] = useState(0);
  const lb = (id: string) => actorLabels[id] || id.slice(0, 8);

  const goalEnergy = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of atoms) { const id = String((a as any).id); const pfx = `util:activeGoal:${selfId}:`; if (id.startsWith(pfx)) out[id.slice(pfx.length)] = cl(Number((a as any).magnitude ?? 0)); }
    if (!Object.keys(out).length) for (const a of atoms) { const id = String((a as any).id); if (id.startsWith('goal:domain:') && id.endsWith(`:${selfId}`)) out[id.slice(12, id.length - selfId.length - 1)] = cl(Number((a as any).magnitude ?? 0)); }
    return out;
  }, [atoms, selfId]);

  if (!ranked.length) return <div className="text-slate-600 text-[10px] italic p-2">No decision data. Build world first.</div>;

  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Linear Decision Anatomy</div>
      <Fm>Q(a) = Σ_g ƒ(E_g) × ƒ(Δg) − ƒ(cost) − 0.4|Q|(1−ƒ(conf))</Fm>

      {Object.keys(goalEnergy).length > 0 && (
        <div className="border border-slate-800/30 rounded p-1.5 bg-slate-950/30">
          <div className="text-[8px] text-slate-600 mb-0.5">ƒ(E_g) — active goal energy:</div>
          <div className="flex flex-wrap gap-1">{Object.entries(goalEnergy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, e]) => <span key={g} className="text-[8px] px-1 py-0.5 rounded bg-amber-900/20 border border-amber-800/30"><span className="text-slate-400">{g}</span>=<span className="text-amber-400 font-mono">{e.toFixed(2)}</span></span>)}</div>
        </div>
      )}

      {ranked.map((entry: any, i: number) => {
        const ac = entry?.action || entry;
        const q = Number(entry?.q ?? 0);
        const label = ac?.label || ac?.id || ac?.kind || `#${i}`;
        const kind = ac?.kind || '?';
        const best = i === 0, open = oi === i;
        const dg: Record<string, number> = ac?.deltaGoals || {};
        const cost = Number(ac?.cost ?? 0);
        const conf = cl(Number(ac?.confidence ?? 1));
        const tid = ac?.targetId;

        let qGoal = 0;
        const bd: Array<{ g: string; E: number; d: number; c: number }> = [];
        for (const [g, delta] of Object.entries(dg)) { const E = goalEnergy[g] ?? 0; const c = E * (delta as number); qGoal += c; if (Math.abs(c) > 0.0005) bd.push({ g, E, d: delta as number, c }); }
        bd.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
        const risk = 0.4 * Math.abs(qGoal - cost) * (1 - conf);

        return (
          <div key={i} className={`border rounded ${best ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-slate-800/40 bg-slate-950/20'}`}>
            <button onClick={() => setOi(open ? -1 : i)} className="w-full px-2 py-1 flex items-center gap-2 text-left">
              <span className={`w-4 text-center font-bold ${best ? 'text-emerald-400' : 'text-slate-600'}`}>{i + 1}</span>
              <span className={`flex-1 truncate ${best ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>{label}</span>
              {tid && <span className="text-[8px] text-slate-600">→{lb(tid)}</span>}
              <span className="font-mono text-[9px] text-amber-400">Q={q.toFixed(3)}</span>
              <span className="text-[8px] text-slate-600">{open ? '▼' : '▶'}</span>
            </button>
            {open && (
              <div className="px-2 pb-2 border-t border-slate-800/20 pt-1 space-y-1">
                <Fm>ƒ(kind)="{kind}" | ƒ(cost)={cost.toFixed(3)} | ƒ(conf)={conf.toFixed(2)} | ƒ(risk)={risk.toFixed(3)}</Fm>
                {bd.length > 0 && (
                  <div>
                    <div className="text-[8px] text-slate-600 mb-0.5">ƒ(Σ E × Δ):</div>
                    {bd.slice(0, 6).map(g => <div key={g.g} className="flex items-center gap-1 text-[9px]"><span className="w-14 text-right text-slate-500 truncate">{g.g}</span><span className="text-amber-500 w-8 text-right font-mono">E={g.E.toFixed(2)}</span><span className="text-slate-600">×</span><span className={`w-10 text-right font-mono ${g.d > 0 ? 'text-emerald-400' : 'text-red-400'}`}>Δ={g.d > 0 ? '+' : ''}{g.d.toFixed(2)}</span><span className="text-slate-600">=</span><span className={`font-mono font-bold ${g.c > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{g.c > 0 ? '+' : ''}{g.c.toFixed(3)}</span></div>)}
                    <div className="text-[8px] text-slate-600 mt-0.5">Σ={qGoal.toFixed(3)} − cost={cost.toFixed(3)} − risk={risk.toFixed(3)} = <span className="text-amber-400 font-bold">Q={q.toFixed(3)}</span></div>
                  </div>
                )}
                {Object.keys(dg).length > 0 && <details className="text-[8px]"><summary className="text-slate-600 cursor-pointer">ƒ(Δgoals) full table</summary><div className="mt-1 grid grid-cols-3 gap-1">{Object.entries(dg).sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number)).map(([g, d]) => <span key={g} className={`px-1 rounded ${(d as number) > 0 ? 'bg-emerald-900/20 text-emerald-400' : (d as number) < 0 ? 'bg-red-900/20 text-red-400' : 'text-slate-600'}`}>{g}:{(d as number) > 0 ? '+' : ''}{(d as number).toFixed(2)}</span>)}</div></details>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5">{children}</div>;
