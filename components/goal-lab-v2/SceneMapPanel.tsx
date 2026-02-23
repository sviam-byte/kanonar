/**
 * SceneMapPanel — center-pane map with actor placement.
 *
 * Uses real MapViewer (same as GoalSandbox).
 * Full height, large cells (28px), actor highlights.
 * Includes placement controls, pairwise distances, export.
 */

import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useGoalLab } from '../../contexts/GoalLabContext';
import { allLocations } from '../../data/locations';
import type { LocationMap } from '../../types';

const MapViewer = lazy(() =>
  import('../locations/MapViewer').then(m => ({ default: m.MapViewer }))
);

function stableHue(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }
function dist(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

export const SceneMapPanel: React.FC = () => {
  const ctx = useGoalLab();
  const { world, engine, actorLabels } = ctx;
  const [placingId, setPlacingId] = useState<string | null>(null);

  const location = useMemo(() =>
    allLocations.find((l: any) => l.entityId === world.selectedLocationId) as any
  , [world.selectedLocationId]);

  const map: LocationMap | null = location?.map || world.activeMap || null;
  const parts = Array.from(world.sceneParticipants);

  const pos = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of parts) {
      const agent = world.worldState?.agents?.find((a: any) => a.entityId === id);
      out[id] = (agent as any)?.position || world.actorPositions?.[id] || { x: 3, y: 3 };
    }
    return out;
  }, [parts, world.worldState, world.actorPositions]);

  const highlights = useMemo(() =>
    parts.map(id => ({
      x: pos[id]?.x ?? 3, y: pos[id]?.y ?? 3,
      color: placingId === id ? '#facc15' : world.perspectiveId === id ? '#22d3ee' : `hsl(${stableHue(id)}, 55%, 50%)`,
      size: world.perspectiveId === id ? 1.4 : 1,
    }))
  , [parts, pos, world.perspectiveId, placingId]);

  const handleCell = useCallback((x: number, y: number) => {
    if (!placingId) return;
    world.setAgentPosition(placingId, { x, y });
    const idx = parts.indexOf(placingId);
    setPlacingId(parts[idx + 1] || null);
  }, [placingId, world, parts]);

  return (
    <div className="flex flex-col h-full">
      {/* Map */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-950/50 overflow-auto p-3">
        {map ? (
          <Suspense fallback={<div className="text-[9px] text-slate-600 animate-pulse">Loading map…</div>}>
            <MapViewer
              map={map}
              onCellClick={handleCell}
              highlights={highlights}
              sizeMode="map"
              cellPx={28}
              hideTextVisuals
            />
          </Suspense>
        ) : (
          <div className="text-slate-600 text-[11px] italic">No map. Select a location with a grid in Scene Setup.</div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 bg-slate-900/60 border-t border-slate-800/40 p-2 space-y-1 max-h-[180px] overflow-y-auto text-[10px]">
        <div className="text-[9px] text-slate-500">
          {placingId
            ? <>Click map cell → place <span className="text-yellow-400 font-bold">{actorLabels[placingId] || placingId}</span></>
            : 'Click actor name → click map cell to relocate'}
        </div>

        {/* Actor chips */}
        <div className="flex flex-wrap gap-1">
          {parts.map(id => {
            const p = pos[id] || { x: 0, y: 0 };
            const active = placingId === id;
            return (
              <button key={id} onClick={() => setPlacingId(active ? null : id)}
                className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[9px] border transition ${
                  active ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700/40' : 'bg-slate-800/40 text-slate-400 border-slate-700/30 hover:text-slate-200'
                }`}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${stableHue(id)}, 55%, 50%)` }} />
                {(actorLabels[id] || id).slice(0, 8)}
                <span className="text-[7px] text-slate-600">({p.x},{p.y})</span>
              </button>
            );
          })}
        </div>

        {/* Distances */}
        {parts.length > 1 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px]">
            {parts.flatMap((a, i) => parts.slice(i + 1).map(b => {
              const d = dist(pos[a] || { x: 0, y: 0 }, pos[b] || { x: 0, y: 0 });
              return (
                <span key={`${a}-${b}`} className="text-slate-600">
                  {(actorLabels[a] || a).slice(0, 4)}↔{(actorLabels[b] || b).slice(0, 4)}=<span className={d < 3 ? 'text-emerald-500' : d < 6 ? 'text-amber-500' : ''}>{d.toFixed(1)}</span>
                </span>
              );
            }))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-1 pt-0.5">
          {world.selectedLocationId && (
            <button onClick={() => world.moveAllToLocation(world.selectedLocationId)}
              className="px-2 py-0.5 bg-slate-800/40 border border-slate-700/30 rounded text-slate-400 hover:text-slate-200 text-[9px]">
              Move all here
            </button>
          )}
          <button onClick={world.forceRebuild}
            className="px-2 py-0.5 bg-cyan-900/30 border border-cyan-700/30 rounded text-cyan-400 hover:text-cyan-200 text-[9px]">
            Rebuild
          </button>
          <button onClick={engine.downloadScene}
            className="px-2 py-0.5 bg-emerald-900/30 border border-emerald-700/30 rounded text-emerald-400 hover:text-emerald-200 text-[9px]">
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
};
