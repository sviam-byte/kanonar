// components/sim/CompareView.tsx
// Side-by-side comparison for two headless simulation runs.
//
// Includes:
// - overlaid tension curves,
// - optional shared-agent stress comparison,
// - aggregate action frequency bars,
// - first divergence marker + unique action sets.

import React, { useMemo } from 'react';
import type { CompareResult } from '../../lib/simkit/compare/batchRunner';
import { clamp01 } from '../../lib/util/math';

type Props = {
  result: CompareResult;
  names: Record<string, string>;
};

const SvgSeries: React.FC<{
  valuesA: number[];
  valuesB: number[];
  labelA: string;
  labelB: string;
  colorA: string;
  colorB: string;
  divergeTick?: number | null;
  w: number;
  h: number;
  title: string;
}> = ({ valuesA, valuesB, labelA, labelB, colorA, colorB, divergeTick, w, h, title }) => {
  const maxLen = Math.max(valuesA.length, valuesB.length, 2);
  const pad = { l: 2, r: 2, t: 14, b: 12 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;

  const x = (i: number) => pad.l + (i / Math.max(1, maxLen - 1)) * pw;
  const y = (v: number) => pad.t + (1 - clamp01(v)) * ph;
  const pts = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg width={w} height={h} style={{ background: '#0f172a', borderRadius: 4, fontFamily: '"JetBrains Mono", monospace' }}>
      <text x={pad.l} y={10} fill="#64748b" fontSize={8} fontWeight={600}>{title}</text>
      {[0, 0.5, 1].map((v) => (
        <line key={v} x1={pad.l} y1={y(v)} x2={w - pad.r} y2={y(v)} stroke="#1e293b" strokeWidth={0.5} />
      ))}
      <polyline points={pts(valuesA)} fill="none" stroke={colorA} strokeWidth={1.2} opacity={0.8} />
      <polyline points={pts(valuesB)} fill="none" stroke={colorB} strokeWidth={1.2} opacity={0.8} strokeDasharray="4 2" />
      {divergeTick != null && (
        <line x1={x(divergeTick)} y1={pad.t} x2={x(divergeTick)} y2={pad.t + ph} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3 3" />
      )}
      <rect x={pad.l} y={h - 10} width={6} height={4} fill={colorA} rx={1} />
      <text x={pad.l + 8} y={h - 6} fill="#64748b" fontSize={6}>{labelA}</text>
      <rect x={pad.l + 70} y={h - 10} width={6} height={4} fill={colorB} rx={1} />
      <text x={pad.l + 78} y={h - 6} fill="#64748b" fontSize={6}>{labelB}</text>
    </svg>
  );
};

const ActionBar: React.FC<{ kind: string; countA: number; countB: number; maxCount: number }> = ({ kind, countA, countB, maxCount }) => {
  const max = Math.max(1, maxCount);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontFamily: 'monospace' }}>
      <span style={{ width: 70, textAlign: 'right', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kind}</span>
      <div style={{ width: 50, height: 5, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${(countA / max) * 50}px`, height: '100%', background: '#3b82f6', borderRadius: 2 }} />
      </div>
      <span style={{ width: 16, color: '#3b82f6', fontSize: 8 }}>{countA}</span>
      <div style={{ width: 50, height: 5, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${(countB / max) * 50}px`, height: '100%', background: '#f97316', borderRadius: 2 }} />
      </div>
      <span style={{ width: 16, color: '#f97316', fontSize: 8 }}>{countB}</span>
    </div>
  );
};

export const CompareView: React.FC<Props> = ({ result, names }) => {
  const { runA, runB, firstDivergenceTick, uniqueActionsA, uniqueActionsB } = result;

  const allKinds = useMemo(() => {
    const set = new Set<string>();
    for (const id of Object.keys(runA.actionCounts || {})) for (const k of Object.keys(runA.actionCounts[id] || {})) set.add(k);
    for (const id of Object.keys(runB.actionCounts || {})) for (const k of Object.keys(runB.actionCounts[id] || {})) set.add(k);
    return [...set].sort();
  }, [runA, runB]);

  const aggA: Record<string, number> = {};
  const aggB: Record<string, number> = {};
  for (const counts of Object.values(runA.actionCounts || {})) for (const [k, v] of Object.entries(counts || {})) aggA[k] = (aggA[k] || 0) + Number(v);
  for (const counts of Object.values(runB.actionCounts || {})) for (const [k, v] of Object.entries(counts || {})) aggB[k] = (aggB[k] || 0) + Number(v);

  const maxCount = Math.max(...Object.values(aggA), ...Object.values(aggB), 1);
  const agentIdsA = Object.keys(runA.stressHistory || {});
  const agentIdsB = Object.keys(runB.stressHistory || {});
  const sharedAgent = agentIdsA.find((id) => agentIdsB.includes(id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#cbd5e1' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: '#3b82f6' }}>A: {runA.label}</span>
        <span style={{ color: '#475569' }}>vs</span>
        <span style={{ fontWeight: 700, color: '#f97316' }}>B: {runB.label}</span>
        {firstDivergenceTick != null && <span style={{ fontSize: 9, color: '#fbbf24' }}>⚡ Расхождение на t={firstDivergenceTick}</span>}
      </div>

      <SvgSeries
        valuesA={runA.tensionHistory}
        valuesB={runB.tensionHistory}
        labelA={runA.label}
        labelB={runB.label}
        colorA="#3b82f6"
        colorB="#f97316"
        divergeTick={firstDivergenceTick}
        w={600}
        h={100}
        title="Tension"
      />

      {sharedAgent && (
        <SvgSeries
          valuesA={runA.stressHistory[sharedAgent] || []}
          valuesB={runB.stressHistory[sharedAgent] || []}
          labelA={`${names[sharedAgent] || sharedAgent} (A)`}
          labelB={`${names[sharedAgent] || sharedAgent} (B)`}
          colorA="#a855f7"
          colorB="#ec4899"
          w={600}
          h={80}
          title={`Stress: ${names[sharedAgent] || sharedAgent}`}
        />
      )}

      <div>
        <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 600 }}>Действия (суммарно)</div>
        {allKinds.map((k) => (
          <ActionBar key={k} kind={k} countA={aggA[k] || 0} countB={aggB[k] || 0} maxCount={maxCount} />
        ))}
      </div>

      {(uniqueActionsA.length > 0 || uniqueActionsB.length > 0) && (
        <div style={{ fontSize: 9, display: 'flex', gap: 16 }}>
          {uniqueActionsA.length > 0 && <div><span style={{ color: '#3b82f6' }}>Только в A:</span> {uniqueActionsA.join(', ')}</div>}
          {uniqueActionsB.length > 0 && <div><span style={{ color: '#f97316' }}>Только в B:</span> {uniqueActionsB.join(', ')}</div>}
        </div>
      )}

      <div style={{ fontSize: 9, color: '#64748b' }}>
        Beats: A={runA.beats.length}, B={runB.beats.length} · Ticks: A={runA.ticks}, B={runB.ticks}
      </div>
    </div>
  );
};
