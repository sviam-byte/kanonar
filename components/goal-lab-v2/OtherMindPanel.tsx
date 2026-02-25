/**
 * OtherMindPanel v2 — model another character's decision-making.
 * Uses castRows (buildGoalLabContext run per participant).
 *
 * NEW: SVG polar chart for TOM metrics about you.
 * Shows: their ToM about you, their emotions, goals, ranked actions with Q.
 */
import React, { useMemo, useState } from 'react';
import { arr } from '../../lib/utils/arr';

const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const pc = (x: number) => Math.round(cl(x) * 100);

type Props = { castRows: any[]; selfId: string; actorLabels?: Record<string, string> };

function TomPolarChart({ metrics }: { metrics: Array<{ mt: string; v: number }> }) {
  if (metrics.length < 2) return null;

  const W = 200;
  const H = 140;
  const cx = W / 2;
  const cy = H / 2 - 2;
  const R = 46;
  const n = metrics.length;
  const dangerSet = new Set(['threat', 'uncertainty']);

  const polygonPoints = metrics.map((m, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const r = R * cl(m.v);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');

  return (
    <svg width={W} height={H} className="w-full bg-slate-900/40 rounded border border-slate-800/30">
      {[0.25, 0.5, 0.75, 1.0].map(r => <circle key={r} cx={cx} cy={cy} r={R * r} fill="none" stroke="#1e293b" strokeWidth={0.5} />)}
      {metrics.map((m, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const lx = cx + (R + 18) * Math.cos(angle);
        const ly = cy + (R + 18) * Math.sin(angle);
        const isDanger = dangerSet.has(m.mt);
        return (
          <g key={m.mt}>
            <line x1={cx} y1={cy} x2={cx + R * Math.cos(angle)} y2={cy + R * Math.sin(angle)} stroke="#334155" strokeWidth={0.5} />
            <text x={lx} y={ly + 3} textAnchor="middle" fill={isDanger ? '#ef4444' : '#64748b'} fontSize="7">{m.mt}</text>
          </g>
        );
      })}
      <polygon points={polygonPoints} fill="#22d3ee" fillOpacity={0.15} stroke="#22d3ee" strokeWidth={1.5} />
      {metrics.map((m, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const r = R * cl(m.v);
        const isDanger = dangerSet.has(m.mt);
        return <circle key={`dot-${m.mt}`} cx={cx + r * Math.cos(angle)} cy={cy + r * Math.sin(angle)} r={3} fill={isDanger && m.v > 0.3 ? '#ef4444' : '#22d3ee'} stroke="#0f172a" strokeWidth={0.5} />;
      })}
      <text x={W / 2} y={H - 2} textAnchor="middle" fill="#475569" fontSize="6">Their beliefs about you</text>
    </svg>
  );
}

function ActionBarChart({ ranked }: { ranked: Array<{ label: string; q: number; tid?: string }> }) {
  if (!ranked.length) return null;
  const W = 240;
  const H = Math.min(80, 10 + ranked.length * 14);
  const maxQ = Math.max(0.01, ...ranked.map(r => Math.abs(r.q)));
  const pad = 60;

  return (
    <svg width={W} height={H} className="w-full bg-slate-900/40 rounded border border-slate-800/30 mb-1">
      {ranked.map((r, i) => {
        const y = 4 + i * 14;
        const barW = (Math.abs(r.q) / maxQ) * (W - pad - 30);
        return (
          <g key={i}>
            <text x={pad - 2} y={y + 9} textAnchor="end" fill={i === 0 ? '#34d399' : '#94a3b8'} fontSize="7" fontWeight={i === 0 ? 'bold' : 'normal'}>{r.label.slice(0, 10)}</text>
            <rect x={pad} y={y + 1} width={Math.max(2, barW)} height={10} rx={2} fill={i === 0 ? '#34d399' : '#38bdf8'} opacity={i === 0 ? 0.9 : 0.5} />
            <text x={pad + Math.max(2, barW) + 3} y={y + 9} fill="#64748b" fontSize="6">Q={r.q.toFixed(3)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const OtherMindPanel: React.FC<Props> = ({ castRows, selfId, actorLabels = {} }) => {
  const lb = (id: string) => actorLabels[id] || id.slice(0, 8);
  const others = useMemo(() => arr(castRows).filter((r: any) => r?.id && r.id !== selfId), [castRows, selfId]);
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = others.find((r: any) => r.id === (selectedId || others[0]?.id));

  const data = useMemo(() => {
    if (!selected) return null;
    const sn = selected?.snapshot || selected;
    const atoms = arr(sn?.atoms || sn?.snapshot?.atoms);
    const decision = sn?.decision || sn?.snapshot?.decision;
    const oid = selected.id;

    const emos = atoms.filter((a: any) => {
      const id = String(a?.id || '');
      return id.startsWith('emo:') && id.endsWith(`:${oid}`) && !id.includes(':dyad:');
    }).map((a: any) => ({ n: String(a.id).split(':')[1], v: cl(Number(a.magnitude ?? 0)) }))
      .filter((e: any) => e.v > 0.02).sort((a: any, b: any) => b.v - a.v).slice(0, 6);

    const goals: Array<{ id: string; a: number; d: string }> = [];
    for (const a of atoms) {
      const id = String((a as any).id || '');
      if (id.startsWith('goal:active:') && id.endsWith(`:${oid}`)) {
        goals.push({ id: id.slice(12, id.length - oid.length - 1), a: cl(Number((a as any).magnitude ?? 0)), d: (a as any)?.trace?.parts?.domain || id.split(':')[2] || '?' });
      }
    }
    goals.sort((a, b) => b.a - a.a);

    const ranked = arr(decision?.ranked).slice(0, 5).map((r: any) => {
      const ac = r?.action || r;
      return { label: ac?.label || ac?.kind || '?', kind: ac?.kind || '?', q: Number(r?.q ?? 0), tid: ac?.targetId, cost: Number(ac?.cost ?? 0) };
    });

    const tomAboutMe: Array<{ mt: string; v: number }> = [];
    const tomMetrics = ['trust', 'threat', 'intimacy', 'alignment', 'respect', 'dominance', 'uncertainty', 'support'];
    for (const mt of tomMetrics) {
      let mag = -1;
      for (const pattern of [`tom:dyad:${oid}:${selfId}:${mt}`, `tom:effective:dyad:${oid}:${selfId}:${mt}`]) {
        const found = atoms.find((a: any) => String(a?.id) === pattern);
        if (found) {
          mag = Number((found as any)?.magnitude ?? -1);
          break;
        }
      }
      if (mag >= 0) tomAboutMe.push({ mt, v: mag });
    }

    return {
      atomCount: atoms.length,
      tomDyadCount: atoms.filter((a: any) => String(a?.id || '').startsWith(`tom:dyad:${oid}:`)).length,
      emos,
      goals,
      ranked,
      tomAboutMe,
    };
  }, [selected, selfId]);

  if (!others.length) return (
    <div className="text-[10px] p-2 space-y-2">
      <div className="text-slate-500 italic">No other characters modeled.</div>
      <div className="border border-amber-800/40 rounded bg-amber-950/20 p-1.5 space-y-1">
        <div className="text-[9px] text-amber-500 font-bold">🔧 How to enable:</div>
        <div className="text-[8px] text-slate-500">1. uiMode = 'console' or 'debug'</div>
        <div className="text-[8px] text-slate-500">2. Add ≥2 participants in scene</div>
        <div className="text-[8px] text-slate-500">3. Rebuild world</div>
      </div>
      <Fm>castRows = buildGoalLabContext per participant (gated by needs.castRows)</Fm>
    </div>
  );

  return (
    <div className="space-y-2 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Other Mind (ToM)</div>
      <Fm>Full buildGoalLabContext per character → their goals, emotions, actions</Fm>

      <div className="flex flex-wrap gap-1">
        {others.map((r: any) => (
          <button key={r.id} onClick={() => setSelectedId(r.id)} className={`px-1.5 py-0.5 rounded text-[9px] border transition ${(selectedId || others[0]?.id) === r.id ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/40' : 'bg-slate-800/40 text-slate-400 border-slate-700/30'}`}>
            {lb(r.id)}
          </button>
        ))}
      </div>

      {selected && data ? (
        <div className="space-y-2">
          <div className="text-[9px] text-slate-400">{lb(selected.id)} — {data.atomCount} atoms, tom:dyad={data.tomDyadCount}</div>
          {data.tomDyadCount === 0 && <div className="text-[8px] text-red-500">⚠ No tom:dyad:{selected.id}:* atoms. Check pipeline stage ≥ S5.</div>}

          {data.tomAboutMe.length > 0 && (
            <S t={`${lb(selected.id)} thinks about ${lb(selfId)}`}>
              <Fm>tom:dyad:{selected.id}:{selfId}:* — their beliefs about you</Fm>
              <TomPolarChart metrics={data.tomAboutMe} />
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
                {data.tomAboutMe.map(t => (
                  <div key={t.mt} className="flex items-center gap-1">
                    <span className={`w-14 text-right text-[9px] ${t.mt === 'threat' || t.mt === 'uncertainty' ? 'text-rose-500' : 'text-slate-500'}`}>{t.mt}</span>
                    <span className="font-mono text-[9px]" style={{ color: t.mt === 'threat' || t.mt === 'uncertainty' ? (t.v > 0.4 ? '#ef4444' : '#64748b') : `hsl(${Math.round(t.v * 120)},70%,45%)` }}>{pc(t.v)}</span>
                  </div>
                ))}
              </div>
            </S>
          )}

          {data.emos.length > 0 && <S t="Their Emotions"><div className="flex flex-wrap gap-1">{data.emos.map(e => <span key={e.n} className="px-1 py-0.5 rounded bg-slate-800/50 text-[9px]">{e.n} <span className="text-amber-400 font-mono">{pc(e.v)}</span></span>)}</div></S>}

          {data.goals.length > 0 && (
            <S t="Their Goals">
              <Fm>What {lb(selected.id)} wants (from their perspective)</Fm>
              {data.goals.map(g => <div key={g.id} className="flex items-center gap-1 mb-0.5"><span className="flex-1 truncate text-slate-300">{g.id}</span><div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden max-w-[60px]"><div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${pc(g.a)}%` }} /></div><span className="text-amber-400 w-5 text-right font-mono">{pc(g.a)}</span></div>)}
            </S>
          )}

          {data.ranked.length > 0 && (
            <S t="Their Best Actions">
              <Fm>What {lb(selected.id)} would choose → ranked by their Q</Fm>
              <ActionBarChart ranked={data.ranked} />
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
            </S>
          )}
        </div>
      ) : <div className="text-[9px] text-slate-600 italic">Select a character above.</div>}
    </div>
  );
};

const S: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => (
  <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t}</div>{children}</div>
);
const Fm: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5 mb-1">{children}</div>
);
