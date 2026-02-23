/**
 * WorldModelPanel — "what's inside the character's head"
 *
 * Shows the agent's subjective world model derived from atoms:
 * - Self-state (body, affect, needs)
 * - Spatial awareness (where I am, who's nearby, danger zones)
 * - Dyadic beliefs (trust/threat/bond for each other character)
 * - Perceived context (what do I think is happening)
 * - Active goals & drives
 * - Current action tendency
 */

import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

function mag(atoms: ContextAtom[], id: string, fb = 0): number {
  const a = atoms.find(x => String((x as any).id) === id);
  return Number((a as any)?.magnitude ?? fb);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function pct(x: number) {
  return Math.round(clamp01(x) * 100);
}

function hue(v: number): string {
  // 0 = red, 0.5 = yellow, 1 = green
  const h = Math.round(v * 120);
  return `hsl(${h}, 70%, 45%)`;
}

type Props = {
  atoms: ContextAtom[];
  selfId: string;
  actorLabels?: Record<string, string>;
  participantIds?: string[];
};

export const WorldModelPanel: React.FC<Props> = ({
  atoms,
  selfId,
  actorLabels = {},
  participantIds = [],
}) => {
  const label = (id: string) => actorLabels[id] || id.slice(0, 8);
  const all = arr(atoms);

  // --- Self State ---
  const selfState = useMemo(
    () => ({
      stress: mag(all, `feat:char:${selfId}:body.stress`),
      fatigue: mag(all, `feat:char:${selfId}:body.fatigue`),
      pain: mag(all, `feat:char:${selfId}:body.pain`),
      hunger: mag(all, `feat:char:${selfId}:body.hunger`),
      morale: mag(all, `feat:char:${selfId}:body.morale`, 0.5),
      paranoia: mag(all, `feat:char:${selfId}:trait.paranoia`, 0.5),
      sensitivity: mag(all, `feat:char:${selfId}:trait.sensitivity`, 0.5),
      autonomy: mag(all, `feat:char:${selfId}:trait.autonomy`, 0.5),
    }),
    [all, selfId]
  );

  // --- Spatial awareness ---
  const spatial = useMemo(() => {
    const danger = mag(all, `ctx:final:danger:${selfId}`, mag(all, `ctx:danger:${selfId}`));
    const safety = mag(all, `ctx:final:safety:${selfId}`, mag(all, `ctx:safety:${selfId}`));
    const crowd = mag(all, `ctx:final:crowd:${selfId}`, mag(all, `ctx:crowd:${selfId}`));
    const privacy = mag(all, `ctx:final:privacy:${selfId}`, mag(all, `ctx:privacy:${selfId}`));
    const surveillance = mag(all, `ctx:final:surveillance:${selfId}`, mag(all, `ctx:surveillance:${selfId}`));
    return { danger, safety, crowd, privacy, surveillance };
  }, [all, selfId]);

  // --- Perceived context (ctx:final:*) ---
  const ctxAxes = useMemo(() => {
    const axes: Array<{ name: string; value: number }> = [];
    const prefix1 = 'ctx:final:';
    const prefix2 = 'ctx:';
    for (const a of all) {
      const id = String((a as any).id);
      let name = '';
      if (id.startsWith(prefix1) && id.endsWith(`:${selfId}`)) {
        name = id.slice(prefix1.length, id.length - selfId.length - 1);
      } else if (
        id.startsWith(prefix2) &&
        id.endsWith(`:${selfId}`) &&
        !id.includes('final') &&
        !id.includes('prio')
      ) {
        name = id.slice(prefix2.length, id.length - selfId.length - 1);
      }
      if (name && !name.includes(':') && name.length < 25) {
        const v = clamp01(Number((a as any).magnitude ?? 0));
        if (!axes.find(x => x.name === name)) axes.push({ name, value: v });
      }
    }
    return axes.sort((a, b) => b.value - a.value).slice(0, 14);
  }, [all, selfId]);

  // --- ToM Dyads (beliefs about others) ---
  const dyads = useMemo(() => {
    const others = participantIds.filter(id => id !== selfId);
    return others.map(otherId => {
      const trust = mag(all, `tom:dyad:${selfId}:${otherId}:trust`, 0.5);
      const threat = mag(all, `tom:dyad:${selfId}:${otherId}:threat`);
      const bond = mag(all, `tom:dyad:${selfId}:${otherId}:bond`);
      const respect = mag(all, `tom:dyad:${selfId}:${otherId}:respect`, 0.5);
      const fear = mag(all, `tom:dyad:${selfId}:${otherId}:fear`);
      const conflict = mag(all, `tom:dyad:${selfId}:${otherId}:conflict`);
      // effective (post-ctx)
      const eTrust = mag(all, `tom:effective:dyad:${selfId}:${otherId}:trust`, trust);
      const eThreat = mag(all, `tom:effective:dyad:${selfId}:${otherId}:threat`, threat);
      return { id: otherId, trust, threat, bond, respect, fear, conflict, eTrust, eThreat };
    });
  }, [all, selfId, participantIds]);

  // --- Energy channels ---
  const energy = useMemo(() => {
    const channels = ['threat', 'norm', 'attachment', 'curiosity', 'status', 'autonomy'];
    return channels
      .map(ch => ({
        name: ch,
        raw: mag(all, `ener:raw:${ch}:${selfId}`),
        felt: mag(all, `ener:felt:${ch}:${selfId}`),
        state: mag(all, `ener:state:${ch}:${selfId}`),
      }))
      .filter(c => c.raw > 0.01 || c.felt > 0.01 || c.state > 0.01);
  }, [all, selfId]);

  // --- Active goals ---
  const goals = useMemo(() => {
    const out: Array<{ id: string; activation: number }> = [];
    for (const a of all) {
      const id = String((a as any).id);
      if (id.startsWith('goal:active:') && id.endsWith(`:${selfId}`)) {
        const goalId = id.slice('goal:active:'.length, id.length - selfId.length - 1);
        out.push({ id: goalId, activation: clamp01(Number((a as any).magnitude ?? 0)) });
      }
    }
    if (out.length === 0) {
      for (const a of all) {
        const id = String((a as any).id);
        if (id.startsWith('goal:domain:') && id.endsWith(`:${selfId}`)) {
          const goalId = id.slice('goal:domain:'.length, id.length - selfId.length - 1);
          out.push({ id: goalId, activation: clamp01(Number((a as any).magnitude ?? 0)) });
        }
      }
    }
    return out.sort((a, b) => b.activation - a.activation).slice(0, 8);
  }, [all, selfId]);

  // --- Decision ---
  const decision = useMemo(() => {
    const acts = all
      .filter(a => String((a as any).id).startsWith('dec:') && String((a as any).id).includes(selfId))
      .map(a => ({
        id: String((a as any).id),
        q: Number((a as any).magnitude ?? 0),
        label: String((a as any).label || (a as any).id),
      }))
      .sort((a, b) => b.q - a.q);
    return acts.slice(0, 5);
  }, [all, selfId]);

  // --- Emotions ---
  const emotions = useMemo(() => {
    return all
      .filter(a => {
        const id = String((a as any).id);
        return id.startsWith('emo:') && id.endsWith(`:${selfId}`) && !id.includes(':dyad:');
      })
      .map(a => ({
        name: String((a as any).id).split(':')[1] || '?',
        mag: clamp01(Number((a as any).magnitude ?? 0)),
      }))
      .filter(e => e.mag > 0.02)
      .sort((a, b) => b.mag - a.mag)
      .slice(0, 8);
  }, [all, selfId]);

  return (
    <div className="space-y-3 text-[10px]">
      {/* Self-state */}
      <WMSection title={`${label(selfId)} — Self State`}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {Object.entries(selfState).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-slate-500 w-16 text-right">{k}</span>
              <MiniBar value={v} color={k === 'morale' ? hue(v) : hue(1 - v)} />
              <span className="text-slate-600 w-6 text-right">{pct(v)}</span>
            </div>
          ))}
        </div>
      </WMSection>

      {/* Emotions */}
      {emotions.length > 0 && (
        <WMSection title="Emotions">
          <div className="flex flex-wrap gap-1.5">
            {emotions.map(e => (
              <span
                key={e.name}
                className="px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/50"
                style={{ borderColor: `hsla(${e.mag * 60}, 60%, 50%, 0.4)` }}
              >
                {e.name} <span className="text-amber-400">{pct(e.mag)}</span>
              </span>
            ))}
          </div>
        </WMSection>
      )}

      {/* Spatial perception */}
      <WMSection title="Spatial Awareness">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {Object.entries(spatial).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-slate-500 w-16 text-right">{k}</span>
              <MiniBar value={v} color={k === 'danger' ? '#ef4444' : k === 'safety' ? '#22c55e' : '#64748b'} />
              <span className="text-slate-600 w-6 text-right">{pct(v)}</span>
            </div>
          ))}
        </div>
      </WMSection>

      {/* Context axes */}
      {ctxAxes.length > 0 && (
        <WMSection title="Perceived Context">
          <div className="space-y-0.5">
            {ctxAxes.map(a => (
              <div key={a.name} className="flex items-center gap-1.5">
                <span className="text-slate-500 w-20 text-right truncate">{a.name}</span>
                <MiniBar value={a.value} color="#38bdf8" />
                <span className="text-slate-600 w-6 text-right">{pct(a.value)}</span>
              </div>
            ))}
          </div>
        </WMSection>
      )}

      {/* ToM Dyads */}
      {dyads.length > 0 && (
        <WMSection title="Beliefs About Others (ToM Dyads)">
          <div className="space-y-2">
            {dyads.map(d => (
              <div key={d.id} className="border border-slate-800/50 rounded p-1.5 bg-slate-950/30">
                <div className="font-bold text-slate-300 mb-0.5">→ {label(d.id)}</div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                  <DyadMetric label="trust" base={d.trust} eff={d.eTrust} />
                  <DyadMetric label="threat" base={d.threat} eff={d.eThreat} danger />
                  <DyadMetric label="bond" base={d.bond} />
                  <DyadMetric label="respect" base={d.respect} />
                  <DyadMetric label="fear" base={d.fear} danger />
                  <DyadMetric label="conflict" base={d.conflict} danger />
                </div>
              </div>
            ))}
          </div>
        </WMSection>
      )}

      {/* Energy Channels */}
      {energy.length > 0 && (
        <WMSection title="Energy Channels">
          {energy.map(ch => (
            <div key={ch.name} className="flex items-center gap-1.5 mb-0.5">
              <span className="w-16 text-right text-slate-400">{ch.name}</span>
              <div className="flex-1 flex gap-0.5 h-2.5">
                <div className="flex-1 bg-slate-800 rounded-sm overflow-hidden" title={`raw: ${ch.raw.toFixed(2)}`}>
                  <div className="h-full bg-amber-600/60 rounded-sm" style={{ width: `${pct(ch.raw)}%` }} />
                </div>
                <div className="flex-1 bg-slate-800 rounded-sm overflow-hidden" title={`felt: ${ch.felt.toFixed(2)}`}>
                  <div className="h-full bg-rose-500/60 rounded-sm" style={{ width: `${pct(ch.felt)}%` }} />
                </div>
              </div>
              <span className="text-[8px] text-slate-600 w-12">
                {ch.raw.toFixed(2)}/{ch.felt.toFixed(2)}
              </span>
            </div>
          ))}
        </WMSection>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <WMSection title="Active Goals">
          {goals.map(g => (
            <div key={g.id} className="flex items-center gap-1.5 mb-0.5">
              <span className="flex-1 truncate text-slate-300">{g.id}</span>
              <MiniBar value={g.activation} color="#f59e0b" />
              <span className="text-amber-400 w-6 text-right">{pct(g.activation)}</span>
            </div>
          ))}
        </WMSection>
      )}

      {/* Decision tendencies */}
      {decision.length > 0 && (
        <WMSection title="Action Tendencies">
          {decision.map((d, i) => (
            <div
              key={d.id}
              className={`flex items-center gap-1.5 mb-0.5 ${i === 0 ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}
            >
              <span className="w-3 text-[8px] opacity-50">{i + 1}</span>
              <span className="flex-1 truncate">{d.label}</span>
              <span className="font-mono text-[9px]">{d.q.toFixed(2)}</span>
            </div>
          ))}
        </WMSection>
      )}
    </div>
  );
};

// --- Micro-components ---

const WMSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2">
    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</div>
    {children}
  </div>
);

const MiniBar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden max-w-[60px]">
    <div className="h-full rounded-full" style={{ width: `${pct(value)}%`, backgroundColor: color }} />
  </div>
);

const DyadMetric: React.FC<{ label: string; base: number; eff?: number; danger?: boolean }> = ({
  label,
  base,
  eff,
  danger,
}) => (
  <div className="flex items-center gap-1">
    <span className={`text-[9px] ${danger ? 'text-rose-500' : 'text-slate-500'}`}>{label}</span>
    <span
      className="font-mono text-[9px]"
      style={{ color: danger ? (base > 0.4 ? '#ef4444' : '#64748b') : hue(base) }}
    >
      {pct(base)}
    </span>
    {eff !== undefined && Math.abs(eff - base) > 0.02 && <span className="text-[8px] text-cyan-600">→{pct(eff)}</span>}
  </div>
);
