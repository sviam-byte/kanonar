// components/sim/DyadPanel.tsx
// Side-by-side dyad comparison panel for DialogueLab v3.
// Shows two agents' internal states, their mutual trust/threat, and dynamics.

import React, { useMemo } from 'react';
import type { SimWorld } from '../../lib/simkit/core/types';
import { getDialogueLog } from '../../lib/simkit/dialogue/dialogueState';
import { clamp01 } from '../../lib/util/math';

type Props = {
  world: SimWorld | null;
  agentA: string;
  agentB: string;
  names: Record<string, string>;
};

const ACTION_RU: Record<string, string> = {
  wait: 'ждать', rest: 'отдыхать', hide: 'спрятаться', escape: 'убежать',
  observe: 'наблюдать', talk: 'говорить', negotiate: 'переговоры', comfort: 'утешить',
  help: 'помочь', treat: 'лечить', guard: 'охранять', attack: 'атаковать',
  avoid: 'избегать', confront: 'конфронтировать', threaten: 'угрожать',
  move: 'идти', move_cell: 'двигаться', move_xy: 'двигаться',
};

const EMO_ICON: Record<string, string> = {
  fear: '😨', anger: '😠', shame: '😔', relief: '😌', resolve: '💪', care: '💙',
};

// ─── Helpers ──────────────────────────────────────────────────────────

function readTrace(world: SimWorld, id: string): any {
  return (world.facts as any)?.[`sim:trace:${id}`] ?? null;
}

function readRel(world: SimWorld, from: string, to: string, metric: string): number {
  const v = Number((world.facts as any)?.relations?.[from]?.[to]?.[metric] ?? NaN);
  return Number.isFinite(v) ? clamp01(v) : NaN;
}

function topEntry(obj: Record<string, number> | undefined, skip: string[] = []): [string, number] | null {
  if (!obj) return null;
  let best: [string, number] | null = null;
  for (const [k, v] of Object.entries(obj)) {
    if (skip.includes(k)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (!best || n > best[1]) best = [k, n];
  }
  return best;
}

// ─── Mini components ──────────────────────────────────────────────────

const Bar: React.FC<{ v: number; color: string; w?: number }> = ({ v, color, w = 56 }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
    <div style={{ width: w, height: 5, background: '#1e293b', borderRadius: 2 }}>
      <div style={{ width: clamp01(v) * w, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ fontSize: 8, color: '#64748b', width: 26, textAlign: 'right' }}>{Math.round(v * 100)}%</span>
  </div>
);

const Delta: React.FC<{ v: number }> = ({ v }) => {
  if (!Number.isFinite(v) || Math.abs(v) < 0.005) return null;
  const sign = v > 0 ? '+' : '';
  const color = v > 0.05 ? '#22c55e' : v < -0.05 ? '#ef4444' : '#64748b';
  return <span style={{ fontSize: 8, color, marginLeft: 4 }}>({sign}{Math.round(v * 100)})</span>;
};

// ─── Agent column ─────────────────────────────────────────────────────

const AgentCol: React.FC<{
  world: SimWorld;
  selfId: string;
  otherId: string;
  names: Record<string, string>;
  color: string;
}> = ({ world, selfId, otherId, names, color }) => {
  const trace = readTrace(world, selfId);
  const char = world.characters?.[selfId];
  if (!char) return null;

  const trust = readRel(world, selfId, otherId, 'trust');
  const threat = readRel(world, selfId, otherId, 'threat');

  const topEmo = topEntry(trace?.emotions, ['arousal', 'valence']);
  const topGoal = trace?.goals?.sort((a: any, b: any) => Number(b.score) - Number(a.score))?.[0];
  const best = trace?.best;
  const mode = trace?.decisionMode;

  const n = (id: string) => names[id] || id;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color }}>{n(selfId)}</span>
        {mode && (
          <span style={{
            fontSize: 8, padding: '1px 4px', borderRadius: 3,
            background: mode === 'reactive' ? '#7f1d1d' : mode === 'degraded' ? '#78350f' : '#0c4a6e',
            color: mode === 'reactive' ? '#fca5a5' : mode === 'degraded' ? '#fde68a' : '#7dd3fc',
            fontWeight: 600,
          }}>
            {mode === 'reactive' ? '⚡S1' : mode === 'degraded' ? '⚠' : '🧠S2'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10 }}>
        {Number.isFinite(trust) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#64748b', width: 46, textAlign: 'right', fontSize: 9 }}>trust→</span>
            <Bar v={trust} color={trust > 0.6 ? '#22c55e' : trust < 0.35 ? '#ef4444' : '#f59e0b'} />
          </div>
        )}
        {Number.isFinite(threat) && threat > 0.1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#64748b', width: 46, textAlign: 'right', fontSize: 9 }}>threat→</span>
            <Bar v={threat} color="#ef4444" />
          </div>
        )}
        {topEmo && topEmo[1] > 0.15 && (
          <div style={{ color: '#94a3b8', fontSize: 9 }}>
            {EMO_ICON[topEmo[0]] || '💭'} {topEmo[0]}: {Math.round(topEmo[1] * 100)}%
          </div>
        )}
        {topGoal && (
          <div style={{ color: '#22d3ee', fontSize: 9 }}>
            ◎ {topGoal.domain}: {Math.round(Number(topGoal.score ?? 0) * 100)}%
          </div>
        )}
        {best && (
          <div style={{ color: '#fbbf24', fontSize: 9, fontWeight: 600 }}>
            → {ACTION_RU[trace?.uiAction?.semanticKind || best.kind] || trace?.uiAction?.semanticKind || best.kind}
            {(trace?.uiAction?.semanticTargetId || best.targetId) ? ` → ${n(trace?.uiAction?.semanticTargetId || best.targetId).slice(0, 10)}` : ''}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Dynamics section ─────────────────────────────────────────────────

function useDyadDynamics(world: SimWorld | null, agentA: string, agentB: string) {
  return useMemo(() => {
    if (!world) return null;

    const log = getDialogueLog(world);
    const windowSize = 5;
    const currentTick = Number((world as any).tickIndex ?? 0);
    const windowStart = Math.max(0, currentTick - windowSize);

    // Speech stats in window
    let aToB = 0;
    let bToA = 0;
    let truthful = 0;
    let selective = 0;
    let deceptive = 0;
    for (const e of log) {
      if (e.tick < windowStart) continue;
      if (e.speakerId === agentA && e.targetId === agentB) aToB++;
      if (e.speakerId === agentB && e.targetId === agentA) bToA++;
      if (e.intent === 'truthful') truthful++;
      else if (e.intent === 'selective') selective++;
      else if (e.intent === 'deceptive') deceptive++;
    }

    // Trust trajectory: read from facts history if available,
    // otherwise just show current values.
    const trustAB = Number((world.facts as any)?.relations?.[agentA]?.[agentB]?.trust ?? NaN);
    const trustBA = Number((world.facts as any)?.relations?.[agentB]?.[agentA]?.trust ?? NaN);

    // Try reading previous trust from trace history stored per-agent
    const prevTrustAB = Number((world.facts as any)?.[`sim:prevTrust:${agentA}:${agentB}`] ?? NaN);
    const prevTrustBA = Number((world.facts as any)?.[`sim:prevTrust:${agentB}:${agentA}`] ?? NaN);

    const deltaTrustAB = Number.isFinite(trustAB) && Number.isFinite(prevTrustAB) ? trustAB - prevTrustAB : NaN;
    const deltaTrustBA = Number.isFinite(trustBA) && Number.isFinite(prevTrustBA) ? trustBA - prevTrustBA : NaN;

    const totalSpeech = aToB + bToA;

    return {
      aToB,
      bToA,
      totalSpeech,
      trustAB,
      trustBA,
      deltaTrustAB,
      deltaTrustBA,
      truthful,
      selective,
      deceptive,
    };
  }, [world, agentA, agentB]);
}

// ─── Main ─────────────────────────────────────────────────────────────

export const DyadPanel: React.FC<Props> = ({ world, agentA, agentB, names }) => {
  const dynamics = useDyadDynamics(world, agentA, agentB);

  if (!world || !agentA || !agentB) {
    return (
      <div style={{ padding: 12, color: '#475569', fontSize: 11, fontStyle: 'italic' }}>
        Выбери агента — собеседник определится автоматически.
      </div>
    );
  }

  const n = (id: string) => names[id] || id;

  return (
    <div style={{
      fontFamily: '"JetBrains Mono", monospace',
      padding: 8,
      background: '#0c1929',
      border: '1px solid #1e293b',
      borderRadius: 6,
    }}>
      {/* Two columns: agent A and agent B */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <AgentCol world={world} selfId={agentA} otherId={agentB} names={names} color="#3b82f6" />
        <div style={{ width: 1, background: '#1e293b', flexShrink: 0 }} />
        <AgentCol world={world} selfId={agentB} otherId={agentA} names={names} color="#f97316" />
      </div>

      {/* Dynamics footer */}
      {dynamics && dynamics.totalSpeech > 0 && (
        <div style={{
          borderTop: '1px solid #1e293b',
          paddingTop: 6,
          display: 'flex',
          gap: 16,
          fontSize: 9,
          color: '#64748b',
          flexWrap: 'wrap',
        }}>
          <span>
            Речь: {n(agentA)} → {dynamics.aToB} | {n(agentB)} → {dynamics.bToA}
          </span>

          {(dynamics.selective > 0 || dynamics.deceptive > 0) && (
            <span>
              <span style={{ color: '#22c55e' }}>✓{dynamics.truthful}</span>
              {dynamics.selective > 0 && <span style={{ color: '#f59e0b', marginLeft: 4 }}>~{dynamics.selective}</span>}
              {dynamics.deceptive > 0 && <span style={{ color: '#ef4444', marginLeft: 4 }}>✗{dynamics.deceptive}</span>}
            </span>
          )}

          {Number.isFinite(dynamics.deltaTrustAB) && (
            <span>
              Δtrust {n(agentA)}→: <Delta v={dynamics.deltaTrustAB} />
            </span>
          )}
          {Number.isFinite(dynamics.deltaTrustBA) && (
            <span>
              Δtrust {n(agentB)}→: <Delta v={dynamics.deltaTrustBA} />
            </span>
          )}
        </div>
      )}
    </div>
  );
};
