import React, { useMemo } from 'react';
import type { WorldState } from '../../types';
import { asArray } from '../../lib/utils/asArray';

type CharacterLike = {
  entityId: string;
  name?: string | null;
  locationId?: string | null;
};

type EventLike = {
  id: string;
  t?: number;
  domain?: string;
  tags?: string[];
  actorId?: string | null;
  targetId?: string | null;
  actionId?: string | null;
  locationId?: string | null;
};

function getCharLabel(c: CharacterLike) {
  return c.name || c.entityId;
}

function badge(text: string) {
  return (
    <span className="px-2 py-0.5 rounded border border-white/10 bg-black/10 text-[10px] font-mono opacity-80">
      {text}
    </span>
  );
}

export const SetupPanel: React.FC<{
  worldState: WorldState | null;
  allCharacters: CharacterLike[];
  actorLabels?: Record<string, string>;

  perspectiveId: string | null;
  setPerspectiveId: (id: string) => void;

  sceneParticipants: Set<string>;
  setSceneParticipants: (s: Set<string>) => void;

  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;

  events: EventLike[];
  selectedEventIds: Set<string>;
  setSelectedEventIds: (s: Set<string>) => void;

  steps: number;
  setSteps: (n: number) => void;
  dt: number;
  setDt: (n: number) => void;
  onRun: () => void;
  onReset: () => void;

  onImportScene?: () => void;
  onDownloadScene?: () => void;
}> = (p) => {
  const locations = useMemo(() => {
    const locs = asArray<any>((p.worldState as any)?.locations || (p.worldState as any)?.locationMap || []);
    const ids: string[] = [];
    if (Array.isArray(locs)) {
      for (const x of locs) {
        const id = String((x as any)?.entityId || (x as any)?.id || '');
        if (id) ids.push(id);
      }
    } else if (locs && typeof locs === 'object') {
      for (const k of Object.keys(locs)) ids.push(String(k));
    }
    return Array.from(new Set(ids)).sort();
  }, [p.worldState]);

  const effectivePerspectiveId = p.perspectiveId || p.allCharacters[0]?.entityId || '';

  const participantsList = useMemo(() => {
    const ids = Array.from(p.sceneParticipants || []).map(String);
    // self всегда участник
    if (effectivePerspectiveId && !ids.includes(effectivePerspectiveId)) ids.unshift(effectivePerspectiveId);
    return Array.from(new Set(ids));
  }, [p.sceneParticipants, effectivePerspectiveId]);

  const filteredEvents = useMemo(() => {
    const all = asArray<EventLike>(p.events);
    return all
      .slice()
      .sort((a, b) => Number((a as any)?.t ?? 0) - Number((b as any)?.t ?? 0))
      .slice(-30);
  }, [p.events]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-3 bg-canon-bg text-canon-text">
      <div className="rounded-lg border border-canon-border bg-canon-bg-light/20 p-3">
        <div className="text-xs font-semibold opacity-80 mb-2">Setup</div>

        <div className="space-y-3">
          {/* Perspective */}
          <div>
            <div className="text-[11px] opacity-70 mb-1">Perspective (who is “self”)</div>
            <select
              className="w-full text-sm rounded border border-white/10 bg-black/10 px-2 py-2"
              value={effectivePerspectiveId}
              onChange={(e) => p.setPerspectiveId(e.target.value)}
            >
              {p.allCharacters.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  {p.actorLabels?.[c.entityId] || getCharLabel(c)}
                </option>
              ))}
            </select>
          </div>

          {/* Participants */}
          <div>
            <div className="text-[11px] opacity-70 mb-1">Participants (who exists in this scene)</div>
            <div className="flex flex-wrap gap-2">
              {p.allCharacters.slice(0, 12).map((c) => {
                const id = c.entityId;
                const isSelf = id === effectivePerspectiveId;
                const on = isSelf || p.sceneParticipants.has(id);
                return (
                  <button
                    key={id}
                    className={`px-2 py-1 rounded border text-xs ${
                      on ? 'border-white/20 bg-white/10' : 'border-white/10 bg-black/10 opacity-70 hover:opacity-100 hover:bg-white/10'
                    }`}
                    onClick={() => {
                      if (isSelf) return;
                      const next = new Set(p.sceneParticipants);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      p.setSceneParticipants(next);
                    }}
                    title={isSelf ? 'Self is always included' : 'Toggle participant'}
                  >
                    {p.actorLabels?.[id] || getCharLabel(c)}
                    {isSelf ? <span className="ml-2 opacity-70">(self)</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] opacity-60">
              Participants сейчас: {participantsList.length ? participantsList.map(x => p.actorLabels?.[x] || x).join(', ') : '—'}
            </div>
          </div>

          {/* Location */}
          <div>
            <div className="text-[11px] opacity-70 mb-1">Location focus</div>
            <select
              className="w-full text-sm rounded border border-white/10 bg-black/10 px-2 py-2"
              value={p.selectedLocationId || ''}
              onChange={(e) => p.setSelectedLocationId(e.target.value || null)}
            >
              <option value="">(auto)</option>
              {locations.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          {/* Simulation */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] opacity-70 mb-1">Steps</div>
              <input
                className="w-full text-sm rounded border border-white/10 bg-black/10 px-2 py-2"
                type="number"
                min={1}
                max={200}
                value={p.steps}
                onChange={(e) => p.setSteps(Number(e.target.value || 1))}
              />
            </div>
            <div>
              <div className="text-[11px] opacity-70 mb-1">dt</div>
              <input
                className="w-full text-sm rounded border border-white/10 bg-black/10 px-2 py-2"
                type="number"
                step={0.1}
                min={0.1}
                max={10}
                value={p.dt}
                onChange={(e) => p.setDt(Number(e.target.value || 1))}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 px-3 py-2 rounded border border-white/10 bg-white/10 hover:bg-white/15 text-sm font-semibold"
              onClick={p.onRun}
            >
              Run
            </button>
            <button
              className="px-3 py-2 rounded border border-white/10 bg-black/10 hover:bg-white/10 text-sm"
              onClick={p.onReset}
            >
              Reset
            </button>
          </div>

          {/* Scene IO */}
          <div className="flex gap-2">
            <button
              className="flex-1 px-3 py-2 rounded border border-white/10 bg-black/10 hover:bg-white/10 text-xs"
              onClick={p.onImportScene}
            >
              Import scene
            </button>
            <button
              className="flex-1 px-3 py-2 rounded border border-white/10 bg-black/10 hover:bg-white/10 text-xs"
              onClick={p.onDownloadScene}
            >
              Download scene
            </button>
          </div>
        </div>
      </div>

      {/* Events quick view */}
      <div className="rounded-lg border border-canon-border bg-canon-bg-light/20 p-3 min-h-0 flex flex-col">
        <div className="text-xs font-semibold opacity-80 mb-2">Events (last 30)</div>
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar space-y-2">
          {filteredEvents.length === 0 ? (
            <div className="text-xs italic opacity-60">No events.</div>
          ) : (
            filteredEvents.map((ev) => {
              const id = String(ev.id);
              const on = p.selectedEventIds.has(id);
              return (
                <button
                  key={id}
                  className={`w-full text-left rounded border px-2 py-2 ${
                    on ? 'border-white/20 bg-white/10' : 'border-white/10 bg-black/10 hover:bg-white/10'
                  }`}
                  onClick={() => {
                    const next = new Set(p.selectedEventIds);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    p.setSelectedEventIds(next);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold">
                      {ev.domain ? `${ev.domain}` : 'event'} {ev.actionId ? `• ${ev.actionId}` : ''}
                    </div>
                    <div className="text-[10px] font-mono opacity-70">{String(ev.t ?? '')}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ev.actorId ? badge(`actor:${ev.actorId}`) : null}
                    {ev.targetId ? badge(`target:${ev.targetId}`) : null}
                    {ev.locationId ? badge(`loc:${ev.locationId}`) : null}
                    {Array.isArray(ev.tags) ? ev.tags.slice(0, 4).map((t) => badge(String(t))) : null}
                  </div>
                  <div className="mt-1 text-[10px] font-mono opacity-50">{id}</div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
