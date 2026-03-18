// components/sim/MacroMap.tsx
// SVG macro map: location graph with characters, edge types, danger coloring.

import React, { useMemo } from 'react';
import type { SimWorld, SimCharacter } from '../../lib/simkit/core/types';
import { getMacroMapLayout, getTrail, type MacroMapLayout } from '../../lib/simkit/core/mapTypes';
import { clamp01 } from '../../lib/util/math';

type Props = {
  world: SimWorld;
  selectedAgentId?: string;
  selectedLocationId?: string;
  onSelectAgent?: (id: string) => void;
  onSelectLocation?: (id: string) => void;
  width?: number;
  height?: number;
};

function stableHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function dangerColor(danger: number): string {
  const d = clamp01(danger);
  if (d < 0.2) return '#1e293b';
  if (d < 0.5) return '#44403c';
  if (d < 0.7) return '#7c2d12';
  return '#991b1b';
}

const EDGE_DASH: Record<string, string> = {
  open: '',
  blocked: '8 4',
  hidden: '3 6',
  locked: '5 3 1 3',
};

const EDGE_COLOR: Record<string, string> = {
  open: '#475569',
  blocked: '#dc2626',
  hidden: '#a855f7',
  locked: '#f59e0b',
};

export const MacroMap: React.FC<Props> = ({
  world,
  selectedAgentId,
  selectedLocationId,
  onSelectAgent,
  onSelectLocation,
  width = 800,
  height = 500,
}) => {
  const locs = useMemo(() => Object.values(world.locations || {}), [world.locations]);
  const chars = useMemo(() => Object.values(world.characters || {}), [world.characters]);
  const locIds = useMemo(() => locs.map((l) => l.id).sort(), [locs]);

  const layout = useMemo<MacroMapLayout>(() => getMacroMapLayout(world.facts as any, locIds), [world.facts, locIds]);

  const charsByLoc = useMemo(() => {
    const m: Record<string, SimCharacter[]> = {};
    for (const c of chars) {
      const loc = (c as any).locId || '';
      (m[loc] ||= []).push(c);
    }
    return m;
  }, [chars]);

  const edges = useMemo(() => {
    const edgeMap = new Map<string, { from: string; to: string; type: string }>();
    for (const loc of locs) {
      for (const nId of loc.neighbors || []) {
        const key = [loc.id, nId].sort().join('|');
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { from: loc.id, to: nId, type: 'open' });
        }
      }
    }
    for (const e of layout.edges || []) {
      const key = [e.from, e.to].sort().join('|');
      edgeMap.set(key, { from: e.from, to: e.to, type: e.type });
    }
    return Array.from(edgeMap.values());
  }, [locs, layout]);

  const pos = layout.positions;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={{ background: '#0f172a', borderRadius: 8, fontFamily: '"JetBrains Mono", monospace' }}
    >
      {edges.map((e, i) => {
        const p1 = pos[e.from];
        const p2 = pos[e.to];
        if (!p1 || !p2) return null;
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={EDGE_COLOR[e.type] || '#475569'}
            strokeWidth={2}
            strokeDasharray={EDGE_DASH[e.type] || ''}
            opacity={0.6}
          />
        );
      })}

      {locs.map((loc) => {
        const p = pos[loc.id];
        if (!p) return null;
        const facts: any = world.facts || {};
        const danger = clamp01(Number(facts[`ctx:danger:${loc.id}`] ?? (loc.hazards as any)?.collapse ?? 0));
        const isSelected = loc.id === selectedLocationId;
        const r = 32;

        return (
          <g key={loc.id} onClick={() => onSelectLocation?.(loc.id)} style={{ cursor: 'pointer' }}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={dangerColor(danger)}
              stroke={isSelected ? '#38bdf8' : '#334155'}
              strokeWidth={isSelected ? 3 : 1.5}
            />
            <text x={p.x} y={p.y - r - 6} textAnchor="middle" fill="#94a3b8" fontSize={10}>
              {loc.title || loc.name || loc.id}
            </text>
            {danger > 0.3 && (
              <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#fbbf24" fontSize={9} fontWeight={700}>
                ⚠ {Math.round(danger * 100)}%
              </text>
            )}
          </g>
        );
      })}

      {locs.map((loc) => {
        const p = pos[loc.id];
        if (!p) return null;
        const agents = charsByLoc[loc.id] || [];
        return agents.map((c, idx) => {
          const angle = (2 * Math.PI * idx) / Math.max(1, agents.length) - Math.PI / 2;
          const cr = 18;
          const cx = p.x + cr * Math.cos(angle);
          const cy = p.y + cr * Math.sin(angle);
          const hue = stableHue(c.id);
          const isSelected = c.id === selectedAgentId;

          const trail = getTrail(world.facts as any, c.id);
          const trailPoints = trail
            .filter((t) => t.locId !== loc.id && pos[t.locId])
            .slice(-3)
            .map((t) => pos[t.locId])
            .filter(Boolean);

          return (
            <g key={c.id}>
              {trailPoints.map((tp, ti) => (
                <line
                  key={ti}
                  x1={tp!.x}
                  y1={tp!.y}
                  x2={cx}
                  y2={cy}
                  stroke={`hsl(${hue} 60% 50%)`}
                  strokeWidth={1}
                  opacity={0.2 + 0.1 * ti}
                  strokeDasharray="3 4"
                />
              ))}
              <circle
                cx={cx}
                cy={cy}
                r={7}
                fill={`hsl(${hue} 70% ${isSelected ? '65%' : '50%'})`}
                stroke={isSelected ? '#fff' : 'none'}
                strokeWidth={isSelected ? 2 : 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAgent?.(c.id);
                }}
                style={{ cursor: 'pointer' }}
              />
              <text x={cx} y={cy + 16} textAnchor="middle" fill="#cbd5e1" fontSize={8}>
                {c.name || c.id}
              </text>
            </g>
          );
        });
      })}
    </svg>
  );
};
