/**
 * PomdpPanel — POMDP lookahead analysis.
 * Q_la(a) = Q_now(a) + γ · V*(ẑ₁(a))
 * V*(z) = Σ_g (|E_g|/Σ|E|) · σ(Σ_k proj[g][k]·z[k])
 * Data: decision.transitionSnapshot (TransitionSnapshotLite)
 */
import React, { useState } from 'react';
import { arr } from '../../lib/utils/arr';
const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const pc = (x: number) => Math.round(cl(x) * 100);

type Props = { transitionSnapshot: any; decision: any; actorLabels?: Record<string, string> };

export const PomdpPanel: React.FC<Props> = ({ transitionSnapshot, decision }) => {
  const snap = transitionSnapshot || (decision as any)?.transitionSnapshot;
  const [oi, setOi] = useState(0);

  if (!snap?.perAction?.length) return (
    <div className="text-[10px] p-2 space-y-2">
      <div className="text-slate-500 italic">POMDP lookahead not available.</div>
      <Fm>Enable: sceneControl.enablePredict = true</Fm>
      <div className="text-[8px] text-slate-600 space-y-0.5">
        <div>Engine needs: pomdpPipeline = true (uiMode='easy' | 'console' or bottomTab='pomdp')</div>
        <div>Requires ≥1 action candidate + feature vector z₀</div>
      </div>
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
      <div className="flex gap-3 text-[9px]">
        <span className="text-slate-500">γ=<span className="text-amber-400 font-mono">{gamma.toFixed(2)}</span></span>
        <span className="text-slate-500">risk=<span className="text-rose-400 font-mono">{risk.toFixed(2)}</span></span>
        <span className="text-slate-500">V*(z₀)=<span className="text-cyan-400 font-mono">{Number(v0).toFixed(3)}</span></span>
      </div>

      <S t="State z₀ ƒ(buildFeatureVector)">
        <Fm>Features from final atoms: threat, escape, cover, socialTrust...</Fm>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{FS.map(k => {
          const v = Number(z0[k] ?? 0); const dn = k === 'threat' || k === 'stress' || k === 'scarcity' || k === 'fatigue';
          return <div key={k} className="flex items-center gap-1"><span className={`w-20 text-right text-[9px] ${dn ? 'text-rose-500' : 'text-slate-500'}`}>{k}</span><div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-[50px]"><div className="h-full rounded-full" style={{ width: `${pc(v)}%`, backgroundColor: dn ? '#ef4444' : '#38bdf8' }} /></div><span className="text-[8px] font-mono text-slate-600">{v.toFixed(2)}</span></div>;
        })}</div>
      </S>

      <S t="Per-Action Lookahead">
        <Fm>Why this action? Q_now vs Q_la. Δ = value from looking ahead.</Fm>
        {pa.map((ev: any, i: number) => {
          const best = i === 0, open = oi === i;
          const deltas: Record<string, number> = ev.deltas || {};
          return (
            <div key={i} className={`border rounded mb-1 ${best ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-slate-800/40 bg-slate-950/20'}`}>
              <button onClick={() => setOi(open ? -1 : i)} className="w-full px-2 py-1 flex items-center gap-2 text-left">
                <span className={`w-4 font-bold ${best ? 'text-emerald-400' : 'text-slate-600'}`}>{i + 1}</span>
                <span className={`flex-1 truncate ${best ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>{ev.kind || ev.actionId}</span>
                <span className="text-[8px] text-slate-500">Q_now={Number(ev.qNow ?? 0).toFixed(3)}</span>
                <span className="text-[8px] text-cyan-400 font-mono">Q_la={Number(ev.qLookahead ?? 0).toFixed(3)}</span>
                <span className="text-[8px] text-slate-600">{open ? '▼' : '▶'}</span>
              </button>
              {open && (
                <div className="px-2 pb-2 border-t border-slate-800/20 pt-1 space-y-1">
                  <Fm>Q_la = {Number(ev.qNow ?? 0).toFixed(3)} + {gamma.toFixed(2)}×{Number(ev.v1 ?? 0).toFixed(3)} = {Number(ev.qLookahead ?? 0).toFixed(3)}</Fm>
                  <Fm>Δ={Number(ev.delta ?? 0).toFixed(3)} | V*(z₀)={Number(ev.v0 ?? 0).toFixed(3)} → V*(ẑ₁)={Number(ev.v1 ?? 0).toFixed(3)}</Fm>
                  <div className="text-[8px] text-slate-600 mb-0.5">Feature deltas (predicted):</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{FS.filter(k => Math.abs(deltas[k] ?? 0) > 0.001).map(k => {
                    const d = deltas[k] ?? 0;
                    return <div key={k} className="flex items-center gap-1 text-[9px]"><span className="w-20 text-right text-slate-500">{k}</span><span className={`font-mono ${d > 0.01 ? 'text-emerald-400' : d < -0.01 ? 'text-red-400' : 'text-slate-600'}`}>{d > 0 ? '+' : ''}{d.toFixed(3)}</span><span className="text-[8px] text-slate-700">→{Number(ev.z1?.[k] ?? 0).toFixed(2)}</span></div>;
                  })}</div>
                  {ev.v1PerGoal && Object.keys(ev.v1PerGoal).length > 0 && (
                    <div>
                      <div className="text-[8px] text-slate-600 mb-0.5">V* per goal contribution:</div>
                      {Object.entries(ev.v1PerGoal).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6).map(([go, v]: any) => {
                        const v0g = ev.v0PerGoal?.[go] ?? 0, df = v - v0g;
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
          {snap.flipCandidates.slice(0, 5).map((f: any, i: number) => <div key={i} className={`text-[9px] flex gap-2 ${f.wouldFlip ? 'text-red-400' : 'text-slate-500'}`}><span className="w-20 text-right">{f.feature}</span><span className="font-mono">ΔQ={Number(f.deltaQ).toFixed(4)}</span>{f.wouldFlip && <span className="text-red-500 font-bold">FLIP</span>}</div>)}
        </S>
      )}
    </div>
  );
};
const S: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t}</div>{children}</div>;
const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5 mb-1">{children}</div>;
