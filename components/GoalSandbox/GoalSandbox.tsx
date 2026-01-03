// components/GoalSandbox/GoalSandbox.tsx

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  EntityType,
  Branch,
  type CharacterEntity,
  type LocationMap,
  type AffectState,
  type LocationEntity,
  type LocalActorRef,
  type WorldState,
  type AgentState,
} from '../../types';
import { useSandbox } from '../../contexts/SandboxContext';
import { getAllCharactersWithRuntime } from '../../data';
import { createInitialWorld } from '../../lib/world/initializer';
import { normalizeWorldShape } from '../../lib/world/normalizeWorldShape';
import { scoreContextualGoals } from '../../lib/context/v2/scoring';
import type { ContextAtom } from '../../lib/context/v2/types';
import { GoalLabResults } from '../goal-lab/GoalLabResults';
import { FrontShell } from './FrontShell';
import { allLocations } from '../../data/locations';
import { computeLocationGoalsForAgent } from '../../lib/context/v2/locationGoals';
import { computeTomGoalsForAgent } from '../../lib/context/v2/tomGoals';
import { GoalLabControls } from '../goal-lab/GoalLabControls';
import { eventRegistry } from '../../data/events-registry';
import { buildGoalLabContext } from '../../lib/goals/goalLabContext';
import { computeContextualMind } from '../../lib/tom/contextual/engine';
import type { ContextualMindReport } from '../../lib/tom/contextual/types';
import { MapViewer } from '../locations/MapViewer';
import { AtomOverrideLayer } from '../../lib/context/overrides/types';
import { runTicksForCast } from '../../lib/engine/tick';
import type { AtomDiff } from '../../lib/snapshot/diffAtoms';
import { diffAtoms } from '../../lib/snapshot/diffAtoms';
import { adaptToSnapshotV1, normalizeSnapshot } from '../../lib/goal-lab/snapshotAdapter';
import { buildGoalLabSceneDumpV2, downloadJson } from '../../lib/goal-lab/sceneDump';
import { materializeStageAtoms } from '../goal-lab/materializePipeline';
import { CastPerspectivePanel } from '../goal-lab/CastPerspectivePanel';
import { CastComparePanel } from '../goal-lab/CastComparePanel';
import { AgentPassportPanel } from '../goal-lab/AgentPassportPanel';
import { allScenarioDefs } from '../../data/scenarios/index';
import { useAccess } from '../../contexts/AccessContext';
import { filterCharactersForActiveModule } from '../../lib/modules/visibility';

// Pipeline Imports
import { FrameDebugPanel } from '../GoalLab/FrameDebugPanel';
import type { ScenePreset } from '../../data/presets/scenes';
import { SCENE_PRESETS } from '../../lib/scene/presets';
import { initTomForCharacters } from '../../lib/tom/init';
import { assignRoles } from '../../lib/roles/assignment';
import { constructGil } from '../../lib/gil/apply';
import type { DyadConfigForA } from '../../lib/tom/dyad-metrics';
import { ensureMapCells } from '../../lib/world/ensureMapCells';
import { buildDebugFrameFromSnapshot } from '../../lib/goal-lab/debugFrameFromSnapshot';
import { EmotionInspector } from '../GoalLab/EmotionInspector';
import { normalizeAtom } from '../../lib/context/v2/infer';
import { lintActionsAndLocations } from '../../lib/linter/actionsAndLocations';
import { arr } from '../../lib/utils/arr';

function createCustomLocationEntity(map: LocationMap): LocationEntity {
  const cells = map.cells || [];
  const avgDanger =
    cells.length > 0 ? cells.reduce((s, c) => s + (c as any).danger, 0) / cells.length : 0;

  return {
    entityId: 'custom-lab-location',
    type: EntityType.Location,
    title: 'Custom Lab',
    versionTags: [Branch.Current],
    map: {
      id: map.id,
      width: map.width,
      height: map.height,
      cells: map.cells,
      defaultWalkable: true,
      defaultDanger: 0,
      defaultCover: 0,
      ...(map as any),
    },
    physics: {
      environmentalStress: avgDanger * 0.5,
      mobilityCost: 1,
      collisionRisk: avgDanger * 0.3,
      climbable: false,
      jumpable: false,
      crawlable: false,
      weightLimit: 1000,
      acousticsProfile: { echo: 0.5, dampening: 0.5 },
    },
    hazards: avgDanger > 0.3 ? [{ id: 'map_haz', type: 'collapse', intensity: avgDanger }] : [],
    norms: { requiredBehavior: [], forbiddenBehavior: [], penalties: {} },
    properties: { privacy: 'public', control_level: 0.5, visibility: 0.8, noise: 0.2 },
  } as unknown as LocationEntity;
}

const dedupeAtomsById = (arr: ContextAtom[]) => {
  const seen = new Set<string>();
  const out: ContextAtom[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const a = arr[i];
    if (!a || !(a as any).id) continue;
    const id = (a as any).id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.unshift(a);
  }
  return out;
};

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') return Object.values(v as Record<string, T>);
  return [];
}

function assertArray(name: string, v: unknown) {
  if (!Array.isArray(v)) {
    console.error(`[GoalLab invariant violated] ${name} is not array`, v);
    throw new Error(`${name} must be array`);
  }
}

const positionsEqual = (
  a: Record<string, { x: number; y: number }>,
  b: Record<string, { x: number; y: number }>
) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const pa = a[key];
    const pb = b[key];
    if (!pb || pa.x !== pb.x || pa.y !== pb.y) return false;
  }
  return true;
};

const cloneWorld = <T,>(w: T): T => {
  // structuredClone is available in modern runtimes; fallback JSON is enough for plain world objects
  try {
    // @ts-ignore
    return structuredClone(w);
  } catch {
    return JSON.parse(JSON.stringify(w));
  }
};

export const GoalSandbox: React.FC = () => {
  const { characters: sandboxCharacters, setDyadConfigFor } = useSandbox();
  const { activeModule } = useAccess();
  const devValidateAtoms = import.meta.env?.DEV ?? false;

  const [fatalError, setFatalError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const allCharacters = useMemo(() => {
    // Единый источник правды: реестр + runtime-characters (и essences внутри).
    const base = getAllCharactersWithRuntime();
    const map = new Map<string, CharacterEntity>();
    [...base, ...sandboxCharacters].forEach(c => map.set(c.entityId, c));
    const merged = Array.from(map.values());
    return filterCharactersForActiveModule(merged, activeModule);
  }, [sandboxCharacters, activeModule]);

  const actorLabels = useMemo(() => {
    const m: Record<string, string> = {};
    allCharacters.forEach(c => {
      m[c.entityId] = c.title;
    });
    return m;
  }, [allCharacters]);

  const [selectedAgentId, setSelectedAgentId] = useState<string>(allCharacters[0]?.entityId || '');
  const [activeScenarioId, setActiveScenarioId] = useState<string>('cave_rescue');
  const [perspectiveAgentId, setPerspectiveAgentId] = useState<string | null>(null);

  // Core World State
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  // IMPORTANT: when importing a scene JSON, do NOT rebuild world via createInitialWorld()
  // иначе импорт перезатрётся эффектом rebuildWorldFromParticipants.
  const [worldSource, setWorldSource] = useState<'derived' | 'imported'>('derived');

  // Scene Management
  const [map, setMap] = useState<LocationMap>(() =>
    ensureMapCells({
      id: 'sandbox',
      width: 12,
      height: 12,
      cells: [],
      defaultWalkable: true,
      defaultDanger: 0,
      defaultCover: 0,
    } as any)
  );
  const [actorPositions, setActorPositions] = useState<Record<string, { x: number; y: number }>>(
    {}
  );
  const actorPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const importInputRef = useRef<HTMLInputElement | null>(null);
  // IMPORTANT: must be synchronous to avoid “previous scene positions” leaking into rebuild
  actorPositionsRef.current = actorPositions;
  const [rebuildNonce, setRebuildNonce] = useState(0);

  const [locationMode, setLocationMode] = useState<'preset' | 'custom'>('preset');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [placingActorId, setPlacingActorId] = useState<string | null>(null);

  // Debug & Overrides
  const [affectOverrides, setAffectOverrides] = useState<Partial<AffectState>>({});
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [manualAtoms, setManualAtoms] = useState<ContextAtom[]>([]);
  const [pipelineStageId, setPipelineStageId] = useState<string>('S5');

  // UI panel visibility (persisted)
  const [uiPanels, setUiPanels] = useState(() => {
    try {
      const raw = localStorage.getItem('goalsandbox.uiPanels.v1');
      if (raw) return JSON.parse(raw);
    } catch {}
    return { left: true, cast: true, compare: false, passport: false, front: false, results: true, emo: false, frame: false, lint: false };
  });

  // Top toolbar collapse (persisted)
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem('goalsandbox.toolbarCollapsed.v1');
      if (raw === '1') return true;
    } catch {}
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem('goalsandbox.toolbarCollapsed.v1', toolbarCollapsed ? '1' : '0');
    } catch {}
  }, [toolbarCollapsed]);

  // Stage bar collapse (persisted)
  const [stageBarCollapsed, setStageBarCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem('goalsandbox.stageBarCollapsed.v1');
      if (raw === '1') return true;
    } catch {}
    return false;
  });
  const [advancedExportsOpen, setAdvancedExportsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('goalsandbox.stageBarCollapsed.v1', stageBarCollapsed ? '1' : '0');
    } catch {}
  }, [stageBarCollapsed]);

  // HUD / headers collapse (persisted)
  const [hudCollapsed, setHudCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('goalSandbox.hudCollapsed');
      return v === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('goalSandbox.hudCollapsed', hudCollapsed ? '1' : '0');
    } catch {}
  }, [hudCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('goalsandbox.uiPanels.v1', JSON.stringify(uiPanels));
    } catch {}
  }, [uiPanels]);

  const togglePanel = useCallback((key: string) => {
    setUiPanels((p: any) => ({ ...p, [key]: !p?.[key] }));
  }, []);

  // NOTE: Do not mutate worldState via affect overrides. Affect is materialized as atoms inside buildGoalLabContext.

  // Atom Overrides
  const [atomOverridesLayer, setAtomOverridesLayer] = useState<AtomOverrideLayer>({
    layerId: 'goal-lab',
    updatedAt: Date.now(),
    ops: [],
  });

  const [injectedEvents, setInjectedEvents] = useState<any[]>([]);
  const [sceneControl, setSceneControl] = useState<any>({ presetId: 'safe_hub' });

  const [atomDiff, setAtomDiff] = useState<AtomDiff[]>([]);

  // --- Tick simulation session state ---
  const baselineWorldRef = useRef<WorldState | null>(null);
  const lastSnapshotAtomsRef = useRef<ContextAtom[] | null>(null);
  const lastBaselineKeyRef = useRef<string>('');

  const resetTransientForNewScene = useCallback((reason: string) => {
    // Anything “interactive” must not carry between preset scenes.
    setSelectedEventIds(new Set());
    setInjectedEvents([]);
    setManualAtoms([]);
    setAtomDiff([]);
    setNearbyActors([]); // legacy injection list
    setPlacingActorId(null);
    setAffectOverrides({});
    setAtomOverridesLayer({ layerId: 'goal-lab', updatedAt: Date.now(), ops: [] });

    // Clear positions BOTH in state and ref (ref is read by rebuild).
    actorPositionsRef.current = {};
    setActorPositions({});

    // Optional: clear runtime UI errors so they don’t look “sticky”
    setRuntimeError(null);
    // fatalError лучше чистить только если он был “про сцену”, но можно и так:
    // setFatalError(null);

    (console as any)?.debug?.(`[GoalLab] resetTransientForNewScene: ${reason}`);
  }, []);

  // Persistent Scene Participants: stores ALL actors in the scene (including selectedAgentId)
  const [sceneParticipants, setSceneParticipants] = useState<Set<string>>(() => new Set());

  const participantIds = useMemo(() => {
    const ids = new Set(sceneParticipants);
    if (selectedAgentId) ids.add(selectedAgentId);
    return Array.from(ids);
  }, [sceneParticipants, selectedAgentId]);

  // Optional per-scene dyad configs (A->B perception weights), typically from ScenePreset
  const [runtimeDyadConfigs, setRuntimeDyadConfigs] = useState<Record<string, DyadConfigForA> | null>(
    null
  );

  const forceRebuildWorld = useCallback(() => {
    setRebuildNonce(n => n + 1);
  }, []);

  const persistActorPositions = useCallback(() => {
    if (!worldState) return;
    setActorPositions(prev => {
      const next = { ...prev };
      worldState.agents.forEach(a => {
        const pos = (a as any).position;
        if (pos) next[a.entityId] = pos;
      });
      return next;
    });
  }, [worldState]);

  // Ensure selectedAgent is valid
  useEffect(() => {
    if (allCharacters.length === 0) return;
    if (!selectedAgentId) {
      setSelectedAgentId(allCharacters[0].entityId);
      return;
    }
    if (!allCharacters.some(c => c.entityId === selectedAgentId)) {
      setSelectedAgentId(allCharacters[0].entityId);
    }
  }, [allCharacters, selectedAgentId]);

  const perspectiveId = perspectiveAgentId || selectedAgentId;

  useEffect(() => {
    // default perspective follows selected agent
    if (!perspectiveAgentId && selectedAgentId) setPerspectiveAgentId(selectedAgentId);
  }, [perspectiveAgentId, selectedAgentId]);

  useEffect(() => {
    if (!participantIds.length) return;
    if (perspectiveId && participantIds.includes(perspectiveId)) return;
    setPerspectiveAgentId(participantIds[0]);
  }, [participantIds, perspectiveId]);

  useEffect(() => {
    // Only auto-fill cast if it's empty (initial boot), never on arbitrary selection changes.
    if (!selectedAgentId) return;
    setSceneParticipants(prev => (prev.size ? prev : new Set([selectedAgentId])));
  }, [selectedAgentId]);

  const setManualAtom = useCallback((id: string, magnitude: number) => {
    setManualAtoms(prev => {
      const next = [...(prev || [])].filter(a => (a as any)?.id !== id);
      next.push(normalizeAtom({
        id,
        magnitude,
        confidence: 1,
        origin: 'override',
        source: 'emotion_inspector',
        kind: 'manual_override',
        ns: id.split(':')[0],
        subject: perspectiveId,
        label: `${id}=${magnitude.toFixed(2)}`
      } as any));
      return next;
    });
  }, [perspectiveId]);

  const getActiveLocationId = useCallback(() => {
    if (locationMode === 'preset' && selectedLocationId) return selectedLocationId;
    return 'custom-lab-location';
  }, [locationMode, selectedLocationId]);

  // Map selection helpers (must be defined before any hook that references them)
  const activeMap = useMemo(() => {
    if (locationMode === 'custom') return ensureMapCells(map);
    if (selectedLocationId) {
      const loc = allLocations.find(l => l.entityId === selectedLocationId);
      if ((loc as any)?.map) return ensureMapCells((loc as any).map);
    }
    return ensureMapCells(map);
  }, [locationMode, map, selectedLocationId]);

  const getSelectedLocationEntity = useCallback((): LocationEntity => {
    if (locationMode === 'preset' && selectedLocationId) {
      const loc = allLocations.find(l => l.entityId === selectedLocationId);
      if (loc) return loc as any;
    }
    return createCustomLocationEntity(activeMap) as any;
  }, [locationMode, selectedLocationId, activeMap]);

  const ensureCompleteInitialRelations = useCallback((agentIds: string[], base: any) => {
    const out: any = { ...(base || {}) };
    for (const a of agentIds) {
      out[a] = { ...(out[a] || {}) };
      for (const b of agentIds) {
        if (a === b) continue;
        out[a][b] = {
          trust: out[a]?.[b]?.trust ?? 0.4,
          bond: out[a]?.[b]?.bond ?? 0.2,
          authority: out[a]?.[b]?.authority ?? 0.4,
        };
      }
    }
    return out;
  }, []);

  const refreshWorldDerived = useCallback(
    (prev: WorldState, nextAgents: AgentState[]) => {
      const locId = getActiveLocationId();
      const agentIds = nextAgents.map(a => a.entityId);

      const agentsWithLoc = nextAgents.map(a => {
        const pos = actorPositionsRef.current[a.entityId] || (a as any).position || { x: 5, y: 5 };
        return { ...(a as any), locationId: locId, position: pos } as AgentState;
      });

      const initialRelations = ensureCompleteInitialRelations(agentIds, (prev as any).initialRelations);

      const worldBase: WorldState = {
        ...(prev as any),
        agents: agentsWithLoc,
        initialRelations,
      };

      const roleMap = assignRoles(worldBase.agents, worldBase.scenario, worldBase);
      worldBase.agents = worldBase.agents.map(
        a => ({ ...(a as any), effectiveRole: (roleMap as any)[a.entityId] } as AgentState)
      );

      worldBase.tom = initTomForCharacters(
        worldBase.agents as any,
        worldBase as any,
        runtimeDyadConfigs || undefined
      ) as any;
      (worldBase as any).gilParams = constructGil(worldBase.agents as any) as any;

      return { ...(worldBase as any) };
    },
    [ensureCompleteInitialRelations, getActiveLocationId, runtimeDyadConfigs]
  );

  const rebuildWorldFromParticipants = useCallback(
    (idsInput: Set<string>) => {
      const subject = allCharacters.find(c => c.entityId === selectedAgentId);
      if (!subject) return;

      const ids = new Set(idsInput);
      if (selectedAgentId) ids.add(selectedAgentId);

      const participants = Array.from(ids)
        .map(id => allCharacters.find(c => c.entityId === id))
        .filter(Boolean) as CharacterEntity[];

      if (participants.length === 0) return;

      const w = createInitialWorld(Date.now(), participants, activeScenarioId);
      if (!w) return;

      w.groupGoalId = undefined;
      w.locations = [getSelectedLocationEntity(), ...allLocations].map(loc => {
        const m = (loc as any)?.map;
        if (!m) return loc as any;
        try {
          return { ...(loc as any), map: ensureMapCells(m) } as any;
        } catch {
          return loc as any;
        }
      });

      const nextPositions = { ...actorPositionsRef.current };
      w.agents.forEach((a, i) => {
        if (actorPositionsRef.current[a.entityId]) {
          (a as any).position = actorPositionsRef.current[a.entityId];
          nextPositions[a.entityId] = actorPositionsRef.current[a.entityId];
        } else {
          const offsetX = (i % 3) * 2;
          const offsetY = Math.floor(i / 3) * 2;
          const pos = { x: 5 + offsetX, y: 5 + offsetY };
          (a as any).position = pos;
          nextPositions[a.entityId] = pos;
        }
      });

      const locId = getActiveLocationId();
      w.agents = arr((w as any)?.agents).map((a: any) => ({ ...(a as any), locationId: locId } as AgentState));

      const allIds = arr((w as any)?.agents).map((a: any) => a.entityId);
      (w as any).initialRelations = ensureCompleteInitialRelations(allIds, (w as any).initialRelations);

      const roleMap = assignRoles(w.agents as any, w.scenario as any, w as any);
      w.agents = w.agents.map(
        a => ({ ...(a as any), effectiveRole: (roleMap as any)[a.entityId] } as AgentState)
      );

      w.tom = initTomForCharacters(w.agents as any, w as any, runtimeDyadConfigs || undefined) as any;
      (w as any).gilParams = constructGil(w.agents as any) as any;

      setActorPositions(prev => (positionsEqual(prev, nextPositions) ? prev : nextPositions));
      setWorldState(w);
    },
    [
      allCharacters,
      selectedAgentId,
      activeScenarioId,
      getSelectedLocationEntity,
      getActiveLocationId,
      ensureCompleteInitialRelations,
      runtimeDyadConfigs,
    ]
  );

  const handleSelectAgent = useCallback(
    (id: string) => {
      if (!id) return;

      // Selecting is a VIEW operation; it must not mutate the scene cast.
      if (!sceneParticipants.has(id) && id !== selectedAgentId) {
        setRuntimeError(`Cannot select agent not in scene cast: ${id}. Add it explicitly.`);
        return;
      }
      setSelectedAgentId(id);
    },
    [sceneParticipants, selectedAgentId]
  );

  const handleAddParticipant = useCallback(
    (id: string) => {
      if (!id) return;
      if (id === selectedAgentId) return;
      setWorldSource('derived');

      if (!allCharacters.some(c => c.entityId === id)) {
        setFatalError(`Add participant failed: unknown character id: ${String(id)}`);
        return;
      }

      console.log('[ADD] request', { id, selectedAgentId });

      setSceneParticipants(prev => {
        const next = new Set(prev);
        next.add(id);

        console.log('[ADD] sceneParticipants ->', Array.from(next));

        return next;
      });

      persistActorPositions();
      forceRebuildWorld();
    },
    [selectedAgentId, persistActorPositions, forceRebuildWorld, allCharacters]
  );

  const handleRemoveParticipant = useCallback(
    (id: string) => {
      if (!id) return;
      if (id === selectedAgentId) return;
      setWorldSource('derived');

      setSceneParticipants(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      forceRebuildWorld();
    },
    [selectedAgentId, forceRebuildWorld]
  );

  const resolveCharacterId = useCallback(
    (rawId: string): string | null => {
      if (!rawId) return null;

      const exact = allCharacters.find(c => c.entityId === rawId);
      if (exact) return exact.entityId;

      const prefixed = `character-${rawId}`;
      const pref = allCharacters.find(c => c.entityId === prefixed);
      if (pref) return pref.entityId;

      const loose = allCharacters.find(c => c.entityId.endsWith(rawId) || c.entityId.includes(rawId));
      return loose ? loose.entityId : null;
    },
    [allCharacters]
  );

  // Initialize / Rebuild World (safe: never null the existing world during rebuild)
  useEffect(() => {
    if (!selectedAgentId) return;
    if (worldSource === 'imported') return;

    const ids = new Set(sceneParticipants);
    ids.add(selectedAgentId);

    // Если в сцене лежат id, которых нет среди зарегистрированных сущностей,
    // результат будет выглядеть как "не добавляется" (id просто отфильтруется).
    const missingIds = Array.from(ids).filter(id => !allCharacters.some(c => c.entityId === id));
    if (missingIds.length) {
      setRuntimeError(`Scene contains unknown character ids: ${missingIds.join(', ')}`);
    } else {
      // не затираем fatalError; это только мягкое предупреждение
      setRuntimeError(prev => (prev && prev.startsWith('Scene contains unknown') ? null : prev));
    }

    const participants = Array.from(ids)
      .map(id => allCharacters.find(c => c.entityId === id))
      .filter(Boolean) as CharacterEntity[];

    if (participants.length === 0) return;

    try {
      const w = createInitialWorld(Date.now(), participants, activeScenarioId);
      if (!w) {
        setFatalError(`createInitialWorld() returned null. Unknown scenarioId: ${String(activeScenarioId)}`);
        return;
      }

      w.groupGoalId = undefined;
      w.locations = [getSelectedLocationEntity(), ...allLocations].map(loc => {
        const m = (loc as any)?.map;
        if (!m) return loc as any;
        try {
          return { ...(loc as any), map: ensureMapCells(m) } as any;
        } catch {
          return loc as any;
        }
      });

      const nextPositions = { ...actorPositionsRef.current };

      w.agents.forEach((a, i) => {
        if (actorPositionsRef.current[a.entityId]) {
          (a as any).position = actorPositionsRef.current[a.entityId];
          nextPositions[a.entityId] = actorPositionsRef.current[a.entityId];
        } else {
          const offsetX = (i % 3) * 2;
          const offsetY = Math.floor(i / 3) * 2;
          const pos = { x: 5 + offsetX, y: 5 + offsetY };
          (a as any).position = pos;
          nextPositions[a.entityId] = pos;
        }
      });

      const locId = getActiveLocationId();
      w.agents = arr((w as any)?.agents).map((a: any) => ({ ...(a as any), locationId: locId } as AgentState));

      const agentIds = arr((w as any)?.agents).map((a: any) => a.entityId);
      (w as any).initialRelations = ensureCompleteInitialRelations(agentIds, (w as any).initialRelations);

      const roleMap = assignRoles(w.agents as any, w.scenario as any, w as any);
      w.agents = w.agents.map(
        a => ({ ...(a as any), effectiveRole: (roleMap as any)[a.entityId] } as AgentState)
      );

      w.tom = initTomForCharacters(w.agents as any, w as any, runtimeDyadConfigs || undefined) as any;
      (w as any).gilParams = constructGil(w.agents as any) as any;

      setActorPositions(prev => (positionsEqual(prev, nextPositions) ? prev : nextPositions));
      setWorldState(w);
      setFatalError(null);
    } catch (e: any) {
      // Keep the previous worldState; just report error
      console.error('[GoalSandbox] rebuild failed', e);
      setFatalError(String(e?.message || e));
    }
  }, [
    rebuildNonce, // <-- ключ: rebuild триггерится этим
    selectedAgentId,
    sceneParticipants,
    allCharacters,
    activeScenarioId,
    runtimeDyadConfigs,
    getSelectedLocationEntity,
    getActiveLocationId,
    ensureCompleteInitialRelations,
    worldSource,
  ]);

  useEffect(() => {
    if (!worldState) return;
    if (!selectedAgentId) return;
    const exists = worldState.agents.some(a => a.entityId === selectedAgentId);
    if (!exists) {
      const next = worldState.agents[0]?.entityId || allCharacters[0]?.entityId || '';
      if (next) setSelectedAgentId(next);
    }
  }, [worldState, selectedAgentId, allCharacters]);

  // Update baseline when world is rebuilt (new scene session or cast rebuild)
  useEffect(() => {
    if (!worldState) return;
    const sceneId = String((sceneControl as any)?.sceneId || 'no_scene_id');
    const key = `${sceneId}::${rebuildNonce}`;
    if (key === lastBaselineKeyRef.current) return;
    lastBaselineKeyRef.current = key;
    baselineWorldRef.current = cloneWorld(worldState);
    setAtomDiff([]);
  }, [worldState, rebuildNonce, sceneControl]);

  const nearbyActors = useMemo<LocalActorRef[]>(() => {
    const ids = Array.from(sceneParticipants).filter(id => id !== selectedAgentId);

    const mePos =
      (worldState?.agents.find(a => a.entityId === selectedAgentId) as any)?.position ||
      actorPositions[selectedAgentId] ||
      { x: 0, y: 0 };

    return ids
      .map(id => {
        const char = allCharacters.find(c => c.entityId === id);
        if (!char) return null;

        const agentPos =
          (worldState?.agents.find(a => a.entityId === id) as any)?.position ||
          actorPositions[id] ||
          { x: 6, y: 6 };

        const dist = Math.hypot(mePos.x - agentPos.x, mePos.y - agentPos.y);

        const roleFromWorld = (worldState?.agents.find(a => a.entityId === id) as any)?.effectiveRole;

        return {
          id,
          label: char.title,
          kind: 'neutral',
          role: roleFromWorld || (char as any).roles?.global?.[0] || 'observer',
          distance: dist,
          threatLevel: 0,
        } as LocalActorRef;
      })
      .filter(Boolean) as LocalActorRef[];
  }, [sceneParticipants, selectedAgentId, allCharacters, worldState, actorPositions]);

  const handleNearbyActorsChange = (newActors: LocalActorRef[]) => {
    setWorldSource('derived');
    const next = new Set<string>(newActors.map(a => a.id));
    if (selectedAgentId) next.add(selectedAgentId); // always keep focus inside the scene
    setSceneParticipants(next);
    persistActorPositions();
    forceRebuildWorld();
  };

  // Scene Preset Loader
  const handleLoadScene = useCallback(
    (scene: ScenePreset) => {
      if (!scene?.characters?.length) return;
      setWorldSource('derived');

      // New scene session => reset all transient/override layers
      resetTransientForNewScene(`loadScene:${scene.id}`);

      const resolvedChars = scene.characters
        .map(id => resolveCharacterId(id))
        .filter(Boolean) as string[];

      const fallbackId = allCharacters[0]?.entityId || '';
      const nextSelected = resolvedChars[0] || resolveCharacterId(scene.characters[0]) || fallbackId;

      const nextParticipants = new Set<string>(resolvedChars);
      if (nextSelected) nextParticipants.add(nextSelected);

      setSceneParticipants(nextParticipants);
      setSelectedAgentId(nextSelected);
      setPerspectiveAgentId(nextSelected);

      // Location must be explicitly set from preset (otherwise it leaks from previous scene)
      setLocationMode('preset');
      setSelectedLocationId(scene.locationId || '');

      // Scenario from preset
      if (scene.suggestedScenarioId) {
        if (allScenarioDefs[scene.suggestedScenarioId]) {
          setActiveScenarioId(scene.suggestedScenarioId);
        } else {
          setFatalError(`Preset scene requested unknown scenarioId: ${String(scene.suggestedScenarioId)}`);
        }
      }

      if ((scene as any).configs) {
        const resolvedCfgs: Record<string, DyadConfigForA> = {};
        for (const [rawId, cfg] of Object.entries((scene as any).configs)) {
          const rid = resolveCharacterId(rawId);
          if (rid) resolvedCfgs[rid] = cfg as DyadConfigForA;
        }
        setRuntimeDyadConfigs(resolvedCfgs);
      } else {
        setRuntimeDyadConfigs(null);
      }

      if ((scene as any).configs) {
        Object.entries((scene as any).configs).forEach(([id, cfg]) => {
          const rid = resolveCharacterId(id);
          if (rid) setDyadConfigFor(rid, cfg as any);
        });
      }

      const enginePreset = scene.enginePresetId || 'safe_hub';
      setSceneControl({
        presetId: enginePreset,
        // Unique scene session id prevents any downstream caching collisions
        sceneId: `scene_${scene.id}_${Date.now()}`,
        metrics: {},
        norms: {},
      });

      forceRebuildWorld();
    },
    [
      allCharacters,
      resolveCharacterId,
      setDyadConfigFor,
      resetTransientForNewScene,
      setActiveScenarioId,
      setSelectedLocationId,
      forceRebuildWorld,
    ]
  );

  // Keep agents' locationId in sync with selected location
  useEffect(() => {
    if (!worldState) return;
    const locId = getActiveLocationId();
    setWorldState(prev => {
      if (!prev) return prev;
      const already = prev.agents.every(a => (a as any).locationId === locId);
      if (already) return prev;
      const nextAgents = prev.agents.map(a => ({ ...(a as any), locationId: locId } as AgentState));
      return { ...(prev as any), agents: nextAgents };
    });
  }, [getActiveLocationId, worldState]);

  const handleActorClick = (x: number, y: number) => {
    if (placingActorId) {
      setActorPositions(prev => ({ ...prev, [placingActorId]: { x, y } }));
      if (worldState) {
        const nextWorld = { ...worldState };
        const agent = nextWorld.agents.find(a => a.entityId === placingActorId);
        if (agent) (agent as any).position = { x, y };
        setWorldState(nextWorld);
      }
      setPlacingActorId(null);
    }
  };

  const handleImportSceneDumpV2 = useCallback(
    (dump: any) => {
      try {
        if (!dump || typeof dump !== 'object') throw new Error('Invalid dump: not an object');
        if (dump.schemaVersion !== 2) {
          throw new Error(`Unsupported schemaVersion: ${String(dump.schemaVersion)}`);
        }
        if (!dump.world) throw new Error('Dump has no world');

        // Reset transient UI layers first (but then apply imported inputs)
        resetTransientForNewScene('importSceneDumpV2');

        const w = normalizeWorldShape(cloneWorld(dump.world));

        // Focus
        const focus = dump.focus || {};
        const selected = focus.selectedAgentId || focus.perspectiveId || w.agents?.[0]?.entityId || '';
        const persp = focus.perspectiveId || selected || null;

        // Participants: if absent, fall back to all agents in world
        const focusParticipants =
          Array.isArray(focus.participantIds) && focus.participantIds.length
            ? focus.participantIds.map(String)
            : arr(w.agents).map(a => String((a as any).entityId)).filter(Boolean);

        // Keep invariant: sceneParticipants excludes selectedAgentId (participantIds memo adds it back)
        const nextSceneParticipants = new Set<string>(
          focusParticipants.filter((id: string) => id && id !== selected)
        );

        setSelectedAgentId(String(selected));
        setPerspectiveAgentId(persp ? String(persp) : null);
        setSceneParticipants(nextSceneParticipants);

        // Location mode/id
        setLocationMode(
          focus.locationMode === 'custom' || focus.locationMode === 'preset' ? focus.locationMode : 'preset'
        );
        setSelectedLocationId(typeof focus.selectedLocationId === 'string' ? focus.selectedLocationId : '');

        // Inputs (overrides)
        const inputs = dump.inputs || {};
        setSelectedEventIds(new Set(Array.isArray(inputs.selectedEventIds) ? inputs.selectedEventIds.map(String) : []));
        setInjectedEvents(Array.isArray(inputs.injectedEvents) ? inputs.injectedEvents : []);
        setSceneControl(
          inputs.sceneControl && typeof inputs.sceneControl === 'object' ? inputs.sceneControl : { presetId: 'safe_hub' }
        );

        // manualAtoms should be normalized to avoid missing fields
        const importedManual = Array.isArray(inputs.manualAtoms) ? inputs.manualAtoms : [];
        setManualAtoms(importedManual.map((a: any) => normalizeAtom(a)));

        // atomOverridesLayer
        setAtomOverridesLayer(
          inputs.atomOverridesLayer && typeof inputs.atomOverridesLayer === 'object'
            ? inputs.atomOverridesLayer
            : { layerId: 'goal-lab', updatedAt: Date.now(), ops: [] }
        );

        // affectOverrides (UI knobs; pipeline already applies them)
        setAffectOverrides(inputs.affectOverrides && typeof inputs.affectOverrides === 'object' ? inputs.affectOverrides : {});

        // Import map (prefer custom-lab-location map if present)
        try {
          const cl = (w.locations || []).find((l: any) => l?.entityId === 'custom-lab-location');
          const m = cl?.map;
          if (m?.width && m?.height) setMap(ensureMapCells(m));
        } catch {}

        // Import positions from agents into actorPositions (and ref!)
        const pos: Record<string, { x: number; y: number }> = {};
        (w.agents || []).forEach((a: any) => {
          const p = a?.position || a?.pos;
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
            pos[String(a.entityId)] = { x: Number(p.x), y: Number(p.y) };
          }
        });
        actorPositionsRef.current = pos;
        setActorPositions(pos);

        // Scenario id from imported world if present
        const scenId = (w as any)?.scenario?.id;
        if (typeof scenId === 'string' && scenId) setActiveScenarioId(scenId);

        // Finally: lock world as imported and set it
        setWorldSource('imported');
        setWorldState(w);
        baselineWorldRef.current = cloneWorld(w);
        setFatalError(null);
        setRuntimeError(null);
      } catch (e: any) {
        console.error('[GoalLab] import failed', e);
        setRuntimeError(String(e?.message || e));
      }
    },
    [resetTransientForNewScene, setMap, setActiveScenarioId]
  );

  const glCtxResult = useMemo(() => {
    if (!worldState) return { ctx: null as any, err: null as string | null };

    const pid = perspectiveAgentId || selectedAgentId;
    if (!pid) return { ctx: null as any, err: null as string | null };

    const worldForCtx = worldState;

    const agent = worldForCtx.agents.find(a => a.entityId === pid);
    if (!agent) return { ctx: null as any, err: `Perspective agent not found in world: ${pid}` };

    try {
      const activeEvents = eventRegistry.getAll().filter(e => selectedEventIds.has(e.id));
      const loc = getSelectedLocationEntity();

      const ctx = buildGoalLabContext(worldForCtx, pid, {
        snapshotOptions: {
          activeEvents,
          // Ensure ToM/affect are computed for the exact scene cast,
          // so every agent has ToM-on-every-agent for the current scene.
          participantIds,
          overrideLocation: loc,
          manualAtoms,
          gridMap: activeMap,
          atomOverridesLayer,
          overrideEvents: injectedEvents,
          sceneControl,
          affectOverrides,
        },
        timeOverride: (worldForCtx as any).tick,
        devValidateAtoms,
      });

      return { ctx, err: null as string | null };
    } catch (e: any) {
      console.error('[GoalSandbox] buildGoalLabContext failed', e);
      return { ctx: null as any, err: String(e?.message || e) };
    }
  }, [
    worldState,
    selectedAgentId,
    perspectiveAgentId,
    manualAtoms,
    selectedEventIds,
    activeMap,
    atomOverridesLayer,
    injectedEvents,
    sceneControl,
    getSelectedLocationEntity,
    affectOverrides,
    devValidateAtoms,
  ]);

  const glCtx = glCtxResult.ctx;

  useEffect(() => {
    // ВАЖНО: setState только в эффектах, не в useMemo
    if (glCtxResult.err) {
      setFatalError(glCtxResult.err);
    } else {
      // аккуратно чистим fatalError только если оно было от glCtx
      setFatalError(prev => (prev ? null : prev));
    }
  }, [glCtxResult.err]);

  const computed = useMemo(() => {
    const empty = {
      frame: null,
      snapshot: null,
      goals: [] as any[],
      locationScores: [] as any[],
      tomScores: [] as any[],
      situation: null as any,
      goalPreview: null as any,
      contextualMind: null as ContextualMindReport | null,
    };

    if (!glCtx || !worldState) {
      return { ...empty, error: null as any };
    }

    try {
      const { agent, frame, snapshot, situation, goalPreview } = glCtx as any;
      snapshot.atoms = dedupeAtomsById(snapshot.atoms);

      const goals = scoreContextualGoals(agent, worldState, snapshot, undefined, frame || undefined);
      const locScores = computeLocationGoalsForAgent(
        worldState,
        agent.entityId,
        (agent as any).locationId || null
      );
      const tomScores = computeTomGoalsForAgent(worldState, agent.entityId);

      let cm: ContextualMindReport | null = null;
      try {
        cm = computeContextualMind({
          world: worldState,
          agent,
          frame: frame || null,
          goalPreview: goalPreview?.goals ?? null,
          domainMix: { ...(snapshot?.domains ?? {}), ...(goalPreview?.debug?.d_mix ?? {}) } as any,
          atoms: snapshot.atoms,
        }).report;
      } catch (e) {
        console.error(e);
      }

      return {
        frame,
        snapshot,
        goals,
        locationScores: locScores,
        tomScores,
        situation,
        goalPreview,
        contextualMind: cm,
        error: null,
      };
    } catch (e: any) {
      console.error('[GoalSandbox] compute pipeline failed', e);
      return { ...empty, error: e };
    }
  }, [glCtx, worldState]);

  const { snapshot, goals, locationScores, tomScores, situation, goalPreview, contextualMind, error: computeError } = computed;

  useEffect(() => {
    if (computeError) {
      setFatalError(String((computeError as any)?.message || computeError));
    }
  }, [computeError]);

  useEffect(() => {
    if (snapshot?.atoms && Array.isArray(snapshot.atoms)) {
      lastSnapshotAtomsRef.current = snapshot.atoms as any;
    }
  }, [snapshot]);

  const snapshotV1 = useMemo(() => {
    if (!glCtx) return null;
    const adapted = adaptToSnapshotV1(glCtx as any, { selfId: perspectiveId } as any);
    const normalized = normalizeSnapshot(adapted);
    if (import.meta.env.DEV) {
      assertArray('snapshot.atoms', normalized.atoms);
      assertArray('snapshot.events', normalized.events);
    }
    return normalized;
  }, [glCtx, perspectiveId]);

  const pipelineV1 = useMemo(() => {
    if (!snapshotV1) return null;
    const stages = arr((snapshotV1 as any)?.meta?.pipelineDeltas);
    return {
      schema: 'GoalLabPipelineV1',
      agentId: perspectiveId,
      selfId: perspectiveId,
      tick: (snapshotV1 as any)?.meta?.tick ?? 0,
      stages,
    } as any;
  }, [snapshotV1, perspectiveId]);

  const pipelineFrame = useMemo(() => {
    if (!snapshotV1) return null;
    const frame = buildDebugFrameFromSnapshot(snapshotV1 as any);
    if (import.meta.env.DEV) {
      assertArray('frame.atoms', (frame as any)?.atoms);
    }
    return frame;
  }, [snapshotV1]);

  const tomMatrixForPerspective = useMemo(() => {
    if (!worldState?.tom) return null;
    if (!perspectiveId) return null;

    const ids = participantIds;
    const tomRoot = (worldState as any).tom;
    const dyads = (tomRoot as any)?.dyads || tomRoot;

    const rows = ids
      .filter(otherId => otherId !== perspectiveId)
      .map(otherId => {
        const dyad =
          (dyads?.[perspectiveId]?.[otherId]) ??
          (dyads?.[perspectiveId]?.dyads?.[otherId]) ??
          ((dyads as any)?.dyads?.[perspectiveId]?.[otherId]);

        return { me: perspectiveId, other: otherId, dyad };
      });

    return rows;
  }, [worldState, participantIds, perspectiveId]);

  const castRows = useMemo(() => {
    if (!worldState) return [];

    const activeEvents = eventRegistry.getAll().filter(e => selectedEventIds.has(e.id));
    const loc = getSelectedLocationEntity();
    const ids = participantIds; // control perf removed; export needs full cast

    return ids.map(id => {
      const char = allCharacters.find(c => c.entityId === id);
      let snap: any = null;

      try {
        const res = buildGoalLabContext(worldState, id, {
          snapshotOptions: {
            activeEvents,
            participantIds,
            overrideLocation: loc,
            manualAtoms,
            gridMap: activeMap,
            atomOverridesLayer,
            overrideEvents: injectedEvents,
            sceneControl,
            affectOverrides,
          },
          timeOverride: (worldState as any).tick,
          devValidateAtoms,
        });
        snap = res?.snapshot ?? null;
      } catch {
        snap = null;
      }

      return {
        id,
        label: char?.title || id,
        snapshot: snap,
      };
    });
  }, [
    worldState,
    participantIds,
    allCharacters,
    selectedEventIds,
    getSelectedLocationEntity,
    manualAtoms,
    activeMap,
    atomOverridesLayer,
    injectedEvents,
    sceneControl,
    affectOverrides,
    devValidateAtoms,
  ]);

  const sceneDumpV2 = useMemo(() => {
    return buildGoalLabSceneDumpV2({
      world: worldState,
      selectedAgentId,
      perspectiveId,
      selectedLocationId,
      locationMode,
      participantIds,
      activeMap,
      selectedEventIds,
      manualAtoms,
      atomOverridesLayer,
      affectOverrides,
      injectedEvents,
      sceneControl,
      glCtx,
      snapshot,
      snapshotV1,
      goals,
      locationScores,
      tomScores,
      situation,
      goalPreview,
      contextualMind,
      pipelineFrame,
      pipelineV1,
      tomMatrixForPerspective,
      castRows,
    });
  }, [
    worldState,
    selectedAgentId,
    perspectiveId,
    selectedLocationId,
    locationMode,
    participantIds,
    activeMap,
    selectedEventIds,
    manualAtoms,
    atomOverridesLayer,
    affectOverrides,
    injectedEvents,
    sceneControl,
    glCtx,
    snapshot,
    snapshotV1,
    goals,
    locationScores,
    tomScores,
    situation,
    goalPreview,
    contextualMind,
    pipelineFrame,
    pipelineV1,
    tomMatrixForPerspective,
    castRows,
  ]);

  const handleRunTicks = useCallback(
    (steps: number) => {
      if (!worldState) return;
      const pid = perspectiveId || selectedAgentId;
      if (!pid) return;

      const prevAtoms = lastSnapshotAtomsRef.current || [];
      const nextWorld = cloneWorld(worldState);

      const activeEvents = eventRegistry.getAll().filter(e => selectedEventIds.has(e.id));
      const loc = getSelectedLocationEntity();

      const result = runTicksForCast({
        world: nextWorld,
        participantIds,
        baseInput: {
          snapshotOptions: {
            participantIds,
            activeEvents,
            overrideLocation: loc,
            manualAtoms,
            gridMap: activeMap,
            atomOverridesLayer,
            overrideEvents: injectedEvents,
            sceneControl,
            affectOverrides,
          },
        },
        cfg: { steps, dt: 1 },
      } as any);

      const snapsForPid: any[] = (result as any)?.snapshotsByAgentId?.[pid] || [];
      const lastSnap = snapsForPid[snapsForPid.length - 1] || null;
      const nextAtoms: ContextAtom[] = (lastSnap?.atoms || []) as any;
      if (prevAtoms && nextAtoms) {
        setAtomDiff(diffAtoms(prevAtoms as any, nextAtoms as any));
      } else {
        setAtomDiff([]);
      }

      // sync positions cache so UI (MapViewer / proximity atoms) doesn’t read stale coords
      const nextPositions: Record<string, { x: number; y: number }> = {};
      (nextWorld as any)?.agents?.forEach((a: any) => {
        if (a?.entityId && a?.position) nextPositions[a.entityId] = a.position;
      });
      actorPositionsRef.current = nextPositions;
      setActorPositions(nextPositions);

      setWorldState(nextWorld);
    },
    [
      worldState,
      selectedAgentId,
      perspectiveId,
      participantIds,
      manualAtoms,
      activeMap,
      atomOverridesLayer,
      sceneControl,
      affectOverrides,
      injectedEvents,
      selectedEventIds,
      getSelectedLocationEntity,
    ]
  );

  const onDownloadScene = useCallback(() => {
    if (!sceneDumpV2) return;

    const exportedAt = new Date().toISOString().replace(/[:.]/g, '-');
    const pid = perspectiveId || selectedAgentId || 'unknown';
    const castTag = Array.isArray(participantIds) && participantIds.length ? `cast-${participantIds.length}` : 'cast';
    downloadJson(sceneDumpV2, `goal-lab-scene__${castTag}__persp-${pid}__${exportedAt}.json`);
  }, [perspectiveId, sceneDumpV2, selectedAgentId, participantIds]);

  const handleExportBundle = useCallback(() => {
    if (!snapshotV1) return;
    const exportedAt = new Date().toISOString().replace(/[:.]/g, '-');

    const payload = {
      schema: 'GoalLabExportBundleV1',
      exportedAt,
      selfId: snapshotV1.selfId,
      tick: snapshotV1.tick,
      snapshotV1,
      pipelineV1: pipelineV1 || null,
      sceneDumpV2: sceneDumpV2 || null,
      cast: (castRows || []).map(r => ({
        id: r.id,
        label: r.label,
        summary: (r.snapshot as any)?.summary || null,
      })),
    };

    downloadJson(
      payload,
      `goal-lab__bundle__${snapshotV1.selfId}__t${snapshotV1.tick}__${exportedAt}.json`
    );
  }, [snapshotV1, pipelineV1, sceneDumpV2, castRows]);

  const handleExportDebugBoth = useCallback(() => {
    if (!worldState) return;

    const dump = buildGoalLabSceneDumpV2({
      world: worldState,
      includePipelineFrames: true,
      includePipelineDeltas: true,
      includeViolations: true,
      selectedAgentId,
      perspectiveId,
      selectedLocationId,
      locationMode,
      participantIds,
      activeMap,
      selectedEventIds,
      manualAtoms,
      atomOverridesLayer,
      affectOverrides,
      injectedEvents,
      sceneControl,
      glCtx,
      snapshot,
      snapshotV1,
      goals,
      locationScores,
      tomScores,
      situation,
      goalPreview,
      contextualMind,
      pipelineFrame,
      pipelineV1,
      tomMatrixForPerspective,
      castRows,
    });

    if (!dump) return;
    const exportedAt = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(dump, `goal-debug__${selectedAgentId || 'agent'}__${exportedAt}.json`);
  }, [
    worldState,
    selectedAgentId,
    perspectiveId,
    selectedLocationId,
    locationMode,
    participantIds,
    activeMap,
    selectedEventIds,
    manualAtoms,
    atomOverridesLayer,
    affectOverrides,
    injectedEvents,
    sceneControl,
    glCtx,
    snapshot,
    snapshotV1,
    goals,
    locationScores,
    tomScores,
    situation,
    goalPreview,
    contextualMind,
    pipelineFrame,
    pipelineV1,
    tomMatrixForPerspective,
    castRows,
  ]);

  const handleExportPipelineAll = useCallback(() => {
    if (pipelineV1) {
      const exportedAt = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJson(
        pipelineV1,
        `goal-lab__pipelineV1__${(pipelineV1 as any).selfId || 'self'}__t${(pipelineV1 as any).tick || 0}__${exportedAt}.json`
      );
      return;
    }
    if (!snapshotV1) return;
    const pipelineDeltasRaw = (snapshotV1 as any).meta?.pipelineDeltas;
    const pipelineDeltas = Array.isArray(pipelineDeltasRaw) ? pipelineDeltasRaw : [];
    const materializedByStage: Record<string, any[]> = {};
    try {
      for (const st of pipelineDeltas) {
        const id = String((st as any)?.id || '');
        if (!id) continue;
        materializedByStage[id] = materializeStageAtoms(pipelineDeltas, id);
      }
    } catch {}

    const payload = {
      schema: 'GoalLabPipelineExportV2',
      tick: snapshotV1.tick,
      selfId: snapshotV1.selfId,
      pipelineDeltas,
      materializedByStage,
      finalAtoms: snapshotV1.atoms,
    };
    downloadJson(payload, `goal-lab__pipeline__${snapshotV1.selfId}__t${snapshotV1.tick}.json`);
  }, [snapshotV1, pipelineV1]);

  const handleExportPipelineStage = useCallback(
    (stageId: string) => {
      if (pipelineV1 && Array.isArray((pipelineV1 as any).stages)) {
        const st = (pipelineV1 as any).stages.find(
          (s: any) => String(s?.stage || s?.id) === String(stageId)
        );
        if (!st) return;
        downloadJson(
          st,
          `goal-lab__pipelineV1__stage-${stageId}__${(pipelineV1 as any).selfId || 'self'}__t${(pipelineV1 as any).tick || 0}.json`
        );
        return;
      }
      if (!snapshotV1) return;
      const stagesRaw = (snapshotV1 as any).meta?.pipelineDeltas;
      const stages = Array.isArray(stagesRaw) ? stagesRaw : [];
      const st = stages.find((s: any) => s.id === stageId);
      if (!st) return;
      const materialized = materializeStageAtoms(stages, stageId);
      const payload = {
        schema: 'GoalLabPipelineStageExportV2',
        tick: snapshotV1.tick,
        selfId: snapshotV1.selfId,
        stageId,
        delta: st,
        materializedAtoms: materialized,
      };
      downloadJson(payload, `goal-lab__stage-${stageId}__${snapshotV1.selfId}__t${snapshotV1.tick}.json`);
    },
    [snapshotV1, pipelineV1]
  );

  const handleImportSceneClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportSceneFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        if (!payload || ![2, 3].includes(payload.schemaVersion)) {
          throw new Error('Invalid scene dump: expected schemaVersion=2 or 3');
        }
        handleImportSceneDumpV2(payload);
      } catch (e: any) {
        console.error('[GoalLab] failed to import scene JSON', e);
        setRuntimeError(String(e?.message || e));
      }
    },
    [handleImportSceneDumpV2]
  );

  const handleResetSim = useCallback(() => {
    const base = baselineWorldRef.current;
    if (!base) return;
    const w = cloneWorld(base);

    const nextPositions: Record<string, { x: number; y: number }> = {};
    const agents = asArray<any>((w as any).agents);
    agents.forEach((a: any) => {
      if (a?.entityId && a?.position) nextPositions[a.entityId] = a.position;
    });

    actorPositionsRef.current = nextPositions;
    setActorPositions(nextPositions);
    setAtomDiff([]);
    setWorldState(w);
  }, []);

  const mapHighlights = useMemo(() => {
    if (!worldState) return [];
    const agents = asArray<any>((worldState as any)?.agents);
    return agents.map((a: any) => ({
      x: (a as any).position?.x ?? 0,
      y: (a as any).position?.y ?? 0,
      color: a.entityId === selectedAgentId ? '#00aaff' : (a as any).hp < 70 ? '#ff4444' : '#33ff99',
    }));
  }, [worldState, selectedAgentId]);

  const actionsLocLint = useMemo(() => {
    try {
      return lintActionsAndLocations();
    } catch (e) {
      return {
        issues: [
          {
            severity: 'error',
            kind: 'unknown_action_token',
            locationId: '(lint)',
            path: '(lint)',
            message: `Lint failed: ${(e as any)?.message ?? String(e)}`,
          },
        ],
        stats: {
          locations: 0,
          locationsWithAffordances: 0,
          errors: 1,
          warnings: 0,
          knownActionIds: 0,
          knownTags: 0,
        },
      };
    }
  }, []);

  // Prefer staged pipeline ids, fallback to snapshot deltas (or a safe default list) for legacy data.
  const pipelineStageOptions = useMemo(() => {
    if (pipelineV1 && Array.isArray((pipelineV1 as any).stages)) {
      return (pipelineV1 as any).stages
        .map((s: any, idx: number) => String(s?.stage || s?.id || `S${idx}`))
        .filter((x: string) => !!x);
    }
    const deltasRaw = (snapshotV1 as any)?.meta?.pipelineDeltas;
    const deltas = Array.isArray(deltasRaw) ? deltasRaw : [];
    const ids = deltas.map((d: any, idx: number) => String(d?.id || `S${idx}`)).filter((x: string) => !!x);
    return ids.length ? ids : ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
  }, [pipelineV1, snapshotV1]);

  const pipelineStageLabelById = useMemo(() => {
    const m = new Map<string, string>();
    if (pipelineV1 && Array.isArray((pipelineV1 as any).stages)) {
      for (const s of (pipelineV1 as any).stages) {
        const id = String(s?.stage || s?.id || '');
        const label = String(s?.title || s?.label || id);
        if (id) m.set(id, label);
      }
    }
    return m;
  }, [pipelineV1]);

  const pipelineStageIndex = useMemo(() => {
    const i = pipelineStageOptions.indexOf(String(pipelineStageId));
    return i >= 0 ? i : pipelineStageOptions.length - 1;
  }, [pipelineStageOptions, pipelineStageId]);

  const currentPipelineStageId = useMemo(() => {
    if (pipelineStageIndex < 0) return pipelineStageId;
    return pipelineStageOptions[pipelineStageIndex] || pipelineStageId;
  }, [pipelineStageIndex, pipelineStageOptions, pipelineStageId]);

  const handlePrevStage = useCallback(() => {
    if (!pipelineStageOptions.length) return;
    const next = Math.max(0, pipelineStageIndex - 1);
    const id = pipelineStageOptions[next];
    if (id) setPipelineStageId(id);
  }, [pipelineStageOptions, pipelineStageIndex]);

  const handleNextStage = useCallback(() => {
    if (!pipelineStageOptions.length) return;
    const next = Math.min(pipelineStageOptions.length - 1, pipelineStageIndex + 1);
    const id = pipelineStageOptions[next];
    if (id) setPipelineStageId(id);
  }, [pipelineStageOptions, pipelineStageIndex]);

  // ===== atoms for the currently selected pipeline stage (for Passport UI) =====
  const passportAtoms = useMemo(() => {
    // Prefer pipelineV1 if present.
    if (pipelineV1 && Array.isArray((pipelineV1 as any).stages)) {
      const stages = (pipelineV1 as any).stages;
      const st =
        stages.find((s: any) => String(s?.stage || s?.id) === String(currentPipelineStageId)) ||
        stages[stages.length - 1];
      const atoms = asArray<any>(st?.atoms ?? st?.materializedAtoms ?? st?.fullAtoms ?? []);
      if (atoms.length) return atoms;
    }

    // Fallback: materialize from snapshotV1.meta.pipelineDeltas.
    if (snapshotV1) {
      const deltasRaw = (snapshotV1 as any).meta?.pipelineDeltas;
      const deltas = Array.isArray(deltasRaw) ? deltasRaw : [];
      if (deltas.length) {
        try {
          return materializeStageAtoms(deltas, String(currentPipelineStageId));
        } catch {}
      }
      return asArray<any>(snapshotV1.atoms as any);
    }

    // Legacy fallback.
    return asArray<any>(((snapshot as any)?.atoms) as any);
  }, [pipelineV1, snapshotV1, snapshot, currentPipelineStageId]);

  return (
    <div className="h-full flex flex-col bg-canon-bg text-canon-text overflow-hidden">
      <div className="sticky top-0 z-40 backdrop-blur bg-black/40 border-b border-white/10 px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => setToolbarCollapsed(v => !v)}
          className="w-7 h-7 flex items-center justify-center rounded border border-white/10 bg-white/5 hover:bg-white/10 text-[12px]"
          title={toolbarCollapsed ? 'Expand toolbar' : 'Collapse toolbar'}
        >
          {toolbarCollapsed ? '▾' : '▴'}
        </button>
        <div className="text-[12px] opacity-80">GoalSandbox</div>
        {!toolbarCollapsed ? (
          <div className="flex items-center gap-1 ml-2">
            {([
              ['left', 'LEFT'],
              ['cast', 'CAST'],
              ['compare', 'COMPARE'],
              ['passport', 'PASSPORT'],
              ['front', 'FRONT'],
              ['results', 'RESULTS'],
              ['emo', 'EMO'],
              ['frame', 'FRAME'],
              ['lint', 'LINT'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => togglePanel(k)}
                className={`px-2 py-1 text-[11px] rounded border border-white/10 transition-colors ${uiPanels?.[k] ? 'bg-white/10 hover:bg-white/15' : 'bg-transparent opacity-60 hover:opacity-100 hover:bg-white/10'}`}
                title={k}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[11px] opacity-60 ml-2">toolbar collapsed</div>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setHudCollapsed(v => !v)}
          className="px-3 py-2 text-[11px] font-semibold border border-canon-border/60 rounded bg-canon-bg-light/20 hover:bg-canon-bg-light/30 transition-colors"
          title="Свернуть/развернуть верхние панели (export/stage controls)"
        >
          {hudCollapsed ? 'Show HUD' : 'Hide HUD'}
        </button>
        {!hudCollapsed ? (
          <button
            onClick={handleExportBundle}
            className={toolbarCollapsed
              ? 'px-3 py-2 text-[11px] font-extrabold border border-canon-accent rounded bg-canon-accent/20 hover:bg-canon-accent/30 transition-colors'
              : 'px-4 py-2 text-[12px] font-extrabold border-2 border-canon-accent rounded bg-canon-accent/20 hover:bg-canon-accent/30 transition-colors'}
            title="Экспорт одного bundle: snapshot + pipeline + scene"
          >
            ⬇ EXPORT BUNDLE
          </button>
        ) : null}
      </div>
      <div className="flex-1 grid grid-cols-12 min-h-0">
        {uiPanels.left ? (
          <div className="col-span-3 border-r border-canon-border bg-canon-bg-light/30 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
            <div className="h-64 border-b border-canon-border relative bg-black">
              <MapViewer
                map={activeMap}
                isEditor={locationMode === 'custom' && !placingActorId}
                onMapChange={setMap}
                onCellClick={handleActorClick}
                highlights={mapHighlights as any}
              />
            </div>

            <div className="p-2">
              <GoalLabControls
                allCharacters={allCharacters}
                allLocations={allLocations as any}
                allEvents={eventRegistry.getAll() as any}
                computedAtoms={asArray<any>((snapshotV1?.atoms ?? (snapshot as any)?.atoms) as any)}
                selectedAgentId={selectedAgentId}
                onSelectAgent={handleSelectAgent}
                selectedLocationId={selectedLocationId}
                onSelectLocation={setSelectedLocationId}
                locationMode={locationMode}
                onLocationModeChange={setLocationMode}
                selectedEventIds={selectedEventIds}
                onToggleEvent={id =>
                  setSelectedEventIds(prev => {
                    const n = new Set(prev);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                manualAtoms={manualAtoms}
                onChangeManualAtoms={setManualAtoms}
                nearbyActors={nearbyActors}
                onNearbyActorsChange={handleNearbyActorsChange}
                placingActorId={placingActorId}
                onStartPlacement={setPlacingActorId}
                affectOverrides={affectOverrides}
                onAffectOverridesChange={setAffectOverrides}
                onRunTicks={handleRunTicks}
                onResetSim={handleResetSim}
                onDownloadScene={onDownloadScene}
                onImportSceneDumpV2={handleImportSceneDumpV2}
                world={worldState as any}
                onWorldChange={(w: any) => setWorldState(normalizeWorldShape(w)) as any}
                participantIds={participantIds}
                onAddParticipant={handleAddParticipant}
                onRemoveParticipant={handleRemoveParticipant}
                onLoadScene={handleLoadScene}
                perspectiveAgentId={perspectiveId}
                onSelectPerspective={setPerspectiveAgentId}
                sceneControl={sceneControl}
                onSceneControlChange={setSceneControl}
                scenePresets={Object.values(SCENE_PRESETS) as any}
              />
            </div>
          </div>
        ) : null}

        <div className={uiPanels.left ? 'col-span-9 flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6' : 'col-span-12 flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6'}>
          {!hudCollapsed ? (
            <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-canon-bg/90 backdrop-blur border-b border-canon-border flex items-center gap-3">
            <button
              onClick={() => setStageBarCollapsed(v => !v)}
              className="w-7 h-7 flex items-center justify-center rounded border border-canon-border/60 bg-canon-bg-light/20 hover:bg-canon-bg-light/30 text-[12px]"
              title={stageBarCollapsed ? 'Expand stage bar' : 'Collapse stage bar'}
            >
              {stageBarCollapsed ? '▾' : '▴'}
            </button>

            {!stageBarCollapsed ? (
              <>
                <button
                  className="px-3 py-2 rounded border border-canon-border/60 bg-canon-bg-light/20 text-[11px] font-semibold hover:bg-canon-bg-light/30 transition-colors"
                  onClick={() => setAdvancedExportsOpen(v => !v)}
                  title="Показать/скрыть дополнительные экспорты"
                >
                  {advancedExportsOpen ? 'Hide advanced exports' : 'Advanced exports'}
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <div className="text-[11px] opacity-70">stage</div>
                  <button
                    className="px-2 py-1 text-[11px] rounded border border-canon-border/60 hover:bg-white/5 disabled:opacity-40"
                    onClick={handlePrevStage}
                    disabled={!pipelineStageOptions.length || pipelineStageIndex <= 0}
                    title="Предыдущая стадия"
                  >
                    ◀
                  </button>
                  <select
                    className="px-2 py-1 text-[11px] rounded border border-canon-border/60 bg-canon-bg min-w-[88px]"
                    value={currentPipelineStageId}
                    onChange={(e) => setPipelineStageId(e.target.value)}
                    title="Выбор стадии пайплайна"
                  >
                    {pipelineStageOptions.map(id => {
                      const label = pipelineStageLabelById.get(id) || id;
                      return (
                        <option key={id} value={id}>
                          {id} — {label}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    className="px-2 py-1 text-[11px] rounded border border-canon-border/60 hover:bg-white/5 disabled:opacity-40"
                    onClick={handleNextStage}
                    disabled={!pipelineStageOptions.length || pipelineStageIndex >= pipelineStageOptions.length - 1}
                    title="Следующая стадия"
                  >
                    ▶
                  </button>
                  <div className="ml-3 flex items-center gap-2">
                    <div className="text-[11px] opacity-70">staged pipe</div>
                    <div className="text-[11px] font-mono opacity-90">{pipelineV1 ? 'on' : 'off'}</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] opacity-70 ml-1">stage</div>
                <div className="text-[11px] font-mono opacity-90">{currentPipelineStageId}</div>
                <div className="flex-1" />
                <button
                  className="px-2 py-1 text-[11px] rounded border border-canon-border/60 hover:bg-white/5"
                  onClick={() => setAdvancedExportsOpen(v => !v)}
                  title="Показать/скрыть дополнительные экспорты"
                >
                  {advancedExportsOpen ? 'Advanced ▲' : 'Advanced ▼'}
                </button>
                <button
                  className="px-2 py-1 text-[11px] rounded border border-canon-border/60 hover:bg-white/5 disabled:opacity-40"
                  onClick={handlePrevStage}
                  disabled={!pipelineStageOptions.length || pipelineStageIndex <= 0}
                  title="Предыдущая стадия"
                >
                  ◀
                </button>
                <button
                  className="px-2 py-1 text-[11px] rounded border border-canon-border/60 hover:bg-white/5 disabled:opacity-40"
                  onClick={handleNextStage}
                  disabled={!pipelineStageOptions.length || pipelineStageIndex >= pipelineStageOptions.length - 1}
                  title="Следующая стадия"
                >
                  ▶
                </button>
              </>
            )}
            {advancedExportsOpen ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="px-3 py-2 rounded bg-canon-accent text-black font-semibold text-[11px]"
                  onClick={handleExportDebugBoth}
                  title="Экспорт: input + output + S0..S* atoms + deltas + validations"
                >
                  EXPORT DEBUG (JSON)
                </button>
                <button
                  className="px-3 py-2 rounded border border-canon-border bg-canon-bg-light/30 text-canon-text font-semibold text-[11px] hover:bg-canon-bg-light/50 transition-colors"
                  onClick={handleExportPipelineAll}
                  title="Экспорт детерминированного пайплайна по стадиям (S0..S8)"
                >
                  EXPORT PIPELINE (JSON)
                </button>
                <button
                  className="px-3 py-2 rounded border border-canon-border bg-canon-bg-light/30 text-canon-text font-semibold text-[11px] hover:bg-canon-bg-light/50 transition-colors"
                  onClick={onDownloadScene}
                  title="Экспорт всей сцены (world + cast snapshots + overrides + events + scene control)"
                >
                  EXPORT SCENE (JSON)
                </button>
              </div>
            ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-6">
            {fatalError && (
              <div className="bg-red-900/40 border border-red-500/60 text-red-200 p-4 rounded">
                <div className="font-bold text-sm mb-1">Goal Lab error</div>
                <div className="text-xs font-mono whitespace-pre-wrap opacity-80">{fatalError}</div>
              </div>
            )}

            {runtimeError && !fatalError && (
              <div className="bg-amber-900/30 border border-amber-500/60 text-amber-100 p-4 rounded">
                <div className="font-bold text-sm mb-1">Goal Lab warning</div>
                <div className="text-xs font-mono whitespace-pre-wrap opacity-80">{runtimeError}</div>
              </div>
            )}

            {uiPanels.cast ? (
              <CastPerspectivePanel
                rows={castRows}
                focusId={perspectiveId}
                onFocus={setPerspectiveAgentId}
              />
            ) : null}

            {uiPanels.compare ? (
              <CastComparePanel
                rows={castRows}
                focusId={perspectiveId}
              />
            ) : null}

            {uiPanels.passport ? (
              <AgentPassportPanel
                atoms={passportAtoms}
                selfId={perspectiveId || ''}
                title="How the agent sees the situation"
              />
            ) : null}

            {uiPanels.front && snapshotV1 ? (
              <FrontShell
                snapshotV1={snapshotV1 as any}
                selfId={perspectiveId || ''}
                actorLabels={actorLabels}
              />
            ) : null}

            {uiPanels.results && !uiPanels.front ? (
              <GoalLabResults
                context={snapshot as any}
                actorLabels={actorLabels}
                perspectiveAgentId={perspectiveId}
                tomRows={tomMatrixForPerspective}
                goalScores={goals as any}
                situation={situation as any}
                goalPreview={goalPreview as any}
                contextualMind={contextualMind as any}
                locationScores={locationScores as any}
                tomScores={tomScores as any}
                tom={(worldState as any)?.tom?.[perspectiveId]}
                atomDiff={atomDiff as any}
                snapshotV1={snapshotV1 as any}
                pipelineV1={pipelineV1 as any}
                pipelineStageId={currentPipelineStageId}
                onChangePipelineStageId={setPipelineStageId}
                onExportPipelineStage={handleExportPipelineStage}
                onExportPipelineAll={handleExportPipelineAll}
                sceneDump={sceneDumpV2 as any}
                onDownloadScene={onDownloadScene}
                onImportScene={handleImportSceneClick}
                manualAtoms={manualAtoms}
                onChangeManualAtoms={setManualAtoms}
              />
            ) : null}

            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImportSceneFile(file);
                e.currentTarget.value = '';
              }}
            />

          {uiPanels.emo && snapshotV1 ? (
            <div className="mt-4">
              <EmotionInspector
                selfId={perspectiveId}
                atoms={asArray<any>(snapshotV1.atoms as any)}
                setManualAtom={setManualAtom}
              />
            </div>
          ) : null}

          {uiPanels.frame && pipelineFrame ? (
            <div className="mt-4">
              <h3 className="text-lg font-bold text-canon-accent uppercase tracking-widest mb-4 border-b border-canon-border/40 pb-2">
                Pipeline Debug Area (Stage 0-3)
              </h3>
              <FrameDebugPanel frame={pipelineFrame as any} />
            </div>
          ) : null}

          {uiPanels.lint ? (
            <div className="mt-4">
              <h3 className="text-lg font-bold text-canon-accent uppercase tracking-widest mb-4 border-b border-canon-border/40 pb-2">
                Actions × Locations Lint
              </h3>

              <div className="text-sm opacity-80 mb-2">
                Locations: {actionsLocLint.stats.locations} • with affordances:{' '}
                {actionsLocLint.stats.locationsWithAffordances} • known actionIds:{' '}
                {actionsLocLint.stats.knownActionIds} • known tags:{' '}
                {actionsLocLint.stats.knownTags}
              </div>

              {(actionsLocLint.stats.errors + actionsLocLint.stats.warnings) === 0 ? (
                <div className="text-sm">No issues.</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm">
                    Errors: <b>{actionsLocLint.stats.errors}</b> • Warnings:{' '}
                    <b>{actionsLocLint.stats.warnings}</b>
                  </div>

                  <div className="max-h-72 overflow-auto border border-canon-border/40 rounded p-2">
                    {actionsLocLint.issues.map((it, idx) => (
                      <div
                        key={idx}
                        className="text-xs py-1 border-b border-canon-border/20 last:border-b-0"
                      >
                        <div>
                          <b>{it.severity.toUpperCase()}</b> • {it.locationId}
                        </div>
                        <div className="opacity-80">
                          {it.path}
                          {it.token ? ` :: ${it.token}` : ''}
                        </div>
                        <div>{it.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
