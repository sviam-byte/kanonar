/**
 * DecisionAnatomyPanel — LINEAR action decision anatomy.
 *
 * Q(a) = Σ_g E_g × Δg(a) − cost(a) − 0.4 × |Q_raw| × (1 − conf)
 *
 * Every number has a ƒ() annotation showing where it comes from.
 *   ƒ(kind)      — action type from possibilities catalog
 *   ƒ(E_g)       — goal energy from util:activeGoal atoms
 *   ƒ(Δg)        — delta-goals from actionProjection + possibility hints
 *   ƒ(cost)      — action cost from possibility metadata
 *   ƒ(conf)      — feasibility from possibility + context
 *   ƒ(support)   — atoms that justify this action candidate
 *   ƒ(target)    — action target (other agent or node)
 */

import React, { useMemo, useState } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

function cl(x: number) { return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)); }
function pct(x: number) { return Math.round(cl(x) * 100); }

type Props = {
  decision: any;
  atoms: ContextAtom[];
  selfId: string;
  actorLabels?: Record<string, string>;
};

export const DecisionAnatomyPanel: React.FC<Props> = ({ decision, atoms, selfId, actorLabels = {} }) => {
  const ranked = useMemo(() => arr(decision?.ranked), [decision]);
  const [openIdx, setOpenIdx] = useState(0);
  const lbl = (id: string) => actorLabels[id] || id.slice(0, 8);

  // Reconstruct goalEnergy from atoms
  const goalEnergy = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of atoms) {
      const id = String((a as any).id);
      const pfx = `util:activeGoal:${selfId}:`;
      if (id.startsWith(pfx)) out[id.slice(pfx.length)] = cl(Number((a as any).magnitude ?? 0));
    }
    if (!Object.keys(out).length) {
      for (const a of atoms) {
        const id = String((a as any).id);
        if (id.startsWith('goal:domain:') && id.endsWith(`:${selfId}`))
          out[id.slice(12, id.length - selfId.length - 1)] = cl(Number((a as any).magnitude ?? 0));
      }
    }
    return out;
  }, [atoms, selfId]);

  if (!ranked.length) return (
    <div className="text-slate-600 text-[10px] italic p-2">
      No decision. Need ≥1 character + world built.
    </div>
  );

  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Linear Decision</div>
      <F>Q(a) = Σ<sub>g</sub> ƒ(E_g) × ƒ(Δg) − ƒ(cost) − 0.4|Q|(1−ƒ(conf))</F>

      {/* Goal energy */}
      {Object.keys(goalEnergy).length > 0 && (
        <div className="border border-slate-800/30 rounded p-1.5 bg-slate-950/30">
          <div className="text-[8px] text-slate-600 mb-0.5">ƒ(E_g) — active goal energy (from util:activeGoal atoms):</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(goalEnergy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, e]) => (
              <span key={g} className="text-[8px] px-1 py-0.5 rounded bg-amber-900/20 border border-amber-800/30">
                <span className="text-slate-400">{g}</span>=<span className="text-amber-400 font-mono">{e.toFixed(2)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {ranked.map((entry: any, i: number) => {
        const action = entry?.action || entry;
        const q = Number(entry?.q ?? 0);
        const label = action?.label || action?.id || action?.kind || `#${i}`;
        const kind = action?.kind || '?';
        const isBest = i === 0;
        const isOpen = openIdx === i;
        const dg: Record<string, number> = action?.deltaGoals || {};
        const cost = Number(action?.cost ?? 0);
        const conf = cl(Number(action?.confidence ?? 1));
        const targetId = action?.targetId;
        const supportAtoms: ContextAtom[] = arr(action?.supportAtoms);

        // Recompute Q breakdown
        let qGoal = 0;
        const breakdown: Array<{ goal: string; E: number; delta: number; c: number }> = [];
        for (const [g, delta] of Object.entries(dg)) {
          const E = goalEnergy[g] ?? 0;
          const c = E * (delta as number);
          qGoal += c;
          if (Math.abs(c) > 0.0005) breakdown.push({ goal: g, E, delta: delta as number, c });
        }
        breakdown.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
        const risk = 0.4 * Math.abs(qGoal - cost) * (1 - conf);

        return (
          <div key={i} className={`border rounded ${isBest ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-slate-800/40 bg-slate-950/20'}`}>
            <button onClick={() => setOpenIdx(isOpen ? -1 : i)} className="w-full px-2 py-1 flex items-center gap-2 text-left">
              <span className={`w-4 text-center font-bold ${isBest ? 'text-emerald-400' : 'text-slate-600'}`}>{i + 1}</span>
              <span className={`flex-1 truncate ${isBest ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>{label}</span>
              {targetId && <span className="text-[8px] text-slate-600">→{lbl(targetId)}</span>}
              <span className="font-mono text-[9px] text-amber-400">Q={q.toFixed(3)}</span>
              <span className="text-[8px] text-slate-600">{isOpen ? '▼' : '▶'}</span>
            </button>

            {isOpen && (
              <div className="px-2 pb-2 border-t border-slate-800/20 pt-1 space-y-1">
                <F>
                  ƒ(kind)="{kind}" | ƒ(cost)={cost.toFixed(3)} | ƒ(conf)={conf.toFixed(2)} | ƒ(risk)={risk.toFixed(3)}
                </F>

                {/* Goal contributions */}
                {breakdown.length > 0 && (
                  <div>
                    <div className="text-[8px] text-slate-600 mb-0.5">ƒ(Σ E × Δ) — goal contributions:</div>
                    {breakdown.slice(0, 6).map(g => (
                      <div key={g.goal} className="flex items-center gap-1 text-[9px]">
                        <span className="w-14 text-right text-slate-500 truncate">{g.goal}</span>
                        <span className="text-amber-500 w-8 text-right font-mono">E={g.E.toFixed(2)}</span>
                        <span className="text-slate-600">×</span>
                        <span className={`w-10 text-right font-mono ${g.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          Δ={g.delta > 0 ? '+' : ''}{g.delta.toFixed(2)}
                        </span>
                        <span className="text-slate-600">=</span>
                        <span className={`font-mono font-bold ${g.c > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {g.c > 0 ? '+' : ''}{g.c.toFixed(3)}
                        </span>
                      </div>
                    ))}
                    <div className="text-[8px] text-slate-600 mt-0.5">
                      Σ={qGoal.toFixed(3)} − ƒ(cost)={cost.toFixed(3)} − ƒ(risk)={risk.toFixed(3)} = <span className="text-amber-400 font-bold">Q={q.toFixed(3)}</span>
                    </div>
                  </div>
                )}

                {/* Support atoms */}
                {supportAtoms.length > 0 && (
                  <div>
                    <div className="text-[8px] text-slate-600 mb-0.5">ƒ(supportAtoms) — {supportAtoms.length} justify this:</div>
                    <div className="flex flex-wrap gap-1">
                      {supportAtoms.slice(0, 8).map((sa, j) => (
                        <span key={j} className="text-[7px] px-1 py-0.5 rounded bg-slate-800/50 truncate max-w-[120px]">
                          {String((sa as any).id)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Δg table */}
                {Object.keys(dg).length > 0 && (
                  <details className="text-[8px]">
                    <summary className="text-slate-600 cursor-pointer hover:text-slate-400">ƒ(deltaGoals) full table</summary>
                    <div className="mt-1 grid grid-cols-3 gap-1">
                      {Object.entries(dg).sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number)).map(([g, d]) => (
                        <span key={g} className={`px-1 rounded ${(d as number) > 0 ? 'bg-emerald-900/20 text-emerald-400' : (d as number) < 0 ? 'bg-red-900/20 text-red-400' : 'text-slate-600'}`}>
                          {g}:{(d as number) > 0 ? '+' : ''}{(d as number).toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}

      {decision?.debug && (
        <details className="text-[8px] border border-slate-800/20 rounded p-1">
          <summary className="text-slate-600 cursor-pointer">ƒ(debug) raw</summary>
          <pre className="mt-1 text-slate-500 overflow-x-auto max-h-[100px]">{JSON.stringify(decision.debug, null, 1)}</pre>
        </details>
      )}
    </div>
  );
};

const F: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5">{children}</div>
);
