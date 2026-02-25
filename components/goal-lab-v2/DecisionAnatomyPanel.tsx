/**
 * DecisionAnatomyPanel v2 — Q(a) = Σ_g E_g × Δg(a) − cost − 0.4|Q|(1−conf)
 *
 * NEW: SVG waterfall chart showing Q decomposition per action.
 * Every component annotated with ƒ() formula labels.
 *
 * Data: decision.ranked[] from pipeline S8 artifacts (via GoalLabShell).
 */
import React, { useMemo, useState } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

type Props = { decision: any; atoms: ContextAtom[]; selfId: string; actorLabels?: Record<string, string> };

function QWaterfallChart({ breakdown, cost, risk, q }: { breakdown: Array<{ g: string; E: number; d: number; c: number }>; cost: number; risk: number; q: number }) {
  const items = breakdown.slice(0, 5);
  if (!items.length) return null;

  type Seg = { label: string; value: number; cumStart: number; cumEnd: number; color: string };
  const segs: Seg[] = [];
  let cum = 0;

  for (const b of items) {
    segs.push({ label: b.g.slice(0, 8), value: b.c, cumStart: cum, cumEnd: cum + b.c, color: b.c >= 0 ? '#34d399' : '#ef4444' });
    cum += b.c;
  }
  if (Math.abs(cost) > 0.001) {
    segs.push({ label: '-cost', value: -cost, cumStart: cum, cumEnd: cum - cost, color: '#f59e0b' });
    cum -= cost;
  }
  if (Math.abs(risk) > 0.001) {
    segs.push({ label: '-risk', value: -risk, cumStart: cum, cumEnd: cum - risk, color: '#ef4444' });
    cum -= risk;
  }

  if (!segs.length) return null;

  const W = 240;
  const H = 60;
  const pad = 30;
  const allVals = segs.flatMap(s => [s.cumStart, s.cumEnd]);
  const mn = Math.min(0, ...allVals);
  const mx = Math.max(0.01, ...allVals);
  const range = mx - mn || 0.01;
  const toX = (v: number) => pad + ((v - mn) / range) * (W - 2 * pad);
  const barH = Math.min(10, (H - 16) / segs.length);

  return (
    <svg width={W} height={H} className="w-full bg-slate-900/40 rounded border border-slate-800/30">
      <line x1={toX(0)} y1={2} x2={toX(0)} y2={H - 14} stroke="#475569" strokeWidth={0.5} strokeDasharray="2" />
      {segs.map((s, i) => {
        const y = 4 + i * (barH + 2);
        const x1 = toX(Math.min(s.cumStart, s.cumEnd));
        const x2 = toX(Math.max(s.cumStart, s.cumEnd));
        return (
          <g key={i}>
            <rect x={x1} y={y} width={Math.max(1, x2 - x1)} height={barH} fill={s.color} rx={1} opacity={0.8} />
            <text x={2} y={y + barH - 1} fill="#94a3b8" fontSize="6" textAnchor="start">{s.label}</text>
            <text x={x2 + 2} y={y + barH - 1} fill="#64748b" fontSize="5">{s.value > 0 ? '+' : ''}{s.value.toFixed(3)}</text>
          </g>
        );
      })}
      <text x={W / 2} y={H - 3} textAnchor="middle" fill="#f59e0b" fontSize="7" fontWeight="bold">Q = {q.toFixed(3)}</text>
    </svg>
  );
}

function ActionRankingChart({ ranked }: { ranked: Array<{ label: string; q: number }> }) {
  if (!ranked.length) return null;

  const W = 240;
  const H = Math.min(80, 12 + ranked.length * 14);
  const maxQ = Math.max(0.01, ...ranked.map(r => Math.abs(r.q)));
  const pad = 60;

  return (
    <svg width={W} height={H} className="w-full bg-slate-900/40 rounded border border-slate-800/30 mb-1">
      {ranked.map((r, i) => {
        const y = 4 + i * 14;
        const barW = (Math.abs(r.q) / maxQ) * (W - pad - 30);
        const isPos = r.q >= 0;
        return (
          <g key={i}>
            <text x={pad - 2} y={y + 9} textAnchor="end" fill={i === 0 ? '#34d399' : '#94a3b8'} fontSize="7" fontWeight={i === 0 ? 'bold' : 'normal'}>{r.label.slice(0, 10)}</text>
            <rect x={pad} y={y + 1} width={Math.max(2, barW)} height={10} rx={2} fill={i === 0 ? '#34d399' : isPos ? '#38bdf8' : '#ef4444'} opacity={i === 0 ? 0.9 : 0.5} />
            <text x={pad + Math.max(2, barW) + 3} y={y + 9} fill="#64748b" fontSize="6">{r.q.toFixed(3)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const DecisionAnatomyPanel: React.FC<Props> = ({ decision, atoms, selfId }) => {
  const ranked = useMemo(() => arr(decision?.ranked), [decision]);
  const [oi, setOi] = useState(0);

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
        if (id.startsWith('goal:domain:') && id.endsWith(`:${selfId}`)) out[id.slice(12, id.length - selfId.length - 1)] = cl(Number((a as any).magnitude ?? 0));
      }
    }
    return out;
  }, [atoms, selfId]);

  const chartData = useMemo(
    () => ranked.slice(0, 5).map((entry: any) => {
      const ac = entry?.action || entry;
      return { label: ac?.label || ac?.kind || '?', q: Number(entry?.q ?? 0) };
    }),
    [ranked]
  );

  if (!ranked.length) return <div className="text-slate-600 text-[10px] italic p-2">No decision data. Build world first.</div>;

  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Decision Anatomy</div>
      <Fm>Q(a) = Σ_g ƒ(E_g) × ƒ(Δg) − ƒ(cost) − 0.4|Q|(1−ƒ(conf))</Fm>
      <ActionRankingChart ranked={chartData} />

      {Object.keys(goalEnergy).length > 0 && (
        <div className="border border-slate-800/30 rounded p-1.5 bg-slate-950/30">
          <div className="text-[8px] text-slate-600 mb-0.5">ƒ(E_g) — active goal energy:</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {Object.entries(goalEnergy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, e]) => (
              <span key={g} className="text-[8px] text-slate-500">{g}: <span className="text-amber-400 font-mono">{e.toFixed(2)}</span></span>
            ))}
          </div>
        </div>
      )}

      {ranked.slice(0, 6).map((entry: any, i: number) => {
        const ac = entry?.action || entry;
        const kind = ac?.kind || 'action';
        const q = Number(entry?.q ?? 0);
        const cost = Number(ac?.cost ?? 0);
        const conf = cl(Number(ac?.confidence ?? ac?.conf ?? 1));
        const dg: Record<string, number> = ac?.goalDeltas || ac?.deltaByGoal || {};

        let qGoal = 0;
        const bd: Array<{ g: string; E: number; d: number; c: number }> = [];
        for (const [g, delta] of Object.entries(dg)) {
          const E = goalEnergy[g] ?? 0;
          const c = E * (delta as number);
          qGoal += c;
          if (Math.abs(c) > 0.0005) bd.push({ g, E, d: delta as number, c });
        }
        bd.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
        const risk = 0.4 * Math.abs(qGoal - cost) * (1 - conf);
        const open = oi === i;
        const best = i === 0;

        return (
          <div key={i} className={`border rounded ${best ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-slate-800/40 bg-slate-950/20'}`}>
            <button onClick={() => setOi(open ? -1 : i)} className="w-full px-2 py-1 flex items-center gap-1 text-left">
              <span className={`w-4 font-bold ${best ? 'text-emerald-400' : 'text-slate-600'}`}>{i + 1}</span>
              <span className={`flex-1 truncate ${best ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>{ac?.label || kind}</span>
              <span className="text-[8px] text-amber-400 font-mono">Q={q.toFixed(3)}</span>
              <span className="text-[8px] text-slate-600">{open ? '▼' : '▶'}</span>
            </button>
            {open && (
              <div className="px-2 pb-2 border-t border-slate-800/20 pt-1 space-y-1">
                <Fm>ƒ(kind)="{kind}" | ƒ(cost)={cost.toFixed(3)} | ƒ(conf)={conf.toFixed(2)} | ƒ(risk)={risk.toFixed(3)}</Fm>
                {bd.length > 0 && <QWaterfallChart breakdown={bd} cost={cost} risk={risk} q={q} />}
                {bd.length > 0 && (
                  <div>
                    <div className="text-[8px] text-slate-600 mb-0.5">ƒ(Σ E × Δ):</div>
                    {bd.slice(0, 6).map(g => (
                      <div key={g.g} className="flex items-center gap-1 text-[9px]">
                        <span className="w-14 text-right text-slate-500 truncate">{g.g}</span>
                        <span className="text-amber-500 w-8 text-right font-mono">E={g.E.toFixed(2)}</span>
                        <span className="text-slate-600">×</span>
                        <span className={`w-10 text-right font-mono ${g.d > 0 ? 'text-emerald-400' : 'text-red-400'}`}>Δ={g.d > 0 ? '+' : ''}{g.d.toFixed(2)}</span>
                        <span className="text-slate-600">=</span>
                        <span className={`font-mono font-bold ${g.c > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{g.c > 0 ? '+' : ''}{g.c.toFixed(3)}</span>
                      </div>
                    ))}
                    <div className="text-[8px] text-slate-600 mt-0.5">Σ={qGoal.toFixed(3)} − cost={cost.toFixed(3)} − risk={risk.toFixed(3)} = <span className="text-amber-400 font-bold">Q={q.toFixed(3)}</span></div>
                  </div>
                )}
                {Object.keys(dg).length > 0 && (
                  <details className="text-[8px]">
                    <summary className="text-slate-600 cursor-pointer">ƒ(Δgoals) full table</summary>
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
    </div>
  );
};

const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5">{children}</div>
);
