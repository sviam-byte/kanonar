// components/SimulatorLab.tsx
// Live single-tick simulator controller + narrative log.

import React, { useEffect, useMemo, useState } from 'react';
import type { SimWorld } from '../lib/simkit/core/types';
import { runOneTick } from '../lib/simkit/core/runOneTick';
import { SimMapView } from './SimMapView';
import { renderTickRU } from './simlog/renderTickRU';

type TickRecord = ReturnType<typeof runOneTick>['record'];

export function SimulatorLab({ initialWorld }: { initialWorld: SimWorld }) {
  const [world, setWorld] = useState<SimWorld>(initialWorld);
  const [records, setRecords] = useState<TickRecord[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(650);

  const locationIds = useMemo(() => Object.keys(world.locations || {}).sort(), [world]);
  const characterIds = useMemo(() => Object.keys(world.characters || {}).sort(), [world]);

  const [activeLocationId, setActiveLocationId] = useState<string>(() => locationIds[0] ?? '');
  const [focusCharId, setFocusCharId] = useState<string>(() => characterIds[0] ?? '');

  // Keep selections valid if world changes
  useEffect(() => {
    if (activeLocationId && world.locations?.[activeLocationId]) return;
    setActiveLocationId(locationIds[0] ?? '');
  }, [world, locationIds, activeLocationId]);

  useEffect(() => {
    if (focusCharId && world.characters?.[focusCharId]) return;
    setFocusCharId(characterIds[0] ?? '');
  }, [world, characterIds, focusCharId]);

  const visibleLocationId = useMemo(() => {
    const c: any = focusCharId ? (world.characters as any)?.[focusCharId] : null;
    return (c?.locId && world.locations?.[c.locId]) ? c.locId : activeLocationId;
  }, [world, focusCharId, activeLocationId]);

  function stepOnce() {
    setWorld((prev) => {
      const r = runOneTick(structuredClone(prev), { temperature: (prev.facts as any)?.temperature ?? 0.8 });
      setRecords((xs) => xs.concat(r.record));
      return r.world;
    });
  }

  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => stepOnce(), Math.max(120, speedMs));
    return () => clearInterval(t);
  }, [isPlaying, speedMs]);

  const narrativeText = useMemo(() => {
    const last = records.slice(-120);
    return last.map((rec) => `Тик ${rec.tickIndex}\n${renderTickRU(world, rec)}`).join('\n\n');
  }, [records, world]);

  return (
    <div className="h-[calc(100vh-16px)] grid grid-cols-[420px_1fr_520px] gap-3 p-2">
      {/* LEFT: Map + selectors + controls */}
      <div className="min-w-0 flex flex-col gap-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={stepOnce}>
              Step
            </button>
            <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={() => setIsPlaying((v) => !v)}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <label className="text-xs opacity-80 ml-2">
              ms
              <input
                className="ml-2 w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1"
                type="number"
                value={speedMs}
                min={120}
                step={50}
                onChange={(e) => setSpeedMs(Number(e.target.value))}
              />
            </label>
            <div className="ml-auto text-xs opacity-80">tick: {world.tickIndex ?? 0}</div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <label className="text-xs opacity-80">
              Локация
              <select
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
                value={activeLocationId}
                onChange={(e) => setActiveLocationId(e.target.value)}
              >
                {locationIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs opacity-80">
              Фокус-персонаж (камера/контекст)
              <select
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
                value={focusCharId}
                onChange={(e) => setFocusCharId(e.target.value)}
              >
                {characterIds.map((id) => {
                  const c: any = (world.characters as any)?.[id];
                  const name = c?.name ? `${c.name} (${id})` : id;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <SimMapView world={world} locationId={visibleLocationId} height={520} focusCharId={focusCharId} />
          <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs opacity-80 mb-2">Персонажи в локации: {visibleLocationId || '(none)'}</div>
            <div className="flex flex-wrap gap-2">
              {Object.values(world.characters || {})
                .filter((c: any) => c.locId === visibleLocationId)
                .map((c: any) => (
                  <button
                    key={c.id}
                    className={`px-2 py-1 rounded-lg text-xs border ${
                      c.id === focusCharId ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                    onClick={() => setFocusCharId(c.id)}
                  >
                    {String(c.name ?? c.id)}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE: Narrative log (live) */}
      <div className="min-w-0 flex flex-col">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3 flex items-center">
          <div className="text-sm opacity-90">Нарративный лог</div>
          <div className="ml-auto text-xs opacity-70">
            показано тиков: {Math.min(records.length, 120)} / всего: {records.length}
          </div>
        </div>

        <div className="mt-2 flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/20 p-3 overflow-auto">
          <pre className="text-xs whitespace-pre-wrap leading-relaxed">
            {narrativeText || 'Пока пусто. Нажми Step или Play.'}
          </pre>
        </div>
      </div>

      {/* RIGHT: Panels */}
      <div className="min-w-0 flex flex-col gap-2">
        <RightTabsPanel world={world} focusCharId={focusCharId} activeLocationId={activeLocationId} />
      </div>
    </div>
  );
}

function RightTabsPanel(props: { world: SimWorld; focusCharId: string; activeLocationId: string }) {
  const focusChar: any = (props.world.characters as any)?.[props.focusCharId] ?? null;
  const activeLoc: any = (props.world.locations as any)?.[props.activeLocationId] ?? null;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs opacity-80 mb-2">Контекст</div>
      <div className="text-xs whitespace-pre-wrap opacity-80">
        focusCharId: {props.focusCharId}
        {'\n'}activeLocationId: {props.activeLocationId}
      </div>
      <div className="mt-3 text-xs opacity-80">Персонаж</div>
      <pre className="text-xs whitespace-pre-wrap opacity-80">
        {focusChar ? JSON.stringify({
          id: focusChar.id,
          name: focusChar.name,
          locId: focusChar.locId,
          stress: focusChar.stress,
          health: focusChar.health,
          energy: focusChar.energy,
        }, null, 2) : '(none)'}
      </pre>
      <div className="mt-3 text-xs opacity-80">Локация</div>
      <pre className="text-xs whitespace-pre-wrap opacity-80">
        {activeLoc ? JSON.stringify({
          id: activeLoc.id,
          name: activeLoc.name,
          neighbors: activeLoc.neighbors,
        }, null, 2) : '(none)'}
      </pre>
    </div>
  );
}
