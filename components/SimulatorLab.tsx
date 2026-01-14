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

  const activeLocationId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of Object.values(world.characters || {}) as any[]) {
      counts[c.locId] = (counts[c.locId] ?? 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return best ?? Object.keys(world.locations || {})[0];
  }, [world]);

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

  return (
    <div className="grid grid-cols-[460px_1fr] gap-3">
      {/* MAP pinned top-left */}
      <div className="sticky top-3 self-start space-y-2">
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={stepOnce}>
            Step (1 tick)
          </button>
          <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={() => setIsPlaying((v) => !v)}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <label className="text-xs opacity-80 ml-2">
            speed ms
            <input
              className="ml-2 w-28 align-middle"
              type="number"
              value={speedMs}
              min={120}
              step={50}
              onChange={(e) => setSpeedMs(Number(e.target.value))}
            />
          </label>
          <div className="text-xs opacity-80 ml-auto">
            tick: {world.tickIndex ?? 0}
          </div>
        </div>

        <SimMapView world={world} locationId={activeLocationId} height={420} />
      </div>

      {/* LOG */}
      <div className="min-w-0">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-sm opacity-90 mb-2">Нарративный лог</div>
          <div className="space-y-2">
            {records.slice(-40).map((rec) => (
              <div key={`tick:${rec.tickIndex}`} className="rounded-xl border border-white/10 bg-white/5 p-2">
                <div className="text-xs opacity-70 mb-1">Тик {rec.tickIndex}</div>
                <pre className="text-xs whitespace-pre-wrap leading-relaxed">
                  {renderTickRU(world, rec)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
