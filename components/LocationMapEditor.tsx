// components/LocationMapEditor.tsx
import React, { useMemo, useState } from 'react';
import { LocationMap, LocationMapCell, LocationMapExit } from '../types';
import { LocationVectorMap } from './locations/LocationVectorMap';

type Brush =
  | 'walkable'
  | 'wall'
  | 'obstacle'
  | 'danger'
  | 'hazard'
  | 'clear_hazard'
  | 'safe'
  | 'cover'
  | 'elevation_up'
  | 'elevation_down'
  | 'exit'
  | 'clear_exit';

interface Props {
  map: LocationMap;
  onChange: (map: LocationMap) => void;
  cellSize?: number;
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export const LocationMapEditor: React.FC<Props> = ({ map, onChange, cellSize = 16 }) => {
  // allow parent to pass brush via map.__editor (см PATCH 2)
  const external = (map as any)?.__editor || {};
  const externalBrush: Brush | undefined = external?.brush;
  const externalExitTargetId: string | undefined = external?.exitTargetId;

  const [brushLocal, setBrushLocal] = useState<Brush>('walkable');
  const brush: Brush = externalBrush ?? brushLocal;

  const [activeLevel, setActiveLevel] = useState(0);

  const exitTargetId = externalExitTargetId ?? 'outside';

  const baseCells: LocationMapCell[] = useMemo(() => {
    return Array.isArray((map as any).cells) ? ((map as any).cells as any) : [];
  }, [map]);

  const exits: LocationMapExit[] = useMemo(() => {
    return Array.isArray((map as any).exits) ? ((map as any).exits as any) : [];
  }, [map]);

  const setCell = (cell: LocationMapCell, updated: LocationMapCell) => {
    const cells = baseCells.map((c: any) => (c.x === cell.x && c.y === cell.y ? updated : c));
    onChange({ ...map, cells });
  };

  const toggleExit = (x: number, y: number, mode: 'add' | 'remove') => {
    const key = `${x},${y}`;
    const has = exits.some((e) => `${e.x},${e.y}` === key);

    if (mode === 'remove') {
      if (!has) return;
      onChange({ ...map, exits: exits.filter((e) => `${e.x},${e.y}` !== key) });
      return;
    }

    // add
    if (has) return;
    const next: LocationMapExit = {
      x,
      y,
      targetId: exitTargetId,
      label: `to ${exitTargetId}`,
    };
    onChange({ ...map, exits: [...exits, next] });
  };

  const handleCellClick = (cell: LocationMapCell) => {
    // exits edit is not per-cell mutation
    if (brush === 'exit') {
      toggleExit(cell.x, cell.y, 'add');
      return;
    }
    if (brush === 'clear_exit') {
      toggleExit(cell.x, cell.y, 'remove');
      return;
    }

    const updated: LocationMapCell = { ...cell };

    // Only edit if same level
    if ((updated.level || 0) !== activeLevel) {
      updated.level = activeLevel;
    }

    if (brush === 'walkable') {
      updated.walkable = true;
      updated.danger = 0;
      updated.cover = 0;
      updated.elevation = 0;
      const tags = new Set<string>(Array.isArray(updated.tags) ? updated.tags : []);
      tags.delete('hazard');
      tags.delete('safe');
      updated.tags = Array.from(tags);
    } else if (brush === 'wall') {
      updated.walkable = false;
      updated.danger = 0;
      updated.cover = 1.0;
      updated.elevation = 2;
    } else if (brush === 'obstacle') {
      updated.walkable = false;
      updated.cover = 0.8;
      updated.danger = 0;
      updated.elevation = 1;
    } else if (brush === 'danger') {
      updated.walkable = true;
      updated.danger = clamp01((updated.danger ?? 0) + 0.3);
    } else if (brush === 'hazard') {
      updated.walkable = true;
      updated.danger = 1;
      const tags = new Set<string>(Array.isArray(updated.tags) ? updated.tags : []);
      tags.add('hazard');
      updated.tags = Array.from(tags);
    } else if (brush === 'clear_hazard') {
      const tags = new Set<string>(Array.isArray(updated.tags) ? updated.tags : []);
      tags.delete('hazard');
      updated.tags = Array.from(tags);
      if ((updated.tags || []).includes('safe')) updated.danger = 0;
    } else if (brush === 'safe') {
      updated.walkable = true;
      updated.danger = 0;
      const tags = new Set<string>(Array.isArray(updated.tags) ? updated.tags : []);
      tags.add('safe');
      tags.delete('hazard');
      updated.tags = Array.from(tags);
    } else if (brush === 'cover') {
      updated.walkable = true;
      updated.cover = clamp01((updated.cover ?? 0) + 0.5);
    } else if (brush === 'elevation_up') {
      updated.elevation = Math.min(5, (updated.elevation ?? 0) + 0.5);
    } else if (brush === 'elevation_down') {
      updated.elevation = Math.max(-5, (updated.elevation ?? 0) - 0.5);
    }

    setCell(cell, updated);
  };

  const normalizeClearDanger = () => {
    const nextCells = baseCells.map((c) => {
      const tags = new Set<string>(Array.isArray(c.tags) ? c.tags : []);
      const isHaz = tags.has('hazard');
      // правило: если не hazard — danger=0; safe тоже danger=0
      if (!isHaz) {
        return { ...c, danger: 0 };
      }
      return c;
    });
    onChange({ ...map, cells: nextCells, defaultDanger: 0 });
  };

  const highlightExits = useMemo(() => {
    return exits.map((e) => ({ x: e.x, y: e.y, color: 'rgba(120,180,255,0.85)', size: 0.20 }));
  }, [exits]);

  return (
    <div className="flex flex-col gap-3">
      {/* Local brush controls (если brush не пришёл снаружи) */}
      {!externalBrush && (
        <div className="flex flex-wrap gap-1 text-[10px]">
          {(['walkable', 'wall', 'obstacle', 'cover', 'danger', 'hazard', 'clear_hazard', 'safe', 'exit', 'clear_exit'] as Brush[]).map((b) => (
            <button
              key={b}
              onClick={() => setBrushLocal(b)}
              className={
                'px-2 py-1 rounded border text-xs uppercase transition-colors ' +
                (brush === b
                  ? 'border-canon-accent text-canon-accent bg-canon-accent/10'
                  : 'border-canon-border text-canon-text-light bg-canon-bg hover:border-canon-text-light')
              }
            >
              {b}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={normalizeClearDanger}
          className="px-2 py-1 rounded border border-canon-border text-[11px] text-canon-text-light hover:border-canon-text"
          title="Force danger=0 for all non-hazard cells; sets defaultDanger=0"
        >
          Clear danger (non-hazard)
        </button>

        <div className="text-[11px] text-canon-text-light opacity-70">
          Exit target: <span className="opacity-100">{exitTargetId}</span>
        </div>
      </div>

      <LocationVectorMap
        map={map}
        onCellClick={(x, y) => {
          const cell = baseCells.find((c) => c.x === x && c.y === y);
          if (cell) handleCellClick(cell);
        }}
        highlights={[...(highlightExits || [])]}
        cellSize={cellSize}
      />
    </div>
  );
};
