/** SceneMapPanel — center-pane map with placement, distances, export. */
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
  const loc = useMemo(() => allLocations.find((l: any) => l.entityId === world.selectedLocationId) as any, [world.selectedLocationId]);
  const map: LocationMap | null = loc?.map || world.activeMap || null;
  const parts = Array.from(world.sceneParticipants);

  const pos = useMemo(() => {
    const o: Record<string, { x: number; y: number }> = {};
    for (const id of parts) { const ag = world.worldState?.agents?.find((a: any) => a.entityId === id); o[id] = (ag as any)?.position || world.actorPositions?.[id] || { x: 3, y: 3 }; }
    return o;
  }, [parts, world.worldState, world.actorPositions]);

  const hl = useMemo(() => parts.map(id => ({
    x: pos[id]?.x ?? 3, y: pos[id]?.y ?? 3,
    color: pid === id ? '#facc15' : world.perspectiveId === id ? '#22d3ee' : `hsl(${sHue(id)},55%,50%)`,
    size: world.perspectiveId === id ? 1.4 : 1,
  })), [parts, pos, world.perspectiveId, pid]);

  const onCell = useCallback((x: number, y: number) => {
    if (!pid) return; world.setAgentPosition(pid, { x, y });
    const i = parts.indexOf(pid); setPid(parts[i + 1] || null);
  }, [pid, world, parts]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-950/50 overflow-auto p-3">
        {map ? <Suspense fallback={<div className="text-[9px] text-slate-600 animate-pulse">Loading…</div>}><MapViewer map={map} onCellClick={onCell} highlights={hl} sizeMode="map" cellPx={28} hideTextVisuals /></Suspense> : <div className="text-slate-600 text-[11px] italic">No map grid. Select a location with map.</div>}
      </div>
      <div className="shrink-0 bg-slate-900/60 border-t border-slate-800/40 p-2 space-y-1 max-h-[180px] overflow-y-auto text-[10px]">
        <div className="text-[9px] text-slate-500">{pid ? <>Place <span className="text-yellow-400 font-bold">{actorLabels[pid] || pid}</span> → click cell</> : 'Click name → click cell to place'}</div>
        <div className="flex flex-wrap gap-1">{parts.map(id => {
          const p = pos[id] || { x: 0, y: 0 };
          return <button key={id} onClick={() => setPid(pid === id ? null : id)} className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[9px] border ${pid === id ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700/40' : 'bg-slate-800/40 text-slate-400 border-slate-700/30 hover:text-slate-200'}`}><div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${sHue(id)},55%,50%)` }} />{(actorLabels[id] || id).slice(0, 8)}<span className="text-[7px] text-slate-600">({p.x},{p.y})</span></button>;
        })}</div>
        {parts.length > 1 && <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px]">{parts.flatMap((a, i) => parts.slice(i + 1).map(b => { const d = dist(pos[a] || { x: 0, y: 0 }, pos[b] || { x: 0, y: 0 }); return <span key={`${a}-${b}`} className="text-slate-600">{(actorLabels[a] || a).slice(0, 4)}↔{(actorLabels[b] || b).slice(0, 4)}=<span className={d < 3 ? 'text-emerald-500' : d < 6 ? 'text-amber-500' : ''}>{d.toFixed(1)}</span></span>; }))}</div>}
        <div className="flex gap-1 pt-0.5">
          {world.selectedLocationId && <button onClick={() => world.moveAllToLocation(world.selectedLocationId)} className="px-2 py-0.5 bg-slate-800/40 border border-slate-700/30 rounded text-slate-400 hover:text-slate-200 text-[9px]">Move all</button>}
          <button onClick={world.forceRebuild} className="px-2 py-0.5 bg-cyan-900/30 border border-cyan-700/30 rounded text-cyan-400 text-[9px]">Rebuild</button>
          <button onClick={engine.downloadScene} className="px-2 py-0.5 bg-emerald-900/30 border border-emerald-700/30 rounded text-emerald-400 text-[9px]">Export JSON</button>
        </div>
      </div>
    </div>
  );
};
