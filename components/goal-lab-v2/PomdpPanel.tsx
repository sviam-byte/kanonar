/**
 * PomdpPanel v2 — POMDP lookahead analysis with SVG state-transition graph.
 *
 * Q_la(a) = Q_now(a) + γ · V*(ẑ₁(a))
 * V*(z) = Σ_g (|E_g|/Σ|E|) · σ(Σ_k proj[g][k]·z[k])
 *
 * Data sources (priority order):
 *   1. pipelineV1.stages[S9].artifacts.transitionSnapshot (full TransitionSnapshotLite)
 *   2. pipelineV1.stages[S8].artifacts.decisionSnapshot.featureVector + lookahead
 *   3. pomdpPipelineV1 (separate POMDP computation)
 *   4. decision.transitionSnapshot (old path, lite — only enabled/gamma/v0)
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

function StateTransitionGraph({ snap, selectedIdx }: { snap: any; selectedIdx: number }) {
  const pa = arr(snap?.perAction);
  if (!pa.length) return null;

  const count = Math.min(pa.length, 5);
  const W = 260;
  const H = Math.min(200, 56 + count * 30);
  const z0X = 30;
  const z0Y = H / 2;
  const actionX = 130;
  const z1X = 230;

  return (
    <svg width={W} height={H} className="w-full bg-slate-900/40 rounded border border-slate-800/30">
      <circle cx={z0X} cy={z0Y} r={16} fill="#0f172a" stroke="#22d3ee" strokeWidth={1.5} />
      <text x={z0X} y={z0Y - 3} textAnchor="middle" fill="#22d3ee" fontSize="8" fontWeight="bold">z₀</text>
      <text x={z0X} y={z0Y + 7} textAnchor="middle" fill="#64748b" fontSize="6">
        V*={Number(snap?.valueFn?.v0 ?? pa[0]?.v0 ?? 0).toFixed(2)}
      </text>

      {pa.slice(0, count).map((ev: any, i: number) => {
        const y = count === 1 ? H / 2 : 24 + i * ((H - 48) / (count - 1));
        const isBest = i === 0;
        const isSelected = i === selectedIdx;
        const actionColor = isBest ? '#34d399' : isSelected ? '#facc15' : '#64748b';
        const v1 = Number(ev.v1 ?? 0);
        const qLa = Number(ev.qLookahead ?? 0);

        return (
          <g key={i}>
            <line
              x1={z0X + 16}
              y1={z0Y}
              x2={actionX - 20}
              y2={y}
              stroke={actionColor}
              strokeWidth={isSelected ? 1.5 : 0.8}
              strokeDasharray={isBest ? undefined : '3,2'}
              opacity={0.7}
            />
            <rect
              x={actionX - 20}
              y={y - 9}
              width={40}
              height={18}
              rx={3}
              fill={isBest ? '#064e3b' : isSelected ? '#422006' : '#1e293b'}
              stroke={actionColor}
              strokeWidth={isSelected ? 1.5 : 0.8}
            />
            <text x={actionX} y={y + 3} textAnchor="middle" fill={actionColor} fontSize="7" fontWeight={isBest ? 'bold' : 'normal'}>
              {(ev.kind || ev.actionId || '?').slice(0, 8)}
            </text>
            <line x1={actionX + 20} y1={y} x2={z1X - 12} y2={y} stroke={actionColor} strokeWidth={isSelected ? 1.5 : 0.8} opacity={0.6} />
            <circle
              cx={z1X}
              cy={y}
              r={10}
              fill="#0f172a"
              stroke={v1 > (snap?.valueFn?.v0 ?? 0) ? '#34d399' : '#ef4444'}
              strokeWidth={isSelected ? 1.5 : 0.8}
            />
            <text x={z1X} y={y + 3} textAnchor="middle" fill={v1 > (snap?.valueFn?.v0 ?? 0) ? '#34d399' : '#ef4444'} fontSize="7">
              {v1.toFixed(2)}
            </text>
            <text x={z1X + 14} y={y + 3} textAnchor="start" fill="#94a3b8" fontSize="6">
              Q={qLa.toFixed(2)}
            </text>
          </g>
        );
      })}

      <text x={W / 2} y={H - 3} textAnchor="middle" fill="#475569" fontSize="6">
        z₀ →[action]→ ẑ₁ | Q_la = Q_now + γ·V*(ẑ₁)
      </text>
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
        return (
          <g key={k}>
            <rect x={x} y={y} width={barW} height={Math.max(1, h)} fill={color} rx={1} opacity={0.8} />
            <text x={x + barW / 2} y={H - 1} textAnchor="middle" fill="#475569" fontSize="5">{k.slice(0, 4)}</text>
          </g>
        );
      })}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#334155" strokeWidth={0.5} />
    </svg>
  );
}

export const PomdpPanel: React.FC<Props> = ({ transitionSnapshot, decision }) => {
  const snap = transitionSnapshot || (decision as any)?.transitionSnapshot;
  const [oi, setOi] = useState(0);

  const dataSource = useMemo(() => {
    if (!snap) return 'none';
    if (snap?.perAction?.length) return snap._pipelineSource ? 'pipelineV1' : 'transitionSnapshot';
    if (snap?.enabled !== undefined && !snap?.perAction) return 'lite-only';
    return 'unknown';
  }, [snap]);

  if (!snap?.perAction?.length) return (
    <div className="text-[10px] p-2 space-y-2">
      <div className="text-slate-500 italic">POMDP lookahead not available.</div>
      <div className="border border-amber-800/40 rounded bg-amber-950/20 p-1.5 space-y-1">
        <div className="text-[9px] text-amber-500 font-bold">🔧 How to enable:</div>
        <div className="text-[8px] text-slate-500">1. Scene preset → set enablePredict = true</div>
        <div className="text-[8px] text-slate-500">2. uiMode = 'console' or 'easy'</div>
        <div className="text-[8px] text-slate-500">3. ≥1 action candidate + z₀ features</div>
        {dataSource === 'lite-only' && (
          <div className="text-[8px] text-yellow-600 mt-1">⚠ decision.transitionSnapshot has only summary. Enable enablePredict in sceneControl.</div>
        )}
      </div>
      <Fm>pomdpPipeline = true when uiMode='easy'|'console' or bottomTab='pomdp'</Fm>
    </div>
  );

  const pa = arr(snap.perAction);
  const z0 = snap.z0?.z || {};
  const gamma = snap.gamma ?? 0;
  const risk = snap.riskAversion ?? 0;
  const v0 = snap.valueFn?.v0 ?? pa[0]?.v0 ?? 0;
  const FS = Object.keys(z0).filter(k => k !== 'base');

  return (
    <div className="space-y-2 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">POMDP Lookahead</div>
      <Fm>Q_la(a) = Q_now(a) + γ·V*(ẑ₁(a))</Fm>
      <Fm>V*(z) = Σ_g (|E_g|/Σ|E|)·σ(Σ_k proj[g][k]·z[k])</Fm>

      <div className="flex gap-3 text-[9px] flex-wrap">
        <span className="text-slate-500">γ=<span className="text-amber-400 font-mono">{gamma.toFixed(2)}</span></span>
        <span className="text-slate-500">risk=<span className="text-rose-400 font-mono">{risk.toFixed(2)}</span></span>
        <span className="text-slate-500">V*(z₀)=<span className="text-cyan-400 font-mono">{Number(v0).toFixed(3)}</span></span>
        <span className="text-slate-600 text-[8px]">src:{dataSource}</span>
      </div>

      <S t="Transition Graph ƒ(z₀→a→ẑ₁)">
        <Fm>Green = best Q_la. Click rows to highlight.</Fm>
        <StateTransitionGraph snap={snap} selectedIdx={oi >= 0 ? oi : 0} />
      </S>

      <S t="State z₀ ƒ(buildFeatureVector)">
        <Fm>Features from final atoms: threat, escape, cover, socialTrust...</Fm>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{FS.map(k => {
          const v = Number(z0[k] ?? 0);
          const dn = k === 'threat' || k === 'stress' || k === 'scarcity' || k === 'fatigue';
          const missing = snap.z0?.missing?.[k];
          return (
            <div key={k} className="flex items-center gap-1">
              <span className={`w-20 text-right text-[9px] ${dn ? 'text-rose-500' : 'text-slate-500'}`}>{k}{missing ? ' ⚠' : ''}</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-[50px]">
                <div className="h-full rounded-full" style={{ width: `${pc(v)}%`, backgroundColor: dn ? '#ef4444' : '#38bdf8' }} />
              </div>
              <span className="text-[8px] font-mono text-slate-600">{v.toFixed(2)}</span>
            </div>
          );
        })}</div>
        {snap.z0?.missing && Object.keys(snap.z0.missing).length > 0 && (
          <div className="text-[8px] text-yellow-600 mt-1">⚠ Missing: {Object.keys(snap.z0.missing).join(', ')} (defaults used)</div>
        )}
      </S>

      <S t="Per-Action Lookahead">
        <Fm>Why this action? Q_now vs Q_la. Δ = value from looking ahead.</Fm>
        {pa.map((ev: any, i: number) => {
          const best = i === 0;
          const open = oi === i;
          const deltas: Record<string, number> = ev.deltas || {};
          return (
            <div key={i} className={`border rounded mb-1 ${best ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-slate-800/40 bg-slate-950/20'}`}>
              <button onClick={() => setOi(open ? -1 : i)} className="w-full px-2 py-1 flex items-center gap-2 text-left">
                <span className={`w-4 font-bold ${best ? 'text-emerald-400' : 'text-slate-600'}`}>{i + 1}</span>
                <span className={`flex-1 truncate ${best ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>{ev.kind || ev.actionId}</span>
                <span className="text-[8px] text-slate-500">Q={Number(ev.qNow ?? 0).toFixed(3)}</span>
                <span className="text-[8px] text-cyan-400 font-mono">Q_la={Number(ev.qLookahead ?? 0).toFixed(3)}</span>
                <span className="text-[8px] text-slate-600">{open ? '▼' : '▶'}</span>
              </button>
              {open && (
                <div className="px-2 pb-2 border-t border-slate-800/20 pt-1 space-y-1">
                  <Fm>Q_la = {Number(ev.qNow ?? 0).toFixed(3)} + {gamma.toFixed(2)}×{Number(ev.v1 ?? 0).toFixed(3)} = {Number(ev.qLookahead ?? 0).toFixed(3)}</Fm>
                  <Fm>Δ={Number(ev.delta ?? 0).toFixed(3)} | V*(z₀)={Number(ev.v0 ?? 0).toFixed(3)} → V*(ẑ₁)={Number(ev.v1 ?? 0).toFixed(3)}</Fm>
                  {FS.length > 0 && <DeltaSparkline deltas={deltas} features={FS} />}
                  <div className="text-[8px] text-slate-600 mb-0.5">Feature deltas:</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{FS.filter(k => Math.abs(deltas[k] ?? 0) > 0.001).map(k => {
                    const d = deltas[k] ?? 0;
                    return (
                      <div key={k} className="flex items-center gap-1 text-[9px]">
                        <span className="w-20 text-right text-slate-500">{k}</span>
                        <span className={`font-mono ${d > 0.01 ? 'text-emerald-400' : d < -0.01 ? 'text-red-400' : 'text-slate-600'}`}>{d > 0 ? '+' : ''}{d.toFixed(3)}</span>
                        <span className="text-[8px] text-slate-700">→{Number(ev.z1?.[k] ?? 0).toFixed(2)}</span>
                      </div>
                    );
                  })}</div>
                  {ev.v1PerGoal && Object.keys(ev.v1PerGoal).length > 0 && (
                    <div>
                      <div className="text-[8px] text-slate-600 mb-0.5">V* per goal:</div>
                      {Object.entries(ev.v1PerGoal).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6).map(([go, v]: any) => {
                        const v0g = ev.v0PerGoal?.[go] ?? 0;
                        const df = v - v0g;
                        return <div key={go} className="flex items-center gap-1 text-[9px]"><span className="w-14 text-right text-slate-500 truncate">{go}</span><span className="text-slate-600">{Number(v0g).toFixed(3)}</span><span className={`font-mono ${df > 0.001 ? 'text-emerald-400' : df < -0.001 ? 'text-red-400' : 'text-slate-600'}`}>→{Number(v).toFixed(3)}</span></div>;
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </S>

      {snap.flipCandidates?.length > 0 && (
        <S t="Decision Fragility">
          <Fm>Which ±0.1 feature shift would flip top action?</Fm>
          {snap.flipCandidates.slice(0, 5).map((f: any, i: number) => (
            <div key={i} className={`text-[9px] flex gap-2 ${f.wouldFlip ? 'text-red-400' : 'text-slate-500'}`}>
              <span className="w-20 text-right">{f.feature}</span>
              <span className="font-mono">ΔQ={Number(f.deltaQ).toFixed(4)}</span>
              {f.wouldFlip && <span className="text-red-500 font-bold">FLIP</span>}
            </div>
          ))}
        </S>
      )}

      {snap.sensitivity && (
        <S t="Sensitivity ∂V*/∂z (top action ẑ₁)">
          <Fm>Partial derivatives of V* w.r.t. each feature at predicted state</Fm>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {Object.entries(snap.sensitivity).sort((a: any, b: any) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8).map(([k, v]: any) => (
              <div key={k} className="flex items-center gap-1 text-[9px]">
                <span className="w-20 text-right text-slate-500">{k}</span>
                <span className={`font-mono ${v > 0.01 ? 'text-emerald-400' : v < -0.01 ? 'text-red-400' : 'text-slate-600'}`}>{v > 0 ? '+' : ''}{Number(v).toFixed(4)}</span>
              </div>
            ))}
          </div>
        </S>
      )}
    </div>
  );
};

const S: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => (
  <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2">
    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t}</div>
    {children}
  </div>
);

const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5 mb-1">{children}</div>
);
