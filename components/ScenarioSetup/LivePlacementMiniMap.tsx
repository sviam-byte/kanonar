import React, { useMemo, useState } from 'react';
import { MapViewer } from '../locations/MapViewer';
import type { LocationMap } from '../../types';

type EditBrush = 'none' | 'safe' | 'danger' | 'hazard' | 'walkable' | 'wall' | 'exit' | 'clear_exit';

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
  // NEW: allow parent to persist edits
  onEditLocationMap,
}: {
  snapshot: any | null;
  worldFacts: any;
  selectedLocId: string;
  onSelectLocId: (id: string) => void;
  onMoveXY: (actorId: string, x: number, y: number, locationId: string) => void;
  activeActorId?: string | null;
  widthPx?: number;
  variant?: 'floating' | 'embedded';
  chrome?: boolean;

  /** Called when user edits the map. Parent must persist into scene draft. */
  onEditLocationMap?: (locationId: string, nextMap: LocationMap) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // NEW
  const [editMode, setEditMode] = useState(false);
  const [brush, setBrush] = useState<EditBrush>('none');
  const [exitTargetId, setExitTargetId] = useState<string>('outside');

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
  if (!place) return null;
  if (collapsed) return null;

  const placeMap = (place as any)?.map as LocationMap | undefined;
  if (!placeMap) return null;

  const onCellClick = (x: number, y: number) => {
    if (editMode) return; // в editMode клики уходит в editor
    if (!activeActorId) return;
    onMoveXY(activeActorId, x, y, selectedLocId);
  };

  const onMapChange = (next: LocationMap) => {
    onEditLocationMap?.(selectedLocId, next);
  };

  // NOTE: чтобы не было гигантской заливки — sizeMode="map"
  return (
    <div
      className={
        variant === 'floating'
          ? 'fixed left-3 top-16 z-40'
          : 'relative'
      }
      style={{ width: widthPx }}
    >
      {chrome && (
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-canon-text-light">Location</div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-canon-text-light flex items-center gap-2">
              <input
                type="checkbox"
                checked={editMode}
                onChange={(e) => setEditMode(e.target.checked)}
              />
              Edit cells
            </label>
            <button
              onClick={() => setCollapsed(true)}
              className="text-[11px] px-2 py-1 rounded border border-canon-border text-canon-text-light hover:border-canon-text"
            >
              Hide
            </button>
          </div>
        </div>
      )}

      {/* Controls for editor */}
      {editMode && (
        <div className="mb-2 p-2 rounded border border-canon-border bg-canon-bg/60">
          <div className="flex flex-wrap gap-1 mb-2">
            {(['safe', 'walkable', 'wall', 'danger', 'hazard', 'exit', 'clear_exit'] as EditBrush[]).map((b) => (
              <button
                key={b}
                onClick={() => setBrush(b)}
                className={
                  'px-2 py-1 rounded border text-[10px] uppercase ' +
                  (brush === b ? 'border-canon-accent text-canon-accent bg-canon-accent/10' : 'border-canon-border text-canon-text-light hover:border-canon-text')
                }
              >
                {b}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[10px] text-canon-text-light">Exit target:</div>
            <select
              value={exitTargetId}
              onChange={(e) => setExitTargetId(e.target.value)}
              className="text-[11px] bg-canon-bg border border-canon-border rounded px-2 py-1 text-canon-text-light"
            >
              <option value="outside">outside</option>
              {locs.map((l: any) => (
                <option key={String(l.id)} value={String(l.id)}>
                  {String(l.id)}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-canon-text-light opacity-70">
              (use brush: exit / clear_exit)
            </div>
          </div>

          {/* передаём brush/target вниз через map.meta (см PATCH 3) */}
        </div>
      )}

      <MapViewer
        map={{
          ...(placeMap as any),
          // хак-прокидка editor-params в map для LocationMapEditor (см PATCH 3)
          __editor: { brush, exitTargetId },
        } as any}
        onCellClick={onCellClick}
        highlights={highlights}
        isEditor={editMode}
        onMapChange={onMapChange}
        sizeMode="map"
        cellPx={24}
        hideTextVisuals={true}
      />
    </div>
  );
}
