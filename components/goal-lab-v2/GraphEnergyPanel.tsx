/**
 * GraphEnergyPanel — atom graph + signal field + energy propagation.
 * Data: engine.goalPreview.debug = { atomGraph, signalField, energy }
 */
import React, { useMemo } from 'react';
import { arr } from '../../lib/utils/arr';
const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const pc = (x: number) => Math.round(cl(x) * 100);

type Props = { goalPreview: any; atoms: any[]; selfId: string };

export const GraphEnergyPanel: React.FC<Props> = ({ goalPreview, atoms }) => {
  const d = goalPreview?.debug;
  const g = d?.atomGraph, sf = d?.signalField, en = d?.energy;
  const nsDist = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of arr(atoms)) { const ns = String((a as any).ns || String((a as any).id || '').split(':')[0] || '?'); m[ns] = (m[ns] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [atoms]);

  if (!d) return <div className="text-slate-600 text-[10px] italic p-2">No graph-energy data. Run pipeline first.</div>;

  return (
    <div className="space-y-2 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Graph-Energy Architecture</div>
      <Fm>Atom DAG from trace.usedAtomIds → energy propagation along edges</Fm>

      {g && <S t="Atom Graph ƒ(buildAtomGraph)">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
          <KV k="Nodes" v={g.nodes} /><KV k="Edges" v={g.edges} />
          <KV k="Missing refs" v={g.missingRefs} w={g.missingRefs > 0} /><KV k="Topo" v={g.topoOk ? '✓ DAG' : '✗ cycles'} w={!g.topoOk} />
          <KV k="Max out" v={`${g.maxOut} (${(g.maxOutId || '').slice(0, 18)})`} /><KV k="Max in" v={`${g.maxIn} (${(g.maxInId || '').slice(0, 18)})`} />
        </div>
        {g.cycleSample?.length > 0 && <div className="text-[8px] text-red-500 mt-1">Cycle: {g.cycleSample.slice(0, 4).join(' → ')}</div>}
      </S>}

      <S t="Atom Distribution">{nsDist.map(([ns, n]) => (
        <div key={ns} className="flex items-center gap-1.5 mb-0.5">
          <span className="w-14 text-right text-slate-500 text-[9px] truncate">{ns}</span>
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-[80px]"><div className="h-full bg-cyan-600/50 rounded-full" style={{ width: `${(n / (nsDist[0]?.[1] || 1)) * 100}%` }} /></div>
          <span className="text-[8px] text-slate-600 w-6">{n}</span>
        </div>
      ))}</S>

      {sf?.channels && <S t="Signal Field ƒ(buildSignalField)">
        <Fm>Per-channel signal = Σ source atoms → feeds energy propagation</Fm>
        {Object.entries(sf.channels).map(([ch, data]: any) => (
          <div key={ch} className="mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-16 text-right text-slate-400">{ch}</span>
              <div className="flex-1 h-2 bg-slate-800 rounded-sm overflow-hidden max-w-[80px]"><div className="h-full bg-amber-500/60 rounded-sm" style={{ width: `${pc(data?.raw_value ?? 0)}%` }} /></div>
              <span className="text-[9px] text-amber-400 font-mono">{(data?.raw_value ?? 0).toFixed(3)}</span>
            </div>
            {data?.sources?.length > 0 && <div className="ml-[72px] flex flex-wrap gap-1 mt-0.5">{data.sources.slice(0, 3).map((s: any, i: number) => <span key={i} className="text-[7px] px-1 bg-slate-800/50 rounded truncate max-w-[100px]">{s.id?.slice(0, 18)}={cl(s.magnitude ?? 0).toFixed(2)}</span>)}</div>}
          </div>
        ))}
      </S>}

      {en && <S t="Energy Propagation ƒ(propagateAtomEnergy)">
        <Fm>7 steps, decay=0.25. Energy flows along edges × magnitude.</Fm>
        <div className="text-[9px] text-slate-500 mb-1">Steps: {en.steps} | Decay: {en.decay}</div>
        {en.topGoalEnergy?.length > 0 && <div>
          <div className="text-[8px] text-slate-600 mb-0.5">Top goal nodes by energy:</div>
          {en.topGoalEnergy.slice(0, 8).map((ge: any) => (
            <div key={ge.id} className="flex items-center gap-1 text-[9px] mb-0.5">
              <span className="flex-1 truncate text-slate-300">{ge.id.slice(0, 28)}</span>
              <span className="text-amber-400 font-mono">{(ge.total ?? 0).toFixed(3)}</span>
              {ge.byChannel && <span className="text-[7px] text-slate-600">[{Object.entries(ge.byChannel).filter((e: any) => e[1] > 0.01).map(([c, v]: any) => `${c}:${v.toFixed(2)}`).join(',')}]</span>}
            </div>
          ))}
        </div>}
        {en.attributionByChannel && <details className="mt-1"><summary className="text-[8px] text-slate-600 cursor-pointer">Attribution raw</summary><pre className="text-[7px] text-slate-600 mt-1 max-h-[80px] overflow-auto">{JSON.stringify(Object.fromEntries(Object.entries(en.attributionByChannel).map(([ch, data]: any) => [ch, Object.entries(data || {}).slice(0, 3)])), null, 1)}</pre></details>}
      </S>}
    </div>
  );
};

const S: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t}</div>{children}</div>;
const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5 mb-1">{children}</div>;
const KV: React.FC<{ k: string; v: any; w?: boolean }> = ({ k, v, w }) => <div className="flex items-center gap-1"><span className="text-slate-600">{k}:</span><span className={`font-mono ${w ? 'text-red-400' : 'text-slate-300'}`}>{String(v)}</span></div>;
