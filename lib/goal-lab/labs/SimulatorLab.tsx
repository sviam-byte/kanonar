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

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

type Props = {
  orchestratorRegistry: ProducerSpec[];
  onPushToGoalLab?: (goalLabSnapshot: any) => void;
};

type TabId = 'world' | 'actions' | 'events' | 'orchestrator' | 'json';

function TabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: TabId;
  active: boolean;
  onClick: (id: TabId) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        padding: '6px 10px',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.12)',
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function MonoBlock({ children, maxHeight = 420 }: { children: React.ReactNode; maxHeight?: number }) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.92, overflow: 'auto', maxHeight }}>
      {children}
    </div>
  );
}

export function SimulatorLab({ orchestratorRegistry, onPushToGoalLab }: Props) {
  const simRef = useRef<SimKitSimulator | null>(null);
  const [seed, setSeed] = useState(1);
  const [version, setVersion] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [tab, setTab] = useState<TabId>('world');
  const [actorFilter, setActorFilter] = useState<string>('(all)');

  if (!simRef.current) {
    simRef.current = new SimKitSimulator({
      scenarioId: basicScenarioId,
      seed,
      initialWorld: makeBasicWorld(),
      maxRecords: 2000,
      plugins: [makeOrchestratorPlugin(orchestratorRegistry)],
    });
  }

  const sim = simRef.current;
  const records = sim.records;
  const cur = selectedIdx >= 0 ? records[selectedIdx] : (records[records.length - 1] ?? null);

  const tickList = useMemo(() => records.map((_, i) => i), [version]);
  const allActors = useMemo(() => {
    const ids = new Set<string>();
    for (const r of records) {
      for (const o of (r?.trace?.actionsProposed || [])) ids.add(String(o.actorId));
      for (const a of (r?.trace?.actionsApplied || [])) ids.add(String(a.actorId));
    }
    return Array.from(ids).sort();
  }, [version]);

  const orchestratorTrace = cur?.plugins?.orchestrator?.trace || null;
  const orchestratorSnapshot = cur?.plugins?.orchestrator?.snapshot || null;

  const actionsProposedFiltered = useMemo(() => {
    const xs = cur?.trace?.actionsProposed || [];
    if (actorFilter === '(all)') return xs;
    return xs.filter((x: any) => String(x.actorId) === actorFilter);
  }, [cur, actorFilter]);

  const actionsAppliedFiltered = useMemo(() => {
    const xs = cur?.trace?.actionsApplied || [];
    if (actorFilter === '(all)') return xs;
    return xs.filter((x: any) => String(x.actorId) === actorFilter);
  }, [cur, actorFilter]);

  function stepOne() {
    sim.step();
    setSelectedIdx(sim.records.length - 1);
    setVersion(v => v + 1);
  }

  function runN(n: number) {
    sim.run(n);
    setSelectedIdx(sim.records.length - 1);
    setVersion(v => v + 1);
  }

  function resetSim() {
    sim.reset(seed);
    setSelectedIdx(-1);
    setVersion(v => v + 1);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900 }}>Simulator Lab</div>
          <div style={{ opacity: 0.8, fontFamily: 'monospace' }}>
            simkit | worldTick={sim.world.tickIndex} | records={records.length} | scenario={sim.cfg.scenarioId}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'monospace', opacity: 0.85 }}>seed</div>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 90 }} />
          <button onClick={resetSim}>Reset</button>
          <button onClick={stepOne}>Step</button>
          <button onClick={() => runN(10)}>Run x10</button>
          <button onClick={() => runN(100)}>Run x100</button>
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

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, padding: 12, paddingTop: 0 }}>
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Panel title="History">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: 'monospace', opacity: 0.85 }}>record</div>
              <select value={selectedIdx} onChange={(e) => setSelectedIdx(Number(e.target.value))}>
                <option value={-1}>latest</option>
                {tickList.map(i => (
                  <option key={i} value={i}>
                    #{i} (tick {records[i]?.snapshot?.tickIndex})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {orchestratorTrace ? (
                <button onClick={() => jsonDownload(`orchestrator-${orchestratorTrace.tickId}.json`, orchestratorTrace)}>
                  Export trace.json
                </button>
              ) : null}

              {onPushToGoalLab && orchestratorSnapshot ? (
                <button onClick={() => onPushToGoalLab(orchestratorSnapshot)}>
                  Push snapshot → GoalLab
                </button>
              ) : null}

              {cur ? (
                <button onClick={() => jsonDownload(`simkit-record-${cur.snapshot.tickIndex}.json`, cur)}>
                  Export record.json
                </button>
              ) : null}
            </div>
          </Panel>

          <Panel title="Filter">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ fontFamily: 'monospace', opacity: 0.85 }}>actor</div>
              <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
                <option value="(all)">(all)</option>
                {allActors.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
          </Panel>

          {cur ? (
            <Panel title="Tick summary">
              <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.9 }}>
                tickIndex={cur.snapshot.tickIndex}<br />
                actionsApplied={cur.trace.actionsApplied.length} eventsApplied={cur.trace.eventsApplied.length}<br />
                charsChanged={cur.trace.deltas.chars.length} factsChanged={Object.keys(cur.trace.deltas.facts || {}).length}<br />
                orchestratorAtomsOut={(orchestratorSnapshot?.atoms || []).length}
              </div>
            </Panel>
          ) : null}
        </div>

        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <TabButton id="world" active={tab === 'world'} onClick={setTab}>World</TabButton>
            <TabButton id="actions" active={tab === 'actions'} onClick={setTab}>Actions</TabButton>
            <TabButton id="events" active={tab === 'events'} onClick={setTab}>Events</TabButton>
            <TabButton id="orchestrator" active={tab === 'orchestrator'} onClick={setTab}>Orchestrator</TabButton>
            <TabButton id="json" active={tab === 'json'} onClick={setTab}>JSON</TabButton>
          </div>

          {!cur ? (
            <div style={{ opacity: 0.75, padding: 12 }}>No records. Press Step.</div>
          ) : (
            <div style={{ minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tab === 'world' ? (
                <>
                  <Panel title="Characters">
                    <MonoBlock maxHeight={520}>
                      {cur.snapshot.characters.map((c: any) => (
                        <div key={c.id} style={{ marginBottom: 6 }}>
                          <b>{c.id}</b> loc={c.locId}  health={clamp01(c.health).toFixed(2)} energy={clamp01(c.energy).toFixed(2)} stress={clamp01(c.stress).toFixed(2)}
                        </div>
                      ))}
                    </MonoBlock>
                  </Panel>

                  <Panel title="Locations">
                    <MonoBlock maxHeight={520}>
                      {cur.snapshot.locations.map((l: any) => (
                        <div key={l.id} style={{ marginBottom: 8 }}>
                          <b>{l.id}</b> {l.name}
                          <div style={{ opacity: 0.9 }}>
                            neighbors: {(l.neighbors || []).join(', ') || '(none)'}
                          </div>
                          <div style={{ opacity: 0.9 }}>
                            hazards: {JSON.stringify(l.hazards || {})}
                          </div>
                          <div style={{ opacity: 0.9 }}>
                            norms: {JSON.stringify(l.norms || {})}
                          </div>
                        </div>
                      ))}
                    </MonoBlock>
                  </Panel>

                  <Panel title="Facts">
                    <MonoBlock maxHeight={260}>
                      {Object.keys(cur.trace.deltas.facts || {}).length ? (
                        Object.entries(cur.trace.deltas.facts || {}).map(([k, v]: any) => (
                          <div key={k} style={{ marginBottom: 6 }}>
                            <b>{k}</b> :: {JSON.stringify(v.before)} → {JSON.stringify(v.after)}
                          </div>
                        ))
                      ) : (
                        <div>(no fact deltas)</div>
                      )}
                    </MonoBlock>
                  </Panel>
                </>
              ) : null}

              {tab === 'actions' ? (
                <>
                  <Panel title="Actions applied">
                    <MonoBlock maxHeight={280}>
                      {(actionsAppliedFiltered || []).length ? (
                        (actionsAppliedFiltered || []).map((a: any) => (
                          <div key={a.id} style={{ marginBottom: 6 }}>
                            <b>{a.id}</b> kind={a.kind} actor={a.actorId}{a.targetId ? ` target=${a.targetId}` : ''}
                          </div>
                        ))
                      ) : (
                        <div>(none)</div>
                      )}
                    </MonoBlock>
                  </Panel>

                  <Panel title="Actions proposed (top 200 by score)">
                    <MonoBlock maxHeight={520}>
                      {(actionsProposedFiltered || []).slice(0, 200).map((o: any, i: number) => (
                        <div key={`${o.kind}:${o.actorId}:${o.targetId ?? ''}:${i}`} style={{ marginBottom: 6 }}>
                          {o.blocked ? 'BLOCK' : 'OK'}  score={Number(o.score ?? 0).toFixed(3)}  kind={o.kind}  actor={o.actorId}{o.targetId ? ` target=${o.targetId}` : ''}{o.reason ? `  // ${o.reason}` : ''}
                        </div>
                      ))}
                      {(actionsProposedFiltered || []).length > 200 ? <div>… ({(actionsProposedFiltered || []).length - 200} more)</div> : null}
                    </MonoBlock>
                  </Panel>

                  <Panel title="Notes">
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{(cur.trace.notes || []).join('\n')}</pre>
                  </Panel>
                </>
              ) : null}

              {tab === 'events' ? (
                <>
                  <Panel title="Events applied">
                    <MonoBlock maxHeight={520}>
                      {(cur.trace.eventsApplied || []).length ? (
                        (cur.trace.eventsApplied || []).map((e: any) => (
                          <div key={e.id} style={{ marginBottom: 8 }}>
                            <b>{e.id}</b> type={e.type}
                            <div style={{ opacity: 0.9 }}>{JSON.stringify(e.payload || {})}</div>
                          </div>
                        ))
                      ) : (
                        <div>(none)</div>
                      )}
                    </MonoBlock>
                  </Panel>

                  <Panel title="Snapshot events">
                    <MonoBlock maxHeight={360}>
                      {(cur.snapshot.events || []).length ? (
                        (cur.snapshot.events || []).map((e: any) => (
                          <div key={e.id} style={{ marginBottom: 8 }}>
                            <b>{e.id}</b> type={e.type}
                            <div style={{ opacity: 0.9 }}>{JSON.stringify(e.payload || {})}</div>
                          </div>
                        ))
                      ) : (
                        <div>(none)</div>
                      )}
                    </MonoBlock>
                  </Panel>
                </>
              ) : null}

              {tab === 'orchestrator' ? (
                <>
                  {!orchestratorTrace ? (
                    <div style={{ opacity: 0.75 }}>No orchestrator trace (plugin not attached or no runTick output).</div>
                  ) : (
                    <>
                      <Panel title="Human log">
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{(orchestratorTrace.humanLog || []).join('\n')}</pre>
                      </Panel>

                      <Panel title="Atom changes (top 200)">
                        <MonoBlock maxHeight={420}>
                          {(orchestratorTrace.atomChanges || []).slice(0, 200).map((c: any) => {
                            const b = Number(c.before?.magnitude ?? 0);
                            const a = Number(c.after?.magnitude ?? 0);
                            const d = a - b;
                            const sign = d >= 0 ? '+' : '';
                            return (
                              <div key={`${c.op}:${c.id}`}>
                                {String(c.op).toUpperCase()} {c.id}  {b.toFixed(3)}→{a.toFixed(3)} ({sign}{d.toFixed(3)})
                              </div>
                            );
                          })}
                          {(orchestratorTrace.atomChanges || []).length > 200 ? (
                            <div>… ({orchestratorTrace.atomChanges.length - 200} more)</div>
                          ) : null}
                        </MonoBlock>
                      </Panel>

                      <Panel title="Stages">
                        <MonoBlock maxHeight={600}>
                          {(orchestratorTrace.stages || []).map((s: any) => (
                            <div key={s.id} style={{ marginBottom: 12 }}>
                              <div style={{ fontWeight: 800 }}>
                                {s.id} {s.tookMs != null ? <span style={{ opacity: 0.75 }}>({s.tookMs}ms)</span> : null}
                              </div>
                              {(s.producers || []).map((p: any) => (
                                <div key={p.name} style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <div style={{ fontWeight: 700 }}>
                                      {p.name}{p.version ? <span style={{ opacity: 0.7 }}> v{p.version}</span> : null}
                                    </div>
                                    <div style={{ opacity: 0.8 }}>{p.tookMs != null ? `${p.tookMs}ms` : ''}</div>
                                  </div>
                                  <div style={{ opacity: 0.9 }}>
                                    inputs: {(p.inputRefs || []).slice(0, 20).join(', ')}{(p.inputRefs || []).length > 20 ? '…' : ''}
                                  </div>
                                  <div style={{ opacity: 0.9 }}>
                                    out: +{(p.outputs?.atomsAdded || []).length} ~{(p.outputs?.atomsUpdated || []).length} -{(p.outputs?.atomsRemoved || []).length}
                                  </div>
                                  {(p.why || []).length ? (
                                    <div style={{ marginTop: 4, opacity: 0.95 }}>
                                      {(p.why || []).slice(0, 30).map((w: any, i: number) => (
                                        <div key={i}>
                                          because={w.because}{w.rule ? ` rule=${w.rule}` : ''}{w.math ? ` math=${w.math}` : ''}{w.weight != null ? ` w=${w.weight}` : ''}{w.note ? ` // ${w.note}` : ''}
                                        </div>
                                      ))}
                                      {(p.why || []).length > 30 ? <div>… ({(p.why || []).length - 30} more)</div> : null}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ))}
                        </MonoBlock>
                      </Panel>
                    </>
                  )}
                </>
              ) : null}

              {tab === 'json' ? (
                <>
                  <Panel title="SimKit record JSON">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <button onClick={() => jsonDownload(`simkit-record-${cur.snapshot.tickIndex}.json`, cur)}>
                        Export record.json
                      </button>
                      {orchestratorSnapshot ? (
                        <button onClick={() => jsonDownload(`goal-lab-snapshot-${cur.snapshot.tickIndex}.json`, orchestratorSnapshot)}>
                          Export GoalLab snapshot.json
                        </button>
                      ) : null}
                    </div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12, opacity: 0.92 }}>
                      {JSON.stringify(cur, null, 2)}
                    </pre>
                  </Panel>
                </>
              ) : null}

              <Panel title="Character deltas">
                <MonoBlock maxHeight={260}>
                  {cur.trace.deltas.chars.map((d: any) => (
                    <div key={d.id} style={{ marginBottom: 6 }}>
                      <b>{d.id}</b> :: {JSON.stringify(d.before)} → {JSON.stringify(d.after)}
                    </div>
                  ))}
                  {!cur.trace.deltas.chars.length ? <div>(none)</div> : null}
                </MonoBlock>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
