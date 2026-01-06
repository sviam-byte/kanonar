// lib/goal-lab/labs/SimulatorLab.tsx
// Simulator Lab panel built on top of SimKit.

import React, { useMemo, useRef, useState } from 'react';
import type { ProducerSpec } from '../../orchestrator/types';
import { SimKitSimulator } from '../../simkit/core/simulator';
import { buildExport } from '../../simkit/core/export';
import { basicScenarioId, makeBasicWorld } from '../../simkit/scenarios/basicScenario';
import { makeOrchestratorPlugin } from '../../simkit/plugins/orchestratorPlugin';

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
  orchestratorRegistry: ProducerSpec[];     // твои реальные producers
  // опционально: коллбек “пушнуть в GoalLab”
  onPushToGoalLab?: (goalLabSnapshot: any) => void;
};

export function SimulatorLab({ orchestratorRegistry, onPushToGoalLab }: Props) {
  const simRef = useRef<SimKitSimulator | null>(null);
  const [seed, setSeed] = useState(1);
  const [version, setVersion] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);

  if (!simRef.current) {
    simRef.current = new SimKitSimulator({
      scenarioId: basicScenarioId,
      seed,
      initialWorld: makeBasicWorld(),
      maxRecords: 1000,
      plugins: [
        makeOrchestratorPlugin(orchestratorRegistry),
      ],
    });
  }

  const sim = simRef.current;

  const records = sim.records;
  const cur = selectedIdx >= 0 ? records[selectedIdx] : (records[records.length - 1] ?? null);

  const tickList = useMemo(() => records.map((_, i) => i), [version]);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontWeight: 800 }}>Simulator Lab</div>
          <div style={{ opacity: 0.8, fontFamily: 'monospace' }}>
            simkit | worldTick={sim.world.tickIndex} | records={records.length} | scenario={sim.cfg.scenarioId}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontFamily: 'monospace', opacity: 0.85 }}>seed</div>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <button
            onClick={() => {
              sim.reset(seed);
              setSelectedIdx(-1);
              setVersion(v => v + 1);
            }}
          >
            Reset
          </button>
          <button
            onClick={() => {
              sim.step();
              setSelectedIdx(sim.records.length - 1);
              setVersion(v => v + 1);
            }}
          >
            Step
          </button>
          <button
            onClick={() => {
              sim.run(10);
              setSelectedIdx(sim.records.length - 1);
              setVersion(v => v + 1);
            }}
          >
            Run x10
          </button>
          <button
            onClick={() => {
              const exp = buildExport({ scenarioId: sim.cfg.scenarioId, seed: sim.world.seed, records: sim.records });
              jsonDownload('simkit-session.json', exp);
            }}
          >
            Export session.json
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ fontFamily: 'monospace', opacity: 0.85 }}>record</div>
        <select
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
        >
          <option value={-1}>latest</option>
          {tickList.map(i => (
            <option key={i} value={i}>
              #{i} (tick {records[i]?.snapshot?.tickIndex})
            </option>
          ))}
        </select>

        {cur?.plugins?.orchestrator?.trace ? (
          <button onClick={() => jsonDownload(`orchestrator-${cur.plugins.orchestrator.trace.tickId}.json`, cur.plugins.orchestrator.trace)}>
            Export trace.json
          </button>
        ) : null}

        {onPushToGoalLab && cur?.plugins?.orchestrator?.snapshot ? (
          <button onClick={() => onPushToGoalLab(cur.plugins.orchestrator.snapshot)}>
            Push snapshot → GoalLab
          </button>
        ) : null}
      </div>

      {!cur ? (
        <div style={{ opacity: 0.75 }}>No records. Press Step.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Tick</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.9 }}>
              tickIndex={cur.snapshot.tickIndex}<br />
              actionsApplied={cur.trace.actionsApplied.length} eventsApplied={cur.trace.eventsApplied.length}<br />
              charsChanged={cur.trace.deltas.chars.length} factsChanged={Object.keys(cur.trace.deltas.facts || {}).length}
            </div>
          </div>

          <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Notes</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{(cur.trace.notes || []).join('\n')}</pre>
          </div>

          <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Orchestrator human log (plugin)</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {((cur.plugins?.orchestrator?.trace?.humanLog) || ['(no orchestrator trace)']).join('\n')}
            </pre>
          </div>

          <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Character deltas</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.9 }}>
              {cur.trace.deltas.chars.map(d => (
                <div key={d.id}>
                  {d.id} :: {JSON.stringify(d.before)} → {JSON.stringify(d.after)}
                </div>
              ))}
              {!cur.trace.deltas.chars.length ? <div>(none)</div> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
