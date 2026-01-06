// lib/goal-lab/labs/SimulatorLab.tsx
// Friendly Simulator Lab UI for SimKit (session runner + debug) + GoalLab Pipeline view.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProducerSpec } from '../../orchestrator/types';
import { SimKitSimulator } from '../../simkit/core/simulator';
import { buildExport } from '../../simkit/core/export';
import { basicScenarioId, makeBasicWorld } from '../../simkit/scenarios/basicScenario';
import { makeOrchestratorPlugin } from '../../simkit/plugins/orchestratorPlugin';
import { makeGoalLabPipelinePlugin } from '../../simkit/plugins/goalLabPipelinePlugin';
import { SCENE_PRESETS } from '../../simkit/scenes/sceneCatalog';
import { SimMapView } from '../../../components/SimMapView';
import { KeyValueEditor } from '../../../components/KeyValueEditor';

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

type Sel = { kind: 'loc'; id: string } | { kind: 'ch'; id: string } | null;

type DraftLoc = {
  id: string;
  name: string;
  enabled: boolean;
  neighbors: string[];
  hazards: Record<string, number>;
  norms: Record<string, number>;
};

type DraftChar = {
  id: string;
  name: string;
  enabled: boolean;
  locId: string;
  stress: number;
  health: number;
  energy: number;
  tags: string[];
};

function toDraftFromWorld(w: ReturnType<typeof makeBasicWorld>) {
  const locs: DraftLoc[] = Object.values(w.locations).map((l) => ({
    id: l.id,
    name: l.name,
    enabled: true,
    neighbors: (l.neighbors || []).slice(),
    hazards: { ...(l.hazards || {}) },
    norms: { ...(l.norms || {}) },
  }));
  const chars: DraftChar[] = Object.values(w.characters).map((c) => ({
    id: c.id,
    name: c.name,
    enabled: true,
    locId: c.locId,
    stress: c.stress,
    health: c.health,
    energy: c.energy,
    tags: (c.tags || []).slice(),
  }));
  return { locs, chars };
}

function buildWorldFromDraft(d: { locs: DraftLoc[]; chars: DraftChar[] }, seed: number) {
  const enabledLocs = d.locs.filter((x) => x.enabled);
  const locIds = new Set(enabledLocs.map((l) => l.id));

  const locations: any = {};
  for (const l of enabledLocs) {
    locations[l.id] = {
      id: l.id,
      name: l.name,
      neighbors: (l.neighbors || []).filter((n) => locIds.has(n) && n !== l.id),
      hazards: l.hazards || {},
      norms: l.norms || {},
    };
  }

  const enabledChars = d.chars.filter((x) => x.enabled);
  const characters: any = {};
  for (const c of enabledChars) {
    characters[c.id] = {
      id: c.id,
      name: c.name,
      locId: locIds.has(c.locId) ? c.locId : (enabledLocs[0]?.id ?? 'loc:missing'),
      stress: c.stress,
      health: c.health,
      energy: c.energy,
      tags: c.tags || [],
    };
  }

  return {
    tickIndex: 0,
    seed,
    facts: {},
    events: [],
    locations,
    characters,
  };
}

function validateDraft(d: { locs: DraftLoc[]; chars: DraftChar[] }) {
  const problems: string[] = [];
  const locs = d.locs.filter((x) => x.enabled);
  const chars = d.chars.filter((x) => x.enabled);

  if (!locs.length) problems.push('Нужна минимум 1 активная локация.');
  if (!chars.length) problems.push('Нужен минимум 1 активный персонаж.');

  const locIds = new Set(locs.map((l) => l.id));
  for (const l of locs) {
    for (const n of l.neighbors || []) {
      if (!locIds.has(n)) problems.push(`Локация ${l.id}: сосед ${n} не существует/выключен.`);
      if (n === l.id) problems.push(`Локация ${l.id}: сосед не может быть самой собой.`);
    }
  }

  for (const c of chars) {
    if (!locIds.has(c.locId)) problems.push(`Персонаж ${c.id}: стартовая locId=${c.locId} не существует/выключена.`);
  }

  return problems;
}

function loadPresetToDraft(id: string) {
  const p = SCENE_PRESETS.find((x) => x.id === id);
  if (!p) return toDraftFromWorld(makeBasicWorld());

  const locs = p.locations.map((l) => ({
    id: l.id,
    name: l.name,
    enabled: true,
    neighbors: (l.neighbors || []).slice(),
    hazards: { ...(l.hazards || {}) },
    norms: { ...(l.norms || {}) },
  }));
  const firstLoc = locs[0]?.id || 'loc:missing';
  const chars = p.characters.map((c) => ({
    id: c.id,
    name: c.name,
    enabled: true,
    locId: firstLoc,
    stress: c.stress ?? 0.2,
    health: c.health ?? 1.0,
    energy: c.energy ?? 0.7,
    tags: (c.tags || []).slice(),
  }));
  return { locs, chars };
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function Btn({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        'px-3 py-2 rounded-xl border border-canon-border bg-canon-card hover:bg-white/5 active:bg-white/10 transition',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    />
  );
}

function BtnPrimary({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        'px-4 py-2.5 rounded-2xl border border-canon-border bg-white/10 hover:bg-white/15 active:bg-white/20 transition',
        'font-semibold',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    />
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-canon-border bg-canon-card p-4', className)}>
      <div className="font-extrabold mb-2">{title}</div>
      {children}
    </div>
  );
}

function Tab({
  id,
  active,
  onClick,
  label,
}: {
  id: TabId;
  active: boolean;
  onClick: (id: TabId) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={cx(
        'px-3 py-2 rounded-xl border border-canon-border transition',
        active ? 'bg-white/10' : 'bg-transparent hover:bg-white/5'
      )}
    >
      <span className="font-semibold">{label}</span>
    </button>
  );
}

export function SimulatorLab({ orchestratorRegistry, onPushToGoalLab }: Props) {
  const simRef = useRef<SimKitSimulator | null>(null);

  const [seedDraft, setSeedDraft] = useState(5);
  const [tab, setTab] = useState<TabId>('summary');
  const [selected, setSelected] = useState<number>(-1); // record index, -1 = latest
  const [version, setVersion] = useState(0);
  const [runN, setRunN] = useState(10);
  const [temperatureDraft, setTemperatureDraft] = useState(0.2);
  const [setupDraft, setSetupDraft] = useState(() => toDraftFromWorld(makeBasicWorld()));
  const [sel, setSel] = useState<Sel>(null);
  const [presetId, setPresetId] = useState<string>('basic:v1');

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

  const orchestratorTrace = cur?.plugins?.orchestrator?.trace || null;
  const orchestratorSnapshot = cur?.plugins?.orchestrator?.snapshot || null;

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

  function doExportSession() {
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

  function applyScene() {
    const w = buildWorldFromDraft(setupDraft, seedDraft);
    sim.setInitialWorld(w, { seed: seedDraft, scenarioId: basicScenarioId });
    setSelected(-1);
    setVersion((v) => v + 1);
    setTab('summary');
  }

  function loadPreset(id: string) {
    setSetupDraft(() => loadPresetToDraft(id));
    setSel(null);
  }

  // Temperature for action sampling in the orchestrator policy (T -> 0 = greedy).
  function updateTemperature(value: number) {
    const safeValue = Number.isFinite(value) ? value : 0;
    setTemperatureDraft(safeValue);
    sim.world.facts['sim:T'] = safeValue;
  }

  const canSimulate = setupProblems.length === 0;
  const previewSnapshot = records.length ? cur?.snapshot : sim.getPreviewSnapshot();

  return (
    <div className="h-full w-full p-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-xl font-extrabold">Simulator Lab</div>
          <div className="font-mono text-sm opacity-80">
            simkit | worldTick={sim.world.tickIndex} | records={records.length} | scenario={sim.cfg.scenarioId}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-mono opacity-80">seed</div>
          <input
            type="number"
            value={seedDraft}
            onChange={(e) => setSeedDraft(Number(e.target.value))}
            className="w-24 px-3 py-2 rounded-xl border border-canon-border bg-canon-card"
          />
          <div className="font-mono opacity-80">T</div>
          <input
            type="number"
            step="0.05"
            value={temperatureDraft}
            onChange={(e) => updateTemperature(Number(e.target.value))}
            className="w-24 px-3 py-2 rounded-xl border border-canon-border bg-canon-card"
          />
          <Btn onClick={doReset}>Apply + Reset</Btn>
          <Btn onClick={doExportSession} disabled={records.length === 0}>
            Export session.json
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-[360px_1fr] gap-4 h-[calc(100%-68px)] min-h-0">
        {/* Left */}
        <div className="min-h-0 flex flex-col gap-4">
          <Card title="Quick start">
            <div className="text-sm opacity-80 mb-3">
              Симулятор = мир → действия → события → снапшот. Нажми “Сделать 1 тик”, чтобы появились записи и отладка.
            </div>

            <div className="flex gap-2 flex-wrap">
              <BtnPrimary onClick={doStep} disabled={!canSimulate}>
                Сделать 1 тик
              </BtnPrimary>
              <Btn onClick={() => doRun(10)} disabled={!canSimulate}>
                Run x10
              </Btn>
              <Btn onClick={() => doRun(100)} disabled={!canSimulate}>
                Run x100
              </Btn>
              <Btn onClick={doReset}>Reset</Btn>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <div className="font-mono text-sm opacity-80">run</div>
              <input
                type="number"
                value={runN}
                onChange={(e) => setRunN(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 px-3 py-2 rounded-xl border border-canon-border bg-canon-card"
              />
              <Btn onClick={() => doRun(runN)} disabled={!canSimulate}>
                Run N
              </Btn>
            </div>
          </Card>

          <Card title="History" className="min-h-0 flex flex-col">
            {records.length === 0 ? (
              <div className="text-sm opacity-70">
                Пока пусто. Сделай 1 тик — появится список тиков, и можно будет смотреть мир/действия/события/пайплайн/оркестратор.
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <Btn onClick={() => setSelected(-1)}>Latest</Btn>
                  <Btn onClick={() => setSelected(Math.max(0, records.length - 1))}>Oldest</Btn>
                  <Btn onClick={doExportRecord} disabled={!cur}>
                    Export record.json
                  </Btn>
                  <Btn onClick={doExportTrace} disabled={!orchestratorTrace}>
                    Export trace.json
                  </Btn>
                  <Btn onClick={doExportPipeline} disabled={!pipelineOut}>
                    Export pipeline.json
                  </Btn>
                  {onPushToGoalLab && orchestratorSnapshot ? (
                    <Btn onClick={() => onPushToGoalLab(orchestratorSnapshot)}>Push → GoalLab</Btn>
                  ) : null}
                </div>

                <div className="min-h-0 overflow-auto pr-1">
                  <div className="flex flex-col gap-2">
                    {tickItems.map((it) => (
                      <button
                        key={it.i}
                        onClick={() => setSelected(it.i)}
                        className={cx(
                          'text-left rounded-xl border border-canon-border p-3 bg-canon-card hover:bg-white/5 transition',
                          it.i === curIdx && 'bg-white/10'
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-extrabold">tick {it.tick}</div>
                          <div className="font-mono text-xs opacity-70">#{it.i}</div>
                        </div>
                        <div className="font-mono text-xs opacity-80 mt-1">
                          actions={it.actions} events={it.events} atoms={it.atoms} pipelineStages={it.pipelineStages}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Right */}
        <div className="min-h-0 flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            <Tab id="setup" active={tab === 'setup'} onClick={setTab} label="Setup" />
            <Tab id="summary" active={tab === 'summary'} onClick={setTab} label="Сводка" />
            <Tab id="world" active={tab === 'world'} onClick={setTab} label="Мир" />
            <Tab id="actions" active={tab === 'actions'} onClick={setTab} label="Действия" />
            <Tab id="events" active={tab === 'events'} onClick={setTab} label="События" />
            <Tab id="pipeline" active={tab === 'pipeline'} onClick={setTab} label="Pipeline (S0–S8)" />
            <Tab id="orchestrator" active={tab === 'orchestrator'} onClick={setTab} label="Оркестратор" />
            <Tab id="map" active={tab === 'map'} onClick={setTab} label="Map" />
            <Tab id="json" active={tab === 'json'} onClick={setTab} label="JSON" />
          </div>

          {records.length === 0 && tab !== 'setup' ? (
            <div className="flex-1 min-h-0 rounded-2xl border border-canon-border bg-canon-card p-8 flex flex-col items-start justify-center gap-4">
              <div className="text-2xl font-extrabold">Здесь будет жизнь</div>
              <div className="opacity-80 max-w-2xl">
                Сейчас записей нет, поэтому “смотреть” нечего. Симулятор создаёт записи только после тиков. Нажми кнопку ниже —
                появится tick 0 и вся отладка.
              </div>
              <BtnPrimary onClick={doStep}>Сделать 1 тик</BtnPrimary>
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
                      Сначала собери сцену: активные локации + персонажи + стартовые позиции. Потом Step/Run.
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        className="px-3 py-2 rounded-xl border border-canon-border bg-canon-card"
                        value={presetId}
                        onChange={(e) => setPresetId(e.target.value)}
                      >
                        {SCENE_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>

                      <Btn onClick={() => loadPreset(presetId)}>Load preset</Btn>

                      <div className="grow" />

                      {setupProblems.length > 0 ? (
                        <div className="text-sm opacity-80">
                          Issues: <span className="text-red-300">{setupProblems.length}</span>
                        </div>
                      ) : (
                        <div className="text-sm opacity-70">OK</div>
                      )}

                      <BtnPrimary disabled={setupProblems.length > 0} onClick={applyScene}>
                        Apply Scene + Reset
                      </BtnPrimary>
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
                  </Card>

                  <div className="grid grid-cols-12 gap-4">
                    {/* LEFT: lists */}
                    <div className="col-span-4 flex flex-col gap-4">
                      <Card title="Locations">
                        <div className="flex items-center gap-2 mb-2">
                          <Btn
                            onClick={() => {
                              setSetupDraft((d) => {
                                const next = structuredClone(d);
                                const n = next.locs.length + 1;
                                const id = `loc:${n}`;
                                next.locs.push({
                                  id,
                                  name: `Location ${n}`,
                                  enabled: true,
                                  neighbors: [],
                                  hazards: {},
                                  norms: {},
                                });
                                return next;
                              });
                            }}
                          >
                            + New
                          </Btn>

                          <select
                            className="px-3 py-2 rounded-xl border border-canon-border bg-canon-card"
                            defaultValue=""
                            onChange={(e) => {
                              const id = e.target.value;
                              if (!id) return;
                              const p = SCENE_PRESETS.find((x) => x.id === presetId) || SCENE_PRESETS[0];
                              const src = p?.locations.find((l) => l.id === id);
                              if (!src) return;

                              setSetupDraft((d) => {
                                const next = structuredClone(d);
                                if (next.locs.some((x) => x.id === src.id)) return next;
                                next.locs.push({
                                  id: src.id,
                                  name: src.name,
                                  enabled: true,
                                  neighbors: (src.neighbors || []).slice(),
                                  hazards: { ...(src.hazards || {}) },
                                  norms: { ...(src.norms || {}) },
                                });
                                return next;
                              });

                              e.currentTarget.value = '';
                            }}
                          >
                            <option value="">+ Add from preset…</option>
                            {(SCENE_PRESETS.find((x) => x.id === presetId)?.locations || []).map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.id}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          {setupDraft.locs.map((l) => (
                            <button
                              key={l.id}
                              className={[
                                'w-full text-left px-3 py-2 rounded-xl border border-canon-border hover:bg-white/5',
                                sel?.kind === 'loc' && sel.id === l.id ? 'bg-white/10' : 'bg-black/10',
                              ].join(' ')}
                              onClick={() => setSel({ kind: 'loc', id: l.id })}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-mono text-sm">{l.id}</div>
                                <label className="flex items-center gap-2 text-sm opacity-80">
                                  <input
                                    type="checkbox"
                                    checked={l.enabled}
                                    onChange={(e) => {
                                      const en = e.target.checked;
                                      setSetupDraft((d) => {
                                        const next = structuredClone(d);
                                        const it = next.locs.find((x) => x.id === l.id);
                                        if (it) it.enabled = en;
                                        return next;
                                      });
                                    }}
                                  />
                                  enabled
                                </label>
                              </div>
                              <div className="text-sm opacity-70">{l.name}</div>
                            </button>
                          ))}
                        </div>
                      </Card>

                      <Card title="Characters">
                        <div className="flex items-center gap-2 mb-2">
                          <Btn
                            onClick={() => {
                              setSetupDraft((d) => {
                                const next = structuredClone(d);
                                const n = next.chars.length + 1;
                                const firstLoc =
                                  next.locs.find((x) => x.enabled)?.id || next.locs[0]?.id || 'loc:missing';
                                next.chars.push({
                                  id: `ch:${n}`,
                                  name: `Character ${n}`,
                                  enabled: true,
                                  locId: firstLoc,
                                  stress: 0.2,
                                  health: 1.0,
                                  energy: 0.7,
                                  tags: [],
                                });
                                return next;
                              });
                            }}
                          >
                            + New
                          </Btn>

                          <select
                            className="px-3 py-2 rounded-xl border border-canon-border bg-canon-card"
                            defaultValue=""
                            onChange={(e) => {
                              const id = e.target.value;
                              if (!id) return;
                              const p = SCENE_PRESETS.find((x) => x.id === presetId) || SCENE_PRESETS[0];
                              const src = p?.characters.find((c) => c.id === id);
                              if (!src) return;

                              setSetupDraft((d) => {
                                const next = structuredClone(d);
                                if (next.chars.some((x) => x.id === src.id)) return next;
                                const firstLoc =
                                  next.locs.find((x) => x.enabled)?.id || next.locs[0]?.id || 'loc:missing';
                                next.chars.push({
                                  id: src.id,
                                  name: src.name,
                                  enabled: true,
                                  locId: firstLoc,
                                  stress: src.stress ?? 0.2,
                                  health: src.health ?? 1.0,
                                  energy: src.energy ?? 0.7,
                                  tags: (src.tags || []).slice(),
                                });
                                return next;
                              });

                              e.currentTarget.value = '';
                            }}
                          >
                            <option value="">+ Add from preset…</option>
                            {(SCENE_PRESETS.find((x) => x.id === presetId)?.characters || []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.id}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          {setupDraft.chars.map((c) => (
                            <button
                              key={c.id}
                              className={[
                                'w-full text-left px-3 py-2 rounded-xl border border-canon-border hover:bg-white/5',
                                sel?.kind === 'ch' && sel.id === c.id ? 'bg-white/10' : 'bg-black/10',
                              ].join(' ')}
                              onClick={() => setSel({ kind: 'ch', id: c.id })}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-mono text-sm">{c.id}</div>
                                <label className="flex items-center gap-2 text-sm opacity-80">
                                  <input
                                    type="checkbox"
                                    checked={c.enabled}
                                    onChange={(e) => {
                                      const en = e.target.checked;
                                      setSetupDraft((d) => {
                                        const next = structuredClone(d);
                                        const it = next.chars.find((x) => x.id === c.id);
                                        if (it) it.enabled = en;
                                        return next;
                                      });
                                    }}
                                  />
                                  enabled
                                </label>
                              </div>
                              <div className="text-sm opacity-70">{c.name}</div>
                            </button>
                          ))}
                        </div>
                      </Card>
                    </div>

                    {/* MIDDLE: inspector */}
                    <div className="col-span-5 flex flex-col gap-4">
                      <Card title="Inspector">
                        {!sel && <div className="text-sm opacity-70">Выбери локацию или персонажа слева.</div>}

                        {sel?.kind === 'loc' &&
                          (() => {
                            const i = setupDraft.locs.findIndex((x) => x.id === sel.id);
                            const l = setupDraft.locs[i];
                            if (!l) return <div className="text-sm opacity-70">Missing loc.</div>;

                            const enabledLocs = setupDraft.locs.filter((x) => x.enabled && x.id !== l.id);

                            return (
                              <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-12 gap-2 items-center">
                                  <div className="col-span-3 font-mono text-sm opacity-80">id</div>
                                  <div className="col-span-9 font-mono text-sm">{l.id}</div>

                                  <div className="col-span-3 text-sm opacity-80">name</div>
                                  <input
                                    className="col-span-9 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
                                    value={l.name}
                                    onChange={(e) => {
                                      const name = e.target.value;
                                      setSetupDraft((d) => {
                                        const next = structuredClone(d);
                                        next.locs[i].name = name;
                                        return next;
                                      });
                                    }}
                                  />
                                </div>

                                <div className="rounded-2xl border border-canon-border bg-canon-card p-3">
                                  <div className="font-semibold mb-2">Neighbors</div>
                                  <div className="flex flex-col gap-2">
                                    {enabledLocs.length === 0 && (
                                      <div className="text-sm opacity-60">Нет других активных локаций.</div>
                                    )}
                                    {enabledLocs.map((n) => {
                                      const checked = l.neighbors.includes(n.id);
                                      return (
                                        <label key={n.id} className="flex items-center gap-2 text-sm">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                              const on = e.target.checked;
                                              setSetupDraft((d) => {
                                                const next = structuredClone(d);
                                                const curNeighbors = next.locs[i].neighbors;
                                                next.locs[i].neighbors = on
                                                  ? Array.from(new Set([...curNeighbors, n.id]))
                                                  : curNeighbors.filter((x) => x !== n.id);
                                                return next;
                                              });
                                            }}
                                          />
                                          <span className="font-mono">{n.id}</span>
                                          <span className="opacity-70">{n.name}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>

                                <KeyValueEditor
                                  title="Hazards"
                                  value={l.hazards}
                                  suggestions={['radiation', 'cold', 'dark', 'toxic', 'noise', 'crowd']}
                                  onChange={(haz) => {
                                    setSetupDraft((d) => {
                                      const next = structuredClone(d);
                                      next.locs[i].hazards = haz;
                                      return next;
                                    });
                                  }}
                                />

                                <KeyValueEditor
                                  title="Norms"
                                  value={l.norms}
                                  suggestions={['order', 'privacy', 'violence', 'ritual', 'obedience', 'surveillance']}
                                  onChange={(norms) => {
                                    setSetupDraft((d) => {
                                      const next = structuredClone(d);
                                      next.locs[i].norms = norms;
                                      return next;
                                    });
                                  }}
                                />
                              </div>
                            );
                          })()}

                        {sel?.kind === 'ch' &&
                          (() => {
                            const i = setupDraft.chars.findIndex((x) => x.id === sel.id);
                            const c = setupDraft.chars[i];
                            if (!c) return <div className="text-sm opacity-70">Missing ch.</div>;

                            const locs = setupDraft.locs.filter((l) => l.enabled);

                            return (
                              <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-12 gap-2 items-center">
                                  <div className="col-span-3 font-mono text-sm opacity-80">id</div>
                                  <div className="col-span-9 font-mono text-sm">{c.id}</div>

                                  <div className="col-span-3 text-sm opacity-80">name</div>
                                  <input
                                    className="col-span-9 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
                                    value={c.name}
                                    onChange={(e) => {
                                      const name = e.target.value;
                                      setSetupDraft((d) => {
                                        const next = structuredClone(d);
                                        next.chars[i].name = name;
                                        return next;
                                      });
                                    }}
                                  />

                                  <div className="col-span-3 text-sm opacity-80">start loc</div>
                                  <select
                                    className="col-span-9 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
                                    value={c.locId}
                                    onChange={(e) => {
                                      const locId = e.target.value;
                                      setSetupDraft((d) => {
                                        const next = structuredClone(d);
                                        next.chars[i].locId = locId;
                                        return next;
                                      });
                                    }}
                                  >
                                    {locs.map((l) => (
                                      <option key={l.id} value={l.id}>
                                        {l.id}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="rounded-2xl border border-canon-border bg-canon-card p-3">
                                  <div className="font-semibold mb-2">Stats</div>
                                  <div className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-3 text-sm opacity-80">stress</div>
                                    <input
                                      className="col-span-9 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
                                      type="number"
                                      step="0.05"
                                      value={c.stress}
                                      onChange={(e) => {
                                        setSetupDraft((d) => {
                                          const n = structuredClone(d);
                                          n.chars[i].stress = Number(e.target.value);
                                          return n;
                                        });
                                      }}
                                    />
                                    <div className="col-span-3 text-sm opacity-80">health</div>
                                    <input
                                      className="col-span-9 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
                                      type="number"
                                      step="0.05"
                                      value={c.health}
                                      onChange={(e) => {
                                        setSetupDraft((d) => {
                                          const n = structuredClone(d);
                                          n.chars[i].health = Number(e.target.value);
                                          return n;
                                        });
                                      }}
                                    />
                                    <div className="col-span-3 text-sm opacity-80">energy</div>
                                    <input
                                      className="col-span-9 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
                                      type="number"
                                      step="0.05"
                                      value={c.energy}
                                      onChange={(e) => {
                                        setSetupDraft((d) => {
                                          const n = structuredClone(d);
                                          n.chars[i].energy = Number(e.target.value);
                                          return n;
                                        });
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                      </Card>
                    </div>

                    {/* RIGHT: map */}
                    <div className="col-span-3 flex flex-col gap-4">
                      <Card title="Map Preview">
                        <SimMapView sim={sim} snapshot={previewSnapshot || sim.getPreviewSnapshot()} />
                      </Card>
                    </div>
                  </div>
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
                          <Btn onClick={doExportPipeline} disabled={!pipelineOut}>
                            Export pipeline.json
                          </Btn>
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
                  <SimMapView sim={sim} snapshot={cur?.snapshot || null} />
                </Card>
              ) : null}

              {/* JSON */}
              {tab === 'json' ? (
                <Card title="JSON текущей записи">
                  <div className="flex gap-2 flex-wrap mb-3">
                    <Btn onClick={doExportRecord}>Export record.json</Btn>
                    {orchestratorSnapshot ? (
                      <Btn onClick={() => jsonDownload(`goal-lab-snapshot-${cur.snapshot.tickIndex}.json`, orchestratorSnapshot)}>
                        Export GoalLab snapshot.json
                      </Btn>
                    ) : null}
                    <Btn onClick={doExportPipeline} disabled={!pipelineOut}>
                      Export pipeline.json
                    </Btn>
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
