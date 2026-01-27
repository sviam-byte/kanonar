// components/ScenarioSetup/PlacementMiniMap.tsx
// Compact placement UI meant to live in an always-on side pane.

import React, { useMemo, useState } from 'react';
import type { LocationMap } from '../../types';
import { LocationVectorMap } from '../locations/LocationVectorMap';

type Mode = 'place_actor' | 'add_danger' | 'add_safe' | 'select';

function clamp01(x: number) {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

let __idCounter = 0;
function makeId(prefix: string) {
  return `${prefix}:${(__idCounter++).toString(36)}:${Date.now()}`;
}

function keyXY(x: number, y: number) {
  return `${x},${y}`;
}

function stableHue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function colorForId(id: string) {
  const hue = stableHue(String(id));
  return `hsl(${hue} 80% 60%)`;
}

function initialsForTitle(title: string) {
  const t = String(title || '').trim();
  if (!t) return '??';
  const parts = t.split(/\s+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? t[0] ?? '?';
  const b = parts.length > 1 ? (parts[1]?.[0] ?? '') : (t[1] ?? '');
  return (a + b).toUpperCase().slice(0, 2);
}

export function PlacementMiniMap({
  draft,
  setDraft,
  place,
  actorIds,
  title,
  scale,
}: {
  draft: any;
  setDraft: (d: any) => void;
  place: any;
  actorIds: string[];
  title?: string;
  scale?: number;
}) {
  const locId = String(place?.entityId ?? place?.id ?? '');
  const map: LocationMap | null =
    place?.map && typeof place.map === 'object' ? (place.map as LocationMap) : null;

  const [mode, setMode] = useState<Mode>('place_actor');
  const [selectedActorId, setSelectedActorId] = useState<string>(() => String(actorIds?.[0] ?? ''));
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const characters = Array.isArray(draft?.characters) ? draft.characters : [];
  const actorTitle = (id: string) =>
    characters.find((c: any) => String(c.id) === String(id))?.title ??
    characters.find((c: any) => String(c.id) === String(id))?.name ??
    id;

  const placementsAll = Array.isArray(draft?.placements) ? draft.placements : [];
  const hazardAll = Array.isArray(draft?.hazardPoints) ? draft.hazardPoints : [];

  const placements = useMemo(
    () => placementsAll.filter((p: any) => String(p.locationId) === locId && actorIds.includes(String(p.characterId))),
    [placementsAll, locId, actorIds]
  );

  const hazardPoints = useMemo(
    () => hazardAll.filter((p: any) => String(p.locationId) === locId),
    [hazardAll, locId]
  );

  const pointByXY = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of hazardPoints) m.set(keyXY(p.x, p.y), p);
    return m;
  }, [hazardPoints]);

  function upsertPlacement(actorId: string, x: number, y: number) {
    const next = [
      ...placementsAll.filter(
        (p: any) => !(String(p.locationId) === locId && String(p.characterId) === String(actorId))
      ),
    ];
    next.push({ characterId: actorId, locationId: locId, x, y, nodeId: null });
    setDraft({
      ...draft,
      placements: next,
      locPlacements: { ...(draft.locPlacements || {}), [String(actorId)]: String(locId) },
    });
  }

  function addHazard(kind: 'danger' | 'safe', x: number, y: number) {
    const next = [...hazardAll];
    next.push({
      id: makeId(kind),
      locationId: locId,
      kind,
      x,
      y,
      radius: 4,
      strength: kind === 'danger' ? 0.85 : 0.75,
      tags: [],
    });
    setDraft({ ...draft, hazardPoints: next });
  }

  function updateHazard(id: string, patch: Partial<any>) {
    const next = hazardAll.map((p: any) => (String(p.id) === String(id) ? { ...p, ...patch } : p));
    setDraft({ ...draft, hazardPoints: next });
  }

  const highlightCells = useMemo(() => {
    const cells: Array<{ x: number; y: number; color: string; size?: number }> = [];
    for (const hp of hazardPoints) {
      cells.push({
        x: hp.x,
        y: hp.y,
        color: hp.kind === 'danger' ? 'rgba(255, 60, 60, 0.35)' : 'rgba(80, 255, 160, 0.28)',
        size: 1.0,
      });
    }
    return cells;
  }, [hazardPoints]);

  const markers = useMemo(() => {
    return placements.map((p: any) => {
      const id = String(p.characterId);
      const titleValue = actorTitle(id);
      const label = initialsForTitle(titleValue);
      return {
        x: p.x,
        y: p.y,
        label,
        title: titleValue,
        color: colorForId(id),
        size: String(id) === String(selectedActorId) ? 0.86 : 0.72,
      };
    });
  }, [placements, selectedActorId]);

  function onCellClick(x: number, y: number) {
    if (!map) return;

    const hp = pointByXY.get(keyXY(x, y));
    if (mode === 'select') {
      setSelectedPointId(hp ? String(hp.id) : null);
      return;
    }

    if (mode === 'place_actor') {
      if (!selectedActorId) return;
      upsertPlacement(String(selectedActorId), x, y);
      return;
    }

    if (mode === 'add_danger') {
      addHazard('danger', x, y);
      return;
    }

    if (mode === 'add_safe') {
      addHazard('safe', x, y);
    }
  }

  const selectedPoint = selectedPointId ? hazardAll.find((p: any) => String(p.id) === String(selectedPointId)) : null;

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="text-[10px] uppercase font-bold text-slate-500">{title ?? 'Placement'}</div>
        <select
          className="canon-input text-[11px] py-1 ml-auto"
          value={selectedActorId}
          onChange={(e) => setSelectedActorId(e.target.value)}
          disabled={!actorIds.length}
          title="Actor to place"
        >
          {actorIds.map((id) => (
            <option key={id} value={id}>
              {actorTitle(id)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          className={`px-2 py-1 text-[10px] rounded border ${
            mode === 'place_actor'
              ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
              : 'border-slate-800 bg-black/40 text-slate-400 hover:text-white'
          }`}
          onClick={() => setMode('place_actor')}
          title="Place/move actor inside location"
        >
          Place
        </button>
        <button
          className={`px-2 py-1 text-[10px] rounded border ${
            mode === 'add_danger'
              ? 'border-red-400/40 bg-red-500/10 text-red-200'
              : 'border-slate-800 bg-black/40 text-slate-400 hover:text-white'
          }`}
          onClick={() => setMode('add_danger')}
          title="Add danger point"
        >
          Danger
        </button>
        <button
          className={`px-2 py-1 text-[10px] rounded border ${
            mode === 'add_safe'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
              : 'border-slate-800 bg-black/40 text-slate-400 hover:text-white'
          }`}
          onClick={() => setMode('add_safe')}
          title="Add safe point"
        >
          Safe
        </button>
        <button
          className={`px-2 py-1 text-[10px] rounded border ${
            mode === 'select'
              ? 'border-slate-400/40 bg-slate-500/10 text-slate-200'
              : 'border-slate-800 bg-black/40 text-slate-400 hover:text-white'
          }`}
          onClick={() => setMode('select')}
          title="Select hazard point to edit"
        >
          Select
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {!map ? (
          <div className="h-full canon-card p-3 text-[11px] text-slate-400">No place.map for this location.</div>
        ) : (
          <LocationVectorMap
            map={map}
            showGrid
            scale={Number.isFinite(Number(scale)) ? Number(scale) : 28}
            hideTextVisuals
            highlightCells={highlightCells}
            markers={markers}
            onCellClick={onCellClick}
          />
        )}
      </div>

      {selectedPoint && (
        <div className="canon-card p-2">
          <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">
            Point: {selectedPoint.kind} @ ({selectedPoint.x},{selectedPoint.y})
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-slate-500 w-[64px]">radius</div>
            <input
              className="canon-input text-[11px] py-1 flex-1"
              type="number"
              value={Number(selectedPoint.radius ?? 4)}
              min={0}
              step={1}
              onChange={(e) => updateHazard(String(selectedPoint.id), { radius: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="text-[10px] text-slate-500 w-[64px]">strength</div>
            <input
              className="canon-input text-[11px] py-1 flex-1"
              type="number"
              value={Number(selectedPoint.strength ?? 0.8)}
              min={0}
              max={1}
              step={0.05}
              onChange={(e) => updateHazard(String(selectedPoint.id), { strength: clamp01(Number(e.target.value)) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
