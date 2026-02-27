/**
 * GoalLabContext v2 — thin provider that wires hooks into a single context.
 *
 * Architecture:
 *   useGoalLabWorld  → world lifecycle, agents, scene
 *   useGoalLabEngine → computation pipeline, snapshot, goals
 *   GoalLabContext   → glues them, provides to children via useGoalLab()
 *
 * All GoalLab pages wrap their content in <GoalLabProvider>.
 * Children read data via useGoalLab() — zero prop drilling.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import type { AffectState } from '../types';
import type { ContextAtom } from '../lib/context/v2/types';
import type { AtomOverrideLayer } from '../lib/context/overrides/types';
import { useGoalLabWorld, type GoalLabWorldHandle, type GoalLabWorldConfig } from '../hooks/useGoalLabWorld';
import { useGoalLabEngine, type GoalLabEngineResult, type EngineNeeds, type GoalLabVM } from '../hooks/useGoalLabEngine';
import { getAllCharactersWithRuntime } from '../data';
import { useAccess } from './AccessContext';
import { useSandbox } from './SandboxContext';
import { filterCharactersForActiveModule } from '../lib/modules/visibility';

// ---------------------------------------------------------------------------
// UI state types
// ---------------------------------------------------------------------------

export type UiMode = 'easy' | 'front' | 'debug' | 'console';
export type FrontTab = 'graph' | 'situation' | 'metrics' | 'affects' | 'curves' | 'tests' | 'report' | 'debug';
export type BottomTab = 'debug' | 'tom' | 'pipeline' | 'pomdp' | 'compare' | 'curves';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface GoalLabContextValue {
  world: GoalLabWorldHandle;
  engine: GoalLabEngineResult;

  // Overrides
  affectOverrides: Partial<AffectState>;
  setAffectOverrides: (o: Partial<AffectState>) => void;
  manualAtoms: ContextAtom[];
  setManualAtoms: (atoms: ContextAtom[]) => void;
  selectedEventIds: Set<string>;
  toggleEvent: (id: string) => void;
  atomOverridesLayer: AtomOverrideLayer;
  setAtomOverridesLayer: (l: AtomOverrideLayer) => void;
  injectedEvents: any[];
  setInjectedEvents: (updater: (prev: any[]) => any[]) => void;
  sceneControl: any;
  setSceneControl: (c: any) => void;
  decisionNonce: number;
  bumpDecisionNonce: () => void;
  observeLiteParams: { radius: number; maxAgents: number; noiseSigma: number; seed: number };
  setObserveLiteParams: (p: { radius: number; maxAgents: number; noiseSigma: number; seed: number }) => void;

  // UI
  uiMode: UiMode;
  setUiMode: (m: UiMode) => void;
  frontTab: FrontTab;
  setFrontTab: (t: FrontTab) => void;
  bottomTab: BottomTab;
  setBottomTab: (t: BottomTab) => void;

  // Derived
  actorLabels: Record<string, string>;
  allCharacters: any[];
  vm: GoalLabVM;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const GoalLabContext = createContext<GoalLabContextValue | null>(null);

export const GoalLabProvider: React.FC<{
  children: ReactNode;
  forcedUiMode?: UiMode;
}> = ({ children, forcedUiMode }) => {
  const { activeModule } = useAccess();
  const { characters: sandboxCharacters } = useSandbox();

  const allCharacters = useMemo(() => {
    const base = getAllCharactersWithRuntime();
    const filtered = filterCharactersForActiveModule(base as any, activeModule as any) as any[];
    // Merge sandbox (user-created) characters, matching original GoalSandbox behavior
    const map = new Map<string, any>();
    for (const c of filtered) map.set(c.entityId, c);
    for (const c of sandboxCharacters) map.set(c.entityId, c);
    return Array.from(map.values());
  }, [activeModule, sandboxCharacters]);

  // --- World ---
  const worldConfig: GoalLabWorldConfig = useMemo(() => ({
    allCharacters,
    initialAgentId: allCharacters[0]?.entityId || '',
    initialScenarioId: 'cave_rescue',
  }), [allCharacters]);

  const world = useGoalLabWorld(worldConfig);

  // --- Overrides ---
  const [affectOverrides, setAffectOverrides] = useState<Partial<AffectState>>({});
  const [manualAtoms, setManualAtoms] = useState<ContextAtom[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [atomOverridesLayer, setAtomOverridesLayer] = useState<AtomOverrideLayer>({ rules: [], label: 'default' });
  const [injectedEvents, setInjectedEventsRaw] = useState<any[]>([]);
  const setInjectedEvents = useCallback((updater: (prev: any[]) => any[]) => setInjectedEventsRaw(updater), []);
  // Default: enablePredict=true so POMDP is always available as prototype.
  const [sceneControl, setSceneControl] = useState<any>({ presetId: 'safe_hub', enablePredict: true });
  const [decisionNonce, setDecisionNonce] = useState(0);
  const bumpDecisionNonce = useCallback(() => setDecisionNonce(n => n + 1), []);
  const [observeLiteParams, setObserveLiteParams] = useState({ radius: 10, maxAgents: 12, noiseSigma: 0, seed: 0 });

  // Keep observeLite seed synced to world RNG seed (but don't override user-edited values).
  useEffect(() => {
    const s = Number((world.worldState as any)?.rngSeed ?? 0);
    if (!Number.isFinite(s)) return;
    setObserveLiteParams(p => (p.seed === 0 ? { ...p, seed: s } : p));
  }, [world.worldState]);
  const toggleEvent = useCallback((id: string) => {
    setSelectedEventIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  // --- UI ---
  const [uiMode, setUiMode] = useState<UiMode>(forcedUiMode || 'front');
  const [frontTab, setFrontTab] = useState<FrontTab>('graph');
  const [bottomTab, setBottomTab] = useState<BottomTab>('pipeline');

  // --- Engine needs (lazy computation gating) ---
  const engineNeeds: EngineNeeds = useMemo(() => ({
    contextualMind: uiMode === 'console' || uiMode === 'debug' || frontTab === 'debug' || bottomTab === 'tom',
    castRows: uiMode === 'console' || uiMode === 'debug' || frontTab === 'metrics' || bottomTab === 'compare',
    pomdpPipeline: uiMode === 'easy' || uiMode === 'console' || bottomTab === 'pomdp',
  }), [uiMode, frontTab, bottomTab]);

  // --- Engine ---
  const engine = useGoalLabEngine(world, {
    affectOverrides, manualAtoms, selectedEventIds, atomOverridesLayer,
    injectedEvents, sceneControl, decisionNonce, observeLiteParams,
  }, engineNeeds);

  // --- Actor labels ---
  const actorLabels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ch of allCharacters) m[ch.entityId] = ch.title || ch.entityId;
    return m;
  }, [allCharacters]);

  const value = useMemo<GoalLabContextValue>(() => ({
    world, engine, allCharacters,
    affectOverrides, setAffectOverrides,
    manualAtoms, setManualAtoms,
    selectedEventIds, toggleEvent,
    atomOverridesLayer, setAtomOverridesLayer,
    injectedEvents, setInjectedEvents,
    sceneControl, setSceneControl,
    decisionNonce, bumpDecisionNonce,
    observeLiteParams, setObserveLiteParams,
    uiMode, setUiMode, frontTab, setFrontTab, bottomTab, setBottomTab,
    actorLabels, vm: engine.vm,
  }), [
    world, engine, allCharacters,
    affectOverrides, manualAtoms, selectedEventIds, atomOverridesLayer,
    injectedEvents, sceneControl, decisionNonce, observeLiteParams,
    uiMode, frontTab, bottomTab, actorLabels,
  ]);

  return <GoalLabContext.Provider value={value}>{children}</GoalLabContext.Provider>;
};

export const useGoalLab = (): GoalLabContextValue => {
  const ctx = useContext(GoalLabContext);
  if (!ctx) throw new Error('useGoalLab must be used within GoalLabProvider');
  return ctx;
};
