// components/sim/LocationMapPanel.tsx
// Renders the real LocationEntity.map (cells + visuals + exits) with live character markers.

import React, { useMemo } from 'react';
import type { SimWorld, SimLocation } from '../../lib/simkit/core/types';
import type { LocationMap } from '../../types';
import { LocationVectorMap } from '../locations/LocationVectorMap';
import { clamp01 } from '../../lib/util/math';

type Props = {
  world: SimWorld;
  locationId: string;
  selectedAgentId?: string;
  onSelectAgent?: (id: string) => void;
  onMoveAgent?: (agentId: string, x: number, y: number) => void;
  height?: number;
};

function stableHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export const LocationMapPanel: React.FC<Props> = ({
  world,
  locationId,
  selectedAgentId,
  onSelectAgent,
  onMoveAgent,
  height = 300,
}) => {
  const loc = world.locations[locationId] as SimLocation | undefined;

  const locMap = useMemo<LocationMap | null>(() => {
    const entity = (loc as any)?.entity;
    if (!entity) return null;
    const map = entity.map;
    if (map && typeof map === 'object' && typeof map.width === 'number' && typeof map.height === 'number') {
      return map as LocationMap;
    }
    return null;
  }, [loc]);

  const charsHere = useMemo(() => {
    return Object.values(world.characters || {}).filter((c: any) => c?.locId === locationId);
  }, [world.characters, locationId]);

  const markers = useMemo(() => {
    return charsHere.map((c: any) => {
      const x = Number(c?.pos?.x);
      const y = Number(c?.pos?.y);
      const isSelected = c.id === selectedAgentId;
      const hue = stableHue(String(c.id));
      return {
        x: Number.isFinite(x) ? x : 5,
        y: Number.isFinite(y) ? y : 5,
        label: String(c?.name || c?.id || '').slice(0, 10),
        color: isSelected ? '#fbbf24' : `hsl(${hue} 70% 60%)`,
        size: isSelected ? 1.5 : 1,
        title: `${c?.name || c?.id} (HP:${Math.round((Number(c?.health ?? 1)) * 100)} STR:${Math.round((Number(c?.stress ?? 0)) * 100)})`,
      };
    });
  }, [charsHere, selectedAgentId]);

  const highlights = useMemo(() => {
    if (!locMap) return [] as Array<{ x: number; y: number; color: string }>;
    const out: Array<{ x: number; y: number; color: string }> = [];
    for (const cell of locMap.cells || []) {
      if ((cell?.danger ?? 0) > 0.3) {
        out.push({ x: cell.x, y: cell.y, color: `rgba(239, 68, 68, ${clamp01((cell.danger ?? 0) * 0.5)})` });
      }
      if ((cell?.cover ?? 0) > 0.5 && cell?.walkable) {
        out.push({ x: cell.x, y: cell.y, color: 'rgba(59, 130, 246, 0.2)' });
      }
    }
    return out;
  }, [locMap]);

  const scale = Math.min(20, Math.max(8, Math.floor(height / Math.max(1, locMap?.height || 20))));

  if (!locMap) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          borderRadius: 6,
          border: '1px solid #1e293b',
          color: '#475569',
          fontSize: 11,
          fontStyle: 'italic',
        }}
      >
        {loc ? `${loc.name || locationId}: нет карты` : 'Выбери локацию'}
      </div>
    );
  }

  return (
    <div style={{ background: '#0f172a', borderRadius: 6, border: '1px solid #1e293b', overflow: 'hidden' }}>
      <div
        style={{
          padding: '4px 8px',
          fontSize: 10,
          color: '#64748b',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 600, color: '#94a3b8' }}>{loc?.name || locationId}</span>
        <span>{charsHere.length} чел. · {locMap.width}×{locMap.height}</span>
      </div>

      <div style={{ overflow: 'auto', maxHeight: height - 24 }}>
        <LocationVectorMap
          map={locMap}
          showGrid={true}
          scale={scale}
          markers={markers}
          highlightCells={highlights}
          hideTextVisuals={false}
          onCellClick={(x, y) => {
            if (onMoveAgent && selectedAgentId) onMoveAgent(selectedAgentId, x, y);
          }}
        />
      </div>

      {charsHere.length > 0 && (
        <div style={{ borderTop: '1px solid #1e293b', padding: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {charsHere.map((c: any) => {
            const selected = c.id === selectedAgentId;
            return (
              <button
                key={c.id}
                onClick={() => onSelectAgent?.(c.id)}
                style={{
                  border: selected ? '1px solid #fbbf24' : '1px solid #334155',
                  background: selected ? '#422006' : '#0b1220',
                  color: selected ? '#fcd34d' : '#94a3b8',
                  borderRadius: 4,
                  padding: '2px 6px',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                {c.name || c.id}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
