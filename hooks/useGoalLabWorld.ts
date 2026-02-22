/**
 * useGoalLabWorld — world lifecycle management for GoalLab.
 *
 * Extracts world creation, rebuild, and agent-mutation logic that was
 * previously inlined in GoalSandbox.tsx (~400 lines of callbacks).
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { CharacterEntity, WorldState, AgentState, LocationMap, LocationEntity, LocalActorRef } from '../types';
import { createInitialWorld } from '../lib/world/initializer';
import { normalizeWorldShape } from '../lib/world/normalizeWorldShape';
import { ensureMapCells } from '../lib/world/ensureMapCells';
import { assignRoles } from '../lib/roles/assignment';
import { initTomForCharacters } from '../lib/tom/init';
import { constructGil } from '../lib/gil/apply';
import { allLocations } from '../data/locations';
import { arr } from '../lib/utils/arr';
import type { DyadConfigForA } from '../lib/tom/dyad-metrics';

type Positions = Record<string, { x: number; y: number }>;

function positionsEqual(a: Positions, b: Positions): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k]?.x === b[k]?.x && a[k]?.y === b[k]?.y);
}

function cloneWorld(w: WorldState): WorldState {
  try { return JSON.parse(JSON.stringify(w)); } catch { return { ...w } as WorldState; }
}

function createCustomLocationEntity(map: LocationMap): LocationEntity {
  return {
    entityId: 'custom-lab-location',
    entityType: 'location' as any,
    title: 'Custom Lab Location',
    properties: {},
    map,
  } as any;
}

export interface GoalLabWorldConfig {
  allCharacters: CharacterEntity[];
  initialAgentId?: string;
  initialScenarioId?: string;
}

export interface SimSettings {
  runSeed: string;
  decisionTemperature: number;
  decisionCurvePreset: string;
}

export interface GoalLabWorldHandle {
  allCharacters: CharacterEntity[];
  worldState: WorldState | null;
  worldSource: 'derived' | 'imported';
  sceneParticipants: Set<string>;
  selectedAgentId: string;
  perspectiveAgentId: string | null;
  perspectiveId: string;
  participantIds: string[];
  activeScenarioId: string;
  selectedLocationId: string;
  locationMode: 'preset' | 'custom';
  activeMap: LocationMap;
  nearbyActors: LocalActorRef[];
  actorPositions: Positions;
  runtimeError: string | null;
  fatalError: string | null;
  setSelectedAgentId: (id: string) => void;
  setPerspectiveAgentId: (id: string | null) => void;
  setActiveScenarioId: (id: string) => void;
  setSelectedLocationId: (id: string) => void;
  setLocationMode: (mode: 'preset' | 'custom') => void;
  addParticipant: (id: string) => void;
  removeParticipant: (id: string) => void;
  setSceneParticipants: (ids: Set<string>) => void;
  setAgentLocation: (agentId: string, locationId: string) => void;
  setAgentPosition: (agentId: string, pos: { x: number; y: number }) => void;
  moveAllToLocation: (locationId: string) => void;
  updateAgentVitals: (agentId: string, patch: { hp?: number; fatigue?: number; stress?: number }) => void;
  forceRebuild: () => void;
  importWorld: (w: WorldState) => void;
  simSettings: SimSettings;
  setSimSettings: (s: Partial<SimSettings>) => void;
  applySimSettings: () => void;
  baselineWorldRef: React.MutableRefObject<WorldState | null>;
  getSelectedLocationEntity: () => LocationEntity;
}

export function useGoalLabWorld(config: GoalLabWorldConfig): GoalLabWorldHandle {
  const { allCharacters, initialAgentId, initialScenarioId } = config;
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [worldSource, setWorldSource] = useState<'derived' | 'imported'>('derived');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [runtimeError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgentId || allCharacters[0]?.entityId || '');
  const [perspectiveAgentId, setPerspectiveAgentId] = useState<string | null>(null);
  const perspectiveId = perspectiveAgentId || selectedAgentId;
  const [activeScenarioId, setActiveScenarioId] = useState<string>(initialScenarioId || 'cave_rescue');
  const [sceneParticipants, setSceneParticipants] = useState<Set<string>>(() => new Set());
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [locationMode, setLocationMode] = useState<'preset' | 'custom'>('preset');
  const [rebuildNonce, setRebuildNonce] = useState(0);
  const [map] = useState<LocationMap>(() => ensureMapCells({ width: 12, height: 10, cells: [] } as any));
  const [simSettings, setSimSettingsState] = useState<SimSettings>({
    runSeed: String(Date.now()), decisionTemperature: 1.0, decisionCurvePreset: 'smoothstep',
  });
  const simRef = useRef(simSettings);
  useEffect(() => { simRef.current = simSettings; }, [simSettings]);
  const setSimSettings = useCallback((patch: Partial<SimSettings>) => {
    setSimSettingsState(prev => ({ ...prev, ...patch }));
  }, []);
  const [actorPositions, setActorPositions] = useState<Positions>({});
  const actorPositionsRef = useRef<Positions>({});
  useEffect(() => { actorPositionsRef.current = actorPositions; }, [actorPositions]);
  const [actorLocationOverrides, setActorLocationOverrides] = useState<Record<string, string>>({});
  const actorLocationOverridesRef = useRef<Record<string, string>>({});
  useEffect(() => { actorLocationOverridesRef.current = actorLocationOverrides; }, [actorLocationOverrides]);
  const [runtimeDyadConfigs] = useState<Record<string, DyadConfigForA> | null>(null);
  const baselineWorldRef = useRef<WorldState | null>(null);

  const participantIds = useMemo(() => {
    const ids = Array.from(sceneParticipants);
    if (selectedAgentId && !ids.includes(selectedAgentId)) ids.unshift(selectedAgentId);
    return ids;
  }, [sceneParticipants, selectedAgentId]);

  const activeMap = useMemo(() => {
    if (locationMode === 'custom') return ensureMapCells(map);
    if (selectedLocationId) {
      const loc = allLocations.find(l => l.entityId === selectedLocationId);
      if ((loc as any)?.map) return ensureMapCells((loc as any).map);
    }
    return ensureMapCells(map);
  }, [locationMode, map, selectedLocationId]);

  const getActiveLocationId = useCallback(() => {
    if (locationMode === 'preset' && selectedLocationId) return selectedLocationId;
    return 'custom-lab-location';
  }, [locationMode, selectedLocationId]);

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
        out[a][b] = { trust: out[a]?.[b]?.trust ?? 0.4, bond: out[a]?.[b]?.bond ?? 0.2, authority: out[a]?.[b]?.authority ?? 0.4 };
      }
    }
    return out;
  }, []);

  const refreshWorldDerived = useCallback((prev: WorldState, nextAgents: AgentState[]) => {
    const defaultLocId = getActiveLocationId();
    const agentIds = nextAgents.map(a => a.entityId);
    const agentsWithLoc = nextAgents.map(a => ({ ...(a as any), locationId: actorLocationOverridesRef.current[a.entityId] || defaultLocId, position: actorPositionsRef.current[a.entityId] || (a as any).position || { x: 5, y: 5 } } as AgentState));
    const initialRelations = ensureCompleteInitialRelations(agentIds, (prev as any).initialRelations);
    const worldBase: WorldState = { ...(prev as any), agents: agentsWithLoc, initialRelations };
    const roleMap = assignRoles(worldBase.agents, worldBase.scenario, worldBase);
    worldBase.agents = worldBase.agents.map(a => ({ ...(a as any), effectiveRole: (roleMap as any)[a.entityId] } as AgentState));
    worldBase.tom = initTomForCharacters(worldBase.agents as any, worldBase as any, runtimeDyadConfigs || undefined) as any;
    (worldBase as any).gilParams = constructGil(worldBase.agents as any) as any;
    return { ...(worldBase as any) };
  }, [ensureCompleteInitialRelations, getActiveLocationId, runtimeDyadConfigs]);

  const patchAgents = useCallback((patcher: (agent: any) => any) => {
    setWorldState(prev => {
      if (!prev) return prev;
      const nextAgents = arr((prev as any).agents).map(patcher);
      try {
        return worldSource === 'derived' ? (refreshWorldDerived(prev, nextAgents) as any) : ({ ...(prev as any), agents: nextAgents } as any);
      } catch { return { ...(prev as any), agents: nextAgents } as any; }
    });
  }, [worldSource, refreshWorldDerived]);

  const forceRebuild = useCallback(() => setRebuildNonce(n => n + 1), []);
  const applySimSettings = useCallback(() => { setWorldSource('derived'); forceRebuild(); }, [forceRebuild]);
  const addParticipant = useCallback((id: string) => {
    if (!id || !allCharacters.some(c => c.entityId === id)) return;
    setWorldSource('derived');
    setSceneParticipants(prev => { const next = new Set(prev); next.add(id); return next; });
    forceRebuild();
  }, [allCharacters, forceRebuild]);

  const removeParticipant = useCallback((id: string) => {
    if (!id || id === selectedAgentId) return;
    setWorldSource('derived');
    setSceneParticipants(prev => { const next = new Set(prev); next.delete(id); return next; });
    forceRebuild();
  }, [selectedAgentId, forceRebuild]);

  const setAgentLocation = useCallback((agentId: string, locationId: string) => {
    const aid = String(agentId).trim(); const lid = String(locationId).trim(); if (!aid) return;
    setActorLocationOverrides(prev => ({ ...prev, [aid]: lid }));
    patchAgents(a => String(a?.entityId) === aid ? { ...a, locationId: lid } : a);
  }, [patchAgents]);

  const setAgentPosition = useCallback((agentId: string, pos: { x: number; y: number }) => {
    const aid = String(agentId).trim(); if (!aid || !Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) return;
    setActorPositions(prev => ({ ...prev, [aid]: pos }));
    patchAgents(a => String(a?.entityId) === aid ? { ...a, position: pos } : a);
  }, [patchAgents]);

  const moveAllToLocation = useCallback((locationId: string) => {
    const lid = String(locationId).trim(); if (!lid) return;
    const ids = participantIds.map(String);
    setActorLocationOverrides(prev => { const next = { ...prev }; for (const id of ids) next[id] = lid; return next; });
    patchAgents(a => ids.includes(String(a?.entityId)) ? { ...a, locationId: lid } : a);
  }, [participantIds, patchAgents]);

  const updateAgentVitals = useCallback((agentId: string, patch: { hp?: number; fatigue?: number; stress?: number }) => {
    const aid = String(agentId).trim(); if (!aid) return;
    patchAgents(a => {
      if (String(a?.entityId) !== aid) return a;
      const next = { ...a }; const body = { ...(next.body || {}) } as any; const acute = { ...(body.acute || {}) } as any;
      if (patch.hp != null && Number.isFinite(+patch.hp)) { acute.hp = +patch.hp; next.hp = +patch.hp; }
      if (patch.fatigue != null && Number.isFinite(+patch.fatigue)) { acute.fatigue = +patch.fatigue; next.fatigue = +patch.fatigue; }
      if (patch.stress != null && Number.isFinite(+patch.stress)) { acute.stress = +patch.stress; next.stress = +patch.stress; }
      body.acute = acute; next.body = body; return next;
    });
  }, [patchAgents]);

  const importWorld = useCallback((w: WorldState) => {
    setWorldSource('imported');
    setWorldState(normalizeWorldShape(w));
  }, []);

  const nearbyActors = useMemo<LocalActorRef[]>(() => {
    const ids = Array.from(sceneParticipants).filter(id => id !== selectedAgentId);
    const mePos = (worldState?.agents.find(a => a.entityId === selectedAgentId) as any)?.position || actorPositions[selectedAgentId] || { x: 0, y: 0 };
    return ids.map(id => {
      const char = allCharacters.find(c => c.entityId === id); if (!char) return null;
      const agentPos = (worldState?.agents.find(a => a.entityId === id) as any)?.position || actorPositions[id] || { x: 6, y: 6 };
      const dist = Math.hypot(mePos.x - agentPos.x, mePos.y - agentPos.y);
      const roleFromWorld = (worldState?.agents.find(a => a.entityId === id) as any)?.effectiveRole;
      return { id, label: char.title, kind: 'neutral', role: roleFromWorld || (char as any).roles?.global?.[0] || 'observer', distance: dist, threatLevel: 0 } as LocalActorRef;
    }).filter(Boolean) as LocalActorRef[];
  }, [sceneParticipants, selectedAgentId, allCharacters, worldState, actorPositions]);

  useEffect(() => {
    if (!allCharacters.length) return;
    if (!selectedAgentId || !allCharacters.some(c => c.entityId === selectedAgentId)) setSelectedAgentId(allCharacters[0].entityId);
  }, [allCharacters, selectedAgentId]);
  useEffect(() => { if (!perspectiveAgentId && selectedAgentId) setPerspectiveAgentId(selectedAgentId); }, [perspectiveAgentId, selectedAgentId]);
  useEffect(() => { if (!participantIds.length) return; if (perspectiveId && participantIds.includes(perspectiveId)) return; setPerspectiveAgentId(participantIds[0]); }, [participantIds, perspectiveId]);
  useEffect(() => { if (!selectedAgentId) return; setSceneParticipants(prev => prev.size ? prev : new Set([selectedAgentId])); }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId || worldSource === 'imported') return;
    const ids = new Set(sceneParticipants); ids.add(selectedAgentId);
    const participants = Array.from(ids).map(id => allCharacters.find(c => c.entityId === id)).filter(Boolean) as CharacterEntity[];
    if (!participants.length) return;
    const normSeed = (raw: string): number | string => {
      const n = Number(raw); return Number.isFinite(n) ? n : raw;
    };
    try {
      const w = createInitialWorld(Date.now(), participants, activeScenarioId, undefined, undefined, {
        runSeed: normSeed(simRef.current.runSeed),
        decisionTemperature: simRef.current.decisionTemperature,
        decisionCurvePreset: simRef.current.decisionCurvePreset,
      });
      if (!w) { setFatalError(`createInitialWorld returned null for scenario: ${activeScenarioId}`); return; }
      (w as any).decisionTemperature = simRef.current.decisionTemperature;
      w.groupGoalId = undefined;
      w.locations = [getSelectedLocationEntity(), ...allLocations].map(loc => {
        const m = (loc as any)?.map;
        if (!m) return loc as any;
        try { return { ...(loc as any), map: ensureMapCells(m) } as any; } catch { return loc as any; }
      });
      const nextPositions = { ...actorPositionsRef.current };
      w.agents.forEach((a, i) => {
        if (actorPositionsRef.current[a.entityId]) {
          (a as any).position = actorPositionsRef.current[a.entityId];
        } else {
          const pos = { x: 5 + (i % 3) * 2, y: 5 + Math.floor(i / 3) * 2 };
          (a as any).position = pos;
          nextPositions[a.entityId] = pos;
        }
      });
      const locId = getActiveLocationId();
      w.agents = arr((w as any).agents).map((a: any) => ({ ...a, locationId: locId } as AgentState));
      const agentIds = arr((w as any).agents).map((a: any) => a.entityId);
      (w as any).initialRelations = ensureCompleteInitialRelations(agentIds, (w as any).initialRelations);
      const roleMap = assignRoles(w.agents as any, w.scenario as any, w as any);
      w.agents = w.agents.map(a => ({ ...(a as any), effectiveRole: (roleMap as any)[a.entityId] } as AgentState));
      w.tom = initTomForCharacters(w.agents as any, w as any, runtimeDyadConfigs || undefined) as any;
      (w as any).gilParams = constructGil(w.agents as any) as any;
      setActorPositions(prev => positionsEqual(prev, nextPositions) ? prev : nextPositions);
      setWorldState(w);
      baselineWorldRef.current = cloneWorld(w);
      setFatalError(null);
    } catch (e: any) {
      console.error('[useGoalLabWorld] rebuild failed', e);
      setFatalError(String(e?.message || e));
    }
  }, [rebuildNonce, selectedAgentId, sceneParticipants, allCharacters, activeScenarioId, runtimeDyadConfigs, getSelectedLocationEntity, getActiveLocationId, ensureCompleteInitialRelations, worldSource]);

  return {
    allCharacters, worldState, worldSource, sceneParticipants, selectedAgentId,
    perspectiveAgentId, perspectiveId, participantIds, activeScenarioId,
    selectedLocationId, locationMode, activeMap, nearbyActors,
    actorPositions, runtimeError, fatalError,
    setSelectedAgentId, setPerspectiveAgentId, setActiveScenarioId,
    setSelectedLocationId, setLocationMode, addParticipant, removeParticipant,
    setSceneParticipants, setAgentLocation, setAgentPosition, moveAllToLocation,
    updateAgentVitals, forceRebuild, importWorld,
    simSettings, setSimSettings, applySimSettings,
    baselineWorldRef, getSelectedLocationEntity,
  };
}
