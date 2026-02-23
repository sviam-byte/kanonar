/**
 * WorldModelPanel — character's subjective world model.
 *
 * Pipeline-correct metric names from extractTomDyadAtoms:
 *   trust, threat, intimacy, alignment, respect, dominance, uncertainty, support
 *   + contextual: trust_ctx, threat_ctx
 *   + effective: tom:effective:dyad:self:other:*
 *
 * Sections:
 *   1. Self-State (feat:char:* vitals + emotions)
 *   2. Event History (event:* atoms — what happened to me and what it did)
 *   3. Perceived Context ƒ(ctx:final)
 *   4. ToM Dyads ƒ(tom:dyad) — beliefs about others
 *   5. Energy Channels ƒ(ener)
 *   6. What I Want ƒ(goal:active) — desires with domain-specific value
 *   7. How I Get It ƒ(decision) — desire→action mapping
 */

import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

function m(atoms: ContextAtom[], id: string, fb = 0): number {
  const a = atoms.find(x => String((x as any).id) === id);
  return Number((a as any)?.magnitude ?? fb);
}
function cl(x: number) { return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)); }
function pct(x: number) { return Math.round(cl(x) * 100); }
function hue(v: number): string { return `hsl(${Math.round(v * 120)}, 70%, 45%)`; }

type Props = {
  atoms: ContextAtom[];
  selfId: string;
  actorLabels?: Record<string, string>;
  participantIds?: string[];
  decision?: any;
};

export const WorldModelPanel: React.FC<Props> = ({
  atoms, selfId, actorLabels = {}, participantIds = [], decision,
}) => {
  const lbl = (id: string) => actorLabels[id] || id.slice(0, 8);
  const all = arr(atoms);

  // ─── 1. Self-State ───
  const selfState = useMemo(() => {
    const keys = [
      ['body.stress', true], ['body.fatigue', true], ['body.pain', true],
      ['body.hunger', true], ['body.morale', false],
      ['trait.paranoia', true], ['trait.sensitivity', true], ['trait.autonomy', false],
    ] as const;
    return keys.map(([k, isDanger]) => ({
      name: k.split('.')[1],
      value: m(all, `feat:char:${selfId}:${k}`, k.includes('morale') ? 0.5 : 0),
      isDanger: isDanger as boolean,
    })).filter(s => s.value > 0.01 || s.name === 'morale');
  }, [all, selfId]);

  const emotions = useMemo(() =>
    all.filter(a => {
      const id = String((a as any).id);
      return id.startsWith('emo:') && id.endsWith(`:${selfId}`) && !id.includes(':dyad:');
    }).map(a => ({
      name: String((a as any).id).split(':')[1],
      v: cl(Number((a as any).magnitude ?? 0)),
    })).filter(e => e.v > 0.02).sort((a, b) => b.v - a.v).slice(0, 8)
  , [all, selfId]);

  // ─── 2. Event History ───
  const events = useMemo(() => {
    return all.filter(a => {
      const id = String((a as any).id);
      return id.startsWith('event:') && !id.startsWith('event:didTo');
    }).map(a => {
      const id = String((a as any).id);
      const ev = (a as any).meta?.event;
      const kind = ev?.kind || id.split(':')[1] || '?';
      const actor = ev?.actorId || (a as any).subject || '?';
      const target = ev?.targetId || (a as any).target || '?';
      const mag = cl(Number((a as any).magnitude ?? 0));
      const tick = ev?.tick ?? (a as any)?.trace?.parts?.tick ?? '?';
      const isDirect = (a as any)?.tags?.includes?.('direct');
      return { kind, actor, target, mag, tick, isDirect, id };
    }).sort((a, b) => (b.tick === '?' ? 0 : b.tick) - (a.tick === '?' ? 0 : a.tick)).slice(0, 10);
  }, [all]);

  const didToMe = useMemo(() =>
    all.filter(a => String((a as any).id).startsWith(`event:didTo:`) && String((a as any).id).includes(`:${selfId}:`))
      .map(a => {
        const parts = String((a as any).id).split(':');
        return { actor: parts[2], kind: parts[4] || '?', mag: cl(Number((a as any).magnitude ?? 0)) };
      }).sort((a, b) => b.mag - a.mag).slice(0, 6)
  , [all, selfId]);

  // ─── 3. Perceived Context ───
  const ctxAxes = useMemo(() => {
    const axes: Array<{ name: string; value: number }> = [];
    for (const a of all) {
      const id = String((a as any).id);
      if (id.startsWith('ctx:final:') && id.endsWith(`:${selfId}`)) {
        const name = id.slice(10, id.length - selfId.length - 1);
        if (name && !name.includes(':') && name.length < 25 && !axes.find(x => x.name === name))
          axes.push({ name, value: cl(Number((a as any).magnitude ?? 0)) });
      }
    }
    return axes.sort((a, b) => b.value - a.value).slice(0, 12);
  }, [all, selfId]);

  // ─── 4. ToM Dyads (CORRECT metrics) ───
  const METRICS = ['trust', 'threat', 'intimacy', 'alignment', 'respect', 'dominance', 'uncertainty', 'support'] as const;
  const DANGER = new Set(['threat', 'uncertainty']);

  const dyads = useMemo(() => {
    const others = participantIds.filter(id => id !== selfId);
    return others.map(oid => {
      const base: Record<string, number> = {};
      const ctx: Record<string, number> = {};
      const eff: Record<string, number> = {};
      for (const metric of METRICS) {
        base[metric] = m(all, `tom:dyad:${selfId}:${oid}:${metric}`, metric === 'trust' || metric === 'respect' ? 0.5 : 0);
        ctx[metric] = m(all, `tom:dyad:${selfId}:${oid}:${metric}_ctx`, -1);
        eff[metric] = m(all, `tom:effective:dyad:${selfId}:${oid}:${metric}`, -1);
      }
      const hasAny = METRICS.some(mt => base[mt] > 0.01 || (eff[mt] >= 0 && eff[mt] > 0.01));
      return { id: oid, base, ctx, eff, hasAny };
    });
  }, [all, selfId, participantIds]);

  // ─── 5. Energy ───
  const energy = useMemo(() => {
    const chs = ['threat', 'norm', 'attachment', 'curiosity', 'status', 'autonomy'];
    return chs.map(ch => ({
      name: ch,
      raw: m(all, `ener:raw:${ch}:${selfId}`),
      felt: m(all, `ener:felt:${ch}:${selfId}`),
    })).filter(c => c.raw > 0.01 || c.felt > 0.01);
  }, [all, selfId]);

  // ─── 6. What I Want (goals with domain-specific value) ───
  const DOMAIN_VALUE: Record<string, string> = {
    survival: '🔴 critical — life preservation',
    safety: '🟠 high — harm avoidance',
    social: '🟡 medium — belonging & trust',
    resource: '🟢 instrumental — material needs',
    autonomy: '🔵 identity — freedom & control',
    wellbeing: '💜 long-term — health & flourishing',
  };

  const goals = useMemo(() => {
    const out: Array<{ id: string; activation: number; domain: string }> = [];
    for (const a of all) {
      const id = String((a as any).id);
      if (id.startsWith('goal:active:') && id.endsWith(`:${selfId}`)) {
        const gid = id.slice(12, id.length - selfId.length - 1);
        const parts = (a as any)?.trace?.parts || {};
        out.push({ id: gid, activation: cl(Number((a as any).magnitude ?? 0)), domain: parts.domain || gid.split(':')[0] || '?' });
      }
    }
    if (!out.length) {
      for (const a of all) {
        const id = String((a as any).id);
        if (id.startsWith('goal:domain:') && id.endsWith(`:${selfId}`)) {
          const gid = id.slice(12, id.length - selfId.length - 1);
          out.push({ id: gid, activation: cl(Number((a as any).magnitude ?? 0)), domain: gid });
        }
      }
    }
    return out.sort((a, b) => b.activation - a.activation).slice(0, 10);
  }, [all, selfId]);

  // ─── 7. How I Get It ───
  const desireActions = useMemo(() => {
    if (!decision?.ranked) return [];
    return arr(decision.ranked).slice(0, 5).map((r: any) => {
      const a = r?.action || r;
      const dg = a?.deltaGoals || {};
      const topG = Object.entries(dg)
        .sort((x: any, y: any) => Math.abs(y[1] as number) - Math.abs(x[1] as number))
        .slice(0, 3);
      return {
        label: a?.label || a?.id || a?.kind || '?',
        kind: a?.kind || '?',
        q: Number(r?.q ?? 0),
        cost: Number(a?.cost ?? 0),
        conf: Number(a?.confidence ?? 1),
        targetId: a?.targetId,
        topGoals: topG.map(([g, d]) => ({ goal: g, delta: d as number })),
      };
    });
  }, [decision]);

  return (
    <div className="space-y-2 text-[10px]">

      {/* 1. Self-State */}
      <Sec title={`${lbl(selfId)} — Internal State`}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {selfState.map(s => (
            <Row key={s.name} label={s.name} value={s.value} color={s.isDanger ? hue(1 - s.value) : hue(s.value)} />
          ))}
        </div>
        {emotions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-slate-800/30">
            {emotions.map(e => (
              <span key={e.name} className="px-1 py-0.5 rounded bg-slate-800/50 text-[9px]">
                {e.name} <span className="text-amber-400 font-mono">{pct(e.v)}</span>
              </span>
            ))}
          </div>
        )}
      </Sec>

      {/* 2. Event History */}
      {(events.length > 0 || didToMe.length > 0) && (
        <Sec title="Event History ƒ(event:*)">
          <F>event atoms = ƒ(world.eventLog, age decay, direct/witnessed)</F>
          {didToMe.length > 0 && (
            <div className="mb-1">
              <div className="text-[8px] text-slate-600 mb-0.5">What others did to me (aggregated):</div>
              {didToMe.map((d, i) => (
                <div key={i} className="flex items-center gap-1 text-[9px]">
                  <span className="text-slate-400">{lbl(d.actor)}</span>
                  <span className="text-slate-600">→</span>
                  <span className={d.kind.includes('attack') || d.kind.includes('harm') ? 'text-red-400' : d.kind.includes('help') ? 'text-emerald-400' : 'text-slate-300'}>
                    {d.kind}
                  </span>
                  <span className="font-mono text-[8px] text-slate-500">{d.mag.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          {events.length > 0 && (
            <div>
              <div className="text-[8px] text-slate-600 mb-0.5">Recent events:</div>
              {events.map((ev, i) => (
                <div key={i} className="flex items-center gap-1 text-[9px] mb-0.5">
                  <span className="text-[7px] text-slate-700 w-6">t{ev.tick}</span>
                  <span className="text-slate-400 w-10 truncate">{lbl(ev.actor)}</span>
                  <span className="text-slate-600">→</span>
                  <span className="text-slate-300 flex-1 truncate">{ev.kind}</span>
                  <span className="text-slate-400 w-10 truncate text-right">{ev.target !== '?' ? lbl(ev.target) : ''}</span>
                  <span className="font-mono text-[8px] text-amber-500">{pct(ev.mag)}</span>
                </div>
              ))}
            </div>
          )}
        </Sec>
      )}

      {/* 3. Perceived Context */}
      {ctxAxes.length > 0 && (
        <Sec title="Perceived Context ƒ(ctx:final)">
          <F>ctx:final = ƒ(S0 world → S1 axes → S2c lens subjectivity)</F>
          <div className="space-y-0.5">
            {ctxAxes.map(a => <Row key={a.name} label={a.name} value={a.value} color="#38bdf8" />)}
          </div>
        </Sec>
      )}

      {/* 4. ToM Dyads */}
      {dyads.length > 0 && (
        <Sec title="Beliefs About Others ƒ(tom:dyad)">
          <F>base = ƒ(initTom) → _ctx = ƒ(beliefBias × base) → effective = ƒ(ctx)</F>
          {dyads.map(d => (
            <div key={d.id} className="border border-slate-800/40 rounded p-1.5 bg-slate-950/30 mb-1.5">
              <div className="font-bold text-slate-300 text-[9px] mb-0.5">→ {lbl(d.id)}</div>
              {!d.hasAny && <div className="text-[8px] text-slate-700 italic">No tom:dyad atoms found for this pair</div>}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {METRICS.map(mt => {
                  const b = d.base[mt];
                  const c = d.ctx[mt];
                  const e = d.eff[mt];
                  const isDanger = DANGER.has(mt);
                  if (b < 0.01 && (c < 0) && (e < 0)) return null;
                  return (
                    <div key={mt} className="flex items-center gap-1">
                      <span className={`w-16 text-right text-[9px] ${isDanger ? 'text-rose-500' : 'text-slate-500'}`}>{mt}</span>
                      <span className="font-mono text-[9px]" style={{ color: isDanger ? (b > 0.4 ? '#ef4444' : '#64748b') : hue(b) }}>{pct(b)}</span>
                      {c >= 0 && Math.abs(c - b) > 0.02 && <span className="text-[8px] text-yellow-600">→{pct(c)}</span>}
                      {e >= 0 && Math.abs(e - (c >= 0 ? c : b)) > 0.02 && <span className="text-[8px] text-cyan-500">→{pct(e)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </Sec>
      )}

      {/* 5. Energy */}
      {energy.length > 0 && (
        <Sec title="Energy Channels ƒ(ener)">
          <F>raw = ƒ(ctx atoms) → felt = ƒ(raw × personality curve)</F>
          {energy.map(ch => (
            <div key={ch.name} className="flex items-center gap-1.5 mb-0.5">
              <span className="w-16 text-right text-slate-400">{ch.name}</span>
              <div className="flex-1 flex gap-0.5 h-2">
                <div className="flex-1 bg-slate-800 rounded-sm overflow-hidden" title={`raw ${ch.raw.toFixed(2)}`}>
                  <div className="h-full bg-amber-600/60 rounded-sm" style={{ width: `${pct(ch.raw)}%` }} />
                </div>
                <div className="flex-1 bg-slate-800 rounded-sm overflow-hidden" title={`felt ${ch.felt.toFixed(2)}`}>
                  <div className="h-full bg-rose-500/60 rounded-sm" style={{ width: `${pct(ch.felt)}%` }} />
                </div>
              </div>
              <span className="text-[8px] text-slate-600 w-12">{ch.raw.toFixed(2)}/{ch.felt.toFixed(2)}</span>
            </div>
          ))}
        </Sec>
      )}

      {/* 6. What I Want */}
      {goals.length > 0 && (
        <Sec title="What I Want ƒ(goal:active)">
          <F>activation = ƒ(domain energy × driver weight × trait). Value differs by domain.</F>
          {goals.map(g => (
            <div key={g.id} className="mb-1">
              <div className="flex items-center gap-1.5">
                <span className="flex-1 truncate text-slate-300">{g.id}</span>
                <Bar value={g.activation} color="#f59e0b" />
                <span className="text-amber-400 w-6 text-right font-mono">{pct(g.activation)}</span>
              </div>
              <div className="text-[8px] text-slate-600 ml-1">{DOMAIN_VALUE[g.domain] || `domain: ${g.domain}`}</div>
            </div>
          ))}
        </Sec>
      )}

      {/* 7. How I Get It */}
      {desireActions.length > 0 && (
        <Sec title="How I Get It ƒ(decision)">
          <F>Q(a) = Σ E_g × Δg(a) − cost − 0.4|Q|(1−conf). Best = softmax(Q/T).</F>
          {desireActions.map((a, i) => (
            <div key={i} className={`border rounded p-1.5 mb-1 ${i === 0 ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-slate-800/30 bg-slate-950/15'}`}>
              <div className="flex items-center gap-1">
                <span className={`font-bold ${i === 0 ? 'text-emerald-300' : 'text-slate-400'}`}>{i + 1}.</span>
                <span className={`flex-1 truncate ${i === 0 ? 'text-emerald-200' : 'text-slate-300'}`}>{a.label}</span>
                {a.targetId && <span className="text-[8px] text-slate-600">→{lbl(a.targetId)}</span>}
                <span className="font-mono text-[9px] text-amber-400">Q={a.q.toFixed(3)}</span>
              </div>
              <div className="flex gap-2 ml-4 text-[8px]">
                <span className="text-slate-500">ƒ(kind)={a.kind}</span>
                <span className="text-red-500/70">ƒ(cost)={a.cost.toFixed(2)}</span>
                <span className="text-blue-500/70">ƒ(conf)={a.conf.toFixed(2)}</span>
              </div>
              {a.topGoals.length > 0 && (
                <div className="ml-4 mt-0.5 flex flex-wrap gap-1">
                  {a.topGoals.map(g => (
                    <span key={g.goal} className={`text-[8px] px-1 rounded ${g.delta > 0 ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                      ƒ(Δ{g.goal})={g.delta > 0 ? '+' : ''}{g.delta.toFixed(2)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Sec>
      )}
    </div>
  );
};

// ─── Micro-components ───
const Sec: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2">
    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</div>
    {children}
  </div>
);

const F: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5 mb-1">{children}</div>
);

const Row: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-slate-500 w-16 text-right text-[9px]">{label}</span>
    <Bar value={value} color={color} />
    <span className="text-slate-600 w-5 text-right font-mono text-[8px]">{pct(value)}</span>
  </div>
);

const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden max-w-[60px]">
    <div className="h-full rounded-full" style={{ width: `${pct(value)}%`, backgroundColor: color }} />
  </div>
);
