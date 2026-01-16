import React, { useMemo, useRef, useState } from 'react';
import { getPlaceMapImage } from '../../lib/places/getPlaceMapImage';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function getMapSize(place: any) {
  const w = Number(place?.map?.width ?? place?.width ?? 1024);
  const h = Number(place?.map?.height ?? place?.height ?? 768);
  return { w: Number.isFinite(w) ? w : 1024, h: Number.isFinite(h) ? h : 768 };
}

function clientToMapXY(e: React.PointerEvent, box: DOMRect, mapW: number, mapH: number) {
  const px = e.clientX - box.left;
  const py = e.clientY - box.top;
  const sx = mapW / box.width;
  const sy = mapH / box.height;
  return { x: px * sx, y: py * sy };
}

export function LivePlacementMiniMap({
  snapshot,
  worldFacts,
  selectedLocId,
  onSelectLocId,
  onMoveXY,
  widthPx = 360,
  variant = 'floating',
  chrome = true,
}: {
  snapshot: any | null;
  worldFacts: any;
  selectedLocId: string;
  onSelectLocId: (id: string) => void;
  onMoveXY: (actorId: string, x: number, y: number, locationId: string) => void;
  widthPx?: number;
  /** Render as a fixed overlay or embedded into a parent layout. */
  variant?: 'floating' | 'embedded';
  /** Hide the panel chrome when the parent provides its own card. */
  chrome?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ actorId: string } | null>(null);

  const locs = useMemo(
    () => (snapshot?.locations || []).slice().sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))),
    [snapshot]
  );
  const chars = useMemo(() => (snapshot?.characters || []).slice(), [snapshot]);

  const place = useMemo(() => {
    const l = locs.find((x: any) => String(x.id) === String(selectedLocId));
    return l || null;
  }, [locs, selectedLocId]);

  const { w: mapW, h: mapH } = getMapSize(place);
  const minDim = Math.max(1, Math.min(mapW, mapH));
  const actorR = clamp(minDim * 0.012, 3.5, 10);
  const labelFont = clamp(minDim * 0.020, 9, 14);
  const img = getPlaceMapImage(place);

  const hazards = useMemo(() => {
    const xs = Array.isArray(worldFacts?.hazardPoints) ? worldFacts.hazardPoints : [];
    return xs.filter((p: any) => String(p.locationId) === String(selectedLocId));
  }, [worldFacts, selectedLocId]);

  const localChars = useMemo(
    () => chars.filter((c: any) => String(c.locId) === String(selectedLocId)),
    [chars, selectedLocId]
  );

  function startDragActor(e: React.PointerEvent, actorId: string) {
    e.stopPropagation();
    dragRef.current = { actorId };
    (e.target as any).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !wrapRef.current) return;
    const box = wrapRef.current.getBoundingClientRect();
    const { x, y } = clientToMapXY(e, box, mapW, mapH);
    onMoveXY(d.actorId, x, y, selectedLocId);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  if (!snapshot) return null;

  const outerClass = variant === 'floating' ? 'fixed top-24 left-4 z-40' : 'w-full';
  const outerStyle = variant === 'floating' ? { width: widthPx } : undefined;

  const mapBody = (
    <>
      {!collapsed ? (
        <div className={chrome ? 'px-3 pb-3 space-y-2' : 'space-y-2'}>
          <div className="flex items-center gap-2">
            <div className="text-xs opacity-70">Location</div>
            <select
              className="canon-input bg-black/40 text-white border border-canon-border w-full"
              value={selectedLocId}
              onChange={(e) => onSelectLocId(e.target.value)}
            >
              {locs.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.title ?? l.id}
                </option>
              ))}
            </select>
          </div>

          <div
            ref={wrapRef}
            className="relative w-full overflow-hidden rounded-xl border border-canon-border bg-black/15"
            style={{ aspectRatio: `${mapW} / ${mapH}` }}
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
              <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70">No map</div>
            )}

            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${mapW} ${mapH}`} preserveAspectRatio="xMidYMid meet">
              {/* hazards (read-only preview) */}
              {hazards.map((p: any) => (
                <g key={p.id} opacity={0.75}>
                  <circle cx={p.x} cy={p.y} r={clamp(minDim * 0.010, 3, 10)} />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={clamp(Number(p.radius || 0), 10, clamp(minDim * 0.45, 40, 4000))}
                    fill="none"
                    opacity={0.12}
                    stroke="currentColor"
                  />
                </g>
              ))}

              {/* actors (drag to move_xy) */}
              {localChars.map((c: any) => {
                const x = Number(c?.pos?.x);
                const y = Number(c?.pos?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return (
                  <g key={c.id} onPointerDown={(e) => startDragActor(e, c.id)} style={{ cursor: 'grab' }}>
                    <circle cx={x} cy={y} r={actorR} opacity={0.95} />
                    <text x={x + actorR + 4} y={y + 4} fontSize={labelFont} opacity={0.95}>
                      {c.title ?? c.name ?? c.id}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="text-[11px] opacity-60">Drag actors to move inside this location (move_xy).</div>
        </div>
      ) : null}
    </>
  );

  if (!chrome) {
    return (
      <div className={outerClass} style={outerStyle}>
        {mapBody}
      </div>
    );
  }

  return (
    <div className={outerClass} style={outerStyle}>
      <div className="rounded-2xl border border-canon-border bg-canon-panel/80 backdrop-blur-md shadow-canon-2 overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2">
          <div className="text-sm font-semibold">Map</div>
          <div className="grow" />
          <button className="canon-button" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
        {mapBody}
      </div>
    </div>
  );
}
