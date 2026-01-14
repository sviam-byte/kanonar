// components/ScenarioSetup/PlacementMapEditor.tsx
import React, { useMemo, useState } from 'react';
import type { LocationMap } from '../../types';
import { LocationVectorMap } from '../locations/LocationVectorMap';

type Mode = 'place_actor' | 'add_danger' | 'add_safe' | 'select';

type Placement = {
  characterId: string;
  locationId: string;
  x: number; // CELL X
  y: number; // CELL Y
  nodeId?: string | null; // keep compat if other code expects it
};

type HazardPoint = {
  id: string;
  locationId: string;
  kind: 'danger' | 'safe';
  x: number; // CELL X
  y: number; // CELL Y
  radius: number; // in CELLS
  strength: number; // 0..1
  tags?: string[];
};

function clamp01(x: number) {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

function makeId(prefix: string) {
  return `${prefix}:${Math.random().toString(16).slice(2)}:${Date.now()}`;
}

function keyXY(x: number, y: number) {
  return `${x},${y}`;
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

  const placementsAll: Placement[] = Array.isArray(draft?.placements) ? draft.placements : [];
  const hazardAll: HazardPoint[] = Array.isArray(draft?.hazardPoints) ? draft.hazardPoints : [];

  const placements: Placement[] = useMemo(
    () => placementsAll.filter((p: any) => String(p.locationId) === locId && actorIds.includes(String(p.characterId))),
    [placementsAll, locId, actorIds]
  );

  const hazardPoints: HazardPoint[] = useMemo(
    () => hazardAll.filter((p: any) => String(p.locationId) === locId),
    [hazardAll, locId]
  );

  const pointByXY = useMemo(() => {
    const m = new Map<string, HazardPoint>();
    for (const p of hazardPoints) m.set(keyXY(p.x, p.y), p);
    return m;
  }, [hazardPoints]);

  const actorByXY = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of placements) m.set(keyXY(p.x, p.y), String(p.characterId));
    return m;
  }, [placements]);

  function upsertPlacement(actorId: string, x: number, y: number) {
    const next = [
      ...placementsAll.filter(
        (p: any) => !(String(p.locationId) === locId && String(p.characterId) === String(actorId))
      ),
    ];
    next.push({ characterId: actorId, locationId: locId, x, y, nodeId: null });
    setDraft({ ...draft, placements: next });
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

  function updateHazard(id: string, patch: Partial<HazardPoint>) {
    const next = hazardAll.map((p: any) => (p.id === id ? { ...p, ...patch } : p));
    setDraft({ ...draft, hazardPoints: next });
  }

  function removeHazard(id: string) {
    const next = hazardAll.filter((p: any) => p.id !== id);
    setDraft({ ...draft, hazardPoints: next });
    if (selectedPointId === id) setSelectedPointId(null);
  }

  function onCellClick(x: number, y: number) {
    if (mode === 'select') {
      const pt = pointByXY.get(keyXY(x, y));
      if (pt) {
        setSelectedPointId(pt.id);
        return;
      }
      const a = actorByXY.get(keyXY(x, y));
      if (a) {
        setSelectedActorId(a);
        return;
      }
      return;
    }

    if (mode === 'place_actor') {
      if (!selectedActorId) return;
      upsertPlacement(selectedActorId, x, y);
      return;
    }

    if (mode === 'add_danger') return void addHazard('danger', x, y);
    if (mode === 'add_safe') return void addHazard('safe', x, y);
  }

  const highlights = useMemo(() => {
    const hs: Array<{ x: number; y: number; color: string; size?: number }> = [];

    // actors: one cell (GoalLab-like)
    for (const p of placements) {
      const isSel = String(p.characterId) === String(selectedActorId);
      hs.push({
        x: p.x,
        y: p.y,
        color: isSel ? '#00e5ff' : 'rgba(255,255,255,0.85)',
        size: 0.85,
      });
    }

    // marks: also one cell (slightly smaller)
    for (const pt of hazardPoints) {
      const isSel = pt.id === selectedPointId;
      hs.push({
        x: pt.x,
        y: pt.y,
        color:
          pt.kind === 'danger'
            ? isSel
              ? '#ff2d2d'
              : 'rgba(255,60,60,0.85)'
            : isSel
              ? '#22ff88'
              : 'rgba(60,255,140,0.85)',
        size: 0.75,
      });
    }

    return hs;
  }, [placements, hazardPoints, selectedActorId, selectedPointId]);

  const selectedPoint =
    selectedPointId ? hazardPoints.find((p) => String(p.id) === String(selectedPointId)) ?? null : null;

  if (!locId || !map) {
    return (
      <div className="canon-card p-3">
        <div className="text-sm font-semibold mb-2">Placement</div>
        <div className="text-xs opacity-70">No place.map (LocationMap) для расстановки.</div>
      </div>
    );
  }

  const isVectorOk = Array.isArray((map as any).cells) && Number.isFinite((map as any).width) && Number.isFinite((map as any).height);

  if (!isVectorOk) {
    return (
      <div className="canon-card p-3">
        <div className="text-sm font-semibold mb-2">Placement</div>
        <div className="text-xs opacity-70">
          place.map есть, но не выглядит как LocationMap (нет cells/width/height). Импорт локации должен давать grid.
        </div>
      </div>
    );
  }

  return (
    <div className="canon-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-sm font-semibold">Карта для расстановки</div>
        <div className="text-xs opacity-70">{place?.title ?? place?.id ?? locId}</div>
        <div className="grow" />
        <div className="flex gap-2 text-xs">
          <button className="canon-link" onClick={() => setMode('place_actor')}>
            Place actor
          </button>
          <button className="canon-link" onClick={() => setMode('add_danger')}>
            Add danger
          </button>
          <button className="canon-link" onClick={() => setMode('add_safe')}>
            Add safe
          </button>
          <button className="canon-link" onClick={() => setMode('select')}>
            Select
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* left panel */}
        <div className="col-span-3 space-y-3">
          <div className="canon-card p-2">
            <div className="text-[11px] opacity-70 mb-1">Mode</div>
            <div className="text-xs font-mono">{mode}</div>
          </div>

          <div className="canon-card p-2">
            <div className="text-[11px] opacity-70 mb-1">Actor</div>
            <select
              className="canon-input w-full"
              value={selectedActorId}
              onChange={(e) => setSelectedActorId(e.target.value)}
              disabled={mode !== 'place_actor' && mode !== 'select'}
            >
              {actorIds.map((id) => (
                <option key={id} value={id}>
                  {actorTitle(String(id))}
                </option>
              ))}
            </select>
            <div className="text-[11px] opacity-60 mt-2">Клик по клетке ставит/выбирает.</div>
          </div>

          <div className="canon-card p-2">
            <div className="text-[11px] opacity-70 mb-2">Marks</div>
            <div className="max-h-40 overflow-auto custom-scrollbar space-y-1">
              {hazardPoints.length ? (
                hazardPoints.map((p) => (
                  <button
                    key={p.id}
                    className={`w-full text-left text-xs canon-card px-2 py-1 ${
                      p.id === selectedPointId ? 'border border-canon-accent' : ''
                    }`}
                    onClick={() => setSelectedPointId(p.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{p.kind}</span>
                      <span className="opacity-70">
                        ({p.x},{p.y})
                      </span>
                    </div>
                    <div className="text-[11px] opacity-70">
                      str={Math.round(100 * clamp01(p.strength))}% r={p.radius}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-xs opacity-60">No marks yet</div>
              )}
            </div>
          </div>

          <div className="canon-card p-2">
            <div className="text-[11px] font-semibold mb-2">Inspector</div>
            {selectedPoint ? (
              <div className="space-y-2">
                <div className="text-xs font-mono">{selectedPoint.id}</div>

                <div className="flex items-center gap-2">
                  <div className="text-[11px] opacity-70 w-16">kind</div>
                  <select
                    className="canon-input w-24"
                    value={selectedPoint.kind}
                    onChange={(e) =>
                      updateHazard(selectedPoint.id, { kind: e.target.value as 'danger' | 'safe' })
                    }
                  >
                    <option value="danger">danger</option>
                    <option value="safe">safe</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[11px] opacity-70 w-16">strength</div>
                  <input
                    className="canon-input w-24"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={String(selectedPoint.strength)}
                    onChange={(e) =>
                      updateHazard(selectedPoint.id, { strength: clamp01(Number(e.target.value)) })
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[11px] opacity-70 w-16">radius</div>
                  <input
                    className="canon-input w-24"
                    type="number"
                    min={1}
                    max={64}
                    step={1}
                    value={String(selectedPoint.radius)}
                    onChange={(e) =>
                      updateHazard(selectedPoint.id, {
                        radius: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                      })
                    }
                  />
                </div>

                <button className="canon-button w-full" onClick={() => removeHazard(selectedPoint.id)}>
                  Delete
                </button>
              </div>
            ) : (
              <div className="text-xs opacity-60">Select mode → клик по клетке с меткой</div>
            )}
          </div>
        </div>

        {/* map */}
        <div className="col-span-9">
          <div className="canon-border rounded-xl p-2 overflow-auto">
            <LocationVectorMap
              map={map}
              showGrid={true}
              scale={32}
              onCellClick={onCellClick}
              highlightCells={highlights}
            />
          </div>

          <div className="text-[11px] opacity-70 mt-2">
            Place actor: ставит выбранного актора в клетку. Add danger/safe: создаёт метку в клетке. Select: выбирает
            актора/метку по клику.
          </div>
        </div>
      </div>
    </div>
  );
}
