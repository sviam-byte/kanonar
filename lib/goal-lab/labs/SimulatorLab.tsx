// lib/goal-lab/labs/SimulatorLab.tsx
// Friendly Simulator Lab UI for SimKit (session runner + debug) + GoalLab Pipeline view.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProducerSpec } from '../../orchestrator/types';
import { SimKitSimulator } from '../../simkit/core/simulator';
import { buildExport } from '../../simkit/core/export';
import { buildSnapshot } from '../../simkit/core/world';
import { basicScenarioId, makeBasicWorld } from '../../simkit/scenarios/basicScenario';
import { makeOrchestratorPlugin } from '../../simkit/plugins/orchestratorPlugin';
import { makeGoalLabPipelinePlugin } from '../../simkit/plugins/goalLabPipelinePlugin';
import { makeSimWorldFromSelection } from '../../simkit/adapters/fromKanonarEntities';
import { SimMapView } from '../../../components/SimMapView';
import { LocationMapView } from '../../../components/LocationMapView';
import { PlacementMapEditor } from '../../../components/ScenarioSetup/PlacementMapEditor';
import { LivePlacementMiniMap } from '../../../components/ScenarioSetup/LivePlacementMiniMap';
import { importLocationFromGoalLab } from '../../simkit/locations/goallabImport';
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

type TabId =
  | 'setup'
  | 'summary'
  | 'narrative'
  | 'world'
  | 'actions'
  | 'events'
  | 'pipeline'
  | 'orchestrator'
  | 'map'
  | 'json';

type SetupDraft = {
  selectedLocIds: string[];
  selectedCharIds: string[];
  locPlacements: Record<string, string>;
  placements: Array<{
    characterId: string;
    locationId: string;
    nodeId: string | null;
    x?: number;
    y?: number;
  }>;
  locationSpecs: any[];
  hazardPoints: Array<any>;
};

function normalizePlacements(args: { draft: SetupDraft; nextLocIds?: string[]; nextCharIds?: string[] }) {
  const selectedLocIds = args.nextLocIds ?? args.draft.selectedLocIds;
  const selectedCharIds = args.nextCharIds ?? args.draft.selectedCharIds;

  const locSet = new Set(selectedLocIds);
  const nextLocPlacements: Record<string, string> = { ...args.draft.locPlacements };

  for (const id of Object.keys(nextLocPlacements)) {
    if (!selectedCharIds.includes(id)) delete nextLocPlacements[id];
  }

  const fallbackLocId = selectedLocIds[0];
  if (fallbackLocId) {
    for (const id of selectedCharIds) {
      const locId = nextLocPlacements[id];
      if (!locSet.has(locId)) nextLocPlacements[id] = fallbackLocId;
    }
  }

  const nextNodePlacements = (args.draft.placements || [])
    .filter((p) => selectedCharIds.includes(p.characterId))
    .map((p) => {
      if (!locSet.has(p.locationId)) {
        return fallbackLocId ? { ...p, locationId: fallbackLocId } : p;
      }
      return p;
    });

  return {
    selectedLocIds,
    selectedCharIds,
    locPlacements: nextLocPlacements,
    placements: nextNodePlacements,
    locationSpecs: args.draft.locationSpecs || [],
  };
}

function validateDraft(d: SetupDraft) {
  const problems: string[] = [];
  if (!d.selectedLocIds.length) problems.push('Нужна минимум 1 выбранная локация.');
  if (!d.selectedCharIds.length) problems.push('Нужен минимум 1 выбранный персонаж.');

  const locSet = new Set(d.selectedLocIds);
  for (const [chId, locId] of Object.entries(d.locPlacements)) {
    if (!d.selectedCharIds.includes(chId)) continue;
    if (!locSet.has(locId)) problems.push(`Персонаж ${chId}: стартовая locId=${locId} не выбрана.`);
  }
  for (const p of d.placements || []) {
    if (!d.selectedCharIds.includes(p.characterId)) continue;
    if (!locSet.has(p.locationId)) {
      problems.push(`Персонаж ${p.characterId}: placement locationId=${p.locationId} не выбрана.`);
    }
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

function toFixed2(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v.toFixed(2) : 'NaN';
}

function buildNameIndex(snapshot: any) {
  const m = new Map<string, string>();
  for (const c of snapshot?.characters || []) m.set(String(c.id), String(c.name || c?.entity?.title || c.id));
  for (const l of snapshot?.locations || []) m.set(String(l.id), String(l.name || l?.entity?.title || l.id));
  return m;
}

function buildAtomIndex(orchestratorSnapshot: any) {
  const m = new Map<string, any>();
  const atoms = orchestratorSnapshot?.atoms || [];
  for (const a of atoms) m.set(String(a?.id), a);
  return m;
}

function formatReasons(chosen: any, atomById: Map<string, any>) {
  const explicit = typeof chosen?.reason === 'string' ? chosen.reason.trim() : '';
  const used = Array.isArray(chosen?.usedAtomIds) ? chosen.usedAtomIds.map(String) : [];

  const hits = used.map((id) => atomById.get(id)).filter(Boolean);

  const top = hits.slice(0, 3).map((a: any) => {
    const label = String(a?.label || a?.id || 'atom');
    const mag = toFixed2(a?.magnitude);
    return `${label}=${mag}`;
  });

  if (explicit && top.length) return `${explicit}; ${top.join(', ')}${hits.length > 3 ? ` …(+${hits.length - 3})` : ''}`;
  if (explicit) return explicit;
  if (top.length) return `${top.join(', ')}${hits.length > 3 ? ` …(+${hits.length - 3})` : ''}`;
  return '';
}

function formatOutcomeForActor(record: any, actorId: string) {
  const d = (record?.trace?.deltas?.chars || []).find((x: any) => String(x?.id) === String(actorId));
  if (!d?.before || !d?.after) return '';

  const parts: string[] = [];

  const bLoc = d.before.locId;
  const aLoc = d.after.locId;
  if (bLoc != null && aLoc != null && String(bLoc) !== String(aLoc)) parts.push(`loc: ${String(bLoc)}→${String(aLoc)}`);

  for (const k of ['stress', 'energy', 'health']) {
    const b = Number(d.before[k]);
    const a = Number(d.after[k]);
    if (!Number.isFinite(b) || !Number.isFinite(a)) continue;
    const dx = a - b;
    if (Math.abs(dx) < 1e-6) continue;
    const sign = dx >= 0 ? '+' : '';
    parts.push(`Δ${k}=${sign}${dx.toFixed(2)}`);
  }

  // Small bonus: count non-action events as consequences.
  const ev = (record?.trace?.eventsApplied || []).filter((e: any) => {
    const t = String(e?.type || '');
    const aid = String(e?.payload?.actorId || '');
    return aid === String(actorId) && !t.startsWith('action:');
  });

  if (ev.length) parts.push(`events(+${ev.length})`);

  return parts.join(' ');
}

function buildNarrativeLinesForRecord(record: any) {
  const tick = record?.snapshot?.tickIndex ?? -1;

  const nameById = buildNameIndex(record?.snapshot);
  const orchestratorSnapshot = record?.plugins?.orchestrator?.snapshot || null;
  const atomById = buildAtomIndex(orchestratorSnapshot);
  const perActor = record?.plugins?.orchestratorDecision?.perActor || {};

  const lines: string[] = [];
  const actions = record?.trace?.actionsApplied || [];

  for (const a of actions) {
    const actorId = String(a?.actorId || '');
    const targetId = a?.targetId != null ? String(a.targetId) : '';
    const actorName = nameById.get(actorId) || actorId;
    const targetName = targetId ? nameById.get(targetId) || targetId : '';

    const chosen = perActor?.[actorId]?.chosen || null;
    const reasons = formatReasons(chosen, atomById);
    const outcome = formatOutcomeForActor(record, actorId);

    const scorePart =
      chosen && Number.isFinite(Number(chosen.score))
        ? ` (score=${Number(chosen.score).toFixed(3)}${Number.isFinite(Number(chosen.prob)) ? ` p=${Number(chosen.prob).toFixed(2)}` : ''})`
        : '';

    const tgt = targetName ? ` → ${targetName}` : '';
    const why = reasons ? ` потому что ${reasons}` : '';
    const got = outcome ? ` и получил ${outcome}` : '';

    lines.push(`tick ${tick} · ${actorName}: ${String(a?.kind || 'action')}${tgt}${scorePart}${why}${got}`);
  }

  return lines;
}

// Normalize lists of ids to stable, trimmed string arrays for comparisons and display.
function normalizeIdList(xs: Array<string | number | null | undefined>) {
  return xs.map((x) => String(x || '').trim()).filter(Boolean).sort();
}

// Compare two lists as sets (order-insensitive).
function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const aSorted = normalizeIdList(a);
  const bSorted = normalizeIdList(b);
  return aSorted.every((id, i) => id === bSorted[i]);
}

export function SimulatorLab({ orchestratorRegistry, onPushToGoalLab }: Props) {
  const simRef = useRef<SimKitSimulator | null>(null);
  const narrativeScrollRef = useRef<HTMLDivElement | null>(null);
  // Center column viewer (always live): narrative vs raw JSON log.
  const [centerMode, setCenterMode] = useState<'narrative' | 'json'>('narrative');

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
  // Orchestrator high-level debug viewer.
  const [dbgFrameTickId, setDbgFrameTickId] = useState<string>('');
  const [dbgStageId, setDbgStageId] = useState<'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6'>('S0');
  const [offersActorFilter, setOffersActorFilter] = useState<string>(''); // substring
  const [offersKeyFilter, setOffersKeyFilter] = useState<string>(''); // substring
  const [offersBlockedByFilter, setOffersBlockedByFilter] = useState<string>(''); // substring over blockedBy[]
  const [offersOnlyRejected, setOffersOnlyRejected] = useState<boolean>(false);
  const [liveOn, setLiveOn] = useState(false);
  const [liveHz, setLiveHz] = useState(2); // ticks per second
  const [followLatest, setFollowLatest] = useState(true);
  const [mapLocId, setMapLocId] = useState<string>('');
  const [mapCharId, setMapCharId] = useState<string | null>(null);
  const [setupMapLocId, setSetupMapLocId] = useState<string>('');
  const [dockLocId, setDockLocId] = useState<string>('');

  const [setupDraft, setSetupDraft] = useState<SetupDraft>({
    selectedLocIds: [],
    selectedCharIds: [],
    locPlacements: {},
    placements: [],
    locationSpecs: [],
    hazardPoints: [],
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

  // If no ticks exist, default to the setup view.
  useEffect(() => {
    if ((simRef.current?.records?.length || 0) === 0) setTab('setup');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setupProblems = useMemo(() => validateDraft(setupDraft), [setupDraft]);

  const selectedLocations = useMemo(
    () => catalogLocations.filter((l) => setupDraft.selectedLocIds.includes(l.entityId)),
    [catalogLocations, setupDraft.selectedLocIds]
  );
  const selectedCharacters = useMemo(
    () => catalogCharacters.filter((c) => setupDraft.selectedCharIds.includes(c.entityId)),
    [catalogCharacters, setupDraft.selectedCharIds]
  );

  // PlacementMapEditor should render the SAME map that will be used by makeSimWorldFromSelection().
  // If a GoalLabLocationV1 spec is imported for this location, prefer its map/nav/features.
  const setupPlaceForEditor = useMemo(() => {
    const base = selectedLocations.find((loc: any) => loc.entityId === setupMapLocId) ?? null;
    if (!base) return null;
    const spec = (setupDraft.locationSpecs || []).find((s: any) => String(s?.id) === String(setupMapLocId));
    if (!spec) return base;
    const imported = importLocationFromGoalLab(spec as any);
    return {
      ...base,
      map: imported.map ?? (base as any).map ?? null,
      nav: imported.nav ?? (base as any).nav,
      features: imported.features ?? (base as any).features,
      hazards: { ...(((base as any).hazards as any) || {}), ...(imported.hazards || {}) },
    };
  }, [selectedLocations, setupMapLocId, setupDraft.locationSpecs]);

  const curIdx = selected >= 0 ? selected : records.length - 1;
  const cur = curIdx >= 0 ? records[curIdx] : null;
  const inboxDebug = useMemo(() => {
    const tick = cur?.snapshot?.tickIndex;
    if (tick == null) return null;
    const key = `debug:inbox:${tick}`;
    return (cur?.trace?.deltas?.facts as any)?.[key]?.after ?? null;
  }, [cur]);

  useEffect(() => {
    const locs = cur?.snapshot?.locations || [];
    if (!locs.length) return;
    const nextId = mapLocId && locs.some((l: any) => l.id === mapLocId)
      ? mapLocId
      : String(locs[0]?.id || '');
    if (nextId && nextId !== mapLocId) setMapLocId(nextId);
  }, [cur, mapLocId]);

  useEffect(() => {
    const locs = setupDraft.selectedLocIds || [];
    if (!locs.length) return;
    const nextId = setupMapLocId && locs.includes(setupMapLocId)
      ? setupMapLocId
      : String(locs[0] || '');
    if (nextId && nextId !== setupMapLocId) setSetupMapLocId(nextId);
  }, [setupDraft.selectedLocIds, setupMapLocId]);

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
  }, [version, records]);

  const narrativeLines = useMemo(() => {
    // Keep only the latest chunk to avoid DOM overload.
    const N = 200;
    const slice = records.slice(Math.max(0, records.length - N));
    const out: string[] = [];
    for (const r of slice) out.push(...buildNarrativeLinesForRecord(r));
    return out;
  }, [records, version]);

  useEffect(() => {
    // Center log follows latest tick if enabled.
    if (!followLatest) return;
    const el = narrativeScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [narrativeLines.length, followLatest, centerMode]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    const snapshotChars = cur?.snapshot?.characters ?? null;

    if (Array.isArray(snapshotChars)) {
      for (const ch of snapshotChars) {
        const id = String((ch as any)?.id ?? (ch as any)?.entityId ?? '');
        const name = String((ch as any)?.name ?? (ch as any)?.title ?? (ch as any)?.entity?.title ?? '');
        if (id && name) map.set(id, name);
      }
    } else {
      for (const [id, ch] of Object.entries(sim.world.characters || {})) {
        const name = String((ch as any)?.name ?? (ch as any)?.title ?? (ch as any)?.entity?.title ?? '');
        if (name) map.set(String(id), name);
      }
    }

    return map;
  }, [cur, sim, version]);

  const tickActionSummary = useMemo(() => {
    if (!cur?.trace?.actionsApplied?.length) return '';
    const xs = cur.trace.actionsApplied.map((a: any) => {
      const k = String(a?.kind ?? '');
      const actor = String(a?.actorId ?? '');
      const actorLabel = nameById.get(actor) ? `${nameById.get(actor)}<${actor}>` : actor;
      const t = a?.targetId ? `→${String(a.targetId)}` : '';
      return `${actorLabel}:${k}${t}`;
    });
    return xs.slice(0, 6).join(' | ') + (xs.length > 6 ? ` …(+${xs.length - 6})` : '');
  }, [cur, curIdx, nameById, version]);

  const orchestratorTrace = cur?.plugins?.orchestrator?.trace || null;
  const orchestratorSnapshot = cur?.plugins?.orchestrator?.snapshot || null;
  const orchestratorDecision = cur?.plugins?.orchestratorDecision || null;
  const orchestratorDebug = (cur as any)?.plugins?.orchestratorDebug || null;
  const orchestratorDebugFrame = (cur as any)?.plugins?.orchestratorDebugFrame || null;

  const pipelineOut = cur?.plugins?.goalLabPipeline || null;
  const pipeline = pipelineOut?.pipeline || null;
  const pipelineStages = pipeline?.stages || [];

  const dbgHistory = useMemo(() => {
    const xs = (orchestratorDebug?.history && Array.isArray(orchestratorDebug.history) ? orchestratorDebug.history : null) as
      | any[]
      | null;
    if (xs && xs.length) return xs;
    if (orchestratorDebugFrame) return [orchestratorDebugFrame];
    return [];
  }, [orchestratorDebug, orchestratorDebugFrame, curIdx, version]);

  const dbgCurrentFrame = useMemo(() => {
    if (!dbgHistory.length) return null;
    if (dbgFrameTickId) {
      const hit = dbgHistory.find((f: any) => String(f?.tickId ?? '') === String(dbgFrameTickId));
      if (hit) return hit;
    }
    // Default: newest.
    return dbgHistory[dbgHistory.length - 1];
  }, [dbgHistory, dbgFrameTickId]);

  const dbgStage = useMemo(() => {
    const f = dbgCurrentFrame;
    if (!f?.stages) return null;
    return (f.stages as any[]).find((s) => String(s?.id) === String(dbgStageId)) || null;
  }, [dbgCurrentFrame, dbgStageId]);

  const dbgS3 = useMemo(() => {
    const f = dbgCurrentFrame;
    if (!f?.stages) return null;
    return (f.stages as any[]).find((s) => String(s?.id) === 'S3') || null;
  }, [dbgCurrentFrame]);

  const offersPerActor = useMemo(() => {
    const raw = dbgS3?.data?.perActor;
    if (!raw || typeof raw !== 'object') return {};
    return raw as Record<string, any>;
  }, [dbgS3]);

  const filteredActorIds = useMemo(() => {
    const all = Object.keys(offersPerActor || {}).sort();
    const aF = offersActorFilter.trim().toLowerCase();
    if (!aF) return all;
    return all.filter((id) => id.toLowerCase().includes(aF));
  }, [offersPerActor, offersActorFilter]);

  function offerKeyOf(o: any): string {
    return String(o?.key ?? o?.possibilityId ?? o?.id ?? o?.kind ?? '');
  }

  function blockedByStr(o: any): string {
    const bb = (o as any)?.blockedBy;
    if (!Array.isArray(bb)) return '';
    return bb.map((x) => String(x)).join(',');
  }

  function offerPassesFilters(o: any): boolean {
    const kF = offersKeyFilter.trim().toLowerCase();
    const bF = offersBlockedByFilter.trim().toLowerCase();
    if (kF) {
      const k = offerKeyOf(o).toLowerCase();
      if (!k.includes(kF)) return false;
    }
    if (bF) {
      const bb = blockedByStr(o).toLowerCase();
      if (!bb.includes(bF)) return false;
    }
    return true;
  }

  async function copyJsonToClipboard(obj: any) {
    try {
      const txt = JSON.stringify(obj ?? null, null, 2);
      await navigator.clipboard.writeText(txt);
      // No toast system assumed; keep silent.
    } catch (e) {
      console.warn('copyJsonToClipboard failed', e);
    }
  }

  function downloadJsonFile(obj: any, filename: string) {
    try {
      const txt = JSON.stringify(obj ?? null, null, 2);
      const blob = new Blob([txt], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('downloadJsonFile failed', e);
    }
  }

  useEffect(() => {
    // Whenever we get a new history, default to newest tickId (stable).
    if (!dbgHistory.length) return;
    const newest = dbgHistory[dbgHistory.length - 1];
    const newestId = String(newest?.tickId ?? '');
    if (!dbgFrameTickId || !dbgHistory.some((f: any) => String(f?.tickId ?? '') === String(dbgFrameTickId))) {
      setDbgFrameTickId(newestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbgHistory.length, curIdx, version]);

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

  useEffect(() => {
    if (!liveOn) return;

    const hz = Math.max(0.25, Number(liveHz) || 1);
    const periodMs = Math.max(16, Math.round(1000 / hz));

    const t = window.setInterval(() => {
      try {
        sim.step();
        if (followLatest) setSelected(-1);
        setVersion((v) => v + 1);
      } catch (e) {
        console.warn('Live tick failed; stopping live mode', e);
        setLiveOn(false);
      }
    }, periodMs);

    return () => window.clearInterval(t);
    // simRef.current is stable; dependency is safe.
  }, [liveOn, liveHz, followLatest, sim]);

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
      placements: setupDraft.locPlacements,
      locationSpecs: setupDraft.locationSpecs,
      nodePlacements: setupDraft.placements,
      hazardPoints: setupDraft.hazardPoints,
    });
    // Persist active cast + temperature into world facts for the orchestrator.
    world.facts = world.facts || {};
    world.facts['sim:actors'] = Object.keys(world.characters || {}).sort();
    world.facts['sim:T'] = temperatureDraft;
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

  function pushManualMoveXY(actorId: string, x: number, y: number, locationId: string) {
    if (!actorId) return;
    sim.forcedActions.push({
      id: `ui:move_xy:${sim.world.tickIndex}:${actorId}:${Math.round(x)}:${Math.round(y)}`,
      kind: 'move_xy',
      actorId,
      payload: { x, y, locationId },
    } as any);
    setVersion((v) => v + 1);
  }

  // Temperature for action sampling in the orchestrator policy (T -> 0 = greedy).
  function updateTemperature(value: number) {
    const safeValue = Number.isFinite(value) ? value : 0;
    setTemperatureDraft(safeValue);
    sim.world.facts['sim:T'] = safeValue;
  }

  const worldCharIds = useMemo(() => normalizeIdList(Object.keys(sim.world.characters || {})), [sim, version]);
  const worldLocIds = useMemo(() => normalizeIdList(Object.keys(sim.world.locations || {})), [sim, version]);

  const worldCastIds = useMemo(() => {
    const raw = sim.world.facts?.['sim:actors'];
    if (Array.isArray(raw)) return normalizeIdList(raw);
    if (typeof raw === 'string') {
      return normalizeIdList(
        raw
          .split(',')
          .map((x) => String(x || '').trim())
          .filter(Boolean)
      );
    }
    return [];
  }, [sim, version]);

  const draftHasSelection = setupDraft.selectedLocIds.length > 0 || setupDraft.selectedCharIds.length > 0;
  const worldMatchesDraft = !draftHasSelection
    ? true
    : sameSet(worldCharIds, setupDraft.selectedCharIds) && sameSet(worldLocIds, setupDraft.selectedLocIds);

  const canSimulate = !draftHasSelection ? true : setupProblems.length === 0 && worldMatchesDraft;

  const draftPreviewSnapshot = useMemo(() => {
    if (!selectedLocations.length) return sim.getPreviewSnapshot();
    const world = makeSimWorldFromSelection({
      seed: Number(seedDraft) || 1,
      locations: selectedLocations,
      characters: selectedCharacters,
      placements: setupDraft.locPlacements,
      locationSpecs: setupDraft.locationSpecs,
      nodePlacements: setupDraft.placements,
      hazardPoints: setupDraft.hazardPoints,
    });
    return buildSnapshot(world);
  }, [
    selectedLocations,
    selectedCharacters,
    setupDraft.locPlacements,
    setupDraft.locationSpecs,
    setupDraft.placements,
    setupDraft.hazardPoints,
    seedDraft,
    sim,
  ]);

  const scenarioId = sim.cfg.scenarioId;

  // Initialize the docked minimap location once the world has locations.
  useEffect(() => {
    if (dockLocId) return;
    const ids = Object.keys(sim.world.locations || {}).sort();
    if (ids.length) setDockLocId(ids[0]);
  }, [dockLocId, sim.world.locations]);

  // Telemetry is mocked for now; map to real sim metrics once available.
  const telemetrySeries = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        time: i,
        stability: 0.6 + 0.2 * Math.sin(i / 3),
        chaos: 0.2 + 0.12 * Math.cos(i / 2.3),
        will: 0.45 + 0.25 * Math.sin(i / 4 + 0.8),
      })),
    []
  );

  const eventLogLines = useMemo(() => {
    if (!narrativeLines.length) return [];
    return narrativeLines.slice(-8);
  }, [narrativeLines]);

  const population = cur?.snapshot?.characters?.length ?? 0;
  const avgStress = useMemo(() => {
    const xs = cur?.snapshot?.characters ?? [];
    if (!xs.length) return null;
    const sum = xs.reduce((acc: number, c: any) => acc + Number(c?.stress ?? 0), 0);
    return sum / xs.length;
  }, [cur]);

  const inspectorChar = useMemo(() => {
    const xs = cur?.snapshot?.characters ?? [];
    if (!xs.length) return null;
    const id = mapCharId || xs[0]?.id;
    return xs.find((c: any) => String(c.id) === String(id)) || xs[0] || null;
  }, [cur, mapCharId]);

  return (
    <div className="h-screen bg-black text-slate-300 flex flex-col font-mono p-1 gap-1">
      {/* TOP: Control Bar */}
      <header className="h-14 bg-slate-900/50 border border-slate-800 flex items-center justify-between px-6 rounded-t-lg">
        <div className="flex items-center gap-8">
          <div className="flex flex-col leading-none">
            <span className="text-[10px] text-cyan-500 font-bold tracking-[0.2em] uppercase">SimKit_Engine</span>
            <span className="text-lg text-white font-black italic">KANONAR_v4</span>
          </div>

          <div className="flex items-center gap-2 bg-black/40 p-1 rounded border border-slate-800">
            {/* Live toggle uses the same simulator loop as the classic controls. */}
            <button
              className="p-2 hover:bg-emerald-500/20 text-emerald-500 transition rounded"
              onClick={() => setLiveOn(true)}
              disabled={!canSimulate}
              aria-label="Start live"
            >
              ▶
            </button>
            <button
              className="p-2 hover:bg-slate-700 text-slate-400 transition rounded"
              onClick={() => setLiveOn(false)}
              aria-label="Stop live"
            >
              ■
            </button>
            <button
              className="p-2 hover:bg-slate-700 text-slate-400 transition rounded"
              onClick={() => doRun(10)}
              disabled={!canSimulate}
              aria-label="Run 10 ticks"
            >
              ⏭
            </button>
          </div>
        </div>

        <div className="flex items-center gap-12">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-500 uppercase">Current_Iteration</span>
            <span className="text-xl text-cyan-400 font-bold tabular-nums">
              {String(sim.world.tickIndex).padStart(6, '0')}
            </span>
          </div>
          <div className="h-10 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[9px] text-slate-500 uppercase">Engine_Status</div>
              <div className="text-[10px] text-emerald-500 flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${liveOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                {liveOn ? 'LIVE' : 'IDLE'}
              </div>
            </div>
            <button
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-[11px] rounded uppercase font-bold border border-slate-700"
              onClick={doReset}
            >
              Reset_World
            </button>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex-1 grid grid-cols-12 gap-1 overflow-hidden">
        {/* VIEWPORT: The World */}
        <section className="col-span-8 bg-slate-950 border border-slate-800 relative group">
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
            <div className="bg-black/60 backdrop-blur-md border border-slate-800 p-2 rounded text-[10px]">
              <div className="text-slate-500 uppercase mb-1">Camera_Feed</div>
              <div className="text-white">SAT_ORBITAL_VIEW</div>
            </div>
          </div>

          <div className="w-full h-full flex items-center justify-center bg-[#050505]">
            <SimMapView />
          </div>

          {/* Overlay Info */}
          <div className="absolute bottom-4 left-4 p-3 bg-black/80 border border-cyan-900/50 rounded flex gap-6 backdrop-blur-sm">
            <div>
              <div className="text-[9px] text-cyan-600 uppercase">Population</div>
              <div className="text-lg text-white">{population}_Agents</div>
            </div>
            <div>
              <div className="text-[9px] text-cyan-600 uppercase">Global_S*</div>
              <div className="text-lg text-white">{avgStress != null ? avgStress.toFixed(3) : '—'}</div>
            </div>
          </div>
        </section>

        {/* TELEMETRY: The Stats */}
        <aside className="col-span-4 flex flex-col gap-1 overflow-hidden">
          {/* Stability Graph */}
          <div className="flex-1 bg-slate-900/30 border border-slate-800 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-2">
                SDE_Stability_Vector
              </span>
              <span className="text-red-500 animate-ping">●</span>
            </div>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetrySeries}>
                  <defs>
                    <linearGradient id="colorStab" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 1]} hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', fontSize: '10px' }}
                    itemStyle={{ color: '#06b6d4' }}
                  />
                  <Area type="monotone" dataKey="stability" stroke="#06b6d4" fillOpacity={1} fill="url(#colorStab)" strokeWidth={2} />
                  <Line type="monotone" dataKey="chaos" stroke="#f43f5e" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Terminal / Events */}
          <div className="flex-1 bg-black border border-slate-800 p-0 flex flex-col overflow-hidden">
            <div className="bg-slate-900/80 px-3 py-1.5 border-b border-slate-800 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
              System_Event_Log
            </div>
            <div className="flex-1 p-3 text-[11px] leading-relaxed font-mono overflow-y-auto custom-scrollbar space-y-1">
              {eventLogLines.length ? (
                eventLogLines.map((line, i) => (
                  <div key={i} className="text-white">
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-slate-600 italic">[idle] awaiting simulator events...</div>
              )}
            </div>
          </div>

          {/* Quick Inspector */}
          <div className="h-40 bg-slate-950 border border-slate-800 p-3 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-500 mb-2 flex items-center gap-2">
              Selected_Entity_Props
            </span>
            {inspectorChar ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/50 p-2 border border-slate-800 rounded">
                  <div className="text-[8px] text-slate-500 uppercase">Energy</div>
                  <div className="text-sm font-bold text-white italic">
                    {Number(inspectorChar.energy ?? 0).toFixed(3)}
                  </div>
                </div>
                <div className="bg-slate-900/50 p-2 border border-slate-800 rounded">
                  <div className="text-[8px] text-slate-500 uppercase">Stress</div>
                  <div className="text-sm font-bold text-red-500 italic">
                    {Number(inspectorChar.stress ?? 0).toFixed(3)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-600">No actor selected.</div>
            )}
          </div>
        </aside>
      </div>

      {/* FOOTER: System Status */}
      <footer className="h-6 bg-slate-950 border border-slate-800 rounded-b-lg flex items-center justify-between px-4 text-[9px] uppercase tracking-[0.2em] text-slate-600">
        <div className="flex gap-6">
          <span>Kanonar_OS v4.0.0</span>
          <span className="text-slate-800">|</span>
          <span>No Errors Detected</span>
        </div>
        <div className="flex gap-4">
          <span className="text-cyan-900 font-bold">Local_Node: 127.0.0.1</span>
          <span className="animate-pulse">● Connected</span>
        </div>
      </footer>
    </div>
  );
}
