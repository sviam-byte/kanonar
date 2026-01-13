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
import { LocationImportPanel } from '../../../components/ScenarioSetup/LocationImportPanel';
import { PlacementPanel } from '../../../components/ScenarioSetup/PlacementPanel';
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
    nodeId: string;
    x?: number;
    y?: number;
  }>;
  locationSpecs: any[];
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

  const [setupDraft, setSetupDraft] = useState<SetupDraft>({
    selectedLocIds: [],
    selectedCharIds: [],
    locPlacements: {},
    placements: [],
    locationSpecs: [],
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
    if (tab !== 'narrative') return;
    if (!followLatest) return;
    const el = narrativeScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tab, narrativeLines.length, followLatest]);

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
    });
    return buildSnapshot(world);
  }, [selectedLocations, selectedCharacters, setupDraft.locPlacements, setupDraft.locationSpecs, setupDraft.placements, seedDraft, sim]);

  const scenarioId = sim.cfg.scenarioId;

  return (
    <div className="h-full w-full p-4">
      <div className="sticky top-0 z-20 mb-4">
        <div className="rounded-canon border border-canon-border bg-canon-panel/70 backdrop-blur-md shadow-canon-1 px-5 py-3 flex items-center gap-3">
          <div className="text-lg font-semibold tracking-tight">Simulator Lab</div>
          <div className="text-xs text-canon-muted font-mono">
            simkit | worldTick={sim.world.tickIndex} | records={sim.records.length} | scenario={scenarioId}
            <div className="text-[11px] text-canon-muted/80">
              chars={worldCharIds.join(',') || '—'} | locs={worldLocIds.join(',') || '—'} | cast:{' '}
              {worldCastIds.join(',') || '—'}
            </div>
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
            {draftHasSelection && !worldMatchesDraft ? (
              <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Вы выбрали сцену в табе Setup, но ещё не применили её к миру. Нажмите <b>Apply + Reset</b>, иначе тики
                будут идти по предыдущему миру.
              </div>
            ) : null}

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

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Badge>Live</Badge>
              <span className="text-xs text-canon-muted font-mono">Hz</span>
              <Input className="w-20" value={String(liveHz)} onChange={(e) => setLiveHz(Number(e.target.value))} />
              <Button kind={liveOn ? 'danger' : 'primary'} onClick={() => setLiveOn((x) => !x)} disabled={!canSimulate}>
                {liveOn ? 'Stop live' : 'Start live'}
              </Button>
              <Button onClick={() => setFollowLatest((x) => !x)}>{followLatest ? 'Follow: ON' : 'Follow: OFF'}</Button>
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
            <TabButton active={tab === 'narrative'} onClick={() => setTab('narrative')}>
              Нарратив
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

            {setupProblems.length ? <Badge tone="bad">issues: {setupProblems.length}</Badge> : <Badge tone="good">scene ok</Badge>}
          </div>

          {records.length === 0 && tab !== 'setup' ? (
            <div className="flex-1 min-h-0 rounded-2xl border border-canon-border bg-canon-card p-8 flex flex-col items-start justify-center gap-4">
              <div className="text-2xl font-extrabold">Здесь будет жизнь</div>
              <div className="opacity-80 max-w-2xl">
                Сейчас записей нет, поэтому “смотреть” нечего. Симулятор создаёт записи только после тиков. Нажми кнопку ниже —
                появится tick 0 и вся отладка.
              </div>
              <Button kind="primary" onClick={doStep} disabled={!canSimulate}>
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
                    <div className="text-sm opacity-80 mb-2">Собери сцену: выбери локации, персонажей и задай стартовые позиции.</div>

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
                          {catalogCharacters.map((c: any) => (
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
                            {selectedCharacters.map((ch: any) => {
                              const fallbackLoc = setupDraft.selectedLocIds[0] || '';
                              const locId = setupDraft.locPlacements[ch.entityId] || fallbackLoc;
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
                                        locPlacements: { ...d.locPlacements, [ch.entityId]: nextLocId },
                                      }));
                                    }}
                                  >
                                    {!setupDraft.selectedLocIds.length ? <option value="">(нет выбранных локаций)</option> : null}
                                    {selectedLocations.map((loc: any) => (
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

                    <div className="grid grid-cols-12 gap-4 mt-4">
                      <div className="col-span-6">
                        <LocationImportPanel
                          draft={setupDraft}
                          setDraft={(next) => {
                            setSetupDraft((d) => ({
                              ...d,
                              locationSpecs: next.locationSpecs || [],
                            }));
                          }}
                        />
                      </div>
                      <div className="col-span-6">
                        <PlacementPanel
                          draft={{
                            ...setupDraft,
                            characters: selectedCharacters.map((c: any) => ({ id: c.entityId, title: c.title || c.entityId })),
                            locations: selectedLocations.map((l: any) => ({ id: l.entityId, title: l.title || l.entityId })),
                          }}
                          setDraft={(next) => {
                            setSetupDraft((d) => ({
                              ...d,
                              placements: next.placements || [],
                            }));
                          }}
                        />
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
                      tickIndex={cur!.snapshot.tickIndex}
                      <br />
                      actionsApplied={cur!.trace.actionsApplied.length} eventsApplied={cur!.trace.eventsApplied.length}
                      <br />
                      charsChanged={cur!.trace.deltas.chars.length} factsChanged={Object.keys(cur!.trace.deltas.facts || {}).length}
                      <br />
                      orchestratorAtoms={(orchestratorSnapshot?.atoms || []).length} pipelineStages={pipelineStages.length}
                    </div>
                  </Card>

                  <Card title="Notes (человеческий лог симулятора)">
                    <pre className="font-mono text-sm opacity-90 whitespace-pre-wrap m-0">
                      {(cur!.trace.notes || []).join('\n') || '(empty)'}
                    </pre>
                  </Card>

                  <Card title="Дельты персонажей">
                    <div className="font-mono text-xs opacity-90">
                      {cur!.trace.deltas.chars.length ? (
                        cur!.trace.deltas.chars.map((d: any) => (
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

              {/* NARRATIVE */}
              {tab === 'narrative' ? (
                <Card title="Нарративный лог (X сделал Y потому что Z и получил W)" bodyClassName="p-0">
                  <div className="p-3 border-b border-canon-border flex items-center gap-2 flex-wrap">
                    <Button kind={liveOn ? 'danger' : 'primary'} onClick={() => setLiveOn((x) => !x)} disabled={!canSimulate}>
                      {liveOn ? 'Stop live' : 'Start live'}
                    </Button>
                    <span className="text-xs text-canon-muted font-mono">Hz</span>
                    <Input className="w-20" value={String(liveHz)} onChange={(e) => setLiveHz(Number(e.target.value))} />

                    <Button onClick={() => setFollowLatest((x) => !x)}>{followLatest ? 'Follow: ON' : 'Follow: OFF'}</Button>

                    <div className="grow" />

                    <Button onClick={() => copyJsonToClipboard({ lines: narrativeLines })} disabled={!narrativeLines.length}>
                      Copy lines.json
                    </Button>
                    <Button
                      onClick={() => downloadJsonFile({ lines: narrativeLines }, 'narrative-lines.json')}
                      disabled={!narrativeLines.length}
                    >
                      Export lines.json
                    </Button>
                  </div>

                  <div ref={narrativeScrollRef} className="max-h-[640px] overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
                    {narrativeLines.length ? narrativeLines.join('\n') : '(empty)'}
                  </div>
                </Card>
              ) : null}

              {/* WORLD */}
              {tab === 'world' ? (
                <>
                  <Card title="Персонажи">
                    <div className="font-mono text-sm opacity-90">
                      {cur!.snapshot.characters.map((c: any) => (
                        <div key={c.id} className="mb-2">
                          <b>{c.id}</b> loc={c.locId} health={clamp01(c.health).toFixed(2)} energy={clamp01(c.energy).toFixed(2)}{' '}
                          stress={clamp01(c.stress).toFixed(2)}
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card title="Локации">
                    <div className="font-mono text-xs opacity-90">
                      {cur!.snapshot.locations.map((l: any) => (
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
                      {cur!.trace.actionsApplied.length ? (
                        cur!.trace.actionsApplied.map((a: any) => (
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

                  <Card title="Action validation (V1/V2/V3)">
                    {!cur?.trace?.actionValidations?.length ? (
                      <div className="opacity-70">(no validation trace)</div>
                    ) : (
                      <div className="font-mono text-xs whitespace-pre-wrap">
                        {cur!.trace.actionValidations.map((v: any) => {
                          const norm = v.normalizedTo
                            ? `${v.normalizedTo.kind}${v.normalizedTo.targetId ? `→${v.normalizedTo.targetId}` : ''}`
                            : '(none)';
                          const tgt = v.targetId ? `→${v.targetId}` : '';
                          const reasons = Array.isArray(v.reasons) ? v.reasons.join(',') : '';
                          return (
                            <div key={String(v.actionId)} className="mb-2">
                              <div>
                                {String(v.actorId)}:{String(v.kind)}
                                {tgt} allowed={String(Boolean(v.allowed))} singleTick={String(Boolean(v.singleTick))}
                              </div>
                              <div className="opacity-80">
                                reasons={reasons || '(none)'} normalizedTo={norm}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  <Card title="Top предложений (actionsProposed)">
                    <div className="font-mono text-xs opacity-90">
                      {(cur!.trace.actionsProposed || []).slice(0, 120).map((o: any, i: number) => (
                        <div key={`${o.kind}:${o.actorId}:${o.targetId ?? ''}:${i}`} className="mb-1">
                          {o.blocked ? 'BLOCK' : 'OK'} score={Number(o.score ?? 0).toFixed(3)} kind={o.kind} actor={o.actorId}
                          {o.targetId ? ` target=${o.targetId}` : ''}
                          {o.reason ? ` // ${o.reason}` : ''}
                        </div>
                      ))}
                      {(cur!.trace.actionsProposed || []).length > 120 ? <div>…</div> : null}
                    </div>
                  </Card>
                </>
              ) : null}

              {/* EVENTS */}
              {tab === 'events' ? (
                <Card title="События, которые были применены">
                  <div className="font-mono text-xs opacity-90">
                    {cur!.trace.eventsApplied.length ? (
                      cur!.trace.eventsApplied.map((e: any) => (
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
                  <Card title="Tick Debug (S0–S6) + history">
                    {!dbgHistory.length ? (
                      <div className="opacity-70">
                        Нет orchestratorDebug (ещё не было тиков или плагин не записал orchestratorDebugFrame).
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-mono text-xs opacity-70">tick:</div>
                          <select
                            className="px-2 py-1 rounded-lg border border-canon-border bg-canon-card text-sm"
                            value={String(dbgFrameTickId)}
                            onChange={(e) => setDbgFrameTickId(String(e.target.value))}
                          >
                            {dbgHistory
                              .slice()
                              .reverse() // newest first in UI
                              .map((f: any) => {
                                const id = String(f?.tickId ?? '');
                                const ti = String(f?.tickIndex ?? '');
                                const t = String(f?.time ?? '');
                                return (
                                  <option key={id} value={id}>
                                    {ti} · {id} · {t}
                                  </option>
                                );
                              })}
                          </select>

                          <div className="ml-auto font-mono text-xs opacity-70">
                            frames={dbgHistory.length} stage={dbgStageId}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            className="px-2 py-1 rounded-lg border border-canon-border bg-canon-card hover:bg-white/5 text-sm"
                            onClick={() => copyJsonToClipboard(dbgCurrentFrame)}
                            disabled={!dbgCurrentFrame}
                            title="Copy current TickDebugFrame JSON to clipboard"
                          >
                            Copy tick JSON
                          </button>
                          <button
                            className="px-2 py-1 rounded-lg border border-canon-border bg-canon-card hover:bg-white/5 text-sm"
                            onClick={() => {
                              if (!dbgCurrentFrame) return;
                              const ti = String(dbgCurrentFrame.tickIndex ?? 'x');
                              const id = String(dbgCurrentFrame.tickId ?? 'tick');
                              downloadJsonFile(dbgCurrentFrame, `tick-${ti}-${id}.json`);
                            }}
                            disabled={!dbgCurrentFrame}
                            title="Download current TickDebugFrame JSON"
                          >
                            Download tick JSON
                          </button>

                          <button
                            className="ml-auto px-2 py-1 rounded-lg border border-canon-border bg-canon-card hover:bg-white/5 text-sm"
                            onClick={() => copyJsonToClipboard(orchestratorDecision)}
                            disabled={!orchestratorDecision}
                            title="Copy orchestratorDecision JSON to clipboard"
                          >
                            Copy decision JSON
                          </button>
                          <button
                            className="px-2 py-1 rounded-lg border border-canon-border bg-canon-card hover:bg-white/5 text-sm"
                            onClick={() => {
                              if (!orchestratorDecision) return;
                              const ti = String(orchestratorDecision.tickIndex ?? 'x');
                              downloadJsonFile(orchestratorDecision, `decision-${ti}.json`);
                            }}
                            disabled={!orchestratorDecision}
                            title="Download orchestratorDecision JSON"
                          >
                            Download decision JSON
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const).map((sid) => (
                            <button
                              key={sid}
                              className={
                                'px-2 py-1 rounded-lg border text-sm ' +
                                (dbgStageId === sid
                                  ? 'border-white/40 bg-white/10'
                                  : 'border-canon-border bg-canon-card hover:bg-white/5')
                              }
                              onClick={() => setDbgStageId(sid)}
                            >
                              {sid}
                            </button>
                          ))}
                        </div>

                        {!dbgCurrentFrame ? (
                          <div className="opacity-70">(no current frame)</div>
                        ) : (
                          <div className="rounded-2xl border border-canon-border bg-canon-card p-4">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="font-extrabold">
                                tickIndex={String(dbgCurrentFrame.tickIndex)} · {String(dbgCurrentFrame.tickId)}
                              </div>
                              <div className="font-mono text-xs opacity-70">
                                pre={String(dbgCurrentFrame.preTraceTickId ?? '')} post={String(dbgCurrentFrame.postTraceTickId ?? '')}
                              </div>
                            </div>

                            <div className="mt-3 font-mono text-xs opacity-70">
                              stage: <b>{String(dbgStage?.title ?? dbgStageId)}</b>
                            </div>

                            <pre className="mt-2 font-mono text-xs opacity-90 whitespace-pre-wrap m-0">
                              {JSON.stringify(dbgStage?.data ?? {}, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>

                  <Card title="Offers Explorer (from S3)">
                    {!dbgCurrentFrame ? (
                      <div className="opacity-70">(no current frame)</div>
                    ) : !dbgS3 ? (
                      <div className="opacity-70">(S3 stage not found)</div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-mono text-xs opacity-70">actor filter:</div>
                          <input
                            className="px-2 py-1 rounded-lg border border-canon-border bg-canon-card text-sm"
                            value={offersActorFilter}
                            onChange={(e) => setOffersActorFilter(String(e.target.value))}
                            placeholder="substring (e.g. krystar)"
                          />

                          <div className="font-mono text-xs opacity-70 ml-2">key filter:</div>
                          <input
                            className="px-2 py-1 rounded-lg border border-canon-border bg-canon-card text-sm"
                            value={offersKeyFilter}
                            onChange={(e) => setOffersKeyFilter(String(e.target.value))}
                            placeholder="substring (e.g. talk, escape)"
                          />

                          <div className="font-mono text-xs opacity-70 ml-2">blockedBy filter:</div>
                          <input
                            className="px-2 py-1 rounded-lg border border-canon-border bg-canon-card text-sm"
                            value={offersBlockedByFilter}
                            onChange={(e) => setOffersBlockedByFilter(String(e.target.value))}
                            placeholder="substring (e.g. loc, permission)"
                          />

                          <label className="ml-auto flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={offersOnlyRejected}
                              onChange={(e) => setOffersOnlyRejected(Boolean(e.target.checked))}
                            />
                            only rejected
                          </label>
                        </div>

                        <div className="font-mono text-xs opacity-70">
                          actors shown: {String(filteredActorIds.length)} / {String(Object.keys(offersPerActor || {}).length)}
                        </div>

                        <div className="flex flex-col gap-3">
                          {filteredActorIds.map((actorId) => {
                            const d = offersPerActor[actorId] || {};
                            const mode = String(d?.mode ?? '');
                            const topK = Array.isArray(d?.topK) ? d.topK : [];
                            const rejected = Array.isArray(d?.rejected) ? d.rejected : [];
                            const rejectedCount = Number(d?.rejectedCount ?? rejected.length ?? 0);

                            const topKFiltered = topK.filter(offerPassesFilters);
                            const rejFiltered = rejected.filter(offerPassesFilters);

                            const shownTopK = offersOnlyRejected ? [] : topKFiltered;
                            const shownRej = rejFiltered;

                            // Skip fully empty after filters.
                            if (!shownTopK.length && !shownRej.length) return null;

                            return (
                              <div key={actorId} className="rounded-2xl border border-canon-border bg-canon-card p-4">
                                <div className="flex items-baseline justify-between gap-3">
                                  <div className="font-bold">{actorId}</div>
                                  <div className="font-mono text-xs opacity-70">
                                    mode={mode} · topK={String(topK.length)}→{String(topKFiltered.length)} · rejected={String(rejectedCount)}
                                    →{String(rejFiltered.length)}
                                  </div>
                                </div>

                                {!offersOnlyRejected ? (
                                  <div className="mt-3">
                                    <div className="font-bold text-sm">topK (filtered)</div>
                                    {!shownTopK.length ? (
                                      <div className="font-mono text-xs opacity-60 mt-2">(none)</div>
                                    ) : (
                                      <div className="mt-2 flex flex-col gap-1">
                                        {shownTopK.slice(0, 30).map((o: any, idx: number) => {
                                          const k = offerKeyOf(o);
                                          const score = Number(o?.score ?? 0);
                                          const cost = Number(o?.cost ?? 0);
                                          const allowed = Boolean(o?.allowed);
                                          const prob = o?.prob;
                                          const target = o?.targetId ? String(o.targetId) : '';
                                          const bb = blockedByStr(o);
                                          const reason = o?.reason ? String(o.reason) : '';

                                          return (
                                            <div key={`${k}:${idx}`} className="font-mono text-xs opacity-90">
                                              score={score.toFixed(3)} cost={cost.toFixed(3)} allowed={String(allowed)}
                                              {typeof prob === 'number' ? ` prob=${prob.toFixed(3)}` : ''} key={k}
                                              {target ? ` target=${target}` : ''}
                                              {bb ? ` blockedBy=${bb}` : ''}
                                              {reason ? ` // ${reason}` : ''}
                                            </div>
                                          );
                                        })}
                                        {shownTopK.length > 30 ? (
                                          <div className="font-mono text-xs opacity-60">… (+{shownTopK.length - 30})</div>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>
                                ) : null}

                                <div className="mt-3">
                                  <div className="font-bold text-sm">rejected (filtered)</div>
                                  {!shownRej.length ? (
                                    <div className="font-mono text-xs opacity-60 mt-2">(none)</div>
                                  ) : (
                                    <div className="mt-2 flex flex-col gap-1">
                                      {shownRej.slice(0, 50).map((o: any, idx: number) => {
                                        const k = offerKeyOf(o);
                                        const score = Number(o?.score ?? 0);
                                        const cost = Number(o?.cost ?? 0);
                                        const target = o?.targetId ? String(o.targetId) : '';
                                        const bb = blockedByStr(o);
                                        const reason = o?.reason ? String(o.reason) : '';
                                        return (
                                          <div key={`${k}:rej:${idx}`} className="font-mono text-xs opacity-90">
                                            score={score.toFixed(3)} cost={cost.toFixed(3)} allowed=false key={k}
                                            {target ? ` target=${target}` : ''}
                                            {bb ? ` blockedBy=${bb}` : ''}
                                            {reason ? ` // ${reason}` : ''}
                                          </div>
                                        );
                                      })}
                                      {shownRej.length > 50 ? (
                                        <div className="font-mono text-xs opacity-60">… (+{shownRej.length - 50})</div>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </Card>

                  <Card title="Decision trace (chosen + topK softmax probs)">
                    {!orchestratorDecision ? (
                      <div className="opacity-70">
                        Нет orchestratorDecision на этом тике. (Либо тиков ещё не было, либо плагин не записал decision trace.)
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <div className="font-mono text-xs opacity-80">
                          tickIndex={String(orchestratorDecision.tickIndex)} T={String(orchestratorDecision.T)} actors=
                          {String(orchestratorDecision.actorCount ?? Object.keys(orchestratorDecision.perActor || {}).length)}
                        </div>

                        <div className="flex flex-col gap-3">
                          {Object.keys(orchestratorDecision.perActor || {})
                            .sort()
                            .map((actorId: string) => {
                              const d = orchestratorDecision.perActor?.[actorId];
                              const ch = d?.chosen;
                              const topK = Array.isArray(d?.topK) ? d.topK : [];
                              const rejected = Array.isArray(d?.rejected) ? d.rejected : [];
                              const rejectedCount = Number(d?.rejectedCount ?? rejected.length ?? 0);

                              const chosenLabel = String(ch?.simKind ?? ch?.kind ?? ch?.key ?? ch?.possibilityId ?? '(none)');

                              return (
                                <div key={actorId} className="rounded-2xl border border-canon-border bg-canon-card p-4">
                                  <div className="flex items-baseline justify-between gap-3">
                                    <div className="font-extrabold">{actorId}</div>
                                    <div className="font-mono text-xs opacity-70">
                                      mode={String(d?.mode || 'n/a')} T={String(d?.T ?? orchestratorDecision.T)}
                                    </div>
                                  </div>

                                  <div className="mt-2 font-mono text-sm">
                                    chosen: <b>{chosenLabel}</b>
                                    {ch?.targetId ? ` target=${String(ch.targetId)}` : ''}
                                    {Number.isFinite(ch?.score) ? ` score=${Number(ch.score).toFixed(3)}` : ''}
                                    {Number.isFinite(ch?.cost) ? ` cost=${Number(ch.cost).toFixed(3)}` : ''}
                                    {ch?.prob != null ? ` prob=${Number(ch.prob).toFixed(3)}` : ''}
                                    {Array.isArray(ch?.blockedBy) && ch.blockedBy.length ? ` blockedBy=${ch.blockedBy.join(',')}` : ''}
                                    {ch?.reason ? ` // ${String(ch.reason)}` : ''}
                                  </div>

                                  <div className="mt-3">
                                    <div className="font-bold text-sm">topK</div>
                                    <div className="font-mono text-xs opacity-90 mt-2">
                                      {topK.slice(0, 25).map((o: any) => {
                                        const key = String(
                                          o.possibilityId ?? o.key ?? o.id ?? `${o.kind ?? ''}:${o.targetId ?? ''}:${o.score ?? ''}`
                                        );
                                        return (
                                          <div key={key} className="mb-1">
                                            prob={o.prob != null ? Number(o.prob).toFixed(3) : 'n/a'} score=
                                            {Number(o.score ?? 0).toFixed(3)} cost={Number(o.cost ?? 0).toFixed(3)} allowed=
                                            {String(Boolean(o.allowed))}{' '}
                                            key={String(o.key ?? o.possibilityId ?? '')}
                                            {o.kind ? ` kind=${String(o.kind)}` : ''}
                                            {o.targetId ? ` target=${String(o.targetId)}` : ''}
                                            {Array.isArray(o.blockedBy) && o.blockedBy.length ? ` blockedBy=${o.blockedBy.join(',')}` : ''}
                                            {o.reason ? ` // ${String(o.reason)}` : ''}
                                          </div>
                                        );
                                      })}
                                      {topK.length > 25 ? <div>… (+{topK.length - 25})</div> : null}
                                    </div>
                                  </div>

                                  <div className="mt-3">
                                    <div className="font-bold text-sm">rejected (first 25) · count={String(rejectedCount)}</div>
                                    {!rejected.length ? (
                                      <div className="font-mono text-xs opacity-60 mt-2">(none)</div>
                                    ) : (
                                      <div className="font-mono text-xs opacity-90 mt-2">
                                        {rejected.slice(0, 25).map((o: any) => {
                                          const key = String(
                                            o.possibilityId ??
                                              o.key ??
                                              o.id ??
                                              `${o.kind ?? ''}:${o.targetId ?? ''}:${o.score ?? ''}:${o.reason ?? ''}`
                                          );
                                          return (
                                            <div key={key} className="mb-1">
                                              score={Number(o.score ?? 0).toFixed(3)} cost={Number(o.cost ?? 0).toFixed(3)} allowed=false{' '}
                                              key={String(o.key ?? o.possibilityId ?? '')}
                                              {o.kind ? ` kind=${String(o.kind)}` : ''}
                                              {o.targetId ? ` target=${String(o.targetId)}` : ''}
                                              {Array.isArray(o.blockedBy) && o.blockedBy.length ? ` blockedBy=${o.blockedBy.join(',')}` : ''}
                                              {o.reason ? ` // ${String(o.reason)}` : ''}
                                            </div>
                                          );
                                        })}
                                        {rejected.length > 25 ? <div>… (+{rejected.length - 25})</div> : null}
                                      </div>
                                    )}
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
                      <Button onClick={() => jsonDownload(`goal-lab-snapshot-${cur!.snapshot.tickIndex}.json`, orchestratorSnapshot)}>
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
