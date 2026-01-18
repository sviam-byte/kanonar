// lib/goal-lab/labs/SimulatorLab.tsx
// SimKit Lab: Setup (locations/chars/placements/env) + Run (map/history/json/pipeline/orchestrator)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProducerSpec } from '../../orchestrator/types';
import { SimKitSimulator } from '../../simkit/core/simulator';
import type { SimSnapshot, SimTickRecord } from '../../simkit/core/types';
import { buildExport } from '../../simkit/core/export';
import { makeOrchestratorPlugin } from '../../simkit/plugins/orchestratorPlugin';
import { makeGoalLabPipelinePlugin } from '../../simkit/plugins/goalLabPipelinePlugin';
import { makeSimWorldFromSelection } from '../../simkit/adapters/fromKanonarEntities';
import { basicScenarioId, makeBasicWorld } from '../../simkit/scenarios/basicScenario';

import { SimMapView } from '../../../components/SimMapView';
import { LocationMapView } from '../../../components/LocationMapView';
import { PlacementMapEditor } from '../../../components/ScenarioSetup/PlacementMapEditor';
import { PlacementMiniMap } from '../../../components/ScenarioSetup/PlacementMiniMap';
import { LocationVectorMap } from '../../../components/locations/LocationVectorMap';

import { EntityType } from '../../../enums';
import { getEntitiesByType, getAllCharactersWithRuntime } from '../../../data';
import { useSandbox } from '../../../contexts/SandboxContext';

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

type Mode = 'setup' | 'run';
type SetupStage = 'loc' | 'entities' | 'env';
type TabId = 'map' | 'summary' | 'narrative' | 'pipeline' | 'orchestrator' | 'json';

type SetupDraft = {
  selectedLocIds: string[];
  selectedCharIds: string[];
  locPlacements: Record<string, string>; // charId -> locId
  placements: Array<{ characterId: string; locationId: string; nodeId: string | null; x?: number; y?: number }>;
  hazardPoints: Array<any>;
  // Для PlacementMapEditor удобнее держать список “characters” и “places” прямо в draft
  characters: Array<{ id: string; name?: string; title?: string }>;
  places: Array<any>;
  // Environment facts (ctx:*)
  envFacts: string[];
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs));
}

function pad4(n: number) {
  return String(n).padStart(4, '0');
}

function stableHue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function colorForId(id: string) {
  const hue = stableHue(String(id));
  return `hsl(${hue} 80% 60%)`;
}

function initialsForTitle(title: string) {
  const t = String(title || '').trim();
  if (!t) return '??';
  const parts = t.split(/\s+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? t[0] ?? '?';
  const b = parts.length > 1 ? (parts[1]?.[0] ?? '') : (t[1] ?? '');
  return (a + b).toUpperCase().slice(0, 2);
}

function compactJson(value: any, opts?: { maxDepth?: number; maxKeys?: number; maxArray?: number; maxStr?: number }) {
  const maxDepth = opts?.maxDepth ?? 4;
  const maxKeys = opts?.maxKeys ?? 60;
  const maxArray = opts?.maxArray ?? 50;
  const maxStr = opts?.maxStr ?? 500;
  const seen = new WeakSet();

  const recur = (v: any, depth: number): any => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') {
      if (v.length <= maxStr) return v;
      return v.slice(0, maxStr) + `…(+${v.length - maxStr} chars)`;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'function') return '[Function]';
    if (typeof v !== 'object') return String(v);
    if (seen.has(v)) return '[Circular]';
    seen.add(v);
    if (depth >= maxDepth) {
      if (Array.isArray(v)) return `[Array(${v.length})]`;
      return `[Object ${Object.keys(v).length}]`;
    }
    if (Array.isArray(v)) {
      const out = v.slice(0, maxArray).map((x) => recur(x, depth + 1));
      if (v.length > maxArray) out.push(`…(+${v.length - maxArray} items)`);
      return out;
    }
    const keys = Object.keys(v);
    const out: any = {};
    for (const k of keys.slice(0, maxKeys)) out[k] = recur((v as any)[k], depth + 1);
    if (keys.length > maxKeys) out.__more_keys__ = keys.length - maxKeys;
    return out;
  };

  return recur(value, 0);
}

export const SimulatorLab: React.FC<Props> = ({ orchestratorRegistry, onPushToGoalLab }) => {
  const { sandboxState } = useSandbox();
  // --------- Entities (источник правды) ----------
  const locations = useMemo(() => getEntitiesByType(EntityType.Location) as any[], []);
  const charactersAll = useMemo(() => getAllCharactersWithRuntime() as any[], []);

  // --------- Setup draft ----------
  const [setupStage, setSetupStage] = useState<SetupStage>('loc');
  const [mode, setMode] = useState<Mode>('setup');

  const [draft, setDraft] = useState<SetupDraft>(() => {
    const loc0 = locations?.[0]?.entityId ? String(locations[0].entityId) : '';
    const ch0 = charactersAll?.[0]?.entityId ? String(charactersAll[0].entityId) : '';
    const selectedLocIds = loc0 ? [loc0] : [];
    const selectedCharIds = ch0 ? [ch0] : [];
    const locPlacements: Record<string, string> = {};
    if (ch0 && loc0) locPlacements[ch0] = loc0;

    return {
      selectedLocIds,
      selectedCharIds,
      locPlacements,
      placements: [],
      hazardPoints: [],
      characters: [],
      places: [],
      envFacts: ['ctx:indoors:1'],
    };
  });

  // --------- Simulator ----------
  const simRef = useRef<SimKitSimulator | null>(null);
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [history, setHistory] = useState<SimTickRecord[]>([]);
  const [currentTickIndex, setCurrentTickIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<TabId>('map');

  const [isRunning, setIsRunning] = useState(false);
  const [tickMs, setTickMs] = useState<number>(250);
  const [viewLocId, setViewLocId] = useState<string>(() => String(locations?.[0]?.entityId ?? ''));
  const [viewActorId, setViewActorId] = useState<string>(() => String(charactersAll?.[0]?.entityId ?? ''));

  // --------- Derived: selected place/entities ----------
  const selectedPlaces = useMemo(() => {
    const ids = new Set(draft.selectedLocIds.map(String));
    return (locations || []).filter((l) => ids.has(String(l.entityId)));
  }, [draft.selectedLocIds, locations]);

  const selectedChars = useMemo(() => {
    const ids = new Set(draft.selectedCharIds.map(String));
    return (charactersAll || []).filter((c) => ids.has(String(c.entityId)));
  }, [draft.selectedCharIds, charactersAll]);

  const placesForDraft = useMemo(() => {
    // adapter ожидает “Kanonar entities”; оставляем оригинальные entities
    return selectedPlaces;
  }, [selectedPlaces]);

  const charsForDraft = useMemo(() => {
    return selectedChars;
  }, [selectedChars]);

  // Синхронизируем удобные поля для PlacementMapEditor
  useEffect(() => {
    setDraft((d) => ({
      ...d,
      characters: charsForDraft.map((c: any) => ({
        id: String(c.entityId),
        title: c.title ?? c.name ?? c.entityId,
        name: c.name ?? c.title ?? c.entityId,
      })),
      places: placesForDraft.map((p: any) => ({
        id: String(p.entityId),
        entityId: String(p.entityId),
        title: p.title ?? p.name ?? p.entityId,
        map: (p as any).map ?? (p as any).place?.map ?? null,
        nav: (p as any).nav ?? null,
      })),
    }));
  }, [charsForDraft, placesForDraft]);

  const currentRecord = useMemo(() => {
    if (!history.length) return null;
    const i = Math.max(0, Math.min(history.length - 1, currentTickIndex));
    return history[i];
  }, [history, currentTickIndex]);

  const currentSnapshot = useMemo(() => {
    return mode === 'run'
      ? (currentRecord?.snapshot as any) ?? snapshot
      : snapshot;
  }, [mode, currentRecord, snapshot]);

  const placesIndex = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of draft.places || []) {
      const id = String(p?.entityId ?? p?.id ?? '');
      if (id) m.set(id, p);
    }
    return m;
  }, [draft.places]);

  useEffect(() => {
    const sel = draft.selectedLocIds.map(String);
    if (!sel.length) return;
    if (!sel.includes(String(viewLocId))) {
      setViewLocId(String(sel[0]));
    }
  }, [draft.selectedLocIds, viewLocId]);

  useEffect(() => {
    const sel = draft.selectedCharIds.map(String);
    if (!sel.length) return;
    if (!sel.includes(String(viewActorId))) {
      setViewActorId(String(sel[0]));
    }
  }, [draft.selectedCharIds, viewActorId]);

  const selectedPlaceForEditor = useMemo(() => {
    // PlacementMapEditor рисует одну place за раз — берём первую выбранную
    const p = placesForDraft?.[0];
    if (!p) return null;
    return {
      id: String(p.entityId),
      entityId: String(p.entityId),
      title: p.title ?? p.name ?? p.entityId,
      map: (p as any).map ?? (p as any).place?.map ?? null,
      nav: (p as any).nav ?? null,
    };
  }, [placesForDraft]);

  // --------- Helpers: validate setup ----------
  const setupProblems = useMemo(() => {
    const problems: string[] = [];
    if (!draft.selectedLocIds.length) problems.push('Нужна минимум 1 выбранная локация.');
    if (!draft.selectedCharIds.length) problems.push('Нужен минимум 1 выбранный персонаж.');
    const locSet = new Set(draft.selectedLocIds.map(String));
    for (const chId of draft.selectedCharIds) {
      const locId = draft.locPlacements[String(chId)];
      if (locId && !locSet.has(String(locId))) problems.push(`Персонаж ${chId}: locId=${locId} не выбрана.`);
      if (!locId && draft.selectedLocIds[0]) problems.push(`Персонаж ${chId}: не задана стартовая локация.`);
    }
    return problems;
  }, [draft]);

  // --------- Build/Rebuild sim from draft ----------
  function rebuildSimulatorFromDraft() {
    const selectedLocIds = draft.selectedLocIds.map(String);
    const selectedCharIds = draft.selectedCharIds.map(String);

    const world = makeSimWorldFromSelection({
      // важное: кидаем оригинальные entities, как было в старой архитектуре
      locations: placesForDraft,
      characters: charsForDraft,
      selectedLocIds,
      selectedCharIds,
      locPlacements: draft.locPlacements,
      placements: draft.placements,
      hazardPoints: draft.hazardPoints,
      // ctx: атомы среды
      envFacts: draft.envFacts,
      // если адаптер поддерживает — пусть возьмёт
    } as any);

    // гарантия: registry всегда массив, даже если пропы/контекст не заполнены
    const registrySafe = Array.isArray(orchestratorRegistry)
      ? orchestratorRegistry
      : Array.isArray((sandboxState as any)?.orchestratorRegistry)
        ? (sandboxState as any).orchestratorRegistry
        : [];

    const orchestratorPlugin = makeOrchestratorPlugin({
      registry: registrySafe,
      onPushToGoalLab,
    } as any);

    const pipelinePlugin = makeGoalLabPipelinePlugin();

    const sim = new SimKitSimulator({
      scenarioId: basicScenarioId,
      seed: 1337,
      initialWorld: world ?? makeBasicWorld(),
      plugins: [orchestratorPlugin, pipelinePlugin],
      maxRecords: 500,
    });

    simRef.current = sim;
    setHistory([]);
    setCurrentTickIndex(0);

    const snap = sim.getPreviewSnapshot();
    setSnapshot(snap as any);
  }

  useEffect(() => {
    // первичный симулятор (чтобы SimMapView не был пустым)
    if (!simRef.current) rebuildSimulatorFromDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------- Run controls ----------
  const stepOnce = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    const rec = sim.step();
    const snap = rec.snapshot as any;
    setSnapshot(snap);
    setHistory((prev) => {
      const next = [...prev, rec];
      // всегда держим UI на "сейчас" (если тебе надо иначе — добавим lock-scroll флаг)
      setCurrentTickIndex(next.length - 1);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => stepOnce(), Math.max(20, tickMs));
    return () => window.clearInterval(id);
  }, [isRunning, tickMs, stepOnce]);

  function startRun() {
    if (setupProblems.length) return;
    setMode('run');
    setIsRunning(true);
    // делаем 1 тик сразу, чтобы история появилась
    stepOnce();
  }

  function stopRun() {
    setIsRunning(false);
  }

  // --------- Manual move: важно — через sim.enqueueAction ----------
  function onManualMove(actorId: string, targetLocId: string) {
    const sim = simRef.current;
    if (!sim) return;
    sim.enqueueAction({
      id: `forced:move:${Date.now()}:${actorId}`,
      kind: 'move',
      actorId,
      targetId: targetLocId,
    } as any);
    // следующий тик применит
    stepOnce();
  }

  function onManualMoveXY(actorId: string, locId: string, x: number, y: number) {
    const sim = simRef.current;
    if (!sim) return;
    sim.enqueueAction({
      id: `forced:move_xy:${Date.now()}:${actorId}`,
      kind: 'move_xy',
      actorId,
      payload: { locationId: locId, x, y },
    } as any);
    stepOnce();
  }

  // --------- UI: selection toggles ----------
  function toggleLoc(id: string) {
    setDraft((d) => {
      const s = new Set(d.selectedLocIds.map(String));
      if (s.has(id)) s.delete(id);
      else s.add(id);
      const nextLocIds = Array.from(s);
      // нормализуем placements char->loc
      const fallback = nextLocIds[0] ?? '';
      const nextLocPlacements = { ...d.locPlacements };
      for (const chId of d.selectedCharIds) {
        const cur = nextLocPlacements[String(chId)];
        if (!cur || !s.has(String(cur))) {
          if (fallback) nextLocPlacements[String(chId)] = fallback;
        }
      }
      // placements: если locationId выпал — перекинем на fallback
      const nextPlacements = (d.placements || []).map((p) =>
        s.has(String(p.locationId)) ? p : fallback ? { ...p, locationId: fallback } : p
      );

      return { ...d, selectedLocIds: nextLocIds, locPlacements: nextLocPlacements, placements: nextPlacements };
    });
  }

  function toggleChar(id: string) {
    setDraft((d) => {
      const s = new Set(d.selectedCharIds.map(String));
      if (s.has(id)) s.delete(id);
      else s.add(id);
      const nextCharIds = Array.from(s);
      const fallbackLoc = d.selectedLocIds[0] ?? '';
      const nextLocPlacements = { ...d.locPlacements };
      for (const chId of nextCharIds) {
        if (!nextLocPlacements[String(chId)] && fallbackLoc) nextLocPlacements[String(chId)] = fallbackLoc;
      }
      // чистим locPlacements для удалённых
      for (const k of Object.keys(nextLocPlacements)) {
        if (!nextCharIds.includes(String(k))) delete nextLocPlacements[k];
      }
      // чистим placements для удалённых
      const nextPlacements = (d.placements || []).filter((p) => nextCharIds.includes(String(p.characterId)));
      return { ...d, selectedCharIds: nextCharIds, locPlacements: nextLocPlacements, placements: nextPlacements };
    });
  }

  // --------- Export ----------
  function exportSession() {
    const sim = simRef.current;
    if (!sim) return;
    const payload = buildExport(sim);
    jsonDownload(`simkit_session_${Date.now()}.json`, payload);
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'map', label: 'Map' },
    { id: 'summary', label: 'Summary' },
    { id: 'narrative', label: 'Narrative' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'orchestrator', label: 'Orchestrator' },
    { id: 'json', label: 'JSON' },
  ];

  return (
    <div className="h-screen bg-[#020617] text-slate-300 flex flex-col font-mono overflow-hidden p-1 gap-1">
      {/* HEADER */}
      <header className="h-12 bg-slate-900/80 border border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest">KANONAR_SimKit</span>
            <span className="text-[11px] text-slate-400">{mode === 'setup' ? 'SETUP' : `RUN • ticks=${history.length}`}</span>
          </div>

          <div className="flex bg-black/40 p-0.5 rounded border border-slate-800">
            <button
              className={cx(
                'px-4 py-1 text-[10px] rounded transition font-bold uppercase',
                mode === 'setup' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              )}
              onClick={() => {
                setMode('setup');
                setIsRunning(false);
              }}
            >
              Setup
            </button>
            <button
              className={cx(
                'px-4 py-1 text-[10px] rounded transition font-bold uppercase',
                mode === 'run' ? 'bg-emerald-600/20 text-emerald-300' : 'text-slate-400 hover:text-white'
              )}
              onClick={() => startRun()}
              disabled={!!setupProblems.length}
              title={setupProblems.length ? setupProblems.join('\n') : 'Start'}
            >
              Run
            </button>
          </div>

          <button
            className="px-3 py-1 text-[10px] rounded border border-slate-800 bg-black/40 hover:bg-black/60 transition"
            onClick={() => {
              rebuildSimulatorFromDraft();
              setMode('setup');
              setIsRunning(false);
            }}
            title="Пересобрать мир из Setup"
          >
            Apply Setup
          </button>

          <button
            className="px-3 py-1 text-[10px] rounded border border-slate-800 bg-black/40 hover:bg-black/60 transition"
            onClick={exportSession}
            title="Экспорт всей сессии в JSON"
          >
            Export JSON
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-2 py-1 rounded border border-slate-800 bg-black/30">
            <span className="text-[10px] text-slate-500">Speed</span>
            <select
              className="bg-black/40 border border-slate-800 text-[10px] px-2 py-1 rounded outline-none focus:border-cyan-500"
              value={tickMs}
              onChange={(e) => setTickMs(Number(e.target.value))}
              title="Tick interval"
            >
              <option value={1000}>Slow (1s)</option>
              <option value={500}>0.5s</option>
              <option value={250}>Normal (250ms)</option>
              <option value={120}>Fast (120ms)</option>
              <option value={60}>Very fast (60ms)</option>
            </select>
          </div>
          <button
            className="px-3 py-1 text-[10px] rounded bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15 transition"
            onClick={() => stepOnce()}
          >
            NEXT_TICK
          </button>
          <button
            className={cx(
              'px-3 py-1 text-[10px] rounded transition',
              isRunning ? 'bg-red-500/10 text-red-300 hover:bg-red-500/15' : 'bg-slate-800/40 text-slate-400 hover:text-white'
            )}
            onClick={() => (isRunning ? stopRun() : startRun())}
            disabled={!!setupProblems.length}
          >
            {isRunning ? 'STOP' : 'START'}
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-1 overflow-hidden">
        {/* LEFT: always-on map + placement */}
        <aside className="col-span-3 bg-[#020617] border border-slate-800 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-800 bg-slate-900/30 flex items-center gap-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">Map</div>
            <select
              className="canon-input text-[11px] py-1 ml-auto"
              value={viewLocId}
              onChange={(e) => setViewLocId(e.target.value)}
            >
              {draft.selectedLocIds.map((id) => (
                <option key={String(id)} value={String(id)}>
                  {placesIndex.get(String(id))?.title ?? String(id)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-hidden p-2">
            {mode === 'setup' ? (
              <PlacementMiniMap
                draft={draft}
                setDraft={setDraft}
                place={placesIndex.get(String(viewLocId)) ?? (draft.places?.[0] ?? null)}
                actorIds={draft.selectedCharIds.map(String)}
                title="Placement"
              />
            ) : (
              <div className="h-full canon-card p-2 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Actors</div>
                  <select
                    className="canon-input text-[11px] py-1 ml-auto"
                    value={viewActorId}
                    onChange={(e) => setViewActorId(e.target.value)}
                  >
                    {draft.selectedCharIds.map((id) => {
                      const ch = draft.characters.find((c: any) => String(c.id) === String(id));
                      const title = ch?.title ?? ch?.name ?? String(id);
                      return (
                        <option key={String(id)} value={String(id)}>
                          {title}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {(() => {
                  const place = placesIndex.get(String(viewLocId)) ?? null;
                  const map = (place as any)?.map ?? null;
                  const chars = (currentSnapshot as any)?.characters ?? [];
                  const inLoc = chars.filter((c: any) => String(c.locId) === String(viewLocId));
                  const markers = inLoc
                    .filter((c: any) => Number.isFinite(c?.pos?.x) && Number.isFinite(c?.pos?.y))
                    .map((c: any) => {
                      const id = String(c.id);
                      const ch = draft.characters.find((x: any) => String(x.id) === id);
                      const title = ch?.title ?? ch?.name ?? id;
                      return {
                        x: Math.round(Number(c.pos.x)),
                        y: Math.round(Number(c.pos.y)),
                        label: initialsForTitle(title),
                        title,
                        color: colorForId(id),
                        size: id === String(viewActorId) ? 0.86 : 0.72,
                      };
                    });

                  if (!map) {
                    return <div className="text-[11px] text-slate-400">No place.map for this location.</div>;
                  }

                  return (
                    <LocationVectorMap
                      map={map}
                      showGrid
                      scale={28}
                      hideTextVisuals
                      markers={markers}
                      onCellClick={(x, y) => onManualMoveXY(String(viewActorId), String(viewLocId), x, y)}
                    />
                  );
                })()}
              </div>
            )}
          </div>
        </aside>

        {/* MAIN */}
        <section className="col-span-5 bg-[#020617] border border-slate-800 overflow-hidden">
            {mode === 'setup' ? (
              <div className="h-full flex flex-col overflow-hidden">
                <div className="h-10 border-b border-slate-800 bg-slate-900/30 flex items-center px-4 gap-3">
                  {(['loc', 'entities', 'env'] as SetupStage[]).map((s) => (
                    <button
                      key={s}
                      className={cx(
                        'text-[10px] uppercase font-bold tracking-widest transition',
                        setupStage === s ? 'text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                      )}
                      onClick={() => setSetupStage(s)}
                    >
                      {s === 'loc' ? 'Setup_Location' : s === 'entities' ? 'Populate_World' : 'Environment_Facts'}
                    </button>
                  ))}

                  <div className="grow" />

                  {setupProblems.length ? (
                    <div className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                      {setupProblems[0]}
                      {setupProblems.length > 1 ? ` (+${setupProblems.length - 1})` : ''}
                    </div>
                  ) : (
                    <div className="text-[10px] text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                      Setup OK
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-hidden">
                  {setupStage === 'loc' && (
                    <div className="h-full p-4 overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-3 gap-3">
                        {locations.map((l: any) => {
                          const id = String(l.entityId);
                          const sel = draft.selectedLocIds.map(String).includes(id);
                          return (
                            <button
                              key={id}
                              onClick={() => toggleLoc(id)}
                              className={cx(
                                'text-left p-3 border rounded transition',
                                sel
                                  ? 'border-cyan-500/80 bg-cyan-500/10'
                                  : 'border-slate-800 bg-slate-900/30 hover:border-cyan-500/40'
                              )}
                            >
                              <div className="text-[10px] text-slate-500">LOCATION_ID</div>
                              <div className="text-sm font-bold text-white mt-1">{l.title ?? l.name ?? id}</div>
                              <div className="text-[10px] mt-2 uppercase font-black text-cyan-300">
                                {sel ? 'Selected' : 'Select'}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 border-t border-slate-800 pt-4">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Preview</div>
                        {selectedPlaces[0] ? (
                          <LocationMapView
                            location={{
                              id: String(selectedPlaces[0].entityId),
                              title: selectedPlaces[0].title ?? selectedPlaces[0].name ?? selectedPlaces[0].entityId,
                              map: (selectedPlaces[0] as any).map,
                              nav: (selectedPlaces[0] as any).nav,
                            }}
                            characters={[]}
                          />
                        ) : (
                          <div className="text-xs opacity-70">Выбери локацию.</div>
                        )}
                      </div>
                    </div>
                  )}

                  {setupStage === 'entities' && (
                    <div className="h-full p-4 overflow-y-auto custom-scrollbar">
                      {!selectedPlaceForEditor ? (
                        <div className="text-xs opacity-70">Нет выбранной локации (Setup_Location).</div>
                      ) : (
                        <PlacementMapEditor
                          draft={draft}
                          setDraft={setDraft}
                          place={selectedPlaceForEditor}
                          actorIds={draft.selectedCharIds.map(String)}
                        />
                      )}
                    </div>
                  )}

                  {setupStage === 'env' && (
                    <div className="h-full p-4 overflow-y-auto custom-scrollbar">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-3">
                        Environment_Facts (ctx:*)
                      </div>

                      <input
                        className="w-full bg-black/40 border border-slate-800 p-2 text-[11px] rounded outline-none focus:border-cyan-500"
                        placeholder="Add ctx atom, e.g. ctx:noise:0.7"
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          const v = e.currentTarget.value.trim();
                          if (!v) return;
                          setDraft((d) => ({ ...d, envFacts: uniq([...(d.envFacts || []), v]) }));
                          e.currentTarget.value = '';
                        }}
                      />

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(draft.envFacts || []).map((f) => (
                          <button
                            key={f}
                            className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-300 hover:bg-slate-700 transition"
                            title="Click to remove"
                            onClick={() => setDraft((d) => ({ ...d, envFacts: (d.envFacts || []).filter((x) => x !== f) }))}
                          >
                            {f} <span className="opacity-70">×</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col overflow-hidden">
                {/* RUN tabs */}
                <nav className="h-10 bg-slate-900/30 border-b border-slate-800 flex overflow-x-auto no-scrollbar shrink-0">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={cx(
                        'px-4 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest border-r border-slate-800/50 transition',
                        activeTab === t.id
                          ? 'bg-slate-800 text-white shadow-[inset_0_-2px_0_#06b6d4]'
                          : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>

                <div className="flex-1 overflow-hidden p-3">
                  {activeTab === 'map' && (
                    <div className="h-full">
                      {/* КРИТИЧНО: SimMapView требует sim + snapshot */}
                      {simRef.current && currentSnapshot ? (
                        <SimMapView sim={simRef.current} snapshot={currentSnapshot as any} onMove={onManualMove} />
                      ) : (
                        <div className="text-xs opacity-70">Нет sim/snapshot. Нажми Apply Setup и сделай NEXT_TICK.</div>
                      )}
                    </div>
                  )}

                  {activeTab === 'summary' && (
                    <div className="h-full overflow-y-auto custom-scrollbar text-[11px]">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Tick summary</div>
                      <pre className="bg-black/40 border border-slate-800 rounded p-3 overflow-auto">
{JSON.stringify(
  {
    tick: currentRecord?.snapshot?.tickIndex ?? null,
    actionsApplied: currentRecord?.trace?.actionsApplied ?? [],
    eventsApplied: currentRecord?.trace?.eventsApplied ?? [],
    notes: currentRecord?.trace?.notes ?? [],
  },
  null,
  2
)}
                      </pre>
                    </div>
                  )}

                  {activeTab === 'narrative' && (
                    <div className="h-full overflow-y-auto custom-scrollbar text-[11px]">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Narrative</div>
                      <pre className="bg-black/40 border border-slate-800 rounded p-3 overflow-auto">
{String((currentRecord as any)?.plugins?.narrative?.text ?? (currentRecord as any)?.trace?.notes?.join('\n') ?? '')}
                      </pre>
                    </div>
                  )}

                  {activeTab === 'pipeline' && (
                    <div className="h-full overflow-y-auto custom-scrollbar text-[11px]">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">GoalLab pipeline snapshot</div>
                      {(() => {
                        const raw = (currentRecord as any)?.plugins?.goalLabPipeline?.snapshot ?? null;
                        const short = compactJson(raw, { maxDepth: 5, maxKeys: 60, maxArray: 40, maxStr: 600 });
                        return (
                          <details open className="bg-black/40 border border-slate-800 rounded">
                            <summary className="px-3 py-2 cursor-pointer text-[10px] uppercase font-bold text-slate-400">
                              Short view
                            </summary>
                            <pre className="p-3 overflow-auto">{JSON.stringify(short, null, 2)}</pre>
                            <details className="border-t border-slate-800">
                              <summary className="px-3 py-2 cursor-pointer text-[10px] uppercase font-bold text-slate-400">
                                Raw (full)
                              </summary>
                              <div className="px-3 pb-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <button
                                    className="px-2 py-1 text-[10px] rounded border border-slate-700 bg-slate-900/40 hover:bg-slate-900/60"
                                    onClick={() => jsonDownload(`pipeline_tick_${pad4(currentTickIndex)}.json`, raw)}
                                  >
                                    Download
                                  </button>
                                </div>
                                <pre className="max-h-[420px] overflow-auto">{JSON.stringify(raw, null, 2)}</pre>
                              </div>
                            </details>
                          </details>
                        );
                      })()}
                    </div>
                  )}

                  {activeTab === 'orchestrator' && (
                    <div className="h-full overflow-y-auto custom-scrollbar text-[11px]">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Orchestrator snapshot</div>
                      {(() => {
                        const raw = (currentRecord as any)?.plugins?.orchestrator?.snapshot ?? null;
                        const short = compactJson(raw, { maxDepth: 5, maxKeys: 60, maxArray: 40, maxStr: 600 });
                        return (
                          <details open className="bg-black/40 border border-slate-800 rounded">
                            <summary className="px-3 py-2 cursor-pointer text-[10px] uppercase font-bold text-slate-400">
                              Short view
                            </summary>
                            <pre className="p-3 overflow-auto">{JSON.stringify(short, null, 2)}</pre>
                            <details className="border-t border-slate-800">
                              <summary className="px-3 py-2 cursor-pointer text-[10px] uppercase font-bold text-slate-400">
                                Raw (full)
                              </summary>
                              <div className="px-3 pb-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <button
                                    className="px-2 py-1 text-[10px] rounded border border-slate-700 bg-slate-900/40 hover:bg-slate-900/60"
                                    onClick={() => jsonDownload(`orchestrator_tick_${pad4(currentTickIndex)}.json`, raw)}
                                  >
                                    Download
                                  </button>
                                </div>
                                <pre className="max-h-[420px] overflow-auto">{JSON.stringify(raw, null, 2)}</pre>
                              </div>
                            </details>
                          </details>
                        );
                      })()}
                    </div>
                  )}

                  {activeTab === 'json' && (
                    <div className="h-full overflow-y-auto custom-scrollbar text-[11px]">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Full tick record</div>
                      {(() => {
                        const raw = currentRecord ?? null;
                        const short = compactJson(raw, { maxDepth: 5, maxKeys: 80, maxArray: 50, maxStr: 600 });
                        return (
                          <details open className="bg-black/40 border border-slate-800 rounded">
                            <summary className="px-3 py-2 cursor-pointer text-[10px] uppercase font-bold text-slate-400">
                              Short view
                            </summary>
                            <pre className="p-3 overflow-auto">{JSON.stringify(short, null, 2)}</pre>
                            <details className="border-t border-slate-800">
                              <summary className="px-3 py-2 cursor-pointer text-[10px] uppercase font-bold text-slate-400">
                                Raw (full)
                              </summary>
                              <div className="px-3 pb-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <button
                                    className="px-2 py-1 text-[10px] rounded border border-slate-700 bg-slate-900/40 hover:bg-slate-900/60"
                                    onClick={() => jsonDownload(`record_tick_${pad4(currentTickIndex)}.json`, raw)}
                                  >
                                    Download
                                  </button>
                                </div>
                                <pre className="max-h-[420px] overflow-auto">{JSON.stringify(raw, null, 2)}</pre>
                              </div>
                            </details>
                          </details>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
        </section>

        {/* RIGHT: Characters + History */}
        <aside className="col-span-4 flex flex-col gap-1 overflow-hidden">
          {/* Characters selection */}
          <div className="flex-1 bg-slate-900/20 border border-slate-800 flex flex-col overflow-hidden">
            <div className="p-3 bg-slate-900/40 border-b border-slate-800 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
              Characters (select for scene)
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {charactersAll.map((c: any) => {
                const id = String(c.entityId);
                const sel = draft.selectedCharIds.map(String).includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleChar(id)}
                    className={cx(
                      'w-full text-left p-2 border rounded transition flex items-center justify-between gap-2',
                      sel
                        ? 'border-cyan-500/70 bg-cyan-500/10'
                        : 'border-slate-800 bg-black/30 hover:border-cyan-500/30'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-white font-bold truncate">{c.title ?? c.name ?? id}</div>
                      <div className="text-[9px] text-slate-500 truncate">{id}</div>
                    </div>
                    <div className={cx('text-[10px] font-bold uppercase', sel ? 'text-cyan-300' : 'text-slate-500')}>
                      {sel ? 'IN' : 'ADD'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* History rail */}
          <div className="h-64 bg-slate-950 border border-slate-800 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase">
              History_Log
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {history.length === 0 ? (
                <div className="p-4 text-[10px] text-slate-600 italic leading-relaxed">
                  Пока пусто. Нажми NEXT_TICK.
                </div>
              ) : (
                history.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentTickIndex(i)}
                    className={cx(
                      'w-full text-left px-4 py-2 border-b border-slate-900 text-[11px] transition',
                      currentTickIndex === i
                        ? 'bg-cyan-500/10 text-cyan-300 border-l-2 border-l-cyan-500'
                        : 'hover:bg-slate-900 text-slate-500'
                    )}
                  >
                    TICK_{pad4(i)}
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer className="h-6 bg-slate-900 border border-slate-800 flex items-center justify-between px-4 text-[9px] text-slate-500 font-bold tracking-widest uppercase shrink-0">
        <div className="flex gap-6">
          <span className="flex items-center gap-1">● {mode === 'setup' ? 'SETUP' : isRunning ? 'SIM_RUNNING' : 'SIM_IDLE'}</span>
          <span>locs={draft.selectedLocIds.length} chars={draft.selectedCharIds.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>ticks={history.length}</span>
        </div>
      </footer>
    </div>
  );
};
