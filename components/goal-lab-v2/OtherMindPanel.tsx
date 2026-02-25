/**
 * OtherMindPanel — model another character's decision-making.
 * Uses castRows (buildGoalLabContext run per participant).
 * Shows: their ToM about you, their emotions, goals, ranked actions.
 */
import React, { useMemo, useState } from 'react';
import { arr } from '../../lib/utils/arr';
const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const pc = (x: number) => Math.round(cl(x) * 100);

type Props = { castRows: any[]; selfId: string; actorLabels?: Record<string, string> };

export const OtherMindPanel: React.FC<Props> = ({ castRows, selfId, actorLabels = {} }) => {
  const lb = (id: string) => actorLabels[id] || id.slice(0, 8);
  const others = useMemo(() => arr(castRows).filter((r: any) => r?.id && r.id !== selfId), [castRows, selfId]);
  const [selectedId, setSelectedId] = useState<string>('');

  const selected = useMemo(() => {
    const id = selectedId || others[0]?.id || '';
    return others.find((r: any) => r.id === id) || null;
  }, [others, selectedId]);

  const data = useMemo(() => {
    if (!selected?.snapshot) return null;
    const sn = selected.snapshot;
    const atoms = arr(sn?.atoms || sn?.snapshot?.atoms);
    const decision = sn?.decision || sn?.snapshot?.decision;
    const oid = selected.id;

    const emos = atoms.filter((a: any) => { const id = String(a?.id || ''); return id.startsWith('emo:') && id.endsWith(`:${oid}`) && !id.includes(':dyad:'); })
      .map((a: any) => ({ n: String(a.id).split(':')[1], v: cl(Number(a.magnitude ?? 0)) }))
      .filter((e: any) => e.v > 0.02).sort((a: any, b: any) => b.v - a.v).slice(0, 6);

    const goals: Array<{ id: string; a: number; d: string }> = [];
    for (const a of atoms) { const id = String((a as any).id || ''); if (id.startsWith('goal:active:') && id.endsWith(`:${oid}`)) goals.push({ id: id.slice(12, id.length - oid.length - 1), a: cl(Number((a as any).magnitude ?? 0)), d: (a as any)?.trace?.parts?.domain || id.split(':')[2] || '?' }); }
    goals.sort((a, b) => b.a - a.a);

    const ranked = arr(decision?.ranked).slice(0, 5).map((r: any) => {
      const ac = r?.action || r;
      return { label: ac?.label || ac?.kind || '?', kind: ac?.kind || '?', q: Number(r?.q ?? 0), tid: ac?.targetId, cost: Number(ac?.cost ?? 0) };
    });

    const tomAboutMe: Array<{ mt: string; v: number }> = [];
    for (const mt of ['trust', 'threat', 'intimacy', 'alignment', 'respect', 'support']) {
      const mag = Number((atoms.find((a: any) => String(a?.id) === `tom:dyad:${oid}:${selfId}:${mt}`) as any)?.magnitude ?? -1);
      if (mag >= 0) tomAboutMe.push({ mt, v: mag });
    }

    const tomDyadCount = atoms.filter((a: any) => String(a?.id || '').startsWith(`tom:dyad:${oid}:`)).length;

    return { emos, goals: goals.slice(0, 6), ranked, tomAboutMe, atomCount: atoms.length, tomDyadCount };
  }, [selected, selfId]);

  if (!others.length) return (
    <div className="text-[10px] p-2 space-y-2">
      <div className="text-slate-500 italic">No other characters modeled.</div>
      <div className="text-[8px] text-slate-600">castRows requires: uiMode='console'|'debug' or tabs using cast snapshots (metrics/compare/tom/debug).</div>
      <div className="text-[8px] text-slate-600">Add ≥2 participants + rebuild world.</div>
    </div>
  );

  return (
    <div className="space-y-2 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Other Mind Model</div>
      <Fm>Full buildGoalLabContext per character → their goals, emotions, actions</Fm>

      <div className="flex flex-wrap gap-1">
        {others.map((r: any) => <button key={r.id} onClick={() => setSelectedId(r.id)} className={`px-1.5 py-0.5 rounded text-[9px] border transition ${(selectedId || others[0]?.id) === r.id ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/40' : 'bg-slate-800/40 text-slate-400 border-slate-700/30'}`}>{lb(r.id)}</button>)}
      </div>

      {selected && data ? (
        <div className="space-y-2">
          <div className="text-[9px] text-slate-400">{lb(selected.id)} — {data.atomCount} atoms</div>
          {data.tomDyadCount === 0 && <div className="text-[8px] text-red-500">⚠ No tom:dyad:{selected.id}:* atoms in this snapshot.</div>}

          {data.tomAboutMe.length > 0 && <S t={`${lb(selected.id)} thinks about ${lb(selfId)}`}>
            <Fm>Their tom:dyad:{selected.id}:{selfId}:* (what they believe about you)</Fm>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{data.tomAboutMe.map(t => <div key={t.mt} className="flex items-center gap-1"><span className={`w-14 text-right text-[9px] ${t.mt === 'threat' ? 'text-rose-500' : 'text-slate-500'}`}>{t.mt}</span><span className="font-mono text-[9px]" style={{ color: t.mt === 'threat' ? (t.v > 0.4 ? '#ef4444' : '#64748b') : `hsl(${Math.round(t.v * 120)},70%,45%)` }}>{pc(t.v)}</span></div>)}</div>
          </S>}

          {data.emos.length > 0 && <S t="Their Emotions"><div className="flex flex-wrap gap-1">{data.emos.map(e => <span key={e.n} className="px-1 py-0.5 rounded bg-slate-800/50 text-[9px]">{e.n} <span className="text-amber-400 font-mono">{pc(e.v)}</span></span>)}</div></S>}

          {data.goals.length > 0 && <S t="Their Goals">
            <Fm>What {lb(selected.id)} wants (from their perspective)</Fm>
            {data.goals.map(g => <div key={g.id} className="flex items-center gap-1 mb-0.5"><span className="flex-1 truncate text-slate-300">{g.id}</span><div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden max-w-[60px]"><div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${pc(g.a)}%` }} /></div><span className="text-amber-400 w-5 text-right font-mono">{pc(g.a)}</span></div>)}
          </S>}

          {data.ranked.length > 0 && <S t="Their Best Actions">
            <Fm>What {lb(selected.id)} would choose → ranked by their Q</Fm>
            {data.ranked.map((a, i) => (
              <div key={i} className={`border rounded p-1 mb-1 ${i === 0 ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-slate-800/30'}`}>
                <div className="flex items-center gap-1">
                  <span className={i === 0 ? 'text-emerald-300 font-bold' : 'text-slate-400'}>{i + 1}.</span>
                  <span className={`flex-1 truncate ${i === 0 ? 'text-emerald-200' : 'text-slate-300'}`}>{a.label}</span>
                  {a.tid && <span className="text-[8px] text-slate-600">→{lb(a.tid)}</span>}
                  <span className="font-mono text-[9px] text-amber-400">Q={a.q.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </S>}
        </div>
      ) : <div className="text-[9px] text-slate-600 italic">Select a character above.</div>}
    </div>
  );
};
const S: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t}</div>{children}</div>;
const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5 mb-1">{children}</div>;
