
// components/GoalSandbox/GoalSandbox.tsx

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { CharacterEntity, EntityType, LocationMap, AffectState, LocationEntity, Branch, LocalActorRef, WorldState, AgentState } from '../../types';
import { useSandbox } from '../../contexts/SandboxContext';
import { getEntitiesByType, getEntityById } from '../../data';
import { createInitialWorld } from '../../lib/world/initializer';
import { scoreContextualGoals } from '../../lib/context/v2/scoring';
import { ContextAtom, ContextSnapshot } from '../../lib/context/v2/types';
import { GoalLabResults } from '../goal-lab/GoalLabResults';
import { Slider } from '../Slider';
import { allLocations } from '../../data/locations';
import { updateTomFromContextGoals } from '../../lib/tom/api';
import { computeLocationGoalsForAgent } from '../../lib/context/v2/locationGoals';
import { computeTomGoalsForAgent } from '../../lib/context/v2/tomGoals';
import { GoalLabControls } from '../goal-lab/GoalLabControls';
import { eventRegistry } from '../../data/events-registry';
import { buildGoalLabContext } from '../../lib/goals/goalLabContext';
import { computeContextualMind } from '../../lib/tom/contextual/engine';
import type { ContextualMindReport } from '../../lib/tom/contextual/types';
import { MapViewer } from '../locations/MapViewer';
import { Tabs } from '../Tabs';
import { normalizeAtom } from '../../lib/context/v2/infer';
import { AtomOverrideLayer } from '../../lib/context/overrides/types';
import { runTicks } from '../../lib/engine/tick';
import { diffAtoms, AtomDiff } from '../../lib/snapshot/diffAtoms';
import { adaptToSnapshotV1 } from '../../lib/goal-lab/snapshotAdapter';

// Pipeline Imports
import { buildFrameMvp } from '../../lib/context/buildFrameMvp';
import { FrameDebugPanel } from '../GoalLab/FrameDebugPanel';
import { ScenePreset } from '../../data/presets/scenes';
import { SCENE_PRESETS } from '../../lib/scene/presets';
import { initTomForCharacters } from '../../lib/tom/init';
import { assignRoles } from '../../lib/roles/assignment';
import { constructGil } from '../../lib/gil/apply';
import type { DyadConfigForA } from '../../lib/tom/dyad-metrics';
import { ensureMapCells } from '../../lib/world/ensureMapCells';

function createCustomLocationEntity(map: LocationMap): LocationEntity {
    const cells = map.cells || [];
    const avgDanger = cells.length > 0 ? cells.reduce((s, c) => s + c.danger, 0) / cells.length : 0;
    
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
             ...map
        },
        physics: { 
            environmentalStress: avgDanger * 0.5, 
            mobilityCost: 1, 
            collisionRisk: avgDanger * 0.3, 
            climbable: false, jumpable: false, crawlable: false, weightLimit: 1000, 
            acousticsProfile: { echo: 0.5, dampening: 0.5 } 
        },
        hazards: avgDanger > 0.3 ? [{ id: 'map_haz', type: 'collapse', intensity: avgDanger }] : [], 
        norms: { requiredBehavior: [], forbiddenBehavior: [], penalties: {} },
        properties: { privacy: 'public', control_level: 0.5, visibility: 0.8, noise: 0.2 }
    } as unknown as LocationEntity;
}

const dedupeAtomsById = (arr: ContextAtom[]) => {
  const seen = new Set<string>();
  const out: ContextAtom[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const a = arr[i];
    if (!a || !a.id) continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.unshift(a);
  }
  return out;
};

export const GoalSandbox: React.FC = () => {
    const { characters: sandboxCharacters, setDyadConfigFor } = useSandbox();
    const [fatalError, setFatalError] = useState<string | null>(null);
    
    const allCharacters = useMemo(() => {
        const base = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
        const map = new Map<string, CharacterEntity>();
        [...base, ...sandboxCharacters].forEach(c => map.set(c.entityId, c));
        return Array.from(map.values());
    }, [sandboxCharacters]);
    
    const [selectedAgentId, setSelectedAgentId] = useState<string>(allCharacters[0]?.entityId || '');
    const [activeScenarioId, setActiveScenarioId] = useState<string>('cave_rescue'); // Track active scenario
    
    // Core World State
    const [worldState, setWorldState] = useState<WorldState | null>(null);
    
    // Scene Management
    const [map, setMap] = useState<LocationMap>(() => 
        ensureMapCells({ id: 'sandbox', width: 12, height: 12, cells: [], defaultWalkable: true, defaultDanger: 0, defaultCover: 0 })
    );
    const [actorPositions, setActorPositions] = useState<Record<string, {x: number, y: number}>>({});
    
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
      ops: []
    });
    
    const [injectedEvents, setInjectedEvents] = useState<any[]>([]);
    const [sceneControl, setSceneControl] = useState<any>({ presetId: 'safe_hub' });
    
    const [atomDiff, setAtomDiff] = useState<AtomDiff[]>([]);
    
    // Persistent Cast Management
    const [sceneCast, setSceneCast] = useState<Set<string>>(new Set());

    // Optional per-scene dyad configs (A->B perception weights), typically from ScenePreset
    const [runtimeDyadConfigs, setRuntimeDyadConfigs] = useState<Record<string, DyadConfigForA> | null>(null);

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

    const getActiveLocationId = useCallback(() => {
        if (locationMode === 'preset' && selectedLocationId) return selectedLocationId;
        return 'custom-lab-location';
    }, [locationMode, selectedLocationId]);

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

    const refreshWorldDerived = useCallback((prev: WorldState, nextAgents: AgentState[]) => {
        const locId = getActiveLocationId();
        const agentIds = nextAgents.map(a => a.entityId);

        const agentsWithLoc = nextAgents.map(a => {
            const pos = actorPositions[a.entityId] || (a as any).position || { x: 5, y: 5 };
            return { ...(a as any), locationId: locId, position: pos } as AgentState;
        });

        const initialRelations = ensureCompleteInitialRelations(agentIds, (prev as any).initialRelations);

        const worldBase: WorldState = {
            ...(prev as any),
            agents: agentsWithLoc,
            initialRelations,
        };

        const roleMap = assignRoles(worldBase.agents, worldBase.scenario, worldBase);
        worldBase.agents = worldBase.agents.map(a => ({ ...(a as any), effectiveRole: roleMap[a.entityId] } as AgentState));
        worldBase.tom = initTomForCharacters(worldBase.agents as any, worldBase as any, runtimeDyadConfigs || undefined) as any;
        (worldBase as any).gilParams = constructGil(worldBase.agents as any) as any;

        return { ...(worldBase as any) };
    }, [actorPositions, ensureCompleteInitialRelations, getActiveLocationId, runtimeDyadConfigs]);

    const participantIds = useMemo(() => {
        if (!worldState) {
             const ids = new Set(sceneCast);
             if (selectedAgentId) ids.add(selectedAgentId);
             return Array.from(ids);
        }
        return worldState.agents.map(a => a.entityId);
    }, [sceneCast, selectedAgentId, worldState]);

    const handleSelectAgent = useCallback((id: string) => {
        if (worldState && worldState.agents.some(a => a.entityId === id)) {
            setSelectedAgentId(id);
        } else {
            setSceneCast(prev => {
                const next = new Set(prev);
                next.add(id);
                return next;
            });
            setSelectedAgentId(id);
            persistActorPositions();
            setWorldState(null);
        }
    }, [worldState, persistActorPositions]);

    const resolveCharacterId = useCallback((rawId: string): string | null => {
        if (!rawId) return null;

        const exact = allCharacters.find(c => c.entityId === rawId);
        if (exact) return exact.entityId;

        const prefixed = `character-${rawId}`;
        const pref = allCharacters.find(c => c.entityId === prefixed);
        if (pref) return pref.entityId;

        const loose = allCharacters.find(c =>
            c.entityId.endsWith(rawId) || c.entityId.includes(rawId)
        );
        return loose ? loose.entityId : null;
    }, [allCharacters]);

    // Initialize World
    useEffect(() => {
        if (!worldState && selectedAgentId) {
            const subject = allCharacters.find(c => c.entityId === selectedAgentId);
            const castIds = new Set(sceneCast);
            castIds.add(selectedAgentId);
            
            const participants = Array.from(castIds)
                .map(id => allCharacters.find(c => c.entityId === id))
                .filter(Boolean) as CharacterEntity[];
            
            if (subject && participants.length > 0) {
                const w = createInitialWorld(Date.now(), participants, activeScenarioId);
                if (w) {
                    w.groupGoalId = undefined;
                    w.locations = [getSelectedLocationEntity(), ...allLocations];
                    const nextPositions = { ...actorPositions };
                    
                    // Placement: if no position, scatter slightly
                    w.agents.forEach((a, i) => {
                        if (actorPositions[a.entityId]) {
                            (a as any).position = actorPositions[a.entityId];
                            nextPositions[a.entityId] = actorPositions[a.entityId];
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

                    const ids = w.agents.map(a => a.entityId);
                    (w as any).initialRelations = ensureCompleteInitialRelations(ids, (w as any).initialRelations);

                    const roleMap = assignRoles(w.agents as any, w.scenario as any, w as any);
                    w.agents = w.agents.map(a => ({ ...(a as any), effectiveRole: roleMap[a.entityId] } as AgentState));
                    w.tom = initTomForCharacters(w.agents as any, w as any, runtimeDyadConfigs || undefined) as any;
                    (w as any).gilParams = constructGil(w.agents as any) as any;

                    setActorPositions(nextPositions);
                    setWorldState(w);
                }
            }
        }
    }, [worldState, allCharacters, selectedAgentId, sceneCast, actorPositions, activeScenarioId, runtimeDyadConfigs, getSelectedLocationEntity, getActiveLocationId, ensureCompleteInitialRelations]);

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
        if (!worldState) return [];
        return worldState.agents
            .filter(a => a.entityId !== selectedAgentId)
            .map(a => {
                // Calculate actual distance
                const myPos = (worldState.agents.find(me => me.entityId === selectedAgentId) as any)?.position || {x:0,y:0};
                const otherPos = (a as any).position || {x:0,y:0};
                const dist = Math.sqrt(Math.pow(myPos.x - otherPos.x, 2) + Math.pow(myPos.y - otherPos.y, 2));

                return {
                    id: a.entityId,
                    label: a.title,
                    kind: 'neutral',
                    role: a.effectiveRole || 'observer',
                    distance: dist,
                    threatLevel: 0
                };
            });
    }, [worldState, selectedAgentId]);

    const handleNearbyActorsChange = (newActors: LocalActorRef[]) => {
        const currentIds = new Set(worldState?.agents.map(a => a.entityId) || []);
        const addedRef = newActors.find(a => !currentIds.has(a.id));

        if (addedRef && worldState) {
            const char = allCharacters.find(c => c.entityId === addedRef.id);
            if (char) {
                const temp = createInitialWorld(Date.now(), [char], activeScenarioId);
                if (temp && temp.agents[0]) {
                    const newAgent = temp.agents[0];
                    if (actorPositions[addedRef.id]) {
                        (newAgent as any).position = actorPositions[addedRef.id];
                    } else {
                        (newAgent as any).position = { x: 6, y: 6 };
                    }
                    setWorldState(prev => {
                        if (!prev) return null;
                        return refreshWorldDerived(prev, [...prev.agents, newAgent]);
                    });
                }
            }
        }

        const newIds = new Set(newActors.map(a => a.id));
        if (worldState) {
            const removedIds = worldState.agents
                .filter(a => a.entityId !== selectedAgentId && !newIds.has(a.entityId))
                .map(a => a.entityId);
                
            if (removedIds.length > 0) {
                 setWorldState(prev => {
                     if (!prev) return null;
                     const nextAgents = prev.agents.filter(a => !removedIds.includes(a.entityId));
                     return refreshWorldDerived(prev, nextAgents);
                 });
            }
        }

        setSceneCast(newIds);
        persistActorPositions();
        if (!worldState) setWorldState(null);
    };
    
    // Scene Preset Loader
    const handleLoadScene = (scene: ScenePreset) => {
        if (!scene?.characters?.length) return;

        setRuntimeDyadConfigs((scene as any).configs || null);

        const resolvedChars = scene.characters
            .map(id => resolveCharacterId(id))
            .filter(Boolean) as string[];

        const fallbackId = allCharacters[0]?.entityId || '';
        const nextSelected = resolvedChars[0] || resolveCharacterId(scene.characters[0]) || fallbackId;
        const nextCast = new Set<string>(resolvedChars.length ? resolvedChars : (nextSelected ? [nextSelected] : []));

        setSelectedAgentId(nextSelected);
        setSceneCast(nextCast); 
        
        if (scene.configs) {
            Object.entries(scene.configs).forEach(([id, cfg]) => {
                const rid = resolveCharacterId(id);
                if (rid) setDyadConfigFor(rid, cfg);
            });
        }

        if (scene.locationId) {
            setSelectedLocationId(scene.locationId);
            setLocationMode('preset');
        }
        
        if (scene.suggestedScenarioId) {
             setActiveScenarioId(scene.suggestedScenarioId);
        }
        
        const enginePreset = scene.enginePresetId || 'safe_hub';
        setSceneControl({ presetId: enginePreset, metrics: {}, norms: {} });
        
        setActorPositions({});

        setWorldState(null); // Trigger full rebuild
    };

    const activeMap = useMemo(() => {
        if (locationMode === 'custom') return ensureMapCells(map);
        if (selectedLocationId) {
            const loc = allLocations.find(l => l.entityId === selectedLocationId);
            if (loc?.map) return ensureMapCells(loc.map);
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

    const glCtx = useMemo(() => {
        try {
            if (!worldState) return null;
            const agent = worldState.agents.find(a => a.entityId === selectedAgentId);
            if (!agent) return null;

            const activeEvents = eventRegistry.getAll().filter(e => selectedEventIds.has(e.id));
            const loc = getSelectedLocationEntity();

            setFatalError(null);
            return buildGoalLabContext(worldState, selectedAgentId, {
                snapshotOptions: {
                    activeEvents,
                    overrideLocation: loc,
                    manualAtoms,
                    gridMap: activeMap,
                    atomOverridesLayer, 
                    overrideEvents: injectedEvents,
                    sceneControl
                },
                timeOverride: worldState.tick
            });
        } catch (err: any) {
            console.error(err);
            setFatalError(err?.message || 'Unknown Goal Lab error');
            return null;
        }
    }, [worldState, selectedAgentId, manualAtoms, selectedEventIds, activeMap, atomOverridesLayer, injectedEvents, sceneControl, getSelectedLocationEntity]);

    const pipelineFrame = useMemo(() => {
        if (!glCtx || !glCtx.snapshot) return null;
        const scene = {
            agent: worldState?.agents.find(a => a.entityId === selectedAgentId),
            location: getSelectedLocationEntity(),
            otherAgents: worldState?.agents.filter(a => a.entityId !== selectedAgentId).map(a => ({
                id: a.entityId,
                name: a.title,
                pos: (a as any).position || {x:0, y:0},
                isWounded: a.hp < 70
            })),
            overrides: manualAtoms,
            tick: worldState?.tick ?? 0
        };
        return buildFrameMvp(scene);
    }, [glCtx, selectedAgentId, getSelectedLocationEntity, worldState, manualAtoms]);

    const { snapshot, goals, locationScores, tomScores, situation, goalPreview, contextualMind } = useMemo(() => {
        if (!glCtx || !worldState) return { frame: null, snapshot: null, goals: [], locationScores: [], tomScores: [], situation: null, goalPreview: null, contextualMind: null };

        const { agent, frame, snapshot, situation, goalPreview } = glCtx;
        snapshot.atoms = dedupeAtomsById(snapshot.atoms);

        const goals = scoreContextualGoals(agent, worldState, snapshot, undefined, frame || undefined);
        const locScores = computeLocationGoalsForAgent(worldState, agent.entityId, (agent as any).locationId || null);
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
        } catch (e) { console.error(e); }

        return { frame, snapshot, goals, locationScores: locScores, tomScores, situation, goalPreview, contextualMind: cm };
    }, [glCtx, worldState]);

    const snapshotV1 = useMemo(() => {
        if (!glCtx) return null;
        return adaptToSnapshotV1(glCtx, { selfId: selectedAgentId });
    }, [glCtx, selectedAgentId]);

    const handleRunTicks = useCallback((steps: number) => {
        if (!worldState || !selectedAgentId) return;
        const result = runTicks({ world: worldState, agentId: selectedAgentId, baseInput: { snapshotOptions: { manualAtoms, gridMap: activeMap, atomOverridesLayer, sceneControl } }, cfg: { steps, dt: 1 } });
        setWorldState({ ...worldState, tick: result.tick });
    }, [worldState, selectedAgentId, manualAtoms, activeMap, atomOverridesLayer, sceneControl]);

    const mapHighlights = useMemo(() => {
        if (!worldState) return [];
        return worldState.agents.map(a => ({
            x: (a as any).position?.x ?? 0,
            y: (a as any).position?.y ?? 0,
            color: a.entityId === selectedAgentId ? '#00aaff' : (a.hp < 70 ? '#ff4444' : '#33ff99')
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
                             highlights={mapHighlights}
                         />
                    </div>
                    <div className="p-2">
                        <GoalLabControls 
                            allCharacters={allCharacters} allLocations={allLocations} allEvents={eventRegistry.getAll()}
                            selectedAgentId={selectedAgentId} onSelectAgent={handleSelectAgent}
                            selectedLocationId={selectedLocationId} onSelectLocation={setSelectedLocationId}
                            locationMode={locationMode} onLocationModeChange={setLocationMode}
                            selectedEventIds={selectedEventIds} onToggleEvent={id => setSelectedEventIds(prev => {const n = new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n;})}
                            manualAtoms={manualAtoms} onChangeManualAtoms={setManualAtoms}
                            nearbyActors={nearbyActors} onNearbyActorsChange={handleNearbyActorsChange}
                            placingActorId={placingActorId} onStartPlacement={setPlacingActorId}
                            affectOverrides={affectOverrides} onAffectOverridesChange={setAffectOverrides}
                            onRunTicks={handleRunTicks}
                            world={worldState} onWorldChange={setWorldState}
                            participantIds={participantIds}
                            onLoadScene={handleLoadScene}
                            sceneControl={sceneControl}
                            onSceneControlChange={setSceneControl}
                            scenePresets={Object.values(SCENE_PRESETS)}
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
                        <GoalLabResults 
                            context={snapshot} 
                            goalScores={goals} 
                            situation={situation}
                            goalPreview={goalPreview}
                            contextualMind={contextualMind}
                            locationScores={locationScores}
                            tomScores={tomScores}
                            tom={worldState?.tom?.[selectedAgentId]}
                            atomDiff={atomDiff}
                            snapshotV1={snapshotV1}
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
