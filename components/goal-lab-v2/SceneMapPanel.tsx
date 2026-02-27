/**
 * SceneMapPanel v2.1 — center-pane map with proper actor placement.
 *
 * Improvements:
 * - Actors shown as labeled pins on the grid (not just highlight dots)
 * - Drag-to-place mode with visual feedback
 * - Distance matrix shown as a compact table
 * - Auto-scatter if all actors are at same position
 */
import React, { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { useGoalLab } from '../../contexts/GoalLabContext';
import { allLocations } from '../../data/locations';
import type { LocationMap } from '../../types';

const MapViewer = lazy(() => import('../locations/MapViewer').then(m => ({ default: m.MapViewer })));
const sHue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

/** Scatter actors on a circle if they're all stacked at the same point. */
function autoScatter(
  parts: string[],
  pos: Record<string, { x: number; y: number }>,
  mapW: number,
  mapH: number,
): Record<string, { x: number; y: number }> | null {
  if (parts.length < 2) return null;
  const allSame = parts.every(id => {
    const p = pos[id];
    const first = pos[parts[0]];
    return p && first && p.x === first.x && p.y === first.y;
  });
  if (!allSame) return null;

  const cx = Math.floor(mapW / 2);
  const cy = Math.floor(mapH / 2);
  const r = Math.min(3, Math.floor(Math.min(mapW, mapH) / 4));
  const out: Record<string, { x: number; y: number }> = {};
  parts.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / parts.length;
    out[id] = {
      x: Math.round(cx + r * Math.cos(angle)),
      y: Math.round(cy + r * Math.sin(angle)),
    };
  });
  return out;
}

export const SceneMapPanel: React.FC = () => {
  const { world, engine, actorLabels } = useGoalLab();
  const [pid, setPid] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const loc = useMemo(() => allLocations.find((l: any) => l.entityId === world.selectedLocationId) as any, [world.selectedLocationId]);
  const map: LocationMap | null = loc?.map || world.activeMap || null;
  const parts = Array.from(world.sceneParticipants);

  const pos = useMemo(() => {
    const o: Record<string, { x: number; y: number }> = {};
    for (const id of parts) {
      const ag = world.worldState?.agents?.find((a: any) => a.entityId === id);
      o[id] = (ag as any)?.position || world.actorPositions?.[id] || { x: 3, y: 3 };
    }
    return o;
  }, [parts, world.worldState, world.actorPositions]);

  // Auto-scatter on first load if all stacked
  useEffect(() => {
    if (!map || parts.length < 2) return;
    const mapW = map.width || 10;
    const mapH = map.height || 10;
    const scattered = autoScatter(parts, pos, mapW, mapH);
    if (scattered) {
      for (const [id, p] of Object.entries(scattered)) {
        world.setAgentPosition(id, p);
      }
    }
  }, [parts.length, map?.width, map?.height]); // eslint-disable-line react-hooks/exhaustive-deps

  const hl = useMemo(() => {
    const items = parts.map(id => ({
      x: pos[id]?.x ?? 3,
      y: pos[id]?.y ?? 3,
      color: pid === id ? '#facc15' : world.perspectiveId === id ? '#22d3ee' : `hsl(${sHue(id)},55%,50%)`,
      size: world.perspectiveId === id ? 1.6 : 1.2,
      label: (actorLabels[id] || id).slice(0, 5),
    }));
    // Ghost highlight for placement preview
    if (pid && hoveredCell) {
      items.push({
        x: hoveredCell.x,
        y: hoveredCell.y,
        color: 'rgba(250, 204, 21, 0.4)',
        size: 1.3,
        label: '⟶',
      });
    }
    return items;
  }, [parts, pos, world.perspectiveId, pid, actorLabels, hoveredCell]);

  const onCell = useCallback((x: number, y: number) => {
    if (!pid) return;
    world.setAgentPosition(pid, { x, y });
    // Advance to next unplaced or stop
    const i = parts.indexOf(pid);
    setPid(parts[i + 1] || null);
    setHoveredCell(null);
  }, [pid, world, parts]);

  const onCellHover = useCallback((x: number, y: number) => {
    if (pid) setHoveredCell({ x, y });
  }, [pid]);

  return (
    <div className="flex flex-col h-full">
      {/* Map area */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-950/50 overflow-auto p-2">
        {map ? (
          <Suspense fallback={<div className="text-[9px] text-slate-600 animate-pulse">Loading…</div>}>
            <MapViewer
              map={map}
              onCellClick={onCell}
              onCellHover={onCellHover}
              highlights={hl}
              sizeMode="map"
              cellPx={32}
              hideTextVisuals
            />
          </Suspense>
        ) : (
          <div className="text-slate-600 text-[11px] italic text-center px-4">
            No map grid.<br />Select a location with a map definition.
          </div>
        )}
      </div>

      {/* Actor placement controls */}
      <div className="shrink-0 bg-slate-900/60 border-t border-slate-800/40 p-2 space-y-1.5 max-h-[200px] overflow-y-auto text-[10px]">
        {/* Placement mode indicator */}
        <div className={`text-[9px] px-1.5 py-0.5 rounded ${pid ? 'bg-yellow-900/20 border border-yellow-700/30 text-yellow-300' : 'text-slate-500'}`}>
          {pid ? (
            <>Placing <span className="font-bold">{actorLabels[pid] || pid}</span> — click a cell on the map</>
          ) : (
            'Click a name below, then click a map cell to place'
          )}
        </div>

        {/* Actor chips with coordinates */}
        <div className="flex flex-wrap gap-1">
          {parts.map(id => {
          const p = pos[id] || { x: 0, y: 0 };
            const isPov = world.perspectiveId === id;
            const isPlacing = pid === id;
            return (
              <button
                key={id}
                onClick={() => setPid(pid === id ? null : id)}
                className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[9px] border transition ${
                  isPlacing
                    ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700/40 ring-1 ring-yellow-500/30'
                    : isPov
                      ? 'bg-cyan-900/20 text-cyan-300 border-cyan-700/30'
                      : 'bg-slate-800/40 text-slate-400 border-slate-700/30 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-black/20" style={{ backgroundColor: `hsl(${sHue(id)},55%,50%)` }} />
                <span className="truncate max-w-[60px]">{(actorLabels[id] || id).slice(0, 10)}</span>
                <span className="text-[7px] text-slate-600 tabular-nums">({p.x},{p.y})</span>
              </button>
            );
          })}
        </div>

        {/* Distance matrix (compact) */}
        {parts.length > 1 && parts.length <= 6 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px]">
            {parts.flatMap((a, i) =>
              parts.slice(i + 1).map(b => {
                const d = dist(pos[a] || { x: 0, y: 0 }, pos[b] || { x: 0, y: 0 });
                return (
                  <span key={`${a}-${b}`} className="text-slate-600">
                    {(actorLabels[a] || a).slice(0, 4)}↔{(actorLabels[b] || b).slice(0, 4)}=
                    <span className={d < 2 ? 'text-emerald-400' : d < 5 ? 'text-amber-400' : 'text-slate-500'}>{d.toFixed(1)}</span>
                  </span>
                );
              })
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-1 pt-0.5">
          {world.selectedLocationId && (
            <button onClick={() => world.moveAllToLocation(world.selectedLocationId)} className="px-2 py-0.5 bg-slate-800/40 border border-slate-700/30 rounded text-slate-400 hover:text-slate-200 text-[9px]">
              Move all
            </button>
          )}
          <button onClick={world.forceRebuild} className="px-2 py-0.5 bg-cyan-900/30 border border-cyan-700/30 rounded text-cyan-400 hover:bg-cyan-900/50 text-[9px] transition">
            Rebuild
          </button>
          <button onClick={engine.downloadScene} className="px-2 py-0.5 bg-emerald-900/30 border border-emerald-700/30 rounded text-emerald-400 hover:bg-emerald-900/50 text-[9px] transition">
            Export
          </button>
        </div>
      </div>
    </div>
  );
};
