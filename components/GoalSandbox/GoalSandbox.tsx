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
import { scoreContextualGoals } from '../../lib/context/v2/scoring';
import type { ContextAtom } from '../../lib/context/v2/types';
import { GoalLabResults } from '../goal-lab/GoalLabResults';
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
import { runTicks } from '../../lib/engine/tick';
import type { AtomDiff } from '../../lib/snapshot/diffAtoms';
import { adaptToSnapshotV1 } from '../../lib/goal-lab/snapshotAdapter';
import { CastPerspectivePanel } from '../goal-lab/CastPerspectivePanel';
import { allScenarioDefs } from '../../data/scenarios/index';

// Pipeline Imports
import { buildFrameMvp } from '../../lib/context/buildFrameMvp';
import { FrameDebugPanel } from '../GoalLab/FrameDebugPanel';
import type { ScenePreset } from '../../data/presets/scenes';
import { SCENE_PRESETS } from '../../lib/scene/presets';
import { initTomForCharacters } from '../../lib/tom/init';
import { assignRoles } from '../../lib/roles/assignment';
import { constructGil } from '../../lib/gil/apply';
import type { DyadConfigForA } from '../../lib/tom/dyad-metrics';
import { ensureMapCells } from '../../lib/world/ensureMapCells';

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

export const GoalSandbox: React.FC = () => {
  const { characters: sandboxCharacters, setDyadConfigFor } = useSandbox();

  const [fatalError, setFatalError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const allCharacters = useMemo(() => {
    // Единый источник правды: реестр + runtime-characters (и essences внутри).
    const base = getAllCharactersWithRuntime();
    const map = new Map<string, CharacterEntity>();
    [...base, ...sandboxCharacters].forEach(c => map.set(c.entityId, c));
    return Array.from(map.values());
  }, [sandboxCharacters]);

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
  const actorPositionsRef = useRef(actorPositions);
  useEffect(() => {
    actorPositionsRef.current = actorPositions;
  }, [actorPositions]);
  const [rebuildNonce, setRebuildNonce] = useState(0);

  const [locationMode, setLocationMode] = useState<'preset' | 'custom'>('preset');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [placingActorId, setPlacingActorId] = useState<string | null>(null);

  // Debug & Overrides
  const [affectOverrides, setAffectOverrides] = useState<Partial<AffectState>>({});
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [manualAtoms, setManualAtoms] = useState<ContextAtom[]>([]);

  // Atom Overrides
  const [atomOverridesLayer, setAtomOverridesLayer] = useState<AtomOverrideLayer>({
    layerId: 'goal-lab',
    updatedAt: Date.now(),
    ops: [],
  });

  const [injectedEvents, setInjectedEvents] = useState<any[]>([]);
  const [sceneControl, setSceneControl] = useState<any>({ presetId: 'safe_hub' });

  const [atomDiff, setAtomDiff] = useState<AtomDiff[]>([]);

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
    if (!selectedAgentId) return;
    setSceneParticipants(prev => {
      const next = new Set(prev);
      next.add(selectedAgentId);
      return next;
    });
  }, [selectedAgentId]);

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

  useEffect(() => {
    if (!worldState) return;

    const actual = new Set(worldState.agents.map(a => a.entityId));

    // Reconcile scene participants to match actual world agents without triggering rebuild loops
    setSceneParticipants(prev => {
      const prevPlusSelected = new Set(prev);
      if (selectedAgentId) prevPlusSelected.add(selectedAgentId);

      let same = prevPlusSelected.size === actual.size;
      if (same) {
        for (const id of prevPlusSelected) {
          if (!actual.has(id)) {
            same = false;
            break;
          }
        }
      }

      return same ? prev : new Set(actual);
    });
  }, [worldState, selectedAgentId]);

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
      w.agents = w.agents.map(a => ({ ...(a as any), locationId: locId } as AgentState));

      const allIds = w.agents.map(a => a.entityId);
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

      // If already in the current world, just focus it (do NOT mutate cast)
      if (worldState && worldState.agents.some(a => a.entityId === id)) {
        setSelectedAgentId(id);
        return;
      }

      // Ensure the focused agent is part of the scene participants
      setSceneParticipants(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      setSelectedAgentId(id);
      persistActorPositions();
      forceRebuildWorld();
    },
    [worldState, persistActorPositions, forceRebuildWorld]
  );

  const handleAddParticipant = useCallback(
    (id: string) => {
      if (!id) return;
      if (id === selectedAgentId) return;

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
      w.agents = w.agents.map(a => ({ ...(a as any), locationId: locId } as AgentState));

      const agentIds = w.agents.map(a => a.entityId);
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
    const next = new Set<string>(newActors.map(a => a.id));
    if (selectedAgentId) next.add(selectedAgentId); // always keep focus inside the scene
    setSceneParticipants(next);
    persistActorPositions();
    forceRebuildWorld();
  };

  // Scene Preset Loader
  const handleLoadScene = (scene: ScenePreset) => {
    if (!scene?.characters?.length) return;

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

    if ((scene as any).locationId) {
      setSelectedLocationId((scene as any).locationId);
      setLocationMode('preset');
    }

    const sid = (scene as any).suggestedScenarioId;
    if (sid) {
      if (allScenarioDefs[sid]) {
        setActiveScenarioId(sid);
      } else {
        // не ломаем worldState; просто сообщаем
        setFatalError(`Preset scene requested unknown scenarioId: ${String(sid)}`);
      }
    }

    const enginePreset = (scene as any).enginePresetId || 'safe_hub';
    setSceneControl({ presetId: enginePreset, metrics: {}, norms: {} });

    setActorPositions({});
    forceRebuildWorld();
  };

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

  const glCtxResult = useMemo(() => {
    if (!worldState) return { ctx: null as any, err: null as string | null };

    const perspectiveId2 = perspectiveAgentId || selectedAgentId;
    if (!perspectiveId2) return { ctx: null as any, err: null as string | null };

    const agent = worldState.agents.find(a => a.entityId === perspectiveId2);
    if (!agent) return { ctx: null as any, err: null as string | null };

    try {
      const activeEvents = eventRegistry.getAll().filter(e => selectedEventIds.has(e.id));
      const loc = getSelectedLocationEntity();

      const ctx = buildGoalLabContext(worldState, perspectiveId2, {
        snapshotOptions: {
          activeEvents,
          overrideLocation: loc,
          manualAtoms,
          gridMap: activeMap,
          atomOverridesLayer,
          overrideEvents: injectedEvents,
          sceneControl,
        },
        timeOverride: (worldState as any).tick,
      });

      return { ctx, err: null as string | null };
    } catch (e: any) {
      console.error(e);
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
  ]);

  const glCtx = glCtxResult.ctx;

  useEffect(() => {
    if (glCtxResult.err) {
      setFatalError(glCtxResult.err);
    }
  }, [glCtxResult.err]);

  const pipelineFrame = useMemo(() => {
    if (!glCtx || !(glCtx as any).snapshot) return null;
    const scene = {
      agent: worldState?.agents.find(a => a.entityId === (perspectiveAgentId || selectedAgentId)),
      location: getSelectedLocationEntity(),
      otherAgents: worldState?.agents
        .filter(a => a.entityId !== (perspectiveAgentId || selectedAgentId))
        .map(a => ({
          id: a.entityId,
          name: (a as any).title,
          pos: (a as any).position || { x: 0, y: 0 },
          isWounded: (a as any).hp < 70,
        })),
      overrides: manualAtoms,
      tick: (worldState as any)?.tick ?? 0,
    };
    return buildFrameMvp(scene as any);
  }, [glCtx, selectedAgentId, getSelectedLocationEntity, worldState, manualAtoms]);

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

  const snapshotV1 = useMemo(() => {
    if (!glCtx) return null;
    return adaptToSnapshotV1(glCtx as any, { selfId: perspectiveId } as any);
  }, [glCtx, perspectiveId]);

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
    const ids = participantIds.slice(0, 8); // control perf

    return ids.map(id => {
      const char = allCharacters.find(c => c.entityId === id);
      let snap: any = null;

      try {
        const res = buildGoalLabContext(worldState, id, {
          snapshotOptions: {
            activeEvents,
            overrideLocation: loc,
            manualAtoms,
            gridMap: activeMap,
            atomOverridesLayer,
            overrideEvents: injectedEvents,
            sceneControl,
          },
          timeOverride: (worldState as any).tick,
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
  ]);

  const handleRunTicks = useCallback(
    (steps: number) => {
      if (!worldState || !selectedAgentId) return;
      const result = runTicks({
        world: worldState,
        agentId: selectedAgentId,
        baseInput: { snapshotOptions: { manualAtoms, gridMap: activeMap, atomOverridesLayer, sceneControl } },
        cfg: { steps, dt: 1 },
      } as any);
      setWorldState({ ...(worldState as any), tick: (result as any).tick });
    },
    [worldState, selectedAgentId, manualAtoms, activeMap, atomOverridesLayer, sceneControl]
  );

  const mapHighlights = useMemo(() => {
    if (!worldState) return [];
    return worldState.agents.map(a => ({
      x: (a as any).position?.x ?? 0,
      y: (a as any).position?.y ?? 0,
      color: a.entityId === selectedAgentId ? '#00aaff' : (a as any).hp < 70 ? '#ff4444' : '#33ff99',
    }));
  }, [worldState, selectedAgentId]);

  return (
    <div className="h-full flex flex-col bg-canon-bg text-canon-text overflow-hidden">
      <div className="flex-1 grid grid-cols-12 min-h-0">
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
              world={worldState as any}
              onWorldChange={setWorldState as any}
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

        <div className="col-span-9 flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
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

            <CastPerspectivePanel
              rows={castRows}
              focusId={perspectiveId}
              onFocus={setPerspectiveAgentId}
            />

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
            />

            {pipelineFrame && (
              <div className="mt-4">
                <h3 className="text-lg font-bold text-canon-accent uppercase tracking-widest mb-4 border-b border-canon-border/40 pb-2">
                  Pipeline Debug Area (Stage 0-3)
                </h3>
                <FrameDebugPanel frame={pipelineFrame as any} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
