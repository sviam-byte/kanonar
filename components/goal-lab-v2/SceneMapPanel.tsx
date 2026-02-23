/**
 * SceneMapPanel — map with actor placement + scene export for GoalLab v2.
 *
 * Uses the real MapViewer component (same as GoalSandbox).
 * Actor positions affect spatial atoms (socProx, hazardGeometry, distance).
 * Includes scene export (JSON) button.
 */

import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useGoalLab } from '../../contexts/GoalLabContext';
import { allLocations } from '../../data/locations';
import type { LocationMap } from '../../types';

const MapViewer = lazy(() =>
  import('../locations/MapViewer').then(m => ({ default: m.MapViewer }))
);

function stableHue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function hslStr(id: string) {
  return `hsl(${stableHue(id)}, 55%, 50%)`;
}

export const SceneMapPanel: React.FC = () => {
  const ctx = useGoalLab();
  const { world, engine, actorLabels } = ctx;
  const [placingId, setPlacingId] = useState<string | null>(null);

  // Get current location map
  const location = useMemo(() => {
    return allLocations.find((l: any) => l.entityId === world.selectedLocationId) as any;
  }, [world.selectedLocationId]);

  const map: LocationMap | null = location?.map || world.activeMap || null;
  const participants = Array.from(world.sceneParticipants);

  // Actor positions
  const positions = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of participants) {
      const agent = world.worldState?.agents?.find((a: any) => a.entityId === id);
      const pos = (agent as any)?.position || world.actorPositions?.[id] || { x: 3, y: 3 };
      out[id] = pos;
    }
    return out;
  }, [participants, world.worldState, world.actorPositions]);

  // Build highlights for MapViewer (actor positions as colored dots)
  const highlights = useMemo(() => {
    return participants.map(id => {
      const pos = positions[id] || { x: 3, y: 3 };
      const isPerspective = world.perspectiveId === id;
      const isPlacing = placingId === id;
      return {
        x: pos.x,
        y: pos.y,
        color: isPlacing ? '#facc15' : isPerspective ? '#22d3ee' : hslStr(id),
        size: isPerspective ? 1.3 : 1,
      };
    });
  }, [participants, positions, world.perspectiveId, placingId]);

  // Cell click → place actor
  const handleCellClick = useCallback((x: number, y: number) => {
    if (placingId) {
      world.setAgentPosition(placingId, { x, y });
      const idx = participants.indexOf(placingId);
      const next = participants[idx + 1];
      setPlacingId(next || null);
    }
  }, [placingId, world, participants]);

  return (
    <div className="space-y-1.5 text-[10px]">
      {/* Map */}
      {map ? (
        <div className="border border-slate-800 rounded overflow-hidden bg-slate-950">
          <Suspense fallback={<div className="h-[140px] flex items-center justify-center text-[9px] text-slate-600">Loading map…</div>}>
            <MapViewer
              map={map}
              onCellClick={handleCellClick}
              highlights={highlights}
              sizeMode="map"
              cellPx={16}
              hideTextVisuals
            />
          </Suspense>
        </div>
      ) : (
        <div className="text-slate-600 italic p-2">Select a location to show map.</div>
      )}

      {/* Actor placement controls */}
      <div className="space-y-0.5">
        <div className="text-[9px] text-slate-600 mb-0.5">
          {placingId ? (
            <span>Click map → place <span className="text-yellow-400 font-bold">{actorLabels[placingId] || placingId}</span></span>
          ) : (
            'Click name → click map cell to place'
          )}
        </div>
        {participants.map(id => {
          const pos = positions[id] || { x: 0, y: 0 };
          const isActive = placingId === id;
          return (
            <button
              key={id}
              onClick={() => setPlacingId(isActive ? null : id)}
              className={`w-full text-left px-1.5 py-0.5 rounded flex items-center gap-1.5 transition ${
                isActive ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/40' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hslStr(id) }} />
              <span className="flex-1 truncate">{actorLabels[id] || id}</span>
              <span className="text-[8px] text-slate-600">({pos.x},{pos.y})</span>
            </button>
          );
        })}
      </div>

      {/* Pairwise distances */}
      {participants.length > 1 && (
        <div className="border-t border-slate-800/40 pt-1">
          <div className="text-[9px] text-slate-600 mb-0.5">Distances</div>
          <div className="space-y-0.5">
            {participants.flatMap((a, i) =>
              participants.slice(i + 1).map(b => {
                const d = dist(positions[a] || { x: 0, y: 0 }, positions[b] || { x: 0, y: 0 });
                return (
                  <div key={`${a}-${b}`} className="flex items-center gap-1 text-[9px]">
                    <span className="text-slate-500 truncate max-w-[50px]">{(actorLabels[a] || a).slice(0, 6)}</span>
                    <span className="text-slate-700">↔</span>
                    <span className="text-slate-500 truncate max-w-[50px]">{(actorLabels[b] || b).slice(0, 6)}</span>
                    <span className={`font-mono ${d < 3 ? 'text-emerald-500' : d < 6 ? 'text-amber-500' : 'text-slate-600'}`}>
                      {d.toFixed(1)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1 pt-1">
        {world.selectedLocationId && (
          <button
            onClick={() => world.moveAllToLocation(world.selectedLocationId)}
            className="flex-1 py-1 bg-slate-800/40 border border-slate-700/40 rounded text-slate-400 hover:text-slate-200 transition text-[9px]"
          >
            Move all here
          </button>
        )}
        <button
          onClick={engine.downloadScene}
          className="flex-1 py-1 bg-cyan-900/30 border border-cyan-700/40 rounded text-cyan-400 hover:text-cyan-200 transition text-[9px]"
          title="Export full scene as JSON (map + actors + pipeline + settings)"
        >
          Export scene
        </button>
      </div>
    </div>
  );
};
