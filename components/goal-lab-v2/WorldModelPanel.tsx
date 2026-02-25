/**
 * WorldModelPanel v2 — character's subjective world model.
 *
 * FIXES vs v1:
 *  - Robust dyad discovery: scans ALL tom:dyad:* atoms by prefix, not just participantIds
 *  - Handles tom:dyad:SELF:OTHER:metric AND tom:effective:dyad:SELF:OTHER:metric
 *  - SVG dyad graph: visualizes trust/threat between self and others
 *  - Better diagnostic header: shows actual atom ID patterns found
 *
 * Correct metrics: trust, threat, intimacy, alignment, respect, dominance, uncertainty, support
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

type DyadEntry = {
  id: string;
  b: Record<string, number>;
  c: Record<string, number>;
  e: Record<string, number>;
  has: boolean;
};

const MS = ['trust', 'threat', 'intimacy', 'alignment', 'respect', 'dominance', 'uncertainty', 'support'] as const;
const DNG = new Set(['threat', 'uncertainty']);

function DyadGraph({ dyads, selfId, lb }: { dyads: DyadEntry[]; selfId: string; lb: (id: string) => string }) {
  const active = dyads.filter(d => d.has);
  if (!active.length) return null;

  const count = Math.min(active.length, 6);
  const W = 250;
  const H = Math.min(180, 50 + count * 28);
  const selfX = 50;
  const selfY = H / 2;

  return (
    <svg width={W} height={H} className="w-full bg-slate-900/40 rounded border border-slate-800/30 mb-1">
      <circle cx={selfX} cy={selfY} r={18} fill="#0c4a6e" stroke="#22d3ee" strokeWidth={1.5} />
      <text x={selfX} y={selfY + 3} textAnchor="middle" fill="#22d3ee" fontSize="8" fontWeight="bold">{lb(selfId).slice(0, 6)}</text>

      {active.slice(0, count).map((d, i) => {
        const y = count === 1 ? H / 2 : 20 + i * ((H - 40) / (count - 1));
        const otherX = 200;
        const trust = d.b.trust ?? 0.5;
        const threat = d.b.threat ?? 0;

        const edgeH = trust > threat ? 120 + trust * 30 : threat * 30;
        const edgeS = Math.max(trust, threat) * 100;
        const edgeColor = `hsl(${edgeH}, ${Math.round(edgeS)}%, 45%)`;
        const edgeWidth = 0.5 + Math.max(trust, threat) * 2;

        return (
          <g key={d.id}>
            <line x1={selfX + 18} y1={selfY} x2={otherX - 14} y2={y} stroke={edgeColor} strokeWidth={edgeWidth} opacity={0.7} />
            <text x={(selfX + 18 + otherX - 14) / 2} y={(selfY + y) / 2 - 3} textAnchor="middle" fill="#64748b" fontSize="6">T:{pc(trust)} {threat > 0.05 ? `⚠${pc(threat)}` : ''}</text>
            <circle cx={otherX} cy={y} r={12} fill="#1e293b" stroke={threat > 0.3 ? '#ef4444' : trust > 0.5 ? '#34d399' : '#475569'} strokeWidth={1} />
            <text x={otherX} y={y + 3} textAnchor="middle" fill={threat > 0.3 ? '#fca5a5' : '#94a3b8'} fontSize="7">{lb(d.id).slice(0, 6)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const WorldModelPanel: React.FC<Props> = ({ atoms, selfId, actorLabels = {}, participantIds = [], decision }) => {
  const lb = (id: string) => actorLabels[id] || id.slice(0, 8);
  const all = arr(atoms);
  const [showDiag, setShowDiag] = useState(false);

  const diag = useMemo(() => {
    const td = all.filter(a => String((a as any).id).startsWith('tom:dyad:'));
    const te = all.filter(a => String((a as any).id).startsWith('tom:effective:'));
    const ta = all.filter(a => String((a as any).id).startsWith('tom:'));
    const em = all.filter(a => String((a as any).id).startsWith('emo:'));

    const discoveredOthers = new Set<string>();
    const prefix = `tom:dyad:${selfId}:`;
    for (const a of td) {
      const id = String((a as any).id);
      if (id.startsWith(prefix)) {
        const otherId = id.slice(prefix.length).split(':')[0];
        if (otherId && otherId !== selfId) discoveredOthers.add(otherId);
      }
    }

    const reverseOthers = new Set<string>();
    for (const a of td) {
      const id = String((a as any).id);
      if (id.startsWith('tom:dyad:') && !id.startsWith(prefix)) {
        const parts = id.slice('tom:dyad:'.length).split(':');
        if (parts[1] === selfId && parts[0]) reverseOthers.add(parts[0]);
      }
    }

    return {
      total: all.length,
      tomDyad: td.length,
      tomEff: te.length,
      tomAll: ta.length,
      emo: em.length,
      discoveredOthers: Array.from(discoveredOthers),
      reverseOthers: Array.from(reverseOthers),
      participantOthers: participantIds.filter(id => id !== selfId),
      sampleIds: td.slice(0, 8).map(a => String((a as any).id)),
    };
  }, [all, selfId, participantIds]);

  const emotions = useMemo(
    () => all.filter(a => {
      const id = String((a as any).id);
      return id.startsWith('emo:') && id.endsWith(`:${selfId}`) && !id.includes(':dyad:');
    }).map(a => ({ n: String((a as any).id).split(':')[1], v: cl(Number((a as any).magnitude ?? 0)) }))
      .filter(e => e.v > 0.02).sort((a, b) => b.v - a.v).slice(0, 8),
    [all, selfId]
  );

  const events = useMemo(
    () => all.filter(a => {
      const id = String((a as any).id);
      return id.startsWith('event:') && !id.startsWith('event:didTo');
    }).map(a => {
      const ev = (a as any).meta?.event;
      return { kind: ev?.kind || String((a as any).id).split(':')[1], actor: ev?.actorId || '?', target: ev?.targetId || '', mag: cl(Number((a as any).magnitude ?? 0)), tick: ev?.tick ?? '?' };
    }).sort((a, b) => b.mag - a.mag).slice(0, 6),
    [all]
  );

  const didToMe = useMemo(
    () => all.filter(a => String((a as any).id).startsWith(`event:didTo:${selfId}:`))
      .map(a => { const p = String((a as any).id).split(':'); return { actor: p[2], kind: p[4] || '?', mag: cl(Number((a as any).magnitude ?? 0)) }; })
      .sort((a, b) => b.mag - a.mag).slice(0, 6),
    [all, selfId]
  );

  const ctxAxes = useMemo(() => {
    const out: Array<{ n: string; v: number }> = [];
    for (const a of all) {
      const id = String((a as any).id);
      if (id.startsWith('ctx:final:') && id.endsWith(`:${selfId}`)) {
        const n = id.slice(10, id.length - selfId.length - 1);
        if (n && !n.includes(':') && n.length < 25 && !out.find(x => x.n === n)) out.push({ n, v: cl(Number((a as any).magnitude ?? 0)) });
      }
    }
    return out.sort((a, b) => b.v - a.v).slice(0, 10);
  }, [all, selfId]);

  const dyads = useMemo<DyadEntry[]>(() => {
    const othersSet = new Set<string>(participantIds.filter(id => id !== selfId));
    const prefix = `tom:dyad:${selfId}:`;
    for (const a of all) {
      const id = String((a as any).id);
      if (id.startsWith(prefix)) {
        const oid = id.slice(prefix.length).split(':')[0];
        if (oid && oid !== selfId) othersSet.add(oid);
      }
    }
    const effPrefix = `tom:effective:dyad:${selfId}:`;
    for (const a of all) {
      const id = String((a as any).id);
      if (id.startsWith(effPrefix)) {
        const oid = id.slice(effPrefix.length).split(':')[0];
        if (oid && oid !== selfId) othersSet.add(oid);
      }
    }

    return Array.from(othersSet).map(oid => {
      const b: Record<string, number> = {};
      const c: Record<string, number> = {};
      const e: Record<string, number> = {};
      for (const mt of MS) {
        b[mt] = mg(all, `tom:dyad:${selfId}:${oid}:${mt}`, mt === 'trust' || mt === 'respect' ? 0.5 : 0);
        const ctxVal = mg(all, `tom:dyad:${selfId}:${oid}:${mt}_ctx`, -1);
        c[mt] = ctxVal >= 0 ? ctxVal : mg(all, `tom:ctx:dyad:${selfId}:${oid}:${mt}`, -1);
        e[mt] = mg(all, `tom:effective:dyad:${selfId}:${oid}:${mt}`, -1);
      }
      return { id: oid, b, c, e, has: MS.some(mt => b[mt] > 0.01 || (e[mt] >= 0 && e[mt] > 0.01)) };
    });
  }, [all, selfId, participantIds]);

  const energy = useMemo(() => ['threat', 'norm', 'attachment', 'curiosity', 'status', 'autonomy', 'resource', 'uncertainty']
    .map(ch => ({ ch, raw: mg(all, `ener:raw:${ch}:${selfId}`), felt: mg(all, `ener:felt:${ch}:${selfId}`) }))
    .filter(c => c.raw > 0.01 || c.felt > 0.01), [all, selfId]);

  const DVAL: Record<string, string> = { survival: '🔴 critical', safety: '🟠 high', social: '🟡 medium', resource: '🟢 instrumental', autonomy: '🔵 identity', wellbeing: '💜 long-term' };
  const goals = useMemo(() => {
    const out: Array<{ id: string; a: number; d: string }> = [];
    for (const at of all) {
      const id = String((at as any).id);
      if (id.startsWith('goal:active:') && id.endsWith(`:${selfId}`)) {
        const gid = id.slice(12, id.length - selfId.length - 1);
        out.push({ id: gid, a: cl(Number((at as any).magnitude ?? 0)), d: (at as any)?.trace?.parts?.domain || gid.split(':')[0] });
      }
    }
    if (!out.length) for (const at of all) {
      const id = String((at as any).id);
      if (id.startsWith('goal:domain:') && id.endsWith(`:${selfId}`)) out.push({ id: id.slice(12, id.length - selfId.length - 1), a: cl(Number((at as any).magnitude ?? 0)), d: id.split(':')[2] || '?' });
    }
    return out.sort((a, b) => b.a - a.a).slice(0, 10);
  }, [all, selfId]);

  const dActs = useMemo(() => {
    if (!decision?.ranked) return [];
    return arr(decision.ranked).slice(0, 5).map((r: any) => {
      const a = r?.action || r;
      return { l: a?.label || a?.kind || '?', q: Number(r?.q ?? 0), t: a?.targetId || '', k: a?.kind || '?' };
    });
  }, [decision]);

  return (
    <div className="space-y-2 text-[10px]">
      <div className="border border-amber-800/40 rounded bg-amber-950/20 p-1.5">
        <button onClick={() => setShowDiag(p => !p)} className="text-[9px] text-amber-500 font-bold w-full text-left">
          🔎 {diag.total} atoms | tom:dyad={diag.tomDyad} eff={diag.tomEff} | emo={diag.emo} | dyad targets={diag.discoveredOthers.length} {showDiag ? '▼' : '▶'}
        </button>
        {showDiag && (
          <div className="mt-1 text-[8px] text-slate-500 space-y-0.5">
            <div>selfId: <span className="text-cyan-400">{selfId}</span></div>
            <div>participantIds: {diag.participantOthers.map(id => lb(id)).join(', ') || 'none'}</div>
            <div>discovered from atoms: {diag.discoveredOthers.map(id => lb(id)).join(', ') || 'none'}</div>
            {diag.reverseOthers.length > 0 && <div>reverse tom (others→self): {diag.reverseOthers.map(id => lb(id)).join(', ')}</div>}
            <div>sample tom:dyad IDs:</div>
            {diag.sampleIds.length ? diag.sampleIds.map((id, i) => <div key={i} className="text-[7px] text-slate-600 ml-2 truncate">{id}</div>) : <div className="text-red-400 ml-2">NONE — pipeline may not inject tom atoms at current stage</div>}
          </div>
        )}
      </div>

      {emotions.length > 0 && <S t="Emotions"><div className="flex flex-wrap gap-1">{emotions.map(e => <span key={e.n} className="px-1 py-0.5 rounded bg-slate-800/50 text-[9px]">{e.n} <span className="text-amber-400 font-mono">{pc(e.v)}</span></span>)}</div></S>}

      {(events.length > 0 || didToMe.length > 0) && (
        <S t="Past Events ƒ(event:*)">
          <Fm>ƒ(eventLog, decay halfLife=12, direct/witnessed)</Fm>
          {events.map((e, i) => <div key={i} className="text-[9px] text-slate-500">{e.kind} {e.target ? `(${lb(e.actor)}→${lb(e.target)})` : `(${lb(e.actor)})`} <span className="text-slate-700">t={String(e.tick)}</span></div>)}
          {didToMe.length > 0 && <div className="pt-1 border-t border-slate-800/30">{didToMe.map((e, i) => <div key={`d${i}`} className="text-[9px] text-rose-400">{lb(e.actor)} did {e.kind} to me</div>)}</div>}
        </S>
      )}

      {ctxAxes.length > 0 && <S t="Context ƒ(ctx:final)"><Fm>ƒ(S0→S1 axes→S2c lens)</Fm>{ctxAxes.map(a => <Rw key={a.n} l={a.n} v={a.v} c="#38bdf8" />)}</S>}

      <S t="Beliefs ƒ(tom:dyad)">
        <Fm>base=ƒ(initTom) → ctx=ƒ(beliefBias) → eff=ƒ(ctx)</Fm>
        <DyadGraph dyads={dyads} selfId={selfId} lb={lb} />
        {dyads.length > 0 ? dyads.map(d => (
          <div key={d.id} className="border border-slate-800/40 rounded p-1.5 bg-slate-950/30 mb-1">
            <div className="font-bold text-slate-300 text-[9px] mb-0.5">→ {lb(d.id)}</div>
            {MS.map(mt => {
              const b = cl(d.b[mt] ?? 0);
              const c = d.c[mt] >= 0 ? cl(d.c[mt]) : null;
              const e = d.e[mt] >= 0 ? cl(d.e[mt]) : null;
              return (
                <div key={mt} className="grid grid-cols-[58px_1fr_1fr_1fr] items-center gap-1 mb-0.5">
                  <span className={`text-[8px] text-right ${DNG.has(mt) ? 'text-rose-500' : 'text-slate-500'}`}>{mt}</span>
                  <Mini v={b} c={DNG.has(mt) ? '#ef4444' : hu(b)} />
                  <Mini v={c ?? 0} c={c === null ? '#334155' : DNG.has(mt) ? '#f43f5e' : '#22d3ee'} ghost={c === null} />
                  <Mini v={e ?? 0} c={e === null ? '#334155' : DNG.has(mt) ? '#ef4444' : '#22c55e'} ghost={e === null} />
                </div>
              );
            })}
          </div>
        )) : <div className="text-[9px] text-red-500">⚠ No dyad targets found. Add characters to scene or check pipeline stage ≥ S5.</div>}
      </S>

      {energy.length > 0 && <S t="Energy ƒ(ener)"><Fm>raw=ƒ(ctx) → felt=ƒ(raw × personality curve)</Fm>{energy.map(ch => <div key={ch.ch} className="grid grid-cols-[58px_1fr_1fr] items-center gap-1 mb-0.5"><span className="text-[8px] text-right text-slate-500">{ch.ch}</span><Mini v={cl(ch.raw)} c="#60a5fa" /><Mini v={cl(ch.felt)} c="#f59e0b" /></div>)}</S>}

      {goals.length > 0 && (
        <S t="What I Want ƒ(goal)">
          <Fm>activation=ƒ(domain×driver×trait)</Fm>
          {goals.map(g => <div key={g.id} className="flex items-center gap-1 mb-0.5"><span className="w-12 text-[8px] text-slate-600">{DVAL[g.d] || g.d}</span><span className="flex-1 truncate text-slate-300">{g.id}</span><div className="w-14"><Mini v={g.a} c="#f59e0b" /></div><span className="text-[8px] text-amber-500 w-6 text-right">{pc(g.a)}</span></div>)}
        </S>
      )}

      {dActs.length > 0 && (
        <S t="How I Get It ƒ(decision)">
          <Fm>Q(a)=Σ E_g×Δg−cost−0.4|Q|(1−conf)</Fm>
          {dActs.map((a, i) => <div key={i} className="flex items-center gap-1 mb-0.5"><span className={`${i === 0 ? 'text-emerald-300 font-bold' : 'text-slate-500'} w-4`}>{i + 1}.</span><span className={`flex-1 truncate ${i === 0 ? 'text-emerald-200' : 'text-slate-300'}`}>{a.l}</span>{a.t && <span className="text-[8px] text-slate-600">→{lb(a.t)}</span>}<span className="font-mono text-[9px] text-amber-400">Q={a.q.toFixed(3)}</span></div>)}
        </S>
      )}
    </div>
  );
};

const S: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t}</div>{children}</div>;
const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5 mb-1">{children}</div>;
const Mini: React.FC<{ v: number; c: string; ghost?: boolean }> = ({ v, c, ghost }) => <div className={`h-1.5 bg-slate-800 rounded-full overflow-hidden ${ghost ? 'opacity-40' : ''}`}><div className="h-full rounded-full" style={{ width: `${pc(v)}%`, backgroundColor: c }} /></div>;
const Rw: React.FC<{ l: string; v: number; c: string }> = ({ l, v, c }) => <div className="flex items-center gap-1 mb-0.5"><span className="w-16 text-right text-[8px] text-slate-500">{l}</span><div className="flex-1"><Mini v={v} c={c} /></div><span className="w-6 text-right text-[8px] text-slate-600">{pc(v)}</span></div>;
