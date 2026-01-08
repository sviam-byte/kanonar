// lib/goal-lab/labs/SimulatorLab.tsx
// Friendly Simulator Lab UI for SimKit (session runner + debug) + GoalLab Pipeline view.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProducerSpec } from '../../orchestrator/types';
import { SimKitSimulator } from '../../simkit/core/simulator';
import { buildExport } from '../../simkit/core/export';
import { buildSnapshot } from '../../simkit/core/world';
import { basicScenarioId, makeBasicWorld } from '../../simkit/scenarios/basicScenario';
import { makeOrchestratorPlugin } from '../../simkit/plugins/orchestratorPlugin';
import { makeGoalLabPipelinePlugin } from '../../simkit/plugins/goalLabPipelinePlugin';
import { makeSimWorldFromSelection } from '../../simkit/adapters/fromKanonarEntities';
import { SimMapView } from '../../../components/SimMapView';
import { Badge, Button, Card, Input, Select, TabButton } from '../../../components/ui/primitives';
import { EntityType } from '../../../enums';
import { getEntitiesByType, getAllCharactersWithRuntime } from '../../../data';
import type { LocationEntity, CharacterEntity } from '../../../types';

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
  orchestratorRegistry: ProducerSpec[];
  onPushToGoalLab?: (goalLabSnapshot: any) => void;
};

type TabId = 'setup' | 'summary' | 'world' | 'actions' | 'events' | 'pipeline' | 'orchestrator' | 'map' | 'json';

type SetupDraft = {
  selectedLocIds: string[];
  selectedCharIds: string[];
  placements: Record<string, string>;
};

function normalizePlacements(args: {
  draft: SetupDraft;
  nextLocIds?: string[];
  nextCharIds?: string[];
}) {
  // Keep placements in sync with the current selection.
  const selectedLocIds = args.nextLocIds ?? args.draft.selectedLocIds;
  const selectedCharIds = args.nextCharIds ?? args.draft.selectedCharIds;
  const locSet = new Set(selectedLocIds);
  const nextPlacements: Record<string, string> = { ...args.draft.placements };

  for (const id of Object.keys(nextPlacements)) {
    if (!selectedCharIds.includes(id)) delete nextPlacements[id];
  }

  const fallbackLocId = selectedLocIds[0];
  if (fallbackLocId) {
    for (const id of selectedCharIds) {
      const locId = nextPlacements[id];
      if (!locSet.has(locId)) nextPlacements[id] = fallbackLocId;
    }
  }

  return {
    selectedLocIds,
    selectedCharIds,
    placements: nextPlacements,
  };
}

function validateDraft(d: SetupDraft) {
  const problems: string[] = [];
  if (!d.selectedLocIds.length) problems.push('Нужна минимум 1 выбранная локация.');
  if (!d.selectedCharIds.length) problems.push('Нужен минимум 1 выбранный персонаж.');

  const locSet = new Set(d.selectedLocIds);
  for (const [chId, locId] of Object.entries(d.placements)) {
    if (!d.selectedCharIds.includes(chId)) continue;
    if (!locSet.has(locId)) problems.push(`Персонаж ${chId}: стартовая locId=${locId} не выбрана.`);
  }

  return problems;
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function SimulatorLab({ orchestratorRegistry, onPushToGoalLab }: Props) {
  const simRef = useRef<SimKitSimulator | null>(null);

  // Catalog: entities available for selection in the simulator setup.
  const catalogLocations = useMemo(
    () =>
      (getEntitiesByType(EntityType.Location) as LocationEntity[]).filter(
        (l) => (l.versionTags || []).length === 0 || (l.versionTags || []).includes('current' as any)
      ),
    []
  );
  const catalogCharacters = useMemo(() => getAllCharactersWithRuntime(), []);

  const [seedDraft, setSeedDraft] = useState(5);
  const [tab, setTab] = useState<TabId>('summary');
  const [selected, setSelected] = useState<number>(-1); // record index, -1 = latest
  const [version, setVersion] = useState(0);
  const [runN, setRunN] = useState(10);
  const [temperatureDraft, setTemperatureDraft] = useState(0.2);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>({
    selectedLocIds: [],
    selectedCharIds: [],
    placements: {},
  });

  if (!simRef.current) {
    simRef.current = new SimKitSimulator({
      scenarioId: basicScenarioId,
      seed: seedDraft,
      initialWorld: makeBasicWorld(),
      maxRecords: 5000,
      plugins: [makeGoalLabPipelinePlugin(), makeOrchestratorPlugin(orchestratorRegistry)],
    });
  }

  const sim = simRef.current;
  sim.world.facts = sim.world.facts || {};
  if (sim.world.facts['sim:T'] == null) {
    sim.world.facts['sim:T'] = temperatureDraft;
  }
  const records = sim.records;

  const setupProblems = useMemo(() => validateDraft(setupDraft), [setupDraft]);
  const selectedLocations = useMemo(
    () => catalogLocations.filter((l) => setupDraft.selectedLocIds.includes(l.entityId)),
    [catalogLocations, setupDraft.selectedLocIds]
  );
  const selectedCharacters = useMemo(
    () => catalogCharacters.filter((c) => setupDraft.selectedCharIds.includes(c.entityId)),
    [catalogCharacters, setupDraft.selectedCharIds]
  );

  // If no ticks exist, default to the setup view.
  useEffect(() => {
    if ((simRef.current?.records?.length || 0) === 0) setTab('setup');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const curIdx = selected >= 0 ? selected : records.length - 1;
  const cur = curIdx >= 0 ? records[curIdx] : null;

  const tickItems = useMemo(() => {
    const xs = records.map((r, i) => ({
      i,
      tick: r?.snapshot?.tickIndex ?? i,
      actions: r?.trace?.actionsApplied?.length ?? 0,
      events: r?.trace?.eventsApplied?.length ?? 0,
      atoms: (r?.plugins?.orchestrator?.snapshot?.atoms || []).length,
      pipelineStages: (r?.plugins?.goalLabPipeline?.pipeline?.stages || []).length,
    }));
    xs.reverse(); // newest first
    return xs;
  }, [version]);

  const tickActionSummary = useMemo(() => {
    if (!cur?.trace?.actionsApplied?.length) return '';
    const xs = cur.trace.actionsApplied.map((a: any) => {
      const k = String(a?.kind ?? '');
      const actor = String(a?.actorId ?? '');
      const t = a?.targetId ? `→${String(a.targetId)}` : '';
      return `${actor}:${k}${t}`;
    });
    return xs.slice(0, 6).join(' | ') + (xs.length > 6 ? ` …(+${xs.length - 6})` : '');
  }, [curIdx, version]);

  const orchestratorTrace = cur?.plugins?.orchestrator?.trace || null;
  const orchestratorSnapshot = cur?.plugins?.orchestrator?.snapshot || null;
  const orchestratorDecision = cur?.plugins?.orchestratorDecision || null;

  const pipelineOut = cur?.plugins?.goalLabPipeline || null;
  const pipeline = pipelineOut?.pipeline || null;
  const pipelineStages = pipeline?.stages || [];

  function hardRefreshAfterRun() {
    setSelected(-1);
    setVersion((v) => v + 1);
  }

  function doReset() {
    sim.reset(seedDraft);
    sim.world.facts = sim.world.facts || {};
    sim.world.facts['sim:T'] = temperatureDraft;
    setTab('summary');
    setSelected(-1);
    setVersion((v) => v + 1);
  }

  function doStep() {
    sim.step();
    hardRefreshAfterRun();
  }

  function doRun(n: number) {
    sim.run(n);
    hardRefreshAfterRun();
  }

  function exportSession() {
    const exp = buildExport({ scenarioId: sim.cfg.scenarioId, seed: sim.world.seed, records: sim.records });
    jsonDownload('simkit-session.json', exp);
  }

  function doExportTrace() {
    if (!orchestratorTrace) return;
    jsonDownload(`orchestrator-${orchestratorTrace.tickId}.json`, orchestratorTrace);
  }

  function doExportRecord() {
    if (!cur) return;
    jsonDownload(`simkit-record-${cur.snapshot.tickIndex}.json`, cur);
  }

  function doExportPipeline() {
    if (!cur) return;
    const tick = cur.snapshot.tickIndex;
    const data = pipelineOut?.pipeline ?? pipelineOut;
    if (!data) return;
    jsonDownload(`goal-lab-pipeline-${tick}.json`, data);
  }

  function applySceneFromDraft() {
    const world = makeSimWorldFromSelection({
      seed: Number(seedDraft) || 1,
      locations: selectedLocations,
      characters: selectedCharacters,
      placements: setupDraft.placements,
    });
    sim.setInitialWorld(world, { seed: seedDraft, scenarioId: basicScenarioId });
    setSelected(-1);
    setVersion((v) => v + 1);
    setTab('summary');
  }

  function pushManualMove(actorId: string, targetLocId: string) {
    if (!actorId || !targetLocId) return;
    // Manual move goes straight to forcedActions to bypass orchestrator selection.
    sim.forcedActions.push({
      id: `ui:move:${sim.world.tickIndex}:${actorId}:${targetLocId}`,
      kind: 'move',
      actorId,
      targetId: targetLocId,
    });
    setVersion((v) => v + 1);
  }

  // Temperature for action sampling in the orchestrator policy (T -> 0 = greedy).
  function updateTemperature(value: number) {
    const safeValue = Number.isFinite(value) ? value : 0;
    setTemperatureDraft(safeValue);
    sim.world.facts['sim:T'] = safeValue;
  }

  const canSimulate = setupProblems.length === 0;
  const draftPreviewSnapshot = useMemo(() => {
    if (!selectedLocations.length) return sim.getPreviewSnapshot();
    const world = makeSimWorldFromSelection({
      seed: Number(seedDraft) || 1,
      locations: selectedLocations,
      characters: selectedCharacters,
      placements: setupDraft.placements,
    });
    return buildSnapshot(world);
  }, [selectedLocations, selectedCharacters, setupDraft.placements, seedDraft, sim]);
  const scenarioId = sim.cfg.scenarioId;

  return (
    <div className="h-full w-full p-4">
      <div className="sticky top-0 z-20 mb-4">
        <div className="rounded-canon border border-canon-border bg-canon-panel/70 backdrop-blur-md shadow-canon-1 px-5 py-3 flex items-center gap-3">
          <div className="text-lg font-semibold tracking-tight">Simulator Lab</div>
          <div className="text-xs text-canon-muted font-mono">
            simkit | worldTick={sim.world.tickIndex} | records={sim.records.length} | scenario={scenarioId}
          </div>
          <div className="grow" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-canon-muted font-mono">seed</span>
            <Input className="w-20" value={String(seedDraft)} onChange={(e) => setSeedDraft(Number(e.target.value))} />
            <span className="text-xs text-canon-muted font-mono">T</span>
            <Input
              className="w-20"
              value={String(sim.world.facts?.['sim:T'] ?? temperatureDraft)}
              onChange={(e) => {
                const v = Number(e.target.value);
                updateTemperature(v);
                setVersion((x) => x + 1);
              }}
            />
            <Button kind="primary" onClick={applySceneFromDraft} disabled={setupProblems.length > 0}>
              Apply + Reset
            </Button>
            <Button onClick={exportSession} disabled={records.length === 0}>
              Export session
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 min-h-0">
        {/* Left */}
        <div className="col-span-3 min-h-0 flex flex-col gap-4">
          <Card title="Controls">
            <div className="text-sm text-canon-muted mb-3">
              Симулятор = мир → действия → события → снапшот. Нажми “Сделать 1 тик”, чтобы появились записи и отладка.
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button kind="primary" onClick={doStep} disabled={!canSimulate}>
                Сделать 1 тик
              </Button>
              <Button onClick={() => doRun(10)} disabled={!canSimulate}>
                Run ×10
              </Button>
              <Button onClick={() => doRun(100)} disabled={!canSimulate}>
                Run ×100
              </Button>
              <Button onClick={doReset}>Reset</Button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-canon-muted font-mono">run</span>
              <Input className="w-24" value={String(runN)} onChange={(e) => setRunN(Number(e.target.value))} />
              <Button onClick={() => doRun(runN)} disabled={!canSimulate}>
                Run N
              </Button>
            </div>
          </Card>

          <Card title="History" bodyClassName="p-0">
            {records.length === 0 ? (
              <div className="text-sm text-canon-muted p-5">
                Пока пусто. Сделай 1 тик — появится список тиков, и можно будет смотреть мир/действия/события/пайплайн/оркестратор.
              </div>
            ) : (
              <div className="max-h-[360px] overflow-auto p-3 flex flex-col gap-2">
                <div className="flex gap-2 flex-wrap mb-2">
                  <Button onClick={() => setSelected(-1)}>Latest</Button>
                  <Button onClick={() => setSelected(Math.max(0, records.length - 1))}>Oldest</Button>
                  <Button onClick={doExportRecord} disabled={!cur}>
                    Export record.json
                  </Button>
                  <Button onClick={doExportTrace} disabled={!orchestratorTrace}>
                    Export trace.json
                  </Button>
                  <Button onClick={doExportPipeline} disabled={!pipelineOut}>
                    Export pipeline.json
                  </Button>
                  {onPushToGoalLab && orchestratorSnapshot ? (
                    <Button onClick={() => onPushToGoalLab(orchestratorSnapshot)}>Push → GoalLab</Button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  {tickItems.map((it) => (
                    <button
                      key={it.i}
                      onClick={() => setSelected(it.i)}
                      className={cx(
                        'text-left rounded-xl border border-canon-border p-3 bg-canon-card/80 hover:bg-white/5 transition',
                        it.i === curIdx && 'bg-white/10'
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-extrabold">tick {it.tick}</div>
                        <div className="font-mono text-xs text-canon-muted">#{it.i}</div>
                      </div>
                      <div className="font-mono text-xs text-canon-muted mt-1">
                        actions={it.actions} events={it.events} atoms={it.atoms} pipelineStages={it.pipelineStages}
                      </div>
                      {it.i === curIdx && tickActionSummary ? (
                        <div className="mt-2 text-xs opacity-80">{tickActionSummary}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right */}
        <div className="col-span-9 min-h-0 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <TabButton active={tab === 'setup'} onClick={() => setTab('setup')}>
              Setup
            </TabButton>
            <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>
              Сводка
            </TabButton>
            <TabButton active={tab === 'world'} onClick={() => setTab('world')}>
              Мир
            </TabButton>
            <TabButton active={tab === 'actions'} onClick={() => setTab('actions')}>
              Действия
            </TabButton>
            <TabButton active={tab === 'events'} onClick={() => setTab('events')}>
              События
            </TabButton>
            <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')}>
              Pipeline (S0–S8)
            </TabButton>
            <TabButton active={tab === 'orchestrator'} onClick={() => setTab('orchestrator')}>
              Оркестратор
            </TabButton>
            <TabButton active={tab === 'map'} onClick={() => setTab('map')}>
              Map
            </TabButton>
            <TabButton active={tab === 'json'} onClick={() => setTab('json')}>
              JSON
            </TabButton>

            <div className="grow" />

            {setupProblems.length ? (
              <Badge tone="bad">issues: {setupProblems.length}</Badge>
            ) : (
              <Badge tone="good">scene ok</Badge>
            )}
          </div>

          {records.length === 0 && tab !== 'setup' ? (
            <div className="flex-1 min-h-0 rounded-2xl border border-canon-border bg-canon-card p-8 flex flex-col items-start justify-center gap-4">
              <div className="text-2xl font-extrabold">Здесь будет жизнь</div>
              <div className="opacity-80 max-w-2xl">
                Сейчас записей нет, поэтому “смотреть” нечего. Симулятор создаёт записи только после тиков. Нажми кнопку ниже —
                появится tick 0 и вся отладка.
              </div>
              <Button kind="primary" onClick={doStep}>
                Сделать 1 тик
              </Button>
            </div>
          ) : !cur && tab !== 'setup' ? (
            <div className="opacity-70">Нет выбранной записи.</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto pr-1 flex flex-col gap-4">
              {/* SETUP */}
              {tab === 'setup' ? (
                <div className="flex flex-col gap-4">
                  <Card title="Scene Setup">
                    <div className="text-sm opacity-80 mb-2">
                      Собери сцену: выбери локации, персонажей и задай стартовые позиции.
                    </div>

                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-4">
                        <div className="font-semibold mb-2">Локации (multi-select)</div>
                        <select
                          multiple
                          value={setupDraft.selectedLocIds}
                          onChange={(e) => {
                            const nextIds = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
                            setSetupDraft((d) => normalizePlacements({ draft: d, nextLocIds: nextIds }));
                          }}
                          className="w-full min-h-[220px] rounded-xl border border-canon-border bg-canon-card px-3 py-2 text-sm"
                        >
                          {catalogLocations.map((l) => (
                            <option key={l.entityId} value={l.entityId}>
                              {l.title || l.entityId} ({l.entityId})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-4">
                        <div className="font-semibold mb-2">Персонажи (multi-select)</div>
                        <select
                          multiple
                          value={setupDraft.selectedCharIds}
                          onChange={(e) => {
                            const nextIds = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
                            setSetupDraft((d) => normalizePlacements({ draft: d, nextCharIds: nextIds }));
                          }}
                          className="w-full min-h-[220px] rounded-xl border border-canon-border bg-canon-card px-3 py-2 text-sm"
                        >
                          {catalogCharacters.map((c) => (
                            <option key={c.entityId} value={c.entityId}>
                              {c.title || c.entityId} ({c.entityId})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-4">
                        <div className="font-semibold mb-2">Расстановка</div>
                        {selectedCharacters.length === 0 ? (
                          <div className="text-sm opacity-70">Выбери хотя бы одного персонажа.</div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {selectedCharacters.map((ch) => {
                              const fallbackLoc = setupDraft.selectedLocIds[0] || '';
                              const locId = setupDraft.placements[ch.entityId] || fallbackLoc;
                              return (
                                <div key={ch.entityId} className="grid grid-cols-12 gap-2 items-center">
                                  <div className="col-span-6 text-sm">
                                    {ch.title || ch.entityId}
                                    <div className="text-xs opacity-60">{ch.entityId}</div>
                                  </div>
                                  <Select
                                    className="col-span-6 bg-black/20"
                                    value={locId}
                                    disabled={!setupDraft.selectedLocIds.length}
                                    onChange={(e) => {
                                      const nextLocId = e.target.value;
                                      setSetupDraft((d) => ({
                                        ...d,
                                        placements: { ...d.placements, [ch.entityId]: nextLocId },
                                      }));
                                    }}
                                  >
                                    {!setupDraft.selectedLocIds.length ? (
                                      <option value="">(нет выбранных локаций)</option>
                                    ) : null}
                                    {selectedLocations.map((loc) => (
                                      <option key={loc.entityId} value={loc.entityId}>
                                        {loc.title || loc.entityId}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {setupProblems.length > 0 && (
                      <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
                        <div className="font-semibold mb-2">Проблемы сцены:</div>
                        <ul className="list-disc pl-5">
                          {setupProblems.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <div className="text-sm opacity-70">
                        Выбрано: {setupDraft.selectedLocIds.length} локаций, {setupDraft.selectedCharIds.length} персонажей.
                      </div>
                      <div className="grow" />
                      <Button kind="primary" disabled={setupProblems.length > 0} onClick={applySceneFromDraft}>
                        Apply Scene + Reset
                      </Button>
                    </div>
                  </Card>

                  <Card title="Map Preview">
                    <SimMapView sim={sim} snapshot={draftPreviewSnapshot} onMove={pushManualMove} />
                  </Card>
                </div>
              ) : null}

              {/* SUMMARY */}
              {tab === 'summary' ? (
                <>
                  <Card title="Что произошло на тике">
                    <div className="font-mono text-sm opacity-90">
                      tickIndex={cur.snapshot.tickIndex}
                      <br />
                      actionsApplied={cur.trace.actionsApplied.length} eventsApplied={cur.trace.eventsApplied.length}
                      <br />
                      charsChanged={cur.trace.deltas.chars.length} factsChanged={Object.keys(cur.trace.deltas.facts || {}).length}
                      <br />
                      orchestratorAtoms={(orchestratorSnapshot?.atoms || []).length} pipelineStages={pipelineStages.length}
                    </div>
                  </Card>

                  <Card title="Notes (человеческий лог симулятора)">
                    <pre className="font-mono text-sm opacity-90 whitespace-pre-wrap m-0">
                      {(cur.trace.notes || []).join('\n') || '(empty)'}
                    </pre>
                  </Card>

                  <Card title="Дельты персонажей">
                    <div className="font-mono text-xs opacity-90">
                      {cur.trace.deltas.chars.length ? (
                        cur.trace.deltas.chars.map((d: any) => (
                          <div key={d.id} className="mb-2">
                            <b>{d.id}</b> :: {JSON.stringify(d.before)} → {JSON.stringify(d.after)}
                          </div>
                        ))
                      ) : (
                        <div>(none)</div>
                      )}
                    </div>
                  </Card>
                </>
              ) : null}

              {/* WORLD */}
              {tab === 'world' ? (
                <>
                  <Card title="Персонажи">
                    <div className="font-mono text-sm opacity-90">
                      {cur.snapshot.characters.map((c: any) => (
                        <div key={c.id} className="mb-2">
                          <b>{c.id}</b> loc={c.locId} health={clamp01(c.health).toFixed(2)} energy={clamp01(c.energy).toFixed(2)}{' '}
                          stress={clamp01(c.stress).toFixed(2)}
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card title="Локации">
                    <div className="font-mono text-xs opacity-90">
                      {cur.snapshot.locations.map((l: any) => (
                        <div key={l.id} className="mb-4">
                          <div className="font-extrabold">
                            {l.id} <span className="opacity-70">{l.name}</span>
                          </div>
                          <div className="opacity-90">neighbors: {(l.neighbors || []).join(', ') || '(none)'}</div>
                          <div className="opacity-90">hazards: {JSON.stringify(l.hazards || {})}</div>
                          <div className="opacity-90">norms: {JSON.stringify(l.norms || {})}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              ) : null}

              {/* ACTIONS */}
              {tab === 'actions' ? (
                <>
                  <Card title="Действия, которые были применены">
                    <div className="font-mono text-sm opacity-90">
                      {cur.trace.actionsApplied.length ? (
                        cur.trace.actionsApplied.map((a: any) => (
                          <div key={a.id} className="mb-2">
                            <b>{a.kind}</b> actor={a.actorId}
                            {a.targetId ? ` target=${a.targetId}` : ''} <span className="opacity-70">({a.id})</span>
                          </div>
                        ))
                      ) : (
                        <div>(none)</div>
                      )}
                    </div>
                  </Card>

                  <Card title="Top предложений (actionsProposed)">
                    <div className="font-mono text-xs opacity-90">
                      {(cur.trace.actionsProposed || []).slice(0, 120).map((o: any, i: number) => (
                        <div key={`${o.kind}:${o.actorId}:${o.targetId ?? ''}:${i}`} className="mb-1">
                          {o.blocked ? 'BLOCK' : 'OK'} score={Number(o.score ?? 0).toFixed(3)} kind={o.kind} actor={o.actorId}
                          {o.targetId ? ` target=${o.targetId}` : ''}
                          {o.reason ? ` // ${o.reason}` : ''}
                        </div>
                      ))}
                      {(cur.trace.actionsProposed || []).length > 120 ? <div>…</div> : null}
                    </div>
                  </Card>
                </>
              ) : null}

              {/* EVENTS */}
              {tab === 'events' ? (
                <>
                  <Card title="События, которые были применены">
                    <div className="font-mono text-xs opacity-90">
                      {cur.trace.eventsApplied.length ? (
                        cur.trace.eventsApplied.map((e: any) => (
                          <div key={e.id} className="mb-3">
                            <div className="font-extrabold">
                              {e.type} <span className="opacity-70">({e.id})</span>
                            </div>
                            <div className="opacity-90">{JSON.stringify(e.payload || {})}</div>
                          </div>
                        ))
                      ) : (
                        <div>(none)</div>
                      )}
                    </div>
                  </Card>
                </>
              ) : null}

              {/* PIPELINE */}
              {tab === 'pipeline' ? (
                <>
                  <Card title="GoalLab Pipeline — сводка">
                    {!pipelineOut ? (
                      <div className="opacity-70">Нет данных плагина goalLabPipeline.</div>
                    ) : pipelineOut?.error ? (
                      <div className="font-mono text-sm opacity-90 whitespace-pre-wrap">
                        error: {String(pipelineOut.error)}
                        {pipelineOut.stack ? `\n\n${String(pipelineOut.stack)}` : ''}
                      </div>
                    ) : (
                      <>
                        <div className="font-mono text-sm opacity-90">
                          agentId={String(pipelineOut.agentId)}
                          <br />
                          stages={Number(pipelineOut.stageCount ?? pipelineStages.length)} atomsOut={Number(pipelineOut.atomsOut ?? 0)}
                        </div>
                        <div className="mt-3">
                          <Button onClick={doExportPipeline} disabled={!pipelineOut}>
                            Export pipeline.json
                          </Button>
                        </div>
                      </>
                    )}
                  </Card>

                  <Card title="Стадии (S0..S8)">
                    {!pipelineStages?.length ? (
                      <div className="opacity-70">(нет стадий)</div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {pipelineStages.map((s: any) => (
                          <div key={String(s.stage)} className="rounded-2xl border border-canon-border bg-canon-card p-4">
                            <div className="flex items-baseline justify-between gap-2">
                              <div className="font-extrabold">
                                {String(s.stage)} <span className="opacity-70">{String(s.title || '')}</span>
                              </div>
                              <div className="font-mono text-xs opacity-70">
                                atoms={Array.isArray(s.atoms) ? s.atoms.length : 0}
                                {s.stats?.addedCount != null ? ` added=${s.stats.addedCount}` : ''}
                              </div>
                            </div>

                            {Array.isArray(s.warnings) && s.warnings.length ? (
                              <div className="mt-2 text-sm">
                                <div className="font-bold">warnings:</div>
                                <div className="font-mono text-xs opacity-90 whitespace-pre-wrap">
                                  {s.warnings.slice(0, 20).map((w: any) => `- ${String(w)}`).join('\n')}
                                  {s.warnings.length > 20 ? `\n… (+${s.warnings.length - 20})` : ''}
                                </div>
                              </div>
                            ) : null}

                            {s.artifacts ? (
                              <div className="mt-3">
                                <div className="font-bold">artifacts (snippet):</div>
                                <pre className="font-mono text-xs opacity-90 whitespace-pre-wrap m-0">
                                  {JSON.stringify(s.artifacts, null, 2).slice(0, 4000)}
                                  {JSON.stringify(s.artifacts, null, 2).length > 4000 ? '\n… (truncated)' : ''}
                                </pre>
                              </div>
                            ) : null}

                            <div className="mt-3">
                              <div className="font-bold">top atoms (first 60):</div>
                              <pre className="font-mono text-xs opacity-90 whitespace-pre-wrap m-0">
                                {Array.isArray(s.atoms)
                                  ? s.atoms
                                      .slice(0, 60)
                                      .map((a: any) => {
                                        const id = String(a?.id ?? a?.atomId ?? '');
                                        const v = Number(a?.magnitude ?? 0);
                                        const c = Number(a?.confidence ?? 1);
                                        const label = a?.label ? ` | ${String(a.label)}` : '';
                                        return `${id} v=${v.toFixed(3)} c=${c.toFixed(3)}${label}`;
                                      })
                                      .join('\n')
                                  : '(no atoms)'}
                                {Array.isArray(s.atoms) && s.atoms.length > 60 ? `\n… (+${s.atoms.length - 60})` : ''}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </>
              ) : null}

              {/* ORCHESTRATOR */}
              {tab === 'orchestrator' ? (
                <>
                  <Card title="Decision trace (chosen + topK softmax probs)">
                    {!orchestratorDecision ? (
                      <div className="opacity-70">
                        Нет orchestratorDecision на этом тике. (Либо тиков ещё не было, либо плагин не записал decision trace.)
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <div className="font-mono text-xs opacity-80">
                          tickIndex={String(orchestratorDecision.tickIndex)} T={String(orchestratorDecision.T)} actors=
                          {String(orchestratorDecision.actorCount)}
                        </div>

                        <div className="flex flex-col gap-3">
                          {Object.keys(orchestratorDecision.perActor || {})
                            .sort()
                            .map((actorId: string) => {
                              const d = orchestratorDecision.perActor[actorId];
                              const ch = d?.chosen;
                              const topK = Array.isArray(d?.topK) ? d.topK : [];
                              return (
                                <div key={actorId} className="rounded-2xl border border-canon-border bg-canon-card p-4">
                                  <div className="flex items-baseline justify-between gap-3">
                                    <div className="font-extrabold">{actorId}</div>
                                    <div className="font-mono text-xs opacity-70">
                                      T={String(d?.T ?? orchestratorDecision.T)}
                                    </div>
                                  </div>

                                  <div className="mt-2 font-mono text-sm">
                                    chosen: <b>{String(ch?.kind ?? '(none)')}</b>
                                    {ch?.targetId ? ` target=${String(ch.targetId)}` : ''}
                                    {ch?.prob != null ? ` prob=${Number(ch.prob).toFixed(3)}` : ''}
                                    {Number.isFinite(ch?.score) ? ` score=${Number(ch.score).toFixed(3)}` : ''}
                                    {ch?.reason ? ` // ${String(ch.reason)}` : ''}
                                  </div>

                                  <div className="mt-3">
                                    <div className="font-bold text-sm">topK (score + prob):</div>
                                    <div className="font-mono text-xs opacity-90 mt-2">
                                      {topK.slice(0, 20).map((o: any) => (
                                        <div key={String(o.key)} className="mb-1">
                                          prob={Number(o.prob ?? 0).toFixed(3)} score={Number(o.score ?? 0).toFixed(3)} kind=
                                          {String(o.kind)}
                                          {o.targetId ? ` target=${String(o.targetId)}` : ''}
                                          {o.reason ? ` // ${String(o.reason)}` : ''}
                                        </div>
                                      ))}
                                      {topK.length > 20 ? <div>… (+{topK.length - 20})</div> : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </Card>

                  <Card title="Human log (оркестратор)">
                    {!orchestratorTrace ? (
                      <div className="opacity-70">Трейса оркестратора нет (registry пустой или плагин не отдал trace).</div>
                    ) : (
                      <pre className="font-mono text-sm opacity-90 whitespace-pre-wrap m-0">
                        {(orchestratorTrace.humanLog || []).join('\n') || '(empty)'}
                      </pre>
                    )}
                  </Card>

                  <Card title="Atom changes (первые 200)">
                    {!orchestratorTrace ? (
                      <div className="opacity-70">(no trace)</div>
                    ) : (
                      <div className="font-mono text-xs opacity-90">
                        {(orchestratorTrace.atomChanges || []).slice(0, 200).map((c: any) => {
                          const b = Number(c.before?.magnitude ?? 0);
                          const a = Number(c.after?.magnitude ?? 0);
                          const d = a - b;
                          const sign = d >= 0 ? '+' : '';
                          return (
                            <div key={`${c.op}:${c.id}`}>
                              {String(c.op).toUpperCase()} {c.id} {b.toFixed(3)}→{a.toFixed(3)} ({sign}
                              {d.toFixed(3)})
                            </div>
                          );
                        })}
                        {(orchestratorTrace.atomChanges || []).length > 200 ? <div>…</div> : null}
                      </div>
                    )}
                  </Card>
                </>
              ) : null}

              {/* MAP */}
              {tab === 'map' ? (
                <Card title="Карта мира">
                  <SimMapView sim={sim} snapshot={cur?.snapshot || null} onMove={pushManualMove} />
                </Card>
              ) : null}

              {/* JSON */}
              {tab === 'json' ? (
                <Card title="JSON текущей записи">
                  <div className="flex gap-2 flex-wrap mb-3">
                    <Button onClick={doExportRecord}>Export record.json</Button>
                    {orchestratorSnapshot ? (
                      <Button onClick={() => jsonDownload(`goal-lab-snapshot-${cur.snapshot.tickIndex}.json`, orchestratorSnapshot)}>
                        Export GoalLab snapshot.json
                      </Button>
                    ) : null}
                    <Button onClick={doExportPipeline} disabled={!pipelineOut}>
                      Export pipeline.json
                    </Button>
                  </div>
                  <pre className="font-mono text-xs opacity-90 whitespace-pre-wrap m-0">{JSON.stringify(cur, null, 2)}</pre>
                </Card>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
