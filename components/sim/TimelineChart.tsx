// components/sim/TimelineChart.tsx
// Lightweight SVG timeline for simulator metrics.
//
// Visualizes:
// - global tension (primary line)
// - stress traces (selected agent + others)
// - narrative beat markers

import React, { useMemo } from 'react';
import type { SimKitSimulator } from '../../lib/simkit/core/simulator';
import { clamp01 } from '../../lib/util/math';

type Props = {
  sim: SimKitSimulator | null;
  selectedAgentId?: string;
  names: Record<string, string>;
  height?: number;
  width?: number;
};

type Series = { label: string; color: string; values: number[] };

function stableHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export const TimelineChart: React.FC<Props> = ({ sim, selectedAgentId, names, height = 100, width = 700 }) => {
  const data = useMemo(() => {
    if (!sim || !sim.records.length) return null;

    const ticks = sim.records.length;
    const tension = sim.tensionHistory.slice(0, ticks);

    const agentIds = Object.keys(sim.world.characters || {}).sort();
    const stressSeries: Record<string, number[]> = {};
    for (const id of agentIds) stressSeries[id] = [];

    // Collect per-tick stress from snapshots (safe for partial data).
    for (const rec of sim.records) {
      const chars = Array.isArray(rec?.snapshot?.characters) ? rec.snapshot.characters : [];
      for (const c of chars as any[]) {
        if (!c?.id || !stressSeries[c.id]) continue;
        stressSeries[c.id].push(clamp01(Number(c.stress ?? 0)));
      }
    }

    const series: Series[] = [{ label: 'Tension', color: '#ef4444', values: tension }];

    if (selectedAgentId && stressSeries[selectedAgentId]) {
      series.push({
        label: `${names[selectedAgentId] || selectedAgentId} stress`,
        color: '#a855f7',
        values: stressSeries[selectedAgentId],
      });
    }

    for (const id of agentIds) {
      if (id === selectedAgentId) continue;
      series.push({
        label: names[id] || id,
        color: `hsl(${stableHue(id)} 40% 40%)`,
        values: stressSeries[id] || [],
      });
    }

    const beatMarkers = (sim.beats || []).map((b) => ({
      tick: Number((b as any)?.tick ?? 0),
      label: String((b as any)?.summary ?? (b as any)?.type ?? 'beat').slice(0, 30),
    }));

    return { series, beatMarkers, ticks };
  }, [sim, selectedAgentId, names]);

  if (!data || data.ticks < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: 10 }}>
        Нет данных
      </div>
    );
  }

  const { series, beatMarkers, ticks } = data;
  const padL = 2;
  const padR = 2;
  const padT = 12;
  const padB = 16;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xScale = (t: number) => padL + (t / Math.max(1, ticks - 1)) * plotW;
  const yScale = (v: number) => padT + (1 - clamp01(v)) * plotH;
  const polyline = (values: number[]) => values.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} style={{ background: '#0f172a', borderRadius: 4, fontFamily: '"JetBrains Mono", monospace' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <line key={v} x1={padL} y1={yScale(v)} x2={width - padR} y2={yScale(v)} stroke="#1e293b" strokeWidth={0.5} />
      ))}

      {series.map((s, i) => (
        <polyline
          key={`${s.label}-${i}`}
          points={polyline(s.values)}
          fill="none"
          stroke={s.color}
          strokeWidth={i === 0 ? 1.5 : 0.8}
          opacity={i === 0 || i === 1 ? 1 : 0.4}
        />
      ))}

      {beatMarkers.map((b, i) => {
        const x = xScale(b.tick);
        return (
          <g key={`beat-${i}`}>
            <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="#fbbf24" strokeWidth={0.5} strokeDasharray="2 3" opacity={0.5} />
            <circle cx={x} cy={padT - 3} r={2} fill="#fbbf24" />
            <title>{`t${b.tick}: ${b.label}`}</title>
          </g>
        );
      })}

      <text x={padL} y={height - 2} fill="#475569" fontSize={7}>t=0</text>
      <text x={width - padR} y={height - 2} fill="#475569" fontSize={7} textAnchor="end">t={ticks}</text>

      {series.slice(0, 3).map((s, i) => (
        <g key={`legend-${s.label}`}>
          <rect x={padL + i * 80} y={1} width={8} height={6} fill={s.color} rx={1} />
          <text x={padL + i * 80 + 10} y={7} fill="#64748b" fontSize={6}>{s.label}</text>
        </g>
      ))}
    </svg>
  );
};
