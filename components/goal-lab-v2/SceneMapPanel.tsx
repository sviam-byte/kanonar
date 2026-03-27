/**
 * SceneMapPanel v2.1 — center-pane map with proper actor placement.
 *
 * Improvements:
 * - Actors shown as labeled pins on the grid (not just highlight dots)
 * - Drag-to-place mode with visual feedback
 * - Distance matrix shown as a compact table
 * - Placement status is explicit
 * - No fake positions for unplaced actors
 * - Auto-place presets available
 */
import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useGoalLab } from '../../contexts/GoalLabContext';
import { allLocations } from '../../data/locations';
import type { LocationMap } from '../../types';

const MapViewer = lazy(() => import('../locations/MapViewer').then(m => ({ default: m.MapViewer })));
const sHue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

export const SceneMapPanel: React.FC = () => {
  const { world, engine, actorLabels } = useGoalLab();
  const [pid, setPid] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const loc = useMemo(() => allLocations.find((l: any) => l.entityId === world.selectedLocationId) as any, [world.selectedLocationId]);
  const map: LocationMap | null = loc?.map || world.activeMap || null;
  const parts = Array.from(world.sceneParticipants);
  const placement = world.placementStatus;
  const placedSet = useMemo(() => new Set(placement.placedIds), [placement.placedIds]);

  const pos = useMemo(() => {
    const o: Record<string, { x: number; y: number }> = {};
    for (const id of parts) {
      const ag = world.worldState?.agents?.find((a: any) => a.entityId === id);
      const p = (ag as any)?.position || world.actorPositions?.[id];
      if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
        o[id] = p;
      }
    }
    return o;
  }, [parts, world.worldState, world.actorPositions]);

  const hl = useMemo(() => {
    const items = parts
      .filter(id => placedSet.has(id) && pos[id])
      .map(id => ({
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
  }, [parts, pos, world.perspectiveId, pid, actorLabels, hoveredCell, placedSet]);

  const onCell = useCallback((x: number, y: number) => {
    if (!pid) return;
    world.setAgentPosition(pid, { x, y });
    // Advance to next still-missing participant.
    const nextMissing = parts.find(id => id !== pid && !placedSet.has(id));
    setPid(nextMissing || null);
    setHoveredCell(null);
  }, [pid, world, parts, placedSet]);

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
        <div className={`text-[9px] px-1.5 py-0.5 rounded border ${
          placement.isComplete
            ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-300'
            : pid
              ? 'bg-yellow-900/20 border-yellow-700/30 text-yellow-300'
              : 'bg-amber-900/20 border-amber-700/30 text-amber-300'
        }`}>
          {placement.isComplete ? (
            <>Placement OK — {placement.placedIds.length}/{placement.total} placed</>
          ) : pid ? (
            <>Placing <span className="font-bold">{actorLabels[pid] || pid}</span> — click a cell on the map</>
          ) : (
            <>Placement incomplete — unplaced: {placement.missingIds.map(id => actorLabels[id] || id).join(', ')}</>
          )}
        </div>

        {!!placement.stackedIds.length && (
          <div className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/30 border border-amber-800/40 text-amber-300">
            Stacked positions: {placement.stackedIds.map(id => actorLabels[id] || id).join(', ')}
          </div>
        )}

        {/* Actor chips with coordinates */}
        <div className="flex flex-wrap gap-1">
          {parts.map(id => {
            const p = pos[id];
            const isPlaced = placedSet.has(id) && !!p;
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
                      : isPlaced
                        ? 'bg-slate-800/40 text-slate-400 border-slate-700/30 hover:text-slate-200 hover:border-slate-600'
                        : 'bg-amber-950/40 text-amber-300 border-amber-800/40 hover:text-amber-100 hover:border-amber-600/50'
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-black/20" style={{ backgroundColor: `hsl(${sHue(id)},55%,50%)` }} />
                <span className="truncate max-w-[60px]">{(actorLabels[id] || id).slice(0, 10)}</span>
                <span className="text-[7px] text-slate-600 tabular-nums">
                  {isPlaced ? `(${p!.x},${p!.y})` : 'unplaced'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Distance matrix (compact) */}
        {placement.placedIds.length > 1 && placement.placedIds.length <= 6 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px]">
            {placement.placedIds.flatMap((a, i) =>
              placement.placedIds.slice(i + 1).map(b => {
                const d = dist(pos[a]!, pos[b]!);
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
        <div className="flex flex-wrap gap-1 pt-0.5">
          <button
            onClick={() => { world.autoPlaceParticipants('clustered'); setPid(null); }}
            className="px-2 py-0.5 bg-slate-800/40 border border-slate-700/30 rounded text-slate-300 hover:text-white text-[9px]"
          >
            Auto: cluster
          </button>
          <button
            onClick={() => { world.autoPlaceParticipants('socially_weighted'); setPid(null); }}
            className="px-2 py-0.5 bg-slate-800/40 border border-slate-700/30 rounded text-slate-300 hover:text-white text-[9px]"
          >
            Auto: social
          </button>
          <button
            onClick={() => { world.autoPlaceParticipants('split_by_role'); setPid(null); }}
            className="px-2 py-0.5 bg-slate-800/40 border border-slate-700/30 rounded text-slate-300 hover:text-white text-[9px]"
          >
            Auto: role
          </button>
          <button
            onClick={() => { world.autoPlaceParticipants('random_valid'); setPid(null); }}
            className="px-2 py-0.5 bg-slate-800/40 border border-slate-700/30 rounded text-slate-300 hover:text-white text-[9px]"
          >
            Auto: random
          </button>
          <button
            onClick={() => { world.clearPlacements(); setPid(parts[0] || null); }}
            className="px-2 py-0.5 bg-amber-900/20 border border-amber-700/30 rounded text-amber-300 hover:text-amber-100 text-[9px]"
          >
            Clear
          </button>
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
