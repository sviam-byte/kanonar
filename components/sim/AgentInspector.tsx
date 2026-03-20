// components/sim/AgentInspector.tsx
// Rich agent inspection panel: decision trace, emotions, drivers, relations, and goals.
// Reads world.facts['sim:trace:<agentId>'] written by goalLabDeciderPlugin.

import React, { useMemo } from 'react';
import type { SimWorld } from '../../lib/simkit/core/types';

type Props = {
  world: SimWorld | null;
  agentId: string;
  names: Record<string, string>;
};

const ACTION_RU: Record<string, string> = {
  wait: 'ждать', rest: 'отдыхать', hide: 'спрятаться', escape: 'убежать',
  observe: 'наблюдать', talk: 'говорить', negotiate: 'переговоры', comfort: 'утешить',
  help: 'помочь', treat: 'лечить', guard: 'охранять', attack: 'атаковать',
  avoid: 'избегать', confront: 'конфронтировать', threaten: 'угрожать', command: 'командовать',
  investigate: 'расследовать', share_resource: 'поделиться', loot: 'мародёрить',
  accuse: 'обвинить', praise: 'хвалить', apologize: 'извиниться', submit: 'подчиниться',
};

const EMO_RU: Record<string, string> = {
  fear: 'страх', anger: 'гнев', shame: 'стыд', relief: 'облегчение',
  resolve: 'решимость', care: 'забота', arousal: 'возбуждение', valence: 'валентность',
};

const DRV_RU: Record<string, string> = {
  safetyNeed: 'безопасность', controlNeed: 'контроль', statusNeed: 'статус',
  affiliationNeed: 'привязанность', resolveNeed: 'решимость', restNeed: 'отдых', curiosityNeed: 'любопытство',
};

const MiniBar: React.FC<{ value: number; color: string; w?: number }> = ({ value, color, w = 60 }) => (
  <div style={{ width: w, height: 6, background: '#1e293b', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
    <div style={{ width: Math.max(0, Math.min(w, value * w)), height: '100%', background: color, borderRadius: 2 }} />
  </div>
);

export const AgentInspector: React.FC<Props> = ({ world, agentId, names }) => {
  const trace = useMemo(() => {
    if (!world || !agentId) return null;
    return (world.facts as any)?.[`sim:trace:${agentId}`] ?? null;
  }, [world, agentId]);

  const char = world?.characters?.[agentId];
  if (!char || !trace) return <div style={{ padding: 8, color: '#475569', fontSize: 11 }}>Выбери агента</div>;

  const n = (id: string) => names[id] || id;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 10, padding: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{char.name || agentId}</span>
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 4,
            background: trace.decisionMode === 'reactive' ? '#7f1d1d' : trace.decisionMode === 'degraded' ? '#78350f' : '#0c4a6e',
            color: trace.decisionMode === 'reactive' ? '#fca5a5' : trace.decisionMode === 'degraded' ? '#fde68a' : '#7dd3fc',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {trace.decisionMode === 'reactive' ? '⚡ System 1' : trace.decisionMode === 'degraded' ? '⚠ Degraded' : '🧠 System 2'}
        </span>
      </div>

      {trace.best && (
        <div style={{ background: '#0c1929', border: '1px solid #1e3a5f', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>
            → {ACTION_RU[trace.best.kind] || trace.best.kind}
            {trace.best.targetId ? ` → ${n(trace.best.targetId)}` : ''}
            <span style={{ color: '#475569', fontWeight: 400, marginLeft: 8 }}>Q={Number(trace.best.q ?? 0).toFixed(3)}</span>
          </div>
          {(trace.best.explanation || []).map((line: string, i: number) => (
            <div key={i} style={{ color: '#94a3b8', fontSize: 10, paddingLeft: 8, lineHeight: 1.5 }}>{line}</div>
          ))}
        </div>
      )}

      {trace.ranked?.length > 1 && (
        <div>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 600 }}>Рассматривал</div>
          {trace.ranked.slice(0, 6).map((r: any, i: number) => {
            const isChosen = i === 0;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', color: isChosen ? '#fbbf24' : '#64748b' }}>
                <span style={{ width: 16, textAlign: 'right', fontSize: 9 }}>{i + 1}.</span>
                <span style={{ width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ACTION_RU[r.kind] || r.kind}
                  {r.targetId ? `→${n(r.targetId).slice(0, 8)}` : ''}
                </span>
                <MiniBar value={Math.max(0, (Number(r.q ?? 0) + 0.5) / 1.5)} color={isChosen ? '#fbbf24' : '#475569'} w={50} />
                <span style={{ fontSize: 9, width: 45 }}>Q={Number(r.q ?? 0).toFixed(3)}</span>
              </div>
            );
          })}
        </div>
      )}

      {Object.keys(trace.emotions || {}).length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 600 }}>Эмоции</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(trace.emotions as Record<string, number>)
              .filter(([k]) => !['arousal', 'valence'].includes(k))
              .sort(([, a], [, b]) => Number(b) - Number(a))
              .map(([key, val]) => {
                const numeric = Number(val);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#64748b', width: 55, textAlign: 'right' }}>{EMO_RU[key] || key}</span>
                    <MiniBar value={numeric} color={key === 'fear' ? '#ef4444' : key === 'anger' ? '#f97316' : key === 'shame' ? '#a855f7' : key === 'care' ? '#22d3ee' : '#4ade80'} w={40} />
                    <span style={{ fontSize: 8, color: '#475569', width: 24 }}>{pct(numeric)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {Object.keys(trace.drivers || {}).length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 600 }}>Потребности</div>
          {Object.entries(trace.drivers as Record<string, number>)
            .sort(([, a], [, b]) => Number(b) - Number(a))
            .map(([key, val]) => {
              const numeric = Number(val);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 0' }}>
                  <span style={{ fontSize: 9, color: '#64748b', width: 75, textAlign: 'right' }}>{DRV_RU[key] || key}</span>
                  <MiniBar value={numeric} color="#f97316" w={50} />
                  <span style={{ fontSize: 8, color: '#475569' }}>{pct(numeric)}</span>
                </div>
              );
            })}
        </div>
      )}

      {Object.keys(trace.relations || {}).length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 600 }}>Отношения</div>
          {Object.entries(trace.relations as Record<string, Record<string, number>>).map(([otherId, metrics]) => (
            <div key={otherId} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>→ {n(otherId)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 12 }}>
                {Object.entries(metrics)
                  .filter(([, v]) => Number.isFinite(Number(v)))
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([metric, val]) => {
                    const v = Number(val);
                    const color = metric === 'trust'
                      ? (v > 0.6 ? '#22c55e' : v < 0.4 ? '#ef4444' : '#64748b')
                      : metric === 'threat'
                        ? (v > 0.5 ? '#ef4444' : '#64748b')
                        : metric === 'familiarity'
                          ? '#3b82f6'
                          : '#64748b';
                    return (
                      <span key={metric} style={{ fontSize: 9, color }}>
                        {metric}: {pct(v)}
                      </span>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      {trace.goals?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 600 }}>
            Цели {trace.mode && <span style={{ color: '#22d3ee' }}>({trace.mode})</span>}
          </div>
          {(trace.goals as any[]).sort((a: any, b: any) => Number(b.score) - Number(a.score)).map((g: any) => {
            const active = (trace.activeGoals || []).includes(g.domain);
            return (
              <div key={g.domain} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 0', opacity: active ? 1 : 0.5 }}>
                {active && <span style={{ color: '#22d3ee', fontSize: 8 }}>●</span>}
                <span style={{ fontSize: 9, color: active ? '#e2e8f0' : '#475569', width: 65, textAlign: 'right' }}>{g.domain}</span>
                <MiniBar value={Number(g.score ?? 0)} color={active ? '#22d3ee' : '#334155'} w={50} />
                <span style={{ fontSize: 8, color: '#475569' }}>{pct(Number(g.score ?? 0))}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
