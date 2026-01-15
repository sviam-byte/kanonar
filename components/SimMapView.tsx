// components/SimMapView.tsx
// Location map view for SimKit: characters + movement trails + interaction radii.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SimWorld } from '../lib/simkit/core/types';
import { DEFAULT_SPATIAL_CONFIG } from '../lib/simkit/core/spatial';

type Props = {
  world: SimWorld;
  locationId: string;
  height?: number;
  focusCharId?: string;
};

type XY = { x: number; y: number };

export function SimMapView({ world, locationId, height = 360, focusCharId }: Props) {
  const loc: any = world.locations?.[locationId];
  const cfg = (world.facts as any)?.spatial ?? DEFAULT_SPATIAL_CONFIG;

  const chars = useMemo(() => {
    return Object.values(world.characters || {}).filter((c: any) => c.locId === locationId);
  }, [world, locationId]);

  // Movement trails (prev pos)
  const prevRef = useRef<Record<string, XY>>({});
  const [prev, setPrev] = useState<Record<string, XY>>({});

  useEffect(() => {
    const next: Record<string, XY> = {};
    for (const c of chars as any[]) {
      if (c?.pos && Number.isFinite(c.pos.x) && Number.isFinite(c.pos.y)) next[c.id] = { x: c.pos.x, y: c.pos.y };
    }
    setPrev(prevRef.current);
    prevRef.current = next;
  }, [world.tickIndex, locationId, chars]);

  const mapW = Number(loc?.map?.width ?? loc?.width ?? 1024);
  const mapH = Number(loc?.map?.height ?? loc?.height ?? 768);

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/20" style={{ height }}>
      <svg viewBox={`0 0 ${mapW} ${mapH}`} width="100%" height="100%">
        {/* Background (optional image) */}
        {loc?.map?.imageUrl ? (
          <image
            href={loc.map.imageUrl}
            x={0}
            y={0}
            width={mapW}
            height={mapH}
            preserveAspectRatio="xMidYMid slice"
            opacity={0.95}
          />
        ) : (
          <rect x={0} y={0} width={mapW} height={mapH} />
        )}

        {/* Trails */}
        {chars.map((c: any) => {
          const p0 = prev[c.id];
          const p1 = c?.pos && Number.isFinite(c.pos.x) && Number.isFinite(c.pos.y) ? { x: c.pos.x, y: c.pos.y } : null;
          if (!p0 || !p1) return null;
          const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          if (moved < 1) return null;
          return (
            <line
              key={`trail:${c.id}`}
              x1={p0.x}
              y1={p0.y}
              x2={p1.x}
              y2={p1.y}
              stroke="rgba(255,255,255,0.20)"
              strokeWidth={2}
            />
          );
        })}

        {/* Characters */}
        {chars.map((c: any) => {
          const x = Number(c?.pos?.x ?? 0);
          const y = Number(c?.pos?.y ?? 0);
          const label = String(c?.name ?? c?.id).slice(0, 10);
          const isFocus = focusCharId && c.id === focusCharId;

          return (
            <g key={c.id} transform={`translate(${x},${y})`}>
              {/* interaction radii (optional) */}
              <circle r={cfg.attackRange} fill="none" stroke="rgba(255,120,120,0.12)" strokeWidth={1} />
              <circle r={cfg.talkRange} fill="none" stroke="rgba(140,180,255,0.10)" strokeWidth={1} />

              <circle
                r={isFocus ? 9 : 7}
                fill={isFocus ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.85)'}
                stroke={isFocus ? 'rgba(255,220,120,0.75)' : 'rgba(0,0,0,0.6)'}
                strokeWidth={isFocus ? 3 : 2}
              />
              <text x={10} y={4} fontSize={12} fill="rgba(255,255,255,0.85)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
