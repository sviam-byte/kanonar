import React, { useMemo, useRef, useState } from 'react';
import { getPlaceMapImage } from '../../lib/places/getPlaceMapImage';
import { LocationVectorMap } from '../locations/LocationVectorMap';

type PointKind = 'danger' | 'safe';

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function getMapSize(place: any) {
  // Fall back to a stable aspect ratio when the map size is missing.
  const w = Number(place?.map?.width ?? place?.width ?? 1024);
  const h = Number(place?.map?.height ?? place?.height ?? 768);
  return { w: Number.isFinite(w) ? w : 1024, h: Number.isFinite(h) ? h : 768 };
}

function makeId(prefix: string) {
  return `${prefix}:${Math.random().toString(16).slice(2)}:${Date.now()}`;
}

function clientToMapXY(e: React.PointerEvent, box: DOMRect, mapW: number, mapH: number) {
  // Convert client pointer coordinates into map space.
  const px = e.clientX - box.left;
  const py = e.clientY - box.top;
  const sx = mapW / box.width;
  const sy = mapH / box.height;
  return { x: px * sx, y: py * sy };
}

export function PlacementMapEditor({
  draft,
  setDraft,
  place,
  actorIds,
}: {
  draft: any;
  setDraft: (d: any) => void;
  place: any;
  actorIds: string[];
}) {
  const locationId = String(place?.id ?? place?.entityId ?? '');
  const mapObj = place?.map;
  // Vector maps expose a cell grid; fall back to image rendering otherwise.
  const isVectorMap = !!(mapObj && Array.isArray((mapObj as any).cells));
  const gridScale = 32;
  const img = getPlaceMapImage(place);
  const { w: mapW, h: mapH } = getMapSize(place);
  const minDim = Math.max(1, Math.min(mapW, mapH));

  // Marker sizes are in map units (SVG viewBox units). Normalize by map size.
  const actorR = clamp(minDim * 0.012, 3.5, 10); // was 12 (too big on small maps)
  const pointCoreR = clamp(minDim * 0.010, 3.0, 10); // core dot
  const ringMax = clamp(minDim * 0.45, 40, 4000); // cap ring visualization
  const labelFont = clamp(minDim * 0.020, 9, 16);

  const hazardTypesDanger = ['generic', 'fire', 'toxic', 'sniper', 'crowd', 'dark', 'noise'];
  const hazardTypesSafe = ['generic', 'cover', 'healing', 'safe_zone', 'light', 'quiet'];

  // Keep placements scoped to the selected place/location.
  const placements = (draft.placements || []).filter((p: any) => p.locationId === locationId);
  const hazardPoints = (draft.hazardPoints || []).filter((p: any) => p.locationId === locationId);

  const [mode, setMode] = useState<'place_actor' | 'add_danger' | 'add_safe' | 'select'>('place_actor');
  const [selectedActorId, setSelectedActorId] = useState<string>(() => actorIds[0] || '');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: 'actor' | 'point'; id: string } | null>(null);

  const actorById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of draft.characters || []) m.set(String(c.id), c);
    return m;
  }, [draft]);

  function upsertPlacement(characterId: string, x: number, y: number) {
    // Persist XY placements (nodeId intentionally cleared).
    const nextAll = Array.isArray(draft.placements) ? [...draft.placements] : [];
    const idx = nextAll.findIndex((p: any) => p.characterId === characterId && p.locationId === locationId);
    const item = { characterId, locationId, x, y, nodeId: null };
    if (idx >= 0) nextAll[idx] = { ...nextAll[idx], ...item };
    else nextAll.push(item);
    setDraft({ ...draft, placements: nextAll });
  }

  function addHazard(kind: PointKind, x: number, y: number) {
    // Create a new hazard/safe point in map-space coordinates.
    const nextAll = Array.isArray(draft.hazardPoints) ? [...draft.hazardPoints] : [];
    nextAll.push({
      id: makeId(kind),
      locationId,
      kind,
      x,
      y,
      radius: clamp(minDim * 0.18, 30, Math.max(mapW, mapH)),
      strength: kind === 'danger' ? 0.8 : 0.7,
      hazardType: 'generic',
      tags: [],
    });
    setDraft({ ...draft, hazardPoints: nextAll });
  }

  function updateHazard(id: string, patch: any) {
    // Patch the selected point in place.
    const nextAll = Array.isArray(draft.hazardPoints) ? [...draft.hazardPoints] : [];
    const idx = nextAll.findIndex((p: any) => p.id === id);
    if (idx < 0) return;
    nextAll[idx] = { ...nextAll[idx], ...patch };
    setDraft({ ...draft, hazardPoints: nextAll });
  }

  function removeHazard(id: string) {
    // Drop the point from the draft list.
    const nextAll = (draft.hazardPoints || []).filter((p: any) => p.id !== id);
    setDraft({ ...draft, hazardPoints: nextAll });
    if (selectedPointId === id) setSelectedPointId(null);
  }

  function onMapPointerDown(e: React.PointerEvent) {
    if (!wrapRef.current) return;
    const box = wrapRef.current.getBoundingClientRect();
    const { x, y } = clientToMapXY(e, box, mapW, mapH);

    if (mode === 'place_actor') {
      if (!selectedActorId) return;
      upsertPlacement(selectedActorId, x, y);
      return;
    }
    if (mode === 'add_danger') {
      addHazard('danger', x, y);
      return;
    }
    if (mode === 'add_safe') {
      addHazard('safe', x, y);
      return;
    }
  }

  function startDragActor(e: React.PointerEvent, actorId: string) {
    e.stopPropagation();
    // Capture drag start on actor markers.
    dragRef.current = { kind: 'actor', id: actorId };
    (e.target as any).setPointerCapture?.(e.pointerId);
  }

  function startDragPoint(e: React.PointerEvent, pointId: string) {
    e.stopPropagation();
    // Capture drag start on hazard markers.
    dragRef.current = { kind: 'point', id: pointId };
    setSelectedPointId(pointId);
    (e.target as any).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !wrapRef.current) return;
    const box = wrapRef.current.getBoundingClientRect();
    const { x, y } = clientToMapXY(e, box, mapW, mapH);

    if (d.kind === 'actor') {
      upsertPlacement(d.id, x, y);
    } else {
      updateHazard(d.id, { x, y });
    }
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const placementByActor = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of placements) m.set(String(p.characterId), p);
    return m;
  }, [placements]);

  const selectedPoint = selectedPointId ? hazardPoints.find((p: any) => p.id === selectedPointId) : null;

  return (
    <div className="canon-card p-3 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="text-sm font-semibold">Placement</div>
        <div className="text-xs opacity-70">{locationId || '—'}</div>

        <div className="ml-auto flex flex-wrap gap-2">
          <button className="canon-button" onClick={() => setMode('place_actor')}>
            Place actor
          </button>
          <button className="canon-button" onClick={() => setMode('add_danger')}>
            Add danger
          </button>
          <button className="canon-button" onClick={() => setMode('add_safe')}>
            Add safe
          </button>
          <button className="canon-button" onClick={() => setMode('select')}>
            Select
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="text-xs opacity-70">Actor:</div>
        <select
          className="canon-input bg-black/40 text-white border border-canon-border"
          value={selectedActorId}
          onChange={(e) => setSelectedActorId(e.target.value)}
          disabled={mode !== 'place_actor'}
        >
          {actorIds.map((id) => {
            const c = actorById.get(String(id));
            return (
              <option key={id} value={id}>
                {c?.title ?? c?.name ?? id}
              </option>
            );
          })}
        </select>

        <div className="text-xs opacity-70 ml-4">Mode:</div>
        <div className="text-xs">{mode}</div>
      </div>

      {isVectorMap ? (
        <div className="canon-border rounded-xl p-2 overflow-auto">
          <div
            ref={wrapRef}
            className="relative"
            style={{ width: mapW * gridScale, height: mapH * gridScale }}
            onPointerDown={onMapPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Vector grid rendering keeps setup/placement readable even without images. */}
            <LocationVectorMap map={mapObj} showGrid={true} scale={gridScale} />

            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`0 0 ${mapW} ${mapH}`}
              preserveAspectRatio="none"
            >
              {/* hazard/safe points */}
              {hazardPoints.map((p: any) => (
                <g key={p.id} onPointerDown={(e) => startDragPoint(e, p.id)} style={{ cursor: 'grab' }}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={pointCoreR}
                    opacity={p.id === selectedPointId ? 0.95 : 0.75}
                  />
                  {/* radius ring (visual only) */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={clamp(Number(p.radius || 0), 10, ringMax)}
                    opacity={0.15}
                    fill="none"
                    stroke="currentColor"
                  />
                  <text x={p.x + actorR + 4} y={p.y + 4} fontSize={labelFont} opacity={0.9}>
                    {p.kind}/{p.hazardType || 'generic'}:{Math.round(100 * clamp01(p.strength || 0))}%
                  </text>
                </g>
              ))}

              {/* actors */}
              {actorIds.map((id) => {
                const p = placementByActor.get(String(id));
                if (!p || p.x == null || p.y == null) return null;
                const c = actorById.get(String(id));
                return (
                  <g key={id} onPointerDown={(e) => startDragActor(e, id)} style={{ cursor: 'grab' }}>
                    <circle cx={p.x} cy={p.y} r={actorR} opacity={0.9} />
                    <text x={p.x + actorR + 4} y={p.y + 4} fontSize={labelFont} opacity={0.95}>
                      {c?.title ?? c?.name ?? id}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative w-full overflow-hidden rounded-xl canon-border"
          style={{ aspectRatio: `${mapW} / ${mapH}` }}
          onPointerDown={onMapPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {img ? (
            <img
              src={img}
              alt={place?.title ?? place?.id ?? 'map'}
              className="absolute inset-0 w-full h-full object-contain select-none"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70">
              No map image on this place (expected place.map.image / place.image / place.assets.map)
            </div>
          )}

          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${mapW} ${mapH}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* hazard/safe points */}
            {hazardPoints.map((p: any) => (
              <g key={p.id} onPointerDown={(e) => startDragPoint(e, p.id)} style={{ cursor: 'grab' }}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={pointCoreR}
                  opacity={p.id === selectedPointId ? 0.95 : 0.75}
                />
                {/* radius ring (visual only) */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={clamp(Number(p.radius || 0), 10, ringMax)}
                  opacity={0.15}
                  fill="none"
                  stroke="currentColor"
                />
                <text x={p.x + actorR + 4} y={p.y + 4} fontSize={labelFont} opacity={0.9}>
                  {p.kind}/{p.hazardType || 'generic'}:{Math.round(100 * clamp01(p.strength || 0))}%
                </text>
              </g>
            ))}

            {/* actors */}
            {actorIds.map((id) => {
              const p = placementByActor.get(String(id));
              if (!p || p.x == null || p.y == null) return null;
              const c = actorById.get(String(id));
              return (
                <g key={id} onPointerDown={(e) => startDragActor(e, id)} style={{ cursor: 'grab' }}>
                  <circle cx={p.x} cy={p.y} r={actorR} opacity={0.9} />
                  <text x={p.x + actorR + 4} y={p.y + 4} fontSize={labelFont} opacity={0.95}>
                    {c?.title ?? c?.name ?? id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Point inspector */}
      <div className="canon-card p-2">
        <div className="text-xs font-semibold mb-2">Point inspector</div>
        {selectedPoint ? (
          <div className="flex flex-wrap gap-3 items-center">
            <div className="text-xs opacity-70">id</div>
            <div className="text-xs">{selectedPoint.id}</div>

            <div className="text-xs opacity-70 ml-2">kind</div>
            <div className="text-xs">{selectedPoint.kind}</div>

            <div className="text-xs opacity-70 ml-2">type</div>
            <select
              className="canon-input bg-black/40 text-white border border-canon-border"
              value={String(selectedPoint.hazardType ?? 'generic')}
              onChange={(e) => updateHazard(selectedPoint.id, { hazardType: e.target.value })}
            >
              {(selectedPoint.kind === 'danger' ? hazardTypesDanger : hazardTypesSafe).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <div className="text-xs opacity-70 ml-2">tags</div>
            <input
              className="canon-input bg-black/40 text-white border border-canon-border"
              value={String((selectedPoint.tags || []).join(', '))}
              onChange={(e) =>
                updateHazard(selectedPoint.id, {
                  tags: String(e.target.value || '')
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
              style={{ width: 220 }}
            />

            <div className="text-xs opacity-70 ml-2">strength</div>
            <input
              className="canon-input bg-black/40 text-white border border-canon-border"
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={String(selectedPoint.strength ?? 0.8)}
              onChange={(e) => updateHazard(selectedPoint.id, { strength: clamp01(Number(e.target.value)) })}
              style={{ width: 90 }}
            />

            <div className="text-xs opacity-70 ml-2">radius</div>
            <input
              className="canon-input bg-black/40 text-white border border-canon-border"
              type="number"
              step="10"
              min="10"
              max={Math.max(mapW, mapH)}
              value={String(selectedPoint.radius ?? 120)}
              onChange={(e) => updateHazard(selectedPoint.id, { radius: Math.max(10, Number(e.target.value) || 120) })}
              style={{ width: 110 }}
            />

            <button className="canon-button ml-auto" onClick={() => removeHazard(selectedPoint.id)}>
              Delete
            </button>
          </div>
        ) : (
          <div className="text-xs opacity-70">Select a danger/safe point (click/drag it)</div>
        )}
      </div>

      <div className="text-xs opacity-70">
        Tip: mode=Place actor → click map to place selected actor; drag markers to adjust.
      </div>
    </div>
  );
}
