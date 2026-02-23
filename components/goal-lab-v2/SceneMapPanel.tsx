/**
 * SceneMapPanel — compact map with actor placement for GoalLab.
 *
 * Shows current location's map grid with actor markers.
 * Click cell to move selected actor. Distances between actors matter for
 * spatial atoms (proximity, hazard geometry, social distance).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useGoalLab } from '../../contexts/GoalLabContext';
import { allLocations } from '../../data/locations';
import type { LocationMap } from '../../types';

function stableHue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export const SceneMapPanel: React.FC = () => {
  const ctx = useGoalLab();
  const { world, actorLabels } = ctx;
  const [placingId, setPlacingId] = useState<string | null>(null);

  // Get current location map
  const location = useMemo(() => {
    return allLocations.find((l: any) => l.entityId === world.selectedLocationId) as any;
  }, [world.selectedLocationId]);

  const map: LocationMap | null = location?.map || null;
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

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      if (placingId) {
        world.setAgentPosition(placingId, { x, y });
        // Auto-advance to next participant or deselect
        const idx = participants.indexOf(placingId);
        const next = participants[idx + 1];
        setPlacingId(next || null);
      }
    },
    [placingId, world, participants]
  );

  if (!map) {
    return (
      <div className="text-[10px] text-slate-600 italic p-2">
        Select a location with a map to place actors.
      </div>
    );
  }

  const w = map.width || 10;
  const h = map.height || 10;
  const cells = Array.isArray(map.cells) ? map.cells : [];
  const cellSize = Math.min(18, Math.floor(200 / Math.max(w, h)));

  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
        Map: {location?.title || 'unknown'} ({w}×{h})
      </div>

      {/* Map grid */}
      <div
        className="relative border border-slate-800 rounded bg-slate-950 overflow-hidden"
        style={{ width: w * cellSize + 2, height: h * cellSize + 2 }}
      >
        {/* Cells */}
        {cells.map((cell: any, ci: number) => {
          const cx = cell.x ?? (ci % w);
          const cy = cell.y ?? Math.floor(ci / w);
          const isWalkable = cell.walkable !== false;
          const danger = Number(cell.danger ?? 0);
          return (
            <div
              key={`${cx}-${cy}`}
              onClick={() => handleCellClick(cx, cy)}
              className={`absolute cursor-pointer transition-colors ${
                isWalkable
                  ? danger > 0.3
                    ? 'bg-red-950/40 hover:bg-red-900/50'
                    : 'bg-slate-900/30 hover:bg-slate-800/50'
                  : 'bg-slate-800/60'
              } border border-slate-800/20`}
              style={{
                left: cx * cellSize + 1,
                top: cy * cellSize + 1,
                width: cellSize - 1,
                height: cellSize - 1,
              }}
              title={`(${cx},${cy}) ${!isWalkable ? '⛔' : ''} ${danger > 0 ? `danger=${danger.toFixed(1)}` : ''}`}
            />
          );
        })}

        {/* Actor markers */}
        {participants.map(id => {
          const pos = positions[id] || { x: 3, y: 3 };
          const hue = stableHue(id);
          const isPlacing = placingId === id;
          const isPerspective = world.perspectiveId === id;
          return (
            <div
              key={id}
              className={`absolute rounded-full flex items-center justify-center transition-all ${
                isPlacing ? 'ring-2 ring-yellow-400 animate-pulse' : ''
              } ${isPerspective ? 'ring-1 ring-cyan-400' : ''}`}
              style={{
                left: pos.x * cellSize + 1 + cellSize / 2 - 5,
                top: pos.y * cellSize + 1 + cellSize / 2 - 5,
                width: 10,
                height: 10,
                backgroundColor: `hsl(${hue}, 60%, 40%)`,
                zIndex: isPlacing ? 20 : 10,
              }}
              title={`${actorLabels[id] || id} (${pos.x}, ${pos.y})`}
            >
              <span className="text-[6px] text-white font-bold">{(actorLabels[id] || id).charAt(0)}</span>
            </div>
          );
        })}
      </div>

      {/* Actor placement controls */}
      <div className="space-y-0.5">
        <div className="text-[9px] text-slate-600 mb-0.5">
          {placingId ? (
            <span>
              Click map to place <span className="text-yellow-400 font-bold">{actorLabels[placingId] || placingId}</span>
            </span>
          ) : (
            'Click actor name → then click map to place'
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
                isActive
                  ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(${stableHue(id)}, 60%, 40%)` }}
              />
              <span className="flex-1 truncate">{actorLabels[id] || id}</span>
              <span className="text-[8px] text-slate-600">
                ({pos.x},{pos.y})
              </span>
            </button>
          );
        })}
      </div>

      {/* Distances */}
      {participants.length > 1 && (
        <div className="border-t border-slate-800/40 pt-1.5">
          <div className="text-[9px] text-slate-600 mb-0.5">Pairwise distances</div>
          <div className="space-y-0.5">
            {participants.flatMap((a, i) =>
              participants.slice(i + 1).map(b => {
                const d = dist(positions[a] || { x: 0, y: 0 }, positions[b] || { x: 0, y: 0 });
                return (
                  <div key={`${a}-${b}`} className="flex items-center gap-1 text-[9px]">
                    <span className="text-slate-500">{(actorLabels[a] || a).slice(0, 6)}</span>
                    <span className="text-slate-700">↔</span>
                    <span className="text-slate-500">{(actorLabels[b] || b).slice(0, 6)}</span>
                    <span
                      className={`font-mono ${
                        d < 3 ? 'text-emerald-500' : d < 6 ? 'text-amber-500' : 'text-slate-600'
                      }`}
                    >
                      {d.toFixed(1)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Move all to location */}
      <button
        onClick={() => {
          if (!world.selectedLocationId) return;
          world.moveAllToLocation(world.selectedLocationId);
        }}
        className="w-full mt-1 py-1 bg-slate-800/40 border border-slate-700/40 rounded text-slate-400 hover:text-slate-200 transition text-[9px]"
      >
        Move all to this location
      </button>
    </div>
  );
};
