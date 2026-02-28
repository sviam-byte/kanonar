/**
 * PomdpPanel v2.1 — POMDP lookahead analysis (redesigned).
 *
 * Visual improvements:
 * - Default prototype data when no pipeline data available
 * - Cleaner SVG graph with better proportions
 * - Collapsible detail sections to reduce noise
 * - Feature delta bars with labels on hover
 *
 * Q_la(a) = Q_now(a) + γ · V*(ẑ₁(a))
 * V*(z) = Σ_g (|E_g|/Σ|E|) · σ(Σ_k proj[g][k]·z[k])
 */
import React, { useMemo, useState } from 'react';
import { arr } from '../../lib/utils/arr';

const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const pc = (x: number) => Math.round(cl(x) * 100);

type Props = {
  transitionSnapshot: any;
  decision: any;
  actorLabels?: Record<string, string>;
  atoms?: any[];
  selfId?: string;
};

const PROTOTYPE_SNAPSHOT = {
  enabled: true,
  gamma: 0.7,
  riskAversion: 0.3,
  z0: { z: { threat: 0.2, escape: 0.4, cover: 0.6, socialTrust: 0.5, stress: 0.3, autonomy: 0.7 }, missing: {} },
  valueFn: { v0: 0.42, note: 'prototype' },
  perAction: [
    { kind: 'wait_observe', qNow: 0.35, qLookahead: 0.52, delta: 0.17, v0: 0.42, v1: 0.56, z1: { threat: 0.15, escape: 0.45, cover: 0.6, socialTrust: 0.55, stress: 0.25, autonomy: 0.7 }, deltas: { threat: -0.05, escape: 0.05, socialTrust: 0.05, stress: -0.05 } },
    { kind: 'approach_ally', qNow: 0.30, qLookahead: 0.48, delta: 0.18, v0: 0.42, v1: 0.50, z1: { threat: 0.18, escape: 0.35, cover: 0.5, socialTrust: 0.65, stress: 0.2, autonomy: 0.6 }, deltas: { threat: -0.02, socialTrust: 0.15, stress: -0.1, autonomy: -0.1 } },
    { kind: 'flee_cover', qNow: 0.25, qLookahead: 0.38, delta: 0.13, v0: 0.42, v1: 0.44, z1: { threat: 0.1, escape: 0.7, cover: 0.8, socialTrust: 0.3, stress: 0.35, autonomy: 0.8 }, deltas: { threat: -0.1, escape: 0.3, cover: 0.2, socialTrust: -0.2, stress: 0.05, autonomy: 0.1 } },
  ],
  flipCandidates: [{ feature: 'threat', deltaQ: -0.08, wouldFlip: false }, { feature: 'socialTrust', deltaQ: 0.06, wouldFlip: false }],
  sensitivity: { threat: -0.32, escape: 0.18, cover: 0.12, socialTrust: 0.28, stress: -0.15, autonomy: 0.09 },
  _isPrototype: true,
};

function StateTransitionGraph({ snap, selectedIdx }: { snap: any; selectedIdx: number }) {
  const pa = arr(snap?.perAction);
  if (!pa.length) return null;
  const count = Math.min(pa.length, 5);
  const W = 280;
  const H = Math.min(180, 50 + count * 28);
  const z0X = 35;
  const z0Y = H / 2;
  const actionX = 140;
  const z1X = 245;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-slate-900/30 rounded border border-slate-800/20">
      <circle cx={z0X} cy={z0Y} r={18} fill="#0f172a" stroke="#22d3ee" strokeWidth={1.2} />
      <text x={z0X} y={z0Y - 4} textAnchor="middle" fill="#22d3ee" fontSize="9" fontWeight="bold">z₀</text>
      <text x={z0X} y={z0Y + 6} textAnchor="middle" fill="#64748b" fontSize="6">V*={Number(snap?.valueFn?.v0 ?? pa[0]?.v0 ?? 0).toFixed(2)}</text>
      {pa.slice(0, count).map((ev: any, i: number) => {
        const y = count === 1 ? H / 2 : 22 + i * ((H - 44) / (count - 1));
        const isBest = i === 0;
        const isSelected = i === selectedIdx;
        const actionColor = isBest ? '#34d399' : isSelected ? '#facc15' : '#64748b';
        const v1 = Number(ev.v1 ?? 0);
        return (
          <g key={i}>
            <line x1={z0X + 18} y1={z0Y} x2={actionX - 22} y2={y} stroke={actionColor} strokeWidth={isSelected ? 1.5 : 0.7} strokeDasharray={isBest ? undefined : '3,2'} opacity={0.6} />
            <rect x={actionX - 24} y={y - 10} width={48} height={20} rx={3} fill={isBest ? '#064e3b' : isSelected ? '#422006' : '#1e293b'} stroke={actionColor} strokeWidth={isSelected ? 1.2 : 0.7} />
            <text x={actionX} y={y + 3} textAnchor="middle" fill={actionColor} fontSize="7.5" fontWeight={isBest ? 'bold' : 'normal'}>{(ev.kind || ev.actionId || '?').slice(0, 10)}</text>
            <line x1={actionX + 24} y1={y} x2={z1X - 14} y2={y} stroke={actionColor} strokeWidth={isSelected ? 1.2 : 0.6} opacity={0.5} />
            <circle cx={z1X} cy={y} r={12} fill="#0f172a" stroke={v1 > (snap?.valueFn?.v0 ?? 0) ? '#34d399' : '#ef4444'} strokeWidth={isSelected ? 1.2 : 0.7} />
            <text x={z1X} y={y + 3} textAnchor="middle" fill={v1 > (snap?.valueFn?.v0 ?? 0) ? '#34d399' : '#ef4444'} fontSize="7.5">{v1.toFixed(2)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DeltaSparkline({ deltas, features }: { deltas: Record<string, number>; features: string[] }) {
  const W = 240;
  const H = 28;
  const filtered = features.filter(k => Math.abs(deltas[k] ?? 0) > 0.001);
  if (!filtered.length) return null;
  const barW = Math.min(20, (W - 10) / filtered.length);
  const maxAbs = Math.max(0.01, ...filtered.map(k => Math.abs(deltas[k] ?? 0)));
  return (
    <svg width={W} height={H} className="w-full">
      {filtered.map((k, i) => {
        const d = deltas[k] ?? 0;
        const h = (Math.abs(d) / maxAbs) * (H / 2 - 2);
        const y = d >= 0 ? H / 2 - h : H / 2;
        const color = d > 0.01 ? '#34d399' : d < -0.01 ? '#ef4444' : '#64748b';
        const x = 2 + i * (barW + 2);
        return <g key={k}><rect x={x} y={y} width={barW} height={Math.max(1, h)} fill={color} rx={1} opacity={0.8} /><text x={x + barW / 2} y={H - 1} textAnchor="middle" fill="#475569" fontSize="5">{k.slice(0, 4)}</text></g>;
      })}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#334155" strokeWidth={0.5} />
    </svg>
  );
}

export const PomdpPanel: React.FC<Props> = ({ transitionSnapshot, decision }) => {
  const rawSnap = transitionSnapshot || (decision as any)?.transitionSnapshot;
  const isPrototype = !rawSnap?.perAction?.length;
  const snap = isPrototype ? PROTOTYPE_SNAPSHOT : rawSnap;
  const [oi, setOi] = useState(0);
  const [showZ0, setShowZ0] = useState(false);

  const dataSource = useMemo(() => {
    if (isPrototype) return 'prototype';
    if (snap?.perAction?.length) return snap._pipelineSource ? 'pipelineV1' : 'transitionSnapshot';
    if (snap?.enabled !== undefined && !snap?.perAction) return 'lite-only';
    return 'unknown';
  }, [snap, isPrototype]);

  const pa = arr(snap.perAction);
  const z0 = snap.z0?.z || {};
  const gamma = snap.gamma ?? 0;
  const risk = snap.riskAversion ?? 0;
  const v0 = snap.valueFn?.v0 ?? pa[0]?.v0 ?? 0;
  const FS = Object.keys({ ...z0, ...(pa[0]?.z1 || {}), ...(pa[0]?.deltas || {}) });

  return (
    <div className="space-y-2 text-[10px]">
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">POMDP Lookahead</div>
        {isPrototype && <span className="text-[8px] px-1.5 py-0.5 bg-amber-900/20 border border-amber-700/30 rounded text-amber-500">Prototype — enable in Scene Setup</span>}
      </div>
      <Fm>Q_la(a) = Q_now + γ·V*(ẑ₁)</Fm>
      <div className="flex gap-2 text-[9px] flex-wrap">
        <span className="text-slate-500">γ <span className="text-amber-400 font-mono">{gamma.toFixed(2)}</span></span>
        <span className="text-slate-500">ρ <span className="text-rose-400 font-mono">{risk.toFixed(2)}</span></span>
        <span className="text-slate-500">V* <span className="text-cyan-400 font-mono">{Number(v0).toFixed(3)}</span></span>
        <span className="text-slate-700 text-[7px]">{dataSource}</span>
      </div>
      <S t="Transition Graph"><StateTransitionGraph snap={snap} selectedIdx={oi >= 0 ? oi : 0} /></S>
      <div className="border border-slate-800/40 rounded bg-slate-950/40">
        <button onClick={() => setShowZ0(p => !p)} className="w-full px-2 py-1 flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300"><span>State z₀ ({FS.length} features)</span><span className="text-[7px] opacity-50">{showZ0 ? '▼' : '▶'}</span></button>
        {showZ0 && <div className="px-2 pb-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">{FS.map(k => { const v = Number(z0[k] ?? 0); const dn = k === 'threat' || k === 'stress' || k === 'scarcity' || k === 'fatigue'; return <div key={k} className="flex items-center gap-1"><span className={`w-16 text-right text-[9px] ${dn ? 'text-rose-500' : 'text-slate-500'}`}>{k}</span><div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-[50px]"><div className="h-full rounded-full" style={{ width: `${pc(v)}%`, backgroundColor: dn ? '#ef4444' : '#38bdf8' }} /></div><span className="text-[8px] font-mono text-slate-600">{v.toFixed(2)}</span></div>; })}</div>}
      </div>
      <S t="Per-Action Lookahead">
        {pa.map((ev: any, i: number) => {
          const best = i === 0;
          const open = oi === i;
          const deltas: Record<string, number> = ev.deltas || {};
          return (
            <div key={i} className={`border rounded mb-1 ${best ? 'border-emerald-700/30 bg-emerald-950/10' : 'border-slate-800/30 bg-slate-950/20'}`}>
              <button onClick={() => setOi(open ? -1 : i)} className="w-full px-2 py-1 flex items-center gap-2 text-left">
                <span className={`w-3 font-bold text-[9px] ${best ? 'text-emerald-400' : 'text-slate-600'}`}>{i + 1}</span>
                <span className={`flex-1 truncate text-[9px] ${best ? 'text-emerald-300 font-semibold' : 'text-slate-300'}`}>{ev.kind || ev.actionId}</span>
                <span className="text-[8px] text-slate-500">{Number(ev.qNow ?? 0).toFixed(2)}</span><span className="text-[7px] text-slate-700">→</span><span className="text-[8px] text-cyan-400 font-mono">{Number(ev.qLookahead ?? 0).toFixed(2)}</span><span className="text-[7px] text-slate-700">{open ? '▼' : '▶'}</span>
              </button>
              {open && <div className="px-2 pb-1.5 border-t border-slate-800/20 pt-1 space-y-1"><div className="text-[8px] text-slate-600">Q = {Number(ev.qNow ?? 0).toFixed(3)} + {gamma.toFixed(2)}×{Number(ev.v1 ?? 0).toFixed(3)} = <span className="text-cyan-400">{Number(ev.qLookahead ?? 0).toFixed(3)}</span></div>{FS.length > 0 && <DeltaSparkline deltas={deltas} features={FS} />}</div>}
            </div>
          );
        })}
      </S>
      {snap.flipCandidates?.length > 0 && <S t="Fragility">{snap.flipCandidates.slice(0, 5).map((f: any, i: number) => <div key={i} className={`text-[9px] flex items-center gap-2 ${f.wouldFlip ? 'text-red-400' : 'text-slate-500'}`}><span className="w-16 text-right">{f.feature}</span><span className="font-mono text-[8px]">ΔQ={Number(f.deltaQ).toFixed(4)}</span>{f.wouldFlip && <span className="text-red-500 font-bold">FLIP</span>}</div>)}</S>}
      {snap.sensitivity && <S t="Sensitivity ∂V*/∂z"><div className="grid grid-cols-2 gap-x-2 gap-y-0.5">{Object.entries(snap.sensitivity).sort((a: any, b: any) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8).map(([k, v]: any) => <div key={k} className="flex items-center gap-1 text-[9px]"><span className="w-14 text-right text-slate-500">{k}</span><span className={`font-mono text-[8px] ${v > 0.01 ? 'text-emerald-400' : v < -0.01 ? 'text-red-400' : 'text-slate-600'}`}>{v > 0 ? '+' : ''}{Number(v).toFixed(3)}</span></div>)}</div></S>}
    </div>
  );
};

const S: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => (
  <div className="border border-slate-800/30 rounded bg-slate-950/30 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t}</div>{children}</div>
);

const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[8px] text-cyan-700/70 font-mono bg-cyan-950/10 border border-cyan-900/15 rounded px-1.5 py-0.5 mb-1">{children}</div>
);
