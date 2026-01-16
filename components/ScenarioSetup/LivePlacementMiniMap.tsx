import React, { useMemo, useState } from 'react';
import { MapViewer } from '../locations/MapViewer';

export function LivePlacementMiniMap({
  snapshot,
  worldFacts,
  selectedLocId,
  onSelectLocId,
  onMoveXY,
  activeActorId = null,
  widthPx = 360,
  variant = 'floating',
  chrome = true,
}: {
  snapshot: any | null;
  worldFacts: any;
  selectedLocId: string;
  onSelectLocId: (id: string) => void;
  onMoveXY: (actorId: string, x: number, y: number, locationId: string) => void;
  activeActorId?: string | null;
  widthPx?: number;
  /** Render as a fixed overlay or embedded into a parent layout. */
  variant?: 'floating' | 'embedded';
  /** Hide the panel chrome when the parent provides its own card. */
  chrome?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const locs = useMemo(
    () => (snapshot?.locations || []).slice().sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))),
    [snapshot]
  );
  const chars = useMemo(() => (snapshot?.characters || []).slice(), [snapshot]);

  const place = useMemo(() => {
    const l = locs.find((x: any) => String(x.id) === String(selectedLocId));
    return l || null;
  }, [locs, selectedLocId]);

  const hazards = useMemo(() => {
    const xs = Array.isArray(worldFacts?.hazardPoints) ? worldFacts.hazardPoints : [];
    return xs.filter((p: any) => String(p.locationId) === String(selectedLocId));
  }, [worldFacts, selectedLocId]);

  const localChars = useMemo(
    () => chars.filter((c: any) => String(c.locId) === String(selectedLocId)),
    [chars, selectedLocId]
  );

  const highlights = useMemo(() => {
    const hs: Array<{ x: number; y: number; color: string; size?: number }> = [];
    for (const c of localChars) {
      const x = Number((c as any)?.pos?.x);
      const y = Number((c as any)?.pos?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      hs.push({ x, y, color: 'rgba(255,255,255,0.90)', size: 0.28 });
    }
    for (const p of hazards) {
      const x = Number((p as any)?.x);
      const y = Number((p as any)?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const isDanger = String((p as any)?.kind) === 'danger';
      hs.push({ x, y, color: isDanger ? 'rgba(255,60,60,0.80)' : 'rgba(60,255,140,0.75)', size: 0.22 });
    }
    return hs;
  }, [localChars, hazards]);

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

          {place?.map ? (
            <div className="h-[320px]">
              <MapViewer
                map={place.map}
                highlights={highlights}
                hideTextVisuals={true}
                onCellClick={(x, y) => {
                  if (!activeActorId) return;
                  onMoveXY(activeActorId, x, y, selectedLocId);
                }}
              />
            </div>
          ) : (
            <div className="h-[320px] rounded-xl border border-canon-border bg-black/15 flex items-center justify-center text-xs opacity-70">
              No place.map for this location
            </div>
          )}

          <div className="text-[11px] opacity-60">
            {activeActorId
              ? `Click a cell to place: ${activeActorId} (move_xy)`
              : 'Select an actor (left panel) then click a cell to place it (move_xy).'}
          </div>
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
