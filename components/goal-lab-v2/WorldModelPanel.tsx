/**
 * WorldModelPanel — character's subjective world model.
 * Correct metrics: trust, threat, intimacy, alignment, respect, dominance, uncertainty, support
 * DIAGNOSTIC header shows atom counts so we can always see WHY dyads may be empty.
 */
import React, { useMemo, useState } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const pc = (x: number) => Math.round(cl(x) * 100);
const hu = (v: number) => `hsl(${Math.round(v * 120)},70%,45%)`;
function mg(atoms: ContextAtom[], id: string, fb = 0): number {
  const a = atoms.find(x => String((x as any).id) === id);
  return Number((a as any)?.magnitude ?? fb);
}

type Props = { atoms: ContextAtom[]; selfId: string; actorLabels?: Record<string, string>; participantIds?: string[]; decision?: any };

export const WorldModelPanel: React.FC<Props> = ({ atoms, selfId, actorLabels = {}, participantIds = [], decision }) => {
  const lb = (id: string) => actorLabels[id] || id.slice(0, 8);
  const all = arr(atoms);
  const [showDiag, setShowDiag] = useState(false);

  const diag = useMemo(() => {
    const td = all.filter(a => String((a as any).id).startsWith('tom:dyad:'));
    const te = all.filter(a => String((a as any).id).startsWith('tom:effective:'));
    const ta = all.filter(a => String((a as any).id).startsWith('tom:'));
    const em = all.filter(a => String((a as any).id).startsWith('emo:'));
    return { total: all.length, tomDyad: td.length, tomEff: te.length, tomAll: ta.length, emo: em.length,
      others: participantIds.filter(id => id !== selfId),
      sampleIds: td.slice(0, 5).map(a => String((a as any).id)) };
  }, [all, selfId, participantIds]);

  const emotions = useMemo(() =>
    all.filter(a => { const id = String((a as any).id); return id.startsWith('emo:') && id.endsWith(`:${selfId}`) && !id.includes(':dyad:'); })
      .map(a => ({ n: String((a as any).id).split(':')[1], v: cl(Number((a as any).magnitude ?? 0)) }))
      .filter(e => e.v > 0.02).sort((a, b) => b.v - a.v).slice(0, 8), [all, selfId]);

  const events = useMemo(() =>
    all.filter(a => { const id = String((a as any).id); return id.startsWith('event:') && !id.startsWith('event:didTo'); })
      .map(a => { const ev = (a as any).meta?.event; return { kind: ev?.kind || String((a as any).id).split(':')[1], actor: ev?.actorId || '?', target: ev?.targetId || '', mag: cl(Number((a as any).magnitude ?? 0)), tick: ev?.tick ?? '?' }; })
      .sort((a, b) => (typeof b.tick === 'number' && typeof a.tick === 'number' ? b.tick - a.tick : 0)).slice(0, 8), [all]);

  const didToMe = useMemo(() =>
    all.filter(a => String((a as any).id).startsWith('event:didTo:') && String((a as any).id).includes(`:${selfId}:`))
      .map(a => { const p = String((a as any).id).split(':'); return { actor: p[2], kind: p[4] || '?', mag: cl(Number((a as any).magnitude ?? 0)) }; })
      .sort((a, b) => b.mag - a.mag).slice(0, 6), [all, selfId]);

  const ctxAxes = useMemo(() => {
    const out: Array<{ n: string; v: number }> = [];
    for (const a of all) { const id = String((a as any).id); if (id.startsWith('ctx:final:') && id.endsWith(`:${selfId}`)) { const n = id.slice(10, id.length - selfId.length - 1); if (n && !n.includes(':') && n.length < 25 && !out.find(x => x.n === n)) out.push({ n, v: cl(Number((a as any).magnitude ?? 0)) }); } }
    return out.sort((a, b) => b.v - a.v).slice(0, 10);
  }, [all, selfId]);

  const MS = ['trust', 'threat', 'intimacy', 'alignment', 'respect', 'dominance', 'uncertainty', 'support'] as const;
  const DNG = new Set(['threat', 'uncertainty']);

  const dyads = useMemo(() => {
    let others = participantIds.filter(id => id !== selfId);
    if (!others.length) { const s = new Set<string>(); for (const a of all) { const id = String((a as any).id); if (id.startsWith(`tom:dyad:${selfId}:`)) { const o = id.slice(`tom:dyad:${selfId}:`.length).split(':')[0]; if (o && o !== selfId) s.add(o); } } others = Array.from(s); }
    return others.map(oid => {
      const b: Record<string, number> = {}, c: Record<string, number> = {}, e: Record<string, number> = {};
      for (const mt of MS) {
        b[mt] = mg(all, `tom:dyad:${selfId}:${oid}:${mt}`, mt === 'trust' || mt === 'respect' ? 0.5 : 0);
        c[mt] = mg(all, `tom:dyad:${selfId}:${oid}:${mt}_ctx`, -1);
        e[mt] = mg(all, `tom:effective:dyad:${selfId}:${oid}:${mt}`, -1);
      }
      return { id: oid, b, c, e, has: MS.some(mt => b[mt] > 0.01 || (e[mt] >= 0 && e[mt] > 0.01)) };
    });
  }, [all, selfId, participantIds]);

  const energy = useMemo(() =>
    ['threat', 'norm', 'attachment', 'curiosity', 'status', 'autonomy', 'resource', 'uncertainty']
      .map(ch => ({ ch, raw: mg(all, `ener:raw:${ch}:${selfId}`), felt: mg(all, `ener:felt:${ch}:${selfId}`) }))
      .filter(c => c.raw > 0.01 || c.felt > 0.01), [all, selfId]);

  const DVAL: Record<string, string> = { survival: '🔴 critical', safety: '🟠 high', social: '🟡 medium', resource: '🟢 instrumental', autonomy: '🔵 identity', wellbeing: '💜 long-term' };
  const goals = useMemo(() => {
    const out: Array<{ id: string; a: number; d: string }> = [];
    for (const at of all) { const id = String((at as any).id); if (id.startsWith('goal:active:') && id.endsWith(`:${selfId}`)) { const gid = id.slice(12, id.length - selfId.length - 1); out.push({ id: gid, a: cl(Number((at as any).magnitude ?? 0)), d: (at as any)?.trace?.parts?.domain || gid.split(':')[0] }); } }
    if (!out.length) for (const at of all) { const id = String((at as any).id); if (id.startsWith('goal:domain:') && id.endsWith(`:${selfId}`)) out.push({ id: id.slice(12, id.length - selfId.length - 1), a: cl(Number((at as any).magnitude ?? 0)), d: id.split(':')[2] || '?' }); }
    return out.sort((a, b) => b.a - a.a).slice(0, 10);
  }, [all, selfId]);

  const dActs = useMemo(() => {
    if (!decision?.ranked) return [];
    return arr(decision.ranked).slice(0, 5).map((r: any) => {
      const ac = r?.action || r; const dg = ac?.deltaGoals || {};
      const top = Object.entries(dg).sort((x: any, y: any) => Math.abs(y[1] as number) - Math.abs(x[1] as number)).slice(0, 3);
      return { label: ac?.label || ac?.kind || '?', kind: ac?.kind || '?', q: Number(r?.q ?? 0), cost: Number(ac?.cost ?? 0), conf: cl(Number(ac?.confidence ?? 1)), tid: ac?.targetId, top: top.map(([g, d]) => ({ g, d: d as number })) };
    });
  }, [decision]);

  return (
    <div className="space-y-2 text-[10px]">
      <div className="border border-amber-800/40 rounded bg-amber-950/20 p-1.5">
        <button onClick={() => setShowDiag(p => !p)} className="text-[9px] text-amber-500 font-bold w-full text-left">
          🔎 {diag.total} atoms | tom:dyad={diag.tomDyad} eff={diag.tomEff} | emo={diag.emo} | others={diag.others.length} {showDiag ? '▼' : '▶'}
        </button>
        {showDiag && (
          <div className="mt-1 text-[8px] text-slate-500 space-y-0.5">
            <div>selfId: <span className="text-cyan-400">{selfId}</span></div>
            <div>participantIds: {participantIds.map(id => lb(id)).join(', ') || 'none'}</div>
            <div>sample tom:dyad IDs: {diag.sampleIds.length ? diag.sampleIds.join(', ') : <span className="text-red-400">NONE — pipeline may not inject tom atoms at this stage</span>}</div>
          </div>
        )}
      </div>

      {emotions.length > 0 && <S t="Emotions"><div className="flex flex-wrap gap-1">{emotions.map(e => <span key={e.n} className="px-1 py-0.5 rounded bg-slate-800/50 text-[9px]">{e.n} <span className="text-amber-400 font-mono">{pc(e.v)}</span></span>)}</div></S>}

      {(events.length > 0 || didToMe.length > 0) && (
        <S t="Past Events ƒ(event:*)">
          <Fm>ƒ(eventLog, decay halfLife=12, direct/witnessed)</Fm>
          {didToMe.map((d, i) => <div key={i} className="flex gap-1 text-[9px]"><span className="text-slate-400 w-14 truncate">{lb(d.actor)}</span><span className={d.kind.match(/attack|harm/) ? 'text-red-400' : 'text-emerald-400'}>{d.kind}</span><span className="text-slate-600 font-mono">{d.mag.toFixed(2)}</span></div>)}
          {events.slice(0, 5).map((ev, i) => <div key={i} className="flex gap-1 text-[9px] mb-0.5"><span className="text-[7px] text-slate-700 w-5">t{ev.tick}</span><span className="text-slate-400 w-12 truncate">{lb(ev.actor)}</span><span className="text-slate-300 flex-1 truncate">{ev.kind}</span><span className="text-amber-500 font-mono">{pc(ev.mag)}</span></div>)}
        </S>
      )}

      {ctxAxes.length > 0 && <S t="Context ƒ(ctx:final)"><Fm>ƒ(S0→S1 axes→S2c lens)</Fm>{ctxAxes.map(a => <Rw key={a.n} l={a.n} v={a.v} c="#38bdf8" />)}</S>}

      <S t="Beliefs ƒ(tom:dyad)">
        <Fm>base=ƒ(initTom) → ctx=ƒ(beliefBias) → eff=ƒ(ctx)</Fm>
        {dyads.length > 0 ? dyads.map(d => (
          <div key={d.id} className="border border-slate-800/40 rounded p-1.5 bg-slate-950/30 mb-1">
            <div className="font-bold text-slate-300 text-[9px] mb-0.5">→ {lb(d.id)}</div>
            {!d.has && <div className="text-[8px] text-red-500">⚠ No tom:dyad atoms for {selfId}→{d.id}</div>}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {MS.map(mt => {
                const bv = d.b[mt], cv = d.c[mt], ev = d.e[mt];
                if (bv < 0.01 && cv < 0 && ev < 0) return null;
                const dn = DNG.has(mt);
                return (
                  <div key={mt} className="flex items-center gap-1">
                    <span className={`w-14 text-right text-[9px] ${dn ? 'text-rose-500' : 'text-slate-500'}`}>{mt}</span>
                    <span className="font-mono text-[9px]" style={{ color: dn ? (bv > 0.4 ? '#ef4444' : '#64748b') : hu(bv) }}>{pc(bv)}</span>
                    {cv >= 0 && Math.abs(cv - bv) > 0.02 && <span className="text-[8px] text-yellow-600">→{pc(cv)}</span>}
                    {ev >= 0 && Math.abs(ev - (cv >= 0 ? cv : bv)) > 0.02 && <span className="text-[8px] text-cyan-500">→{pc(ev)}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )) : <div className="text-[9px] text-red-500">⚠ No dyad targets. Add characters to scene.</div>}
      </S>

      {energy.length > 0 && (
        <S t="Energy ƒ(ener)">
          <Fm>raw=ƒ(ctx) → felt=ƒ(raw × personality curve)</Fm>
          {energy.map(c => (
            <div key={c.ch} className="flex items-center gap-1 mb-0.5">
              <span className="w-16 text-right text-slate-400">{c.ch}</span>
              <div className="flex-1 flex gap-0.5 h-2 max-w-[90px]">
                <div className="flex-1 bg-slate-800 rounded-sm overflow-hidden"><div className="h-full bg-amber-600/60" style={{ width: `${pc(c.raw)}%` }} /></div>
                <div className="flex-1 bg-slate-800 rounded-sm overflow-hidden"><div className="h-full bg-rose-500/60" style={{ width: `${pc(c.felt)}%` }} /></div>
              </div>
              <span className="text-[8px] text-slate-600 w-14">{c.raw.toFixed(2)}/{c.felt.toFixed(2)}</span>
            </div>
          ))}
        </S>
      )}

      {goals.length > 0 && (
        <S t="What I Want ƒ(goal)">
          <Fm>activation=ƒ(domain×driver×trait)</Fm>
          {goals.map(g => <div key={g.id} className="mb-0.5"><div className="flex items-center gap-1"><span className="flex-1 truncate text-slate-300">{g.id}</span><Br v={g.a} c="#f59e0b" /><span className="text-amber-400 w-5 text-right font-mono">{pc(g.a)}</span></div><div className="text-[8px] text-slate-600 ml-1">{DVAL[g.d] || g.d}</div></div>)}
        </S>
      )}

      {dActs.length > 0 && (
        <S t="How I Get It ƒ(decision)">
          <Fm>Q(a)=Σ E_g×Δg−cost−0.4|Q|(1−conf)</Fm>
          {dActs.map((a, i) => (
            <div key={i} className={`border rounded p-1 mb-1 ${i === 0 ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-slate-800/30'}`}>
              <div className="flex items-center gap-1">
                <span className={i === 0 ? 'text-emerald-300 font-bold' : 'text-slate-400'}>{i + 1}.</span>
                <span className={`flex-1 truncate ${i === 0 ? 'text-emerald-200' : 'text-slate-300'}`}>{a.label}</span>
                {a.tid && <span className="text-[8px] text-slate-600">→{lb(a.tid)}</span>}
                <span className="font-mono text-[9px] text-amber-400">Q={a.q.toFixed(3)}</span>
              </div>
              {a.top.length > 0 && <div className="ml-3 flex flex-wrap gap-1 mt-0.5">{a.top.map(g => <span key={g.g} className={`text-[8px] px-1 rounded ${g.d > 0 ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>Δ{g.g}={g.d > 0 ? '+' : ''}{g.d.toFixed(2)}</span>)}</div>}
            </div>
          ))}
        </S>
      )}
    </div>
  );
};

const S: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t}</div>{children}</div>;
const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5 mb-1">{children}</div>;
const Rw: React.FC<{ l: string; v: number; c: string }> = ({ l, v, c }) => <div className="flex items-center gap-1.5 mb-0.5"><span className="text-slate-500 w-16 text-right text-[9px]">{l}</span><Br v={v} c={c} /><span className="text-slate-600 w-5 text-right font-mono text-[8px]">{Math.round(Math.max(0, Math.min(1, v)) * 100)}</span></div>;
const Br: React.FC<{ v: number; c: string }> = ({ v, c }) => <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden max-w-[60px]"><div className="h-full rounded-full" style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, backgroundColor: c }} /></div>;
