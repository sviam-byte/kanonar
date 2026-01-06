// lib/goal-lab/labs/SimulatorLab.tsx
// UI panel to drive a lightweight session simulator and inspect ticks.

import React, { useMemo, useRef, useState } from 'react';
import type { ProducerSpec } from '../../orchestrator/types';
import { defaultWorldAdapter } from '../../simulator/worldAdapter';
import { SessionSimulator } from '../../simulator/sessionSimulator';

function jsonDownload(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  registry: ProducerSpec[]; // передай сюда список реальных producers (world/tom/goals/relations)
};

export function SimulatorLab({ registry }: Props) {
  // держим симулятор в ref, чтобы не пересоздавался на каждый рендер
  const simRef = useRef<SessionSimulator | null>(null);

  const [version, setVersion] = useState(0); // force rerender
  const [selectedTick, setSelectedTick] = useState<number>(-1);

  if (!simRef.current) {
    simRef.current = new SessionSimulator({
      seed: 1,
      registry,
      world: defaultWorldAdapter,
      initialWorld: {
        tickIndex: 0,
        seed: 1,
        characters: [],
        locations: [],
        facts: {},
        scheduledEvents: [],
      },
      maxHistory: 500,
    });
  }

  const sim = simRef.current;

  const ticks = sim.history;
  const current = selectedTick >= 0 ? ticks.find(t => t.tickIndex === selectedTick) : (ticks[ticks.length - 1] ?? null);

  const tickOptions = useMemo(() => ticks.map(t => t.tickIndex), [version]);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontWeight: 800 }}>Simulator Lab</div>
          <div style={{ opacity: 0.8, fontFamily: 'monospace' }}>
            worldTick={sim.worldState.tickIndex} | history={sim.history.length}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => {
              sim.step();
              setSelectedTick(sim.history[sim.history.length - 1].tickIndex);
              setVersion(v => v + 1);
            }}
          >
            Step
          </button>
          <button
            onClick={() => {
              sim.run(10);
              setSelectedTick(sim.history[sim.history.length - 1].tickIndex);
              setVersion(v => v + 1);
            }}
          >
            Run x10
          </button>
          <button
            onClick={() => {
              sim.reset();
              setSelectedTick(-1);
              setVersion(v => v + 1);
            }}
          >
            Reset
          </button>
          <button onClick={() => jsonDownload('session-sim-export.json', sim.export())}>
            Export session.json
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ fontFamily: 'monospace', opacity: 0.85 }}>Tick view:</div>
        <select value={selectedTick} onChange={(e) => setSelectedTick(Number(e.target.value))}>
          <option value={-1}>latest</option>
          {tickOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {current?.orchestratorTrace ? (
          <button onClick={() => jsonDownload(`orchestrator-${current.orchestratorTrace.tickId}.json`, current.orchestratorTrace)}>
            Export trace.json
          </button>
        ) : null}
      </div>

      {!current ? (
        <div style={{ opacity: 0.75 }}>No ticks yet. Press Step.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Tick summary</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.9 }}>
              tickIndex={current.tickIndex}<br />
              actionsApplied={current.actionsApplied.length} eventsApplied={current.eventsApplied.length}<br />
              atomsOut={(current.snapshot?.atoms || []).length}
            </div>
          </div>

          <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Orchestrator human log</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {(current.orchestratorTrace?.humanLog || ['(no trace)']).join('\n')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
