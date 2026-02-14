// components/GoalSandbox/GoalSandbox.tsx

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
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
import type { ContextAtom, ContextualGoalScore as V2GoalScore } from '../../lib/context/v2/types';
import { DebugShell } from './DebugShell';
import { allLocations } from '../../data/locations';
import { computeLocationGoalsForAgent } from '../../lib/context/v2/locationGoals';
import { computeTomGoalsForAgent } from '../../lib/context/v2/tomGoals';
import { GoalLabControls } from '../goal-lab/GoalLabControls';
import { GoalLabResults } from '../goal-lab/GoalLabResults';
import { GoalLabConsoleResults } from '../goal-lab/GoalLabConsoleResults';
import { DoNowCard } from '../goal-lab/DoNowCard';
import { CurvesPanel } from '../goal-lab/CurvesPanel';
import { PipelinePanel } from '../goal-lab/PipelinePanel';
import { PomdpConsolePanel } from '../goal-lab/PomdpConsolePanel';
import { DecisionGraphView } from '../goal-lab/DecisionGraphView';
import { GoalActionGraphView } from '../goal-lab/GoalActionGraphView';
import { CurveStudio } from '../goal-lab/CurveStudio';
import { ToMPanel } from '../goal-lab/ToMPanel';
import { CastComparePanel } from '../goal-lab/CastComparePanel';
import { GoalLabTestsPanel } from '../goal-lab/GoalLabTestsPanel';
import { GoalLabReportPanel } from '../goal-lab/GoalLabReportPanel';
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
import { runGoalLabPipelineV1 } from '../../lib/goal-lab/pipeline/runPipelineV1';
import { adaptPipelineV1ToContract } from '../../lib/goal-lab/pipeline/adaptV1ToContract';
import { buildGoalLabSceneDumpV2, downloadJson } from '../../lib/goal-lab/sceneDump';
import { materializeStageAtoms } from '../goal-lab/materializePipeline';
import { buildFullDebugDump } from '../../lib/debug/buildFullDebugDump';
import { allScenarioDefs } from '../../data/scenarios/index';
import { useAccess } from '../../contexts/AccessContext';
import { filterCharactersForActiveModule } from '../../lib/modules/visibility';

// Pipeline Imports
import type { ScenePreset } from '../../data/presets/scenes';
import { SCENE_PRESETS } from '../../lib/scene/presets';
import { initTomForCharacters } from '../../lib/tom/init';
import { assignRoles } from '../../lib/roles/assignment';
import { constructGil } from '../../lib/gil/apply';
import type { DyadConfigForA } from '../../lib/tom/dyad-metrics';
import { ensureMapCells } from '../../lib/world/ensureMapCells';
import { buildDebugFrameFromSnapshot } from '../../lib/goal-lab/debugFrameFromSnapshot';
import { normalizeAtom } from '../../lib/context/v2/infer';
import { lintActionsAndLocations } from '../../lib/linter/actionsAndLocations';
import { arr } from '../../lib/utils/arr';
import { getCanonicalAtomsFromSnapshot } from '../../lib/goal-lab/atoms/canonical';
import type { CurvePreset } from '../../lib/utils/curves';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Collect trait identifiers from the agent across known data shapes.
 * This keeps GoalLab resilient to evolving character schemas.
 */
function collectTraitIds(agent: AgentState): Set<string> {
  const traitIds = new Set<string>();
  const identity: any = (agent as any)?.identity || {};

  const pushTrait = (t: any) => {
    if (!t) return;
    if (typeof t === 'string') traitIds.add(t);
    else if (typeof t?.id === 'string') traitIds.add(t.id);
    else if (typeof t?.key === 'string') traitIds.add(t.key);
  };

  (Array.isArray(identity?.traits) ? identity.traits : []).forEach(pushTrait);
  (Array.isArray((agent as any)?.traits) ? (agent as any).traits : []).forEach(pushTrait);
  (Array.isArray((agent as any)?.tags) ? (agent as any).tags : []).forEach(pushTrait);
  if (typeof identity?.arch_true_dominant_id === 'string') {
    traitIds.add(identity.arch_true_dominant_id);
  }

  return traitIds;
}

/**
 * Normalize location tags from known location shapes.
 * We keep the original casing for display, but lowercase is used for matching.
 */
function collectLocationTags(location: LocationEntity | null | undefined): string[] {
  if (!location) return [];
  const direct = Array.isArray((location as any).tags) ? (location as any).tags : [];
  const propTags = Array.isArray(location.properties?.tags) ? location.properties?.tags : [];
  const mapTags = Array.isArray((location as any)?.map?.tags) ? (location as any).map.tags : [];
  return Array.from(new Set([...direct, ...propTags, ...mapTags].map(String)));
}

type ManualContextAxes = {
  privacy: number;
  social: number;
  duty: number;
  danger: number;
  comfort: number;
  hygiene: number;
  authorityPresence: number;
  crowding: number;
  noise: number;
};

/**
 * Heuristic: translate room tags + location.properties into basic context axes for GoalLab.
 * This is a lab-only bridge when server-side context ticks are absent.
 *
 * CRITICAL: never return undefined — all axes must be 0..1 so math never collapses.
 */
function deriveManualContextAxes(location: LocationEntity | null | undefined): ManualContextAxes {
  const tags = collectLocationTags(location);
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  const props: Record<string, unknown> = (location as any)?.properties ?? {};

  const privacyTag = tagSet.has('private') || tagSet.has('bedroom') ? 1.0 : 0.1;
  const socialTag = tagSet.has('public') || tagSet.has('bar') || tagSet.has('crowd') ? 1.0 : 0.0;
  const dutyTag = tagSet.has('work') || tagSet.has('office') || tagSet.has('throne') ? 1.0 : 0.0;
  const dangerTag = tagSet.has('dangerous') || tagSet.has('danger') || tagSet.has('hazard') ? 0.8 : 0.0;

  const envStress = Number((location as any)?.physics?.environmentalStress);
  const comfortFallback = Number.isFinite(envStress) ? clamp01(1 - envStress) : 0.5;

  const privacy = clamp01(Number((props as any).privacy ?? privacyTag));
  const social = clamp01(Number((props as any).social ?? socialTag));
  const duty = clamp01(Number((props as any).duty ?? dutyTag));
  const danger = clamp01(Number((props as any).danger ?? dangerTag));
  const comfort = clamp01(Number((props as any).comfort ?? comfortFallback));
  const hygiene = clamp01(Number((props as any).hygiene ?? 0.5));

  // Authority presence is situational, but in GoalLab we approximate it.
  // You can override it in the location JSON via properties.authorityPresence.
  const authorityPresence = clamp01(
    Number((props as any).authorityPresence ?? (tagSet.has('throne') ? 1.0 : 0.0))
  );

  // Noise / crowding help interpret why some social / safety goals spike.
  const noise = clamp01(Number((props as any).noise ?? 0.2));
  const crowding = clamp01(Number((props as any).crowding ?? social));

  return { privacy, social, duty, danger, comfort, hygiene, authorityPresence, crowding, noise };
}

/**
 * Build manual context axis atoms so the pipeline can "see" a room in GoalLab.
 * We keep ids stable per agent to avoid duplicate atoms in the snapshot.
 */
function buildManualContextAxisAtoms(selfId: string, axes: ManualContextAxes): ContextAtom[] {
  const atoms = [
    { id: `world:loc:privacy:${selfId}`, magnitude: axes.privacy, label: 'Manual privacy (GoalLab)' },
    { id: `ctx:privacy:${selfId}`, magnitude: axes.privacy, label: 'Manual ctx:privacy (GoalLab)' },
    { id: `ctx:publicness:${selfId}`, magnitude: axes.social, label: 'Manual ctx:publicness (GoalLab)' },
    { id: `ctx:crowding:${selfId}`, magnitude: axes.crowding, label: 'Manual ctx:crowding (GoalLab)' },
    { id: `world:loc:normative_pressure:${selfId}`, magnitude: axes.duty, label: 'Manual duty (GoalLab)' },
    { id: `ctx:normPressure:${selfId}`, magnitude: axes.duty, label: 'Manual ctx:normPressure (GoalLab)' },
    { id: `world:map:danger:${selfId}`, magnitude: axes.danger, label: 'Manual map danger (GoalLab)' },
    { id: `ctx:danger:${selfId}`, magnitude: axes.danger, label: 'Manual ctx:danger (GoalLab)' },
    // "Quality" axes (not yet first-class in all engines, but useful for graphs/debug)
    { id: `ctx:comfort:${selfId}`, magnitude: axes.comfort, label: 'Manual ctx:comfort (GoalLab)' },
    { id: `ctx:hygiene:${selfId}`, magnitude: axes.hygiene, label: 'Manual ctx:hygiene (GoalLab)' },
    { id: `ctx:noise:${selfId}`, magnitude: axes.noise, label: 'Manual ctx:noise (GoalLab)' },
    // Authority pressure (replaces hardcoded kingPresent bonuses).
    {
      id: `ctx:authorityPresence:${selfId}`,
      magnitude: axes.authorityPresence,
      label: 'Manual ctx:authorityPresence (GoalLab)',
    },
  ];

  return atoms.map(atom =>
    normalizeAtom({
      ...atom,
      source: 'manual',
      kind: 'ctx',
      confidence: 0.8,
      tags: ['goal-lab', 'manual-context'],
      trace: {
        usedAtomIds: [],
        notes: ['GoalLab manual context axes'],
        parts: { axisId: atom.id, magnitude: atom.magnitude },
      },
    })
  );
}

/**
 * Merge extra manual atoms without duplicating by id.
 */
function mergeManualAtoms(base: ContextAtom[], extras: ContextAtom[]): ContextAtom[] {
  const out = new Map<string, ContextAtom>();
  base.forEach(atom => out.set(String(atom.id), atom));
  extras.forEach(atom => {
    const id = String(atom.id);
    if (!out.has(id)) out.set(id, atom);
  });
  return Array.from(out.values());
}

/**
 * GoalLab-only variability shim: apply quick trait-driven modifiers and record debug hints.
 */
function applyLabVariability(
  goals: (V2GoalScore & { uiMultiplier?: number; uiReasons?: string[] })[],
  traitIds: Set<string>,
  axes: ManualContextAxes,
  locationTags: string[]
): (V2GoalScore & {
  uiMultiplier?: number;
  uiReasons?: string[];
  _debugModifiers?: string[];
  debug?: { inputValues: ManualContextAxes; traits: string[]; roomTags: string[] };
})[] {
  const traitList = Array.from(traitIds);
  const roomTags = locationTags.map(String);

  return (goals || [])
    .map(goal => {
      let finalProb = Number((goal as any).probability ?? 0);
      let finalLogit = Number((goal as any).totalLogit ?? 0);
      const modifiers: string[] = [];

      const goalId = String((goal as any).goalId || '');

      // === HARDCODED VARIABILITY (temporary GoalLab test) ===
      if (traitIds.has('Coward') && axes.danger > 0.1) {
        finalProb *= 0.1;
        finalLogit *= 0.1;
        modifiers.push('Coward (Fear)');
      }

      if (traitIds.has('Introvert') && axes.social > 0.5) {
        if (goalId === 'Socialize') {
          finalProb *= 0.5;
          finalLogit *= 0.5;
          modifiers.push('Introvert (Social drain)');
        }
        if (goalId === 'GoHome') {
          finalProb *= 1.5;
          finalLogit *= 1.5;
          modifiers.push('Introvert (Escape)');
        }
      }

      return {
        ...goal,
        totalLogit: finalLogit,
        probability: clamp01(finalProb),
        _debugModifiers: modifiers.length ? modifiers : undefined,
        debug: {
          inputValues: axes,
          traits: traitList,
          roomTags,
        },
      };
    })
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
}

function applyUiPersonalization(
  goals: V2GoalScore[],
  agent: AgentState,
  frame: any
): (V2GoalScore & {
  uiMultiplier?: number;
  uiReasons?: string[];
})[] {
  // UI-only personalization layer to make character differences visible immediately.
  const traitIds = collectTraitIds(agent);

  const locTags = new Set<string>(
    Array.isArray((frame as any)?.where?.locationTags) ? (frame as any).where.locationTags : []
  );
  const isSafeCell = !!(frame as any)?.where?.map?.isSafeCell;

  return (goals || []).map(goal => {
    let m = 1.0;
    const reasons: string[] = [];

    const goalId = String((goal as any).goalId || (goal as any).id || '');
    const label = String((goal as any).label || '');
    const isSocial = /social|talk|chat|party|bond|cooperate/i.test(goalId) || /social/i.test(label);
    const isRelax = /rest|relax|sleep/i.test(goalId) || /relax|rest|sleep/i.test(label);
    const isClean = /clean|hygiene/i.test(goalId) || /clean/i.test(label);
    const isWork = /work|operate|maintain|admin/i.test(goalId) || /work/i.test(label);

    // Introvert / Extrovert example.
    if (traitIds.has('Introvert')) {
      if (locTags.has('public') || locTags.has('Public')) {
        if (isSocial) {
          m *= 0.3;
          reasons.push('Introvert×public');
        }
        if (isRelax) {
          m *= 0.6;
          reasons.push('Relax↓public');
        }
      }
      if (locTags.has('private') || locTags.has('Private') || isSafeCell) {
        if (isRelax) {
          m *= 1.4;
          reasons.push('Relax↑private');
        }
      }
    }
    if (traitIds.has('Extrovert')) {
      if (isSocial) {
        m *= 1.4;
        reasons.push('Extrovert');
      }
    }

    // NeatFreak / Lazy example.
    if (traitIds.has('NeatFreak') && isClean) {
      m *= 1.6;
      reasons.push('NeatFreak');
    }
    if (traitIds.has('Lazy')) {
      if (isWork || isClean) {
        m *= 0.6;
        reasons.push('Lazy↓work/clean');
      }
      if (isRelax) {
        m *= 1.2;
        reasons.push('Lazy↑rest');
      }
    }

    // Safety bias: if safe cell/private room, reduce panic goals and increase recovery.
    if (isSafeCell || locTags.has('safe_hub') || locTags.has('private')) {
      if (/escape|flee|panic|hide/i.test(goalId)) {
        m *= 0.7;
        reasons.push('Safe↓panic');
      }
      if (isRelax) {
        m *= 1.1;
        reasons.push('Safe↑rest');
      }
    }

    const rawProb = Number((goal as any).probability ?? 0);
    const newProb = clamp01(rawProb * m);
    const newTotal = Number((goal as any).totalLogit ?? 0) * m;

    return {
      ...goal,
      totalLogit: newTotal,
      probability: newProb,
      uiMultiplier: Math.abs(m - 1) > 1e-3 ? Number(m.toFixed(3)) : undefined,
      uiReasons: reasons.length ? reasons : undefined,
    };
  }).sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
}

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

/**
 * View-model contract exposed by GoalSandbox for external renderers (e.g. Console).
 * Keep this additive/backward-compatible while legacy DebugShell still depends on it.
 */
export type GoalSandboxVM = {
  // core dumps
  sceneDump: any;
  snapshotV1: any;
  pipelineV1: any;
  pipelineFrame: any;
  pipelineStageId: string;

  // selection / ids
  perspectiveId: string;

  // debug data
  castRows: any[];
  passportAtoms: any[];
  passportMeta: any;
  contextualMind: any;
  locationScores: any;
  tomScores: any;
  tom: any;
  atomDiff: any;
  manualAtoms: any[];
  worldState: any;

  // callbacks used by DebugShell and console
  onChangePipelineStageId: (id: string) => void;
  onSetPerspectiveId: (id: string) => void;
  onDownloadScene: () => void;
  onImportScene: (file: File) => void;
  onChangeManualAtoms: (atoms: any[]) => void;
  onExportPipelineStage: () => void;
  onExportPipelineAll: () => void;
  onExportFullDebug: () => void;
};

type GoalSandboxProps = {
  /** Optional custom renderer. If omitted, GoalSandbox renders its built-in UI. */
  render?: (vm: GoalSandboxVM) => ReactNode;
  /** Optional mode override for dedicated routes (e.g. console page). */
  uiMode?: 'front' | 'debug' | 'console';
};

export const GoalSandbox: React.FC<GoalSandboxProps> = ({ render, uiMode: forcedUiMode }) => {
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
  // --- Deterministic stochasticity controls ---
  const [runSeed, setRunSeed] = useState<string>(() => String(Date.now()));
  const [decisionTemperature, setDecisionTemperature] = useState<number>(1.0);
  const [decisionCurvePreset, setDecisionCurvePreset] = useState<string>('smoothstep');
  const [decisionNonce, setDecisionNonce] = useState<number>(0);

  const simSettingsRef = useRef({
    runSeed: String(Date.now()),
    decisionTemperature: 1.0,
    decisionCurvePreset: 'smoothstep',
  });

  useEffect(() => {
    simSettingsRef.current.runSeed = runSeed;
  }, [runSeed]);
  useEffect(() => {
    simSettingsRef.current.decisionTemperature = decisionTemperature;
  }, [decisionTemperature]);
  useEffect(() => {
    simSettingsRef.current.decisionCurvePreset = decisionCurvePreset;
  }, [decisionCurvePreset]);

  const normalizeSeedValue = useCallback((raw: string): number | string => {
    const s = (raw ?? '').trim();
    if (!s) return Date.now();
    if (/^-?\d+$/.test(s)) {
      const n = Number.parseInt(s, 10);
      return Number.isFinite(n) ? n : Date.now();
    }
    return s;
  }, []);
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
  // Per-agent location overrides (console editor). If empty, derived worlds place everyone into active location.
  const [actorLocationOverrides, setActorLocationOverrides] = useState<Record<string, string>>({});
  const actorLocationOverridesRef = useRef<Record<string, string>>({});
  // IMPORTANT: must be synchronous to avoid stale override leaks
  actorLocationOverridesRef.current = actorLocationOverrides;

  const importInputRef = useRef<HTMLInputElement | null>(null);
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
  const [activeBottomTab, setActiveBottomTab] = useState<'debug' | 'tom' | 'pipeline' | 'pomdp' | 'compare' | 'curves'>('pipeline');
  const [observeLiteParams, setObserveLiteParams] = useState<{ radius: number; maxAgents: number; noiseSigma: number; seed: number }>(() => ({
    radius: 10,
    maxAgents: 12,
    noiseSigma: 0,
    seed: 0,
  }));
  const [lockedMapViewport, setLockedMapViewport] = useState<{ w: number; h: number } | null>(null);
  const lockedMapIdRef = useRef<string | null>(null);

  // UI mode: a compact “front” view for normal use, and a “debug” view for pipeline/atoms.
  const [uiMode, setUiMode] = useState<'front' | 'debug' | 'console'>(() => {
    if (forcedUiMode) return forcedUiMode;
    try {
      return (localStorage.getItem('goalsandbox.uiMode.v1') as any) === 'debug' ? 'debug' : 'front';
    } catch {
      return 'front';
    }
  });

  useEffect(() => {
    if (forcedUiMode) return;
    try {
      localStorage.setItem('goalsandbox.uiMode.v1', uiMode);
    } catch {}
  }, [uiMode, forcedUiMode]);

  // Center view (map vs. goal graphs) is persisted so the UI reopens where the user left it.
  const [centerView, setCenterView] = useState<'map' | 'energy' | 'actions'>(() => {
    try {
      const stored = localStorage.getItem('goalsandbox.centerView.v1');
      if (stored === 'map' || stored === 'energy' || stored === 'actions') return stored;
    } catch {}
    return 'energy';
  });

  const [energyViewMode, setEnergyViewMode] = useState<'overview' | 'graph' | 'explain' | '3d'>(() => {
    try {
      const stored = localStorage.getItem('goalsandbox.energyViewMode.v1');
      if (stored === 'overview' || stored === 'graph' || stored === 'explain' || stored === '3d') return stored;
    } catch {}
    return 'graph';
  });

  const [centerOverlayOpen, setCenterOverlayOpen] = useState(false);
  const [centerOverlaySize, setCenterOverlaySize] = useState<'wide' | 'max'>('wide');

  // Front (non-debug) UX: right panel is constant, left/main switches via tabs.
  const [frontTab, setFrontTab] = useState<
    'graph' | 'situation' | 'metrics' | 'affects' | 'curves' | 'tests' | 'report' | 'debug'
  >(() => {
    return 'graph';
  });

  useEffect(() => {
    try {
      localStorage.setItem('goalsandbox.centerView.v1', centerView);
    } catch {}
  }, [centerView]);

  useEffect(() => {
    try {
      localStorage.setItem('goalsandbox.energyViewMode.v1', energyViewMode);
    } catch {}
  }, [energyViewMode]);

  // Keep the bottom panel aligned with the chosen mode (debug vs. front).
  useEffect(() => {
    setActiveBottomTab(uiMode === 'debug' ? 'debug' : 'pipeline');
  }, [uiMode]);

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

  // Seed the scene with a small cast by default (prevents empty “no one around” front views).
  useEffect(() => {
    if (worldSource === 'imported') return;
    if (sceneParticipants.size > 0) return;
    if (allCharacters.length < 2) return;
    const n = Math.min(4, allCharacters.length);
    setSceneParticipants(new Set(allCharacters.slice(0, n).map(c => c.entityId)));
  }, [allCharacters, sceneParticipants.size, worldSource]);

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

  const onApplySimSettings = useCallback(() => {
    // Rebuild world to re-seed per-agent RNG channels and apply curve/temperature consistently.
    setDecisionNonce(0);
    setWorldSource('derived');
    forceRebuildWorld();
  }, [forceRebuildWorld]);
  const onRerollDecisionNoise = useCallback(() => {
    setDecisionNonce((n) => (Number.isFinite(n) ? n + 1 : 1));
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

  /**
   * Quick parser for ctx:* manual atoms.
   * Accepts "ctx:danger:0.8" (id+value) or "ctx:danger" (defaults to magnitude=1).
   */
  const handleQuickCtxAdd = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const parts = trimmed.split(':');
    const last = parts[parts.length - 1];
    const parsedMagnitude = Number(last);
    const hasMagnitude = parts.length >= 3 && Number.isFinite(parsedMagnitude);
    const atomId = hasMagnitude ? parts.slice(0, -1).join(':') : trimmed;
    const magnitude = hasMagnitude ? parsedMagnitude : 1;

    const atom = normalizeAtom({
      id: atomId,
      magnitude,
      source: 'manual',
      kind: 'ctx',
      label: atomId,
    });

    setManualAtoms(prev => [...(prev || []), atom]);
  }, []);

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

  /**
   * Lock the map viewport after the first map selection to avoid resize jitter.
   * Fit the viewport to the map so the center area doesn't become a huge black canvas.
   */
  useEffect(() => {
    if (!activeMap) {
      setLockedMapViewport(null);
      lockedMapIdRef.current = null;
      return;
    }

    const nextMapId = String((activeMap as any)?.id ?? '');
    if (lockedMapIdRef.current && lockedMapIdRef.current !== nextMapId) {
      setLockedMapViewport(null);
      lockedMapIdRef.current = null;
    }

    if (lockedMapViewport) return;

    // MapViewer uses cellSize=32 and adds padding (p-4) + border; include chrome margin.
    const cellSize = 32;
    const chrome = 64;
    const w = Math.max(320, activeMap.width * cellSize + chrome);
    const h = Math.max(240, activeMap.height * cellSize + chrome);
    setLockedMapViewport({ w, h });
    lockedMapIdRef.current = nextMapId || 'map';
  }, [activeMap, lockedMapViewport]);

  const getSelectedLocationEntity = useCallback((): LocationEntity => {
    if (locationMode === 'preset' && selectedLocationId) {
      const loc = allLocations.find(l => l.entityId === selectedLocationId);
      if (loc) return loc as any;
    }
    return createCustomLocationEntity(activeMap) as any;
  }, [locationMode, selectedLocationId, activeMap]);

  /**
   * GoalLab context metadata for the selected location.
   * Used for manual context axes + UI debug output.
   */
  const labLocationContext = useMemo(() => {
    const location = getSelectedLocationEntity();
    const tags = collectLocationTags(location);
    const manualContextAxes = deriveManualContextAxes(location);
    return { location, tags, manualContextAxes };
  }, [getSelectedLocationEntity]);

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
      const defaultLocId = getActiveLocationId();
      const agentIds = nextAgents.map(a => a.entityId);

      const agentsWithLoc = nextAgents.map(a => {
        const pos = actorPositionsRef.current[a.entityId] || (a as any).position || { x: 5, y: 5 };
        const locId = actorLocationOverridesRef.current[a.entityId] || defaultLocId;
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


  // Keep the derived world consistent when the editor changes location mode/preset.
  // Without this, agents can keep stale locationId and world.locations can drift from overrideLocation.
  const lastLocationKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${locationMode}:${selectedLocationId}`;
    if (lastLocationKeyRef.current === key) return;
    lastLocationKeyRef.current = key;
    if (worldSource !== 'derived') return;
    // Best-effort: update agents' locationId + recompute roles/tom without wiping other world fields.
    setWorldState(prev => {
      if (!prev) return prev;
      try {
        return refreshWorldDerived(prev as any, arr((prev as any).agents) as any) as any;
      } catch {
        return prev;
      }
    });
  }, [locationMode, selectedLocationId, worldSource, refreshWorldDerived]);

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

      const w = createInitialWorld(Date.now(), participants, activeScenarioId, undefined, undefined, {
        runSeed: normalizeSeedValue(simSettingsRef.current.runSeed),
        decisionTemperature: simSettingsRef.current.decisionTemperature,
        decisionCurvePreset: simSettingsRef.current.decisionCurvePreset,
      });
      if (!w) return;

      (w as any).decisionTemperature = decisionTemperature;
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
      runSeed,
      decisionTemperature,
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


  const handleSetAgentLocation = useCallback(
    (agentId: string, locationId: string) => {
      const aid = String(agentId || '').trim();
      const lid = String(locationId || '').trim();
      if (!aid) return;
      setActorLocationOverrides(prev => ({ ...(prev || {}), [aid]: lid }));
      setWorldState(prev => {
        if (!prev) return prev;
        const nextAgents = arr((prev as any).agents).map((a: any) =>
          String(a?.entityId) === aid ? ({ ...(a || {}), locationId: lid } as any) : a
        );
        try {
          return worldSource === 'derived' ? (refreshWorldDerived(prev as any, nextAgents as any) as any) : ({ ...(prev as any), agents: nextAgents } as any);
        } catch {
          return { ...(prev as any), agents: nextAgents } as any;
        }
      });
    },
    [worldSource, refreshWorldDerived]
  );

  const handleSetAgentPosition = useCallback(
    (agentId: string, pos: { x: number; y: number }) => {
      const aid = String(agentId || '').trim();
      if (!aid) return;
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      setActorPositions(prev => ({ ...(prev || {}), [aid]: { x, y } }));
      setWorldState(prev => {
        if (!prev) return prev;
        const nextAgents = arr((prev as any).agents).map((a: any) =>
          String(a?.entityId) === aid ? ({ ...(a || {}), position: { x, y } } as any) : a
        );
        try {
          return worldSource === 'derived' ? (refreshWorldDerived(prev as any, nextAgents as any) as any) : ({ ...(prev as any), agents: nextAgents } as any);
        } catch {
          return { ...(prev as any), agents: nextAgents } as any;
        }
      });
    },
    [worldSource, refreshWorldDerived]
  );


  const handleUpdateAgentVitals = useCallback(
    (agentId: string, patch: { hp?: number; fatigue?: number; stress?: number }) => {
      const aid = String(agentId || '').trim();
      if (!aid) return;
      const hp = patch?.hp;
      const fatigue = patch?.fatigue;
      const stress = patch?.stress;

      setWorldState(prev => {
        if (!prev) return prev;
        const nextAgents = arr((prev as any).agents).map((a: any) => {
          if (String(a?.entityId) !== aid) return a;
          const next = { ...(a || {}) } as any;
          const body = { ...(next.body || {}) } as any;
          const acute = { ...((body.acute || {}) as any) } as any;

          if (hp != null && Number.isFinite(Number(hp))) {
            const v = Number(hp);
            next.hp = v;
            acute.hp = v;
          }
          if (fatigue != null && Number.isFinite(Number(fatigue))) {
            const v = Number(fatigue);
            acute.fatigue = v;
            next.fatigue = v;
          }
          if (stress != null && Number.isFinite(Number(stress))) {
            const v = Number(stress);
            acute.stress = v;
            next.stress = v;
          }

          body.acute = acute;
          next.body = body;
          return next;
        });

        try {
          return worldSource === 'derived' ? (refreshWorldDerived(prev as any, nextAgents as any) as any) : ({ ...(prev as any), agents: nextAgents } as any);
        } catch {
          return { ...(prev as any), agents: nextAgents } as any;
        }
      });
    },
    [worldSource, refreshWorldDerived]
  );

  const handleMoveAllToLocation = useCallback(
    (locationId: string) => {
      const lid = String(locationId || '').trim();
      if (!lid) return;
      const ids = arr(participantIds).map(String);
      setActorLocationOverrides(prev => {
        const next = { ...(prev || {}) } as Record<string, string>;
        for (const id of ids) next[id] = lid;
        return next;
      });
      setWorldState(prev => {
        if (!prev) return prev;
        const nextAgents = arr((prev as any).agents).map((a: any) => (ids.includes(String(a?.entityId)) ? ({ ...(a || {}), locationId: lid } as any) : a));
        try {
          return worldSource === 'derived' ? (refreshWorldDerived(prev as any, nextAgents as any) as any) : ({ ...(prev as any), agents: nextAgents } as any);
        } catch {
          return { ...(prev as any), agents: nextAgents } as any;
        }
      });
    },
    [participantIds, worldSource, refreshWorldDerived]
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
      const w = createInitialWorld(Date.now(), participants, activeScenarioId, undefined, undefined, {
        runSeed: normalizeSeedValue(simSettingsRef.current.runSeed),
        decisionTemperature: simSettingsRef.current.decisionTemperature,
        decisionCurvePreset: simSettingsRef.current.decisionCurvePreset,
      });
      if (!w) {
        setFatalError(`createInitialWorld() returned null. Unknown scenarioId: ${String(activeScenarioId)}`);
        return;
      }

      (w as any).decisionTemperature = decisionTemperature;
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
    runSeed,
    decisionTemperature,
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

  useEffect(() => {
    if (!worldState) return;

    setWorldState(prev => {
      if (!prev) return prev;
      if ((prev as any).decisionTemperature === decisionTemperature) return prev;
      return { ...(prev as any), decisionTemperature } as WorldState;
    });

    if (baselineWorldRef.current && (baselineWorldRef.current as any).decisionTemperature !== decisionTemperature) {
      baselineWorldRef.current = {
        ...(baselineWorldRef.current as any),
        decisionTemperature,
      } as WorldState;
    }
  }, [decisionTemperature, worldState]);

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

        // Import sim tuning if present
        if ((w as any)?.rngSeed != null) setRunSeed(String((w as any).rngSeed));
        if (typeof (w as any)?.decisionTemperature === "number") setDecisionTemperature((w as any).decisionTemperature);
        if (typeof (w as any)?.decisionCurvePreset === "string") setDecisionCurvePreset((w as any).decisionCurvePreset);

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

    const { location, manualContextAxes } = labLocationContext;
    const autoAxisAtoms = buildManualContextAxisAtoms(pid, manualContextAxes);
    const manualAtomsForContext = mergeManualAtoms(arr(manualAtoms), autoAxisAtoms);

    // NOTE: We keep this local to GoalLab; worldState must remain immutable.
    const worldForCtx = {
      ...(worldState as any),
      contextAxes: manualContextAxes,
    } as WorldState;

    const agent = worldForCtx.agents.find(a => a.entityId === pid);
    if (!agent) return { ctx: null as any, err: `Perspective agent not found in world: ${pid}` };

    try {
      const activeEvents = eventRegistry.getAll().filter(e => selectedEventIds.has(e.id));
      const loc = location;

      const ctx = buildGoalLabContext(worldForCtx, pid, {
        snapshotOptions: {
          activeEvents,
          // Ensure ToM/affect are computed for the exact scene cast,
          // so every agent has ToM-on-every-agent for the current scene.
          participantIds,
          overrideLocation: loc,
          // Inject manual context axes derived from room tags.
          manualAtoms: manualAtomsForContext,
          gridMap: activeMap,
          atomOverridesLayer,
          overrideEvents: injectedEvents,
          sceneControl,
          affectOverrides,
          decisionNonce,
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
    labLocationContext,
    decisionNonce,
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
      const traitIds = collectTraitIds(agent);
      const { manualContextAxes, tags: locationTags } = labLocationContext;

      // Raw goal scores from the engine.
      const rawGoals = scoreContextualGoals(agent, worldState, snapshot, undefined, frame || undefined);
      // UI-only personalization layer (explicitly to show character differences immediately).
      const uiGoals = applyUiPersonalization(rawGoals, agent, frame);
      // Post-process: temporary GoalLab variability injection + debug payloads.
      const goals = applyLabVariability(uiGoals, traitIds, manualContextAxes, locationTags);
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

  const canonicalAtoms = useMemo(() => {
    if (!snapshotV1) {
      return {
        stageId: String(currentPipelineStageId || ''),
        atoms: [] as any[],
        source: 'snapshotFallback' as const,
        warnings: ['no snapshotV1'],
      };
    }
    return getCanonicalAtomsFromSnapshot(snapshotV1 as any, String(currentPipelineStageId || ''));
  }, [snapshotV1, currentPipelineStageId]);

  const pipelineFrame = useMemo(() => {
    if (!snapshotV1) return null;
    const frame = buildDebugFrameFromSnapshot(
      snapshotV1 as any,
      String(currentPipelineStageId || '')
    );
    if (import.meta.env.DEV) {
      assertArray('frame.atoms', (frame as any)?.atoms);
    }
    return frame;
  }, [snapshotV1, currentPipelineStageId]);

  // ===== atoms for the currently selected pipeline stage (for Passport UI) =====
  const passportAtoms = useMemo(() => {
    return arr(canonicalAtoms?.atoms);
  }, [canonicalAtoms]);

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
            decisionNonce,
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
    decisionNonce,
  ]);

  /**
   * Ensure the compare/dyad panels have at least two entries when possible.
   * Falls back to world agents when the cast is underspecified.
   */
  const castRowsSafe = useMemo(() => {
    if (Array.isArray(castRows) && castRows.length >= 2) return castRows;
    const agents = Array.isArray((worldState as any)?.agents) ? (worldState as any).agents : [];
    if (!agents.length) return castRows || [];

    const activeEvents = eventRegistry.getAll().filter((e) => selectedEventIds.has(e.id));
    const loc = getSelectedLocationEntity();

    return agents.map((a: any) => {
      const id = String(a?.entityId || '');
      const char = allCharacters.find((c) => c.entityId === id);
      let snap: any = null;
      try {
        const res = buildGoalLabContext(worldState as any, id, {
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
            decisionNonce,
          },
          timeOverride: (worldState as any)?.tick,
          devValidateAtoms,
        });
        snap = res?.snapshot ?? null;
      } catch {
        snap = null;
      }
      return { id, label: char?.title || id, snapshot: snap };
    });
  }, [
    castRows,
    worldState,
    allCharacters,
    selectedEventIds,
    getSelectedLocationEntity,
    participantIds,
    manualAtoms,
    activeMap,
    atomOverridesLayer,
    injectedEvents,
    sceneControl,
    affectOverrides,
    devValidateAtoms,
    decisionNonce,
  ]);

  const focusId =
    perspectiveId ||
    selectedAgentId ||
    (castRowsSafe?.[0]?.id ? String(castRowsSafe[0].id) : '');

  // POMDP console pipeline (real stages from runGoalLabPipelineV1), adapted to strict contracts.
  // NOTE: focusId is resolved above to avoid TDZ crashes in optimized/prod builds.
  // This keeps UI-level parsing stable even if internal V1 artifact shapes evolve.
  const pomdpPipelineV1 = useMemo(() => {
    if (!worldState) return null;
    const agentId = String(focusId || perspectiveId || selectedAgentId || '');
    if (!agentId) return null;
    try {
      return runGoalLabPipelineV1({
        world: worldState as any,
        agentId,
        participantIds: participantIds as any,
        manualAtoms: manualAtoms as any,
        injectedEvents,
        sceneControl,
        tickOverride: Number((worldState as any)?.tick ?? 0),
        observeLiteParams,
      });
    } catch (e) {
      console.error('[GoalSandbox] runGoalLabPipelineV1 failed', e);
      return null;
    }
  }, [worldState, focusId, perspectiveId, selectedAgentId, participantIds, manualAtoms, injectedEvents, sceneControl, observeLiteParams]);

  const pomdpRun = useMemo(() => adaptPipelineV1ToContract(pomdpPipelineV1 as any), [pomdpPipelineV1]);

  // Keep observeLite seed synced to world RNG seed (but don't override user-edited values).
  useEffect(() => {
    const s = Number((worldState as any)?.rngSeed ?? 0);
    if (!Number.isFinite(s)) return;
    setObserveLiteParams((p) => (p.seed === 0 ? { ...p, seed: s } : p));
  }, [worldState]);

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

  const handleExportFullDebug = useCallback(() => {
    if (!snapshotV1) return;

    const payload = buildFullDebugDump({
      snapshotV1,
      pipelineV1,
      pipelineFrame,
      worldState,
      sceneDump: sceneDumpV2,
      castRows,
      manualAtoms,
      selectedEventIds,
      selectedLocationId,
      selectedAgentId,
      uiMeta: {
        pipelineStageId: currentPipelineStageId,
        perspectiveId,
      },
    });

    const exportedAt = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(
      payload,
      `goal-lab__FULL_DEBUG__${snapshotV1.selfId}__t${snapshotV1.tick}__${exportedAt}.json`
    );
  }, [
    snapshotV1,
    pipelineV1,
    pipelineFrame,
    worldState,
    sceneDumpV2,
    castRows,
    manualAtoms,
    selectedEventIds,
    selectedLocationId,
    selectedAgentId,
    currentPipelineStageId,
    perspectiveId,
  ]);

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

  /**
   * Normalize pipeline stages for the bottom panel.
   * We tolerate partial shapes because pipelineV1 is optional.
   */
  const pipelineStagesForPanel = useMemo(() => {
    const raw = (pipelineV1 as any)?.stages;
    if (!Array.isArray(raw)) return [];
    return raw.map((s: any, idx: number) => {
      const id = String(s?.id || s?.stageId || `S${idx}`);
      const label = String(s?.label || s?.title || id);
      const atomCount = Number.isFinite(Number(s?.atomCount)) ? Number(s.atomCount) : 0;
      return { ...s, id, label, atomCount };
    });
  }, [pipelineV1]);

  // Fixed map frame size (locked on first map selection).
  const frameW = lockedMapViewport?.w ?? 980;
  const frameH = lockedMapViewport?.h ?? 620;
  const tomRows = tomMatrixForPerspective ?? [];

  const mapArea = (
    <div className="flex-none relative bg-black overflow-visible p-3">
      <div className="flex items-center justify-between gap-2 mb-2 px-2 py-1 bg-slate-950/70 border border-slate-800 rounded-md backdrop-blur-sm">
        <div className="flex items-baseline gap-2 min-w-0">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest shrink-0">Perspective</div>
          <div className="text-[11px] text-cyan-300 font-bold truncate">{focusId || '—'}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <div className="flex items-center gap-1">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">seed</div>
              <input
                className="w-24 bg-black/20 border border-slate-700/60 rounded px-2 py-0.5 text-[10px] text-slate-200 outline-none focus:border-cyan-500/50"
                value={runSeed}
                onChange={(e) => setRunSeed(e.target.value)}
                title="Global run seed"
              />
            </div>
            <div className="flex items-center gap-1">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">temp</div>
              <input
                type="range"
                min={0.10}
                max={5.0}
                step={0.05}
                value={decisionTemperature}
                onChange={(e) => setDecisionTemperature(Number(e.target.value))}
              />
              <div className="text-[10px] text-slate-200 tabular-nums w-10 text-right">
                {decisionTemperature.toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">curve</div>
              <select
                className="bg-black/20 border border-slate-700/60 rounded px-2 py-0.5 text-[10px] text-slate-200 outline-none focus:border-cyan-500/50"
                value={decisionCurvePreset}
                onChange={(e) => setDecisionCurvePreset(e.target.value)}
              >
                {(['linear', 'smoothstep', 'sqrt', 'sigmoid', 'pow2', 'pow4'] as const).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={onApplySimSettings}
              className="px-2 py-0.5 text-[9px] rounded uppercase border bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:border-cyan-400/60"
              title="Apply: rebuild world (reseed agents + pipelines)"
            >
              apply
            </button>
            <button
              onClick={onRerollDecisionNoise}
              className="px-2 py-0.5 text-[9px] rounded uppercase border bg-emerald-600/20 text-emerald-200 border-emerald-500/40 hover:border-emerald-400/60"
              title="Reroll: same seed & context, new decision noise (nonce)"
            >
              reroll
            </button>
            <div className="text-[9px] text-slate-500" title="Decision reroll nonce">
              n:{decisionNonce}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(['map', 'energy', 'actions'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setCenterView(view)}
                className={`px-2 py-0.5 text-[9px] rounded uppercase border transition ${
                  centerView === view
                    ? 'bg-cyan-600/25 text-cyan-200 border-cyan-500/40'
                    : 'bg-black/10 text-slate-300 border-slate-700/60 hover:border-slate-500/70'
                }`}
                title={
                  view === 'map'
                    ? 'Map (placement)'
                    : view === 'energy'
                      ? 'Energy (inputs → goals)'
                      : 'Actions (action → goal)'
                }
              >
                {view}
              </button>
            ))}
          </div>

          {centerView === 'energy' ? (
            <>
              <div className="flex items-center gap-1">
                {(['overview', 'graph', 'explain', '3d'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setEnergyViewMode(mode)}
                    className={`px-2 py-0.5 text-[9px] rounded uppercase border ${
                      energyViewMode === mode
                        ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500/40'
                        : 'bg-black/20 text-slate-300 border-slate-700/60 hover:border-slate-500/70'
                    }`}
                    title={
                      mode === 'overview'
                        ? 'Overview (context → goals)'
                        : mode === 'graph'
                          ? 'Graph (inputs → goals)'
                          : mode === 'explain'
                            ? 'Explain goals'
                            : '3D scaffold'
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCenterOverlayOpen(true)}
                className="px-2 py-0.5 text-[9px] rounded uppercase border bg-black/20 text-slate-300 border-slate-700/60 hover:border-slate-500/70"
                title="Open widened view"
              >
                widen
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div
        className="relative flex-none border border-slate-800 bg-slate-950/40 overflow-hidden shadow-[0_0_0_1px_rgba(148,163,184,0.15)]"
        style={{
          width: frameW,
          height: frameH,
        }}
      >
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 to-transparent" />
        <div className="absolute inset-0">
          {centerView === 'map' ? (
            <MapViewer
              map={activeMap}
              isEditor={locationMode === 'custom' && !placingActorId}
              onMapChange={setMap}
              onCellClick={handleActorClick}
              highlights={mapHighlights as any}
            />
          ) : centerView === 'actions' ? (
            <div className="h-full w-full">
              <GoalActionGraphView />
            </div>
          ) : (
            <div className="h-full w-full">
              <DecisionGraphView
                frame={computed.frame as any}
                contextAtoms={computed.snapshot?.atoms ?? []}
                selfId={computed.snapshot?.selfId ?? undefined}
                goalScores={arr(computed.goals) as any}
                selectedGoalId={null}
                mode={energyViewMode}
                compact
                temperature={decisionTemperature}
                curvePreset={decisionCurvePreset as any}
              />
            </div>
          )}
        </div>
      </div>

      {/* Inline error/warning surface to avoid silent failures in the new layout. */}
      {fatalError ? (
        <div className="absolute top-4 right-4 max-w-[360px] bg-red-900/70 border border-red-500/60 text-red-200 p-3 rounded text-xs">
          <div className="font-bold text-[11px] mb-1">Goal Lab error</div>
          <div className="whitespace-pre-wrap opacity-80">{fatalError}</div>
        </div>
      ) : runtimeError ? (
        <div className="absolute top-4 right-4 max-w-[360px] bg-amber-900/60 border border-amber-500/60 text-amber-100 p-3 rounded text-xs">
          <div className="font-bold text-[11px] mb-1">Goal Lab warning</div>
          <div className="whitespace-pre-wrap opacity-80">{runtimeError}</div>
        </div>
      ) : null}

      {centerOverlayOpen && centerView === 'energy' ? (
        <div className="absolute inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setCenterOverlayOpen(false)} />
          <div
            className={`absolute ${
              centerOverlaySize === 'max' ? 'inset-2' : 'inset-8'
            } bg-slate-950 border border-slate-800 rounded-lg shadow-xl flex flex-col`}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800">
              <div className="text-[10px] text-slate-300/70 uppercase">Energy view</div>
              <div className="flex items-center gap-2">
                {(['wide', 'max'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setCenterOverlaySize(size)}
                    className={`px-2 py-0.5 text-[9px] rounded uppercase border ${
                      centerOverlaySize === size
                        ? 'bg-cyan-600/30 text-cyan-200 border-cyan-500/40'
                        : 'bg-black/20 text-slate-300 border-slate-700/60 hover:border-slate-500/70'
                    }`}
                  >
                    {size}
                  </button>
                ))}
                <button
                  onClick={() => setCenterOverlayOpen(false)}
                  className="px-2 py-0.5 text-[9px] rounded uppercase border bg-black/20 text-slate-300 border-slate-700/60 hover:border-slate-500/70"
                >
                  close
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <DecisionGraphView
                frame={computed.frame as any}
                contextAtoms={computed.snapshot?.atoms ?? []}
                selfId={computed.snapshot?.selfId ?? undefined}
                goalScores={arr(computed.goals) as any}
                selectedGoalId={null}
                mode={energyViewMode}
                temperature={decisionTemperature}
                curvePreset={decisionCurvePreset as any}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  // Build a stable VM so external shells can reuse GoalSandbox logic without duplicating state wiring.
  const vm: GoalSandboxVM = useMemo(() => ({
    sceneDump: sceneDumpV2 as any,
    snapshotV1: snapshotV1 as any,
    pipelineV1: pipelineV1 as any,
    pipelineFrame: pipelineFrame as any,
    pipelineStageId: currentPipelineStageId,
    perspectiveId: focusId,
    castRows: castRowsSafe as any,
    passportAtoms: passportAtoms as any,
    passportMeta: canonicalAtoms as any,
    contextualMind: contextualMind as any,
    locationScores: locationScores as any,
    tomScores: tomScores as any,
    tom: (worldState as any)?.tom?.[focusId as any],
    atomDiff: atomDiff as any,
    manualAtoms: manualAtoms as any,
    worldState: worldState as any,
    onChangePipelineStageId: (id) => setPipelineStageId(id),
    onSetPerspectiveId: (id) => setPerspectiveAgentId(id),
    onDownloadScene: onDownloadScene,
    onImportScene: handleImportSceneClick,
    onChangeManualAtoms: (atoms) => setManualAtoms(atoms as any),
    onExportPipelineStage: handleExportPipelineStage,
    onExportPipelineAll: handleExportPipelineAll,
    onExportFullDebug: handleExportFullDebug,
  }), [
    sceneDumpV2, snapshotV1, pipelineV1, pipelineFrame, currentPipelineStageId,
    focusId, castRowsSafe, passportAtoms, canonicalAtoms, contextualMind,
    locationScores, tomScores, worldState, atomDiff, manualAtoms,
    onDownloadScene, handleImportSceneClick, handleExportPipelineStage,
    handleExportPipelineAll, handleExportFullDebug,
  ]);

  if (render) return <>{render(vm)}</>;

  return (
    <div className="flex h-full bg-[#020617] text-slate-300 overflow-hidden font-mono">
      {/* LEFT (debug only): controls + quick ctx input */}
      {uiMode === 'debug' ? (
        <aside className="w-[350px] border-r border-slate-800 flex flex-col bg-slate-950/50 shrink-0">
        <div className="p-3 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center">
          <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest">Perspective_Drive</span>
          <div className="flex gap-2">
            <button
              className={`px-2 py-0.5 text-[9px] rounded uppercase ${
                uiMode === 'debug' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
              onClick={() => setUiMode('debug')}
            >
              Debug
            </button>
            <button
              className={`px-2 py-0.5 text-[9px] rounded uppercase ${
                uiMode === 'front' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
              onClick={() => setUiMode('front')}
            >
              Front
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <GoalLabControls
            allCharacters={allCharacters}
            allLocations={allLocations as any}
            events={eventRegistry.getAll() as any}
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
            runSeed={runSeed}
            onRunSeedChange={setRunSeed}
            decisionTemperature={decisionTemperature}
            onDecisionTemperatureChange={setDecisionTemperature}
            decisionCurvePreset={decisionCurvePreset}
            onDecisionCurvePresetChange={setDecisionCurvePreset}
            onApplySimSettings={onApplySimSettings}
            mode="debug"
          />

          <div className="mt-8 pt-4 border-t border-slate-800">
            <h4 className="text-[10px] text-slate-500 uppercase mb-4">Environment_Facts (ctx:*)</h4>
            <input
              className="w-full bg-black/40 border border-slate-800 p-2 text-[11px] rounded outline-none focus:border-cyan-500/50"
              placeholder="Add_Fact (e.g. ctx:danger:0.8)"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                handleQuickCtxAdd(e.currentTarget.value || '');
                e.currentTarget.value = '';
              }}
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {(manualAtoms || []).slice(0, 12).map((a) => {
                const magnitude = Number((a as any).magnitude);
                const formattedMagnitude = Number.isFinite(magnitude) ? magnitude.toFixed(2) : '1.00';
                return (
                  <span
                    key={String((a as any).id)}
                    className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300"
                  >
                    {String((a as any).id)}:{formattedMagnitude}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
      ) : null}

      {/* CENTER */}
      <main className="flex-1 flex flex-col relative min-w-0 bg-black">
        {uiMode === 'front' ? (
          <div className="flex-none border-b border-slate-800 bg-slate-900/40">
            <div className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest">GoalLab</div>
                <div className="text-[11px] text-slate-300 truncate">
                  Perspective: <span className="text-cyan-300 font-bold">{focusId || '—'}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {uiMode === 'front' ? (
                  <button
                    className="px-3 py-1 text-[10px] rounded uppercase bg-slate-800 text-slate-200 border border-slate-700/60 hover:border-slate-500/70"
                    onClick={() => setUiMode('debug')}
                  >
                    Debug
                  </button>
                ) : (
                  <button
                    className="px-3 py-1 text-[10px] rounded uppercase bg-slate-800 text-slate-200 border border-slate-700/60 hover:border-slate-500/70"
                    onClick={() => setUiMode('front')}
                  >
                    Front
                  </button>
                )}
              </div>
            </div>
            <div className="px-3 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                {([
                  ['graph', 'Graph'],
                  ['situation', 'Situation'],
                  ['metrics', 'Metrics'],
                  ['affects', 'Affects'],
                  ['curves', 'Curves'],
                  ['tests', 'Tests'],
                  ['report', 'Report'],
                  ['debug', 'Debug'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFrontTab(key)}
                    className={`px-3 py-1 text-[10px] rounded uppercase border transition ${
                      frontTab === key
                        ? 'bg-cyan-600/25 text-cyan-200 border-cyan-500/40'
                        : 'bg-black/10 text-slate-200 border-slate-700/60 hover:border-slate-500/70'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {uiMode === 'front' ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            {frontTab === 'situation' ? (
              <div className="h-full overflow-y-auto custom-scrollbar p-3">
                <GoalLabControls
                  allCharacters={allCharacters}
                  allLocations={allLocations as any}
                  events={eventRegistry.getAll() as any}
                  computedAtoms={arr((snapshotV1 as any)?.atoms ?? (snapshot as any)?.atoms)}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={handleSelectAgent}
                  selectedLocationId={selectedLocationId}
                  onSelectLocation={setSelectedLocationId}
                  locationMode={locationMode}
                  onLocationModeChange={setLocationMode}
                  selectedEventIds={selectedEventIds}
                  onToggleEvent={(id) =>
                    setSelectedEventIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
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
                  runSeed={runSeed}
                  onRunSeedChange={setRunSeed}
                  decisionTemperature={decisionTemperature}
                  onDecisionTemperatureChange={setDecisionTemperature}
                  decisionCurvePreset={decisionCurvePreset}
                  onDecisionCurvePresetChange={setDecisionCurvePreset}
                  onApplySimSettings={onApplySimSettings}
                  mode="front"
                  forcedTab="scene"
                  hideTabs
                />
              </div>
            ) : frontTab === 'affects' ? (
              <div className="h-full overflow-y-auto custom-scrollbar p-3">
                <GoalLabControls
                  allCharacters={allCharacters}
                  allLocations={allLocations as any}
                  events={eventRegistry.getAll() as any}
                  computedAtoms={arr((snapshotV1 as any)?.atoms ?? (snapshot as any)?.atoms)}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={handleSelectAgent}
                  selectedLocationId={selectedLocationId}
                  onSelectLocation={setSelectedLocationId}
                  locationMode={locationMode}
                  onLocationModeChange={setLocationMode}
                  selectedEventIds={selectedEventIds}
                  onToggleEvent={(id) =>
                    setSelectedEventIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
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
                  runSeed={runSeed}
                  onRunSeedChange={setRunSeed}
                  decisionTemperature={decisionTemperature}
                  onDecisionTemperatureChange={setDecisionTemperature}
                  decisionCurvePreset={decisionCurvePreset}
                  onDecisionCurvePresetChange={setDecisionCurvePreset}
                  onApplySimSettings={onApplySimSettings}
                  mode="front"
                  forcedTab="affect"
                  hideTabs
                />
              </div>
            ) : frontTab === 'curves' ? (
              <div className="h-full overflow-y-auto custom-scrollbar p-3">
                <CurvesPanel
                  seed={runSeed}
                  onSeed={setRunSeed}
                  temperature={decisionTemperature}
                  onTemperature={setDecisionTemperature}
                  preset={decisionCurvePreset as CurvePreset}
                  onPreset={(p) => setDecisionCurvePreset(p)}
                  onApply={onApplySimSettings}
                />
              </div>
            ) : frontTab === 'metrics' ? (
              <div className="h-full overflow-y-auto custom-scrollbar p-3 space-y-3">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Pipeline</div>
                  <PipelinePanel
                    stages={pipelineStagesForPanel as any}
                    selectedId={currentPipelineStageId}
                    onSelect={setPipelineStageId as any}
                    onExportStage={handleExportPipelineStage}
                  />
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">ToM</div>
                  <ToMPanel atoms={passportAtoms as any} />
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Cast Compare</div>
                  <CastComparePanel rows={castRowsSafe as any} focusId={focusId} />
                </div>
              </div>
            ) : frontTab === 'debug' ? (
              <div className="h-full overflow-y-auto custom-scrollbar p-3">
                <DebugShell
                  snapshotV1={snapshotV1 as any}
                  pipelineV1={pipelineV1 as any}
                  pipelineFrame={pipelineFrame as any}
                  pipelineStageId={currentPipelineStageId}
                  onChangePipelineStageId={setPipelineStageId}
                  castRows={castRowsSafe}
                  perspectiveId={focusId}
                  onSetPerspectiveId={setPerspectiveAgentId}
                  passportAtoms={passportAtoms}
                  passportMeta={canonicalAtoms as any}
                  contextualMind={contextualMind as any}
                  locationScores={locationScores as any}
                  tomScores={tomScores as any}
                  tom={(worldState as any)?.tom?.[focusId as any]}
                  atomDiff={atomDiff as any}
                  sceneDump={sceneDumpV2 as any}
                  onDownloadScene={onDownloadScene}
                  onImportScene={handleImportSceneClick}

                activeScenarioId={activeScenarioId}
                onSetActiveScenarioId={setActiveScenarioId}
                runSeed={normalizeSeedValue(runSeed)}
                onSetRunSeed={(n) => setRunSeed(String(n))}
                onApplySimSettings={onApplySimSettings}
                sceneParticipants={Array.from(sceneParticipants)}
                onSetSceneParticipants={(ids) => setSceneParticipants(new Set(ids))}
                sceneControl={sceneControl}
                onSetSceneControl={setSceneControl}
                onUpdateAgentVitals={handleUpdateAgentVitals}
                  manualAtoms={manualAtoms}
                  onChangeManualAtoms={setManualAtoms}
                  onExportPipelineStage={handleExportPipelineStage}
                  onExportPipelineAll={handleExportPipelineAll}
                  onExportFullDebug={handleExportFullDebug}
                />
              </div>
            ) : frontTab === 'tests' ? (
              <div className="h-full overflow-y-auto custom-scrollbar p-3">
                <GoalLabTestsPanel
                  selfId={perspectiveId || selectedAgentId || ''}
                  actorLabels={actorLabels as any}
                />
              </div>
            ) : frontTab === 'report' ? (
              <div className="h-full overflow-y-auto custom-scrollbar p-3">
                <GoalLabReportPanel pipelineV1={pipelineV1 as any} />
              </div>
            ) : (
              <div className="h-full overflow-auto">{mapArea}</div>
            )}
          </div>
        ) : (
          <>
            {mapArea}
            <div className="flex-1 min-h-[220px] border-t border-slate-800 bg-slate-950 flex flex-col min-h-0">
              <nav className="flex border-b border-slate-800 bg-slate-900/20">
                {(['debug', 'tom', 'pipeline', 'pomdp', 'compare', 'curves'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveBottomTab(t)}
                    className={`px-6 py-2 text-[10px] font-bold uppercase tracking-widest border-r border-slate-800 transition ${
                      activeBottomTab === t
                        ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_-2px_0_#06b6d4]'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </nav>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 min-h-0">
                {activeBottomTab === 'pipeline' ? (
                  <PipelinePanel
                    stages={pipelineStagesForPanel as any}
                    selectedId={currentPipelineStageId}
                    onSelect={setPipelineStageId as any}
                    onExportStage={handleExportPipelineStage}
                  />
                ) : null}
                {activeBottomTab === 'pomdp' ? (
                  <PomdpConsolePanel
                    run={pomdpRun as any}
                    rawV1={pomdpPipelineV1 as any}
                    observeLiteParams={observeLiteParams}
                    onObserveLiteParamsChange={setObserveLiteParams}
                  />
                ) : null}
                {activeBottomTab === 'tom' ? (
                  // IMPORTANT: ToM atoms are produced by GoalLab pipeline stages, not by the raw SimSnapshot.
                  // Using passportAtoms makes the Dyad/ToM layer non-empty.
                  <ToMPanel atoms={passportAtoms as any} />
                ) : null}
                {activeBottomTab === 'compare' ? (
                  <CastComparePanel rows={castRowsSafe as any} focusId={focusId} />
                ) : null}
                {activeBottomTab === 'curves' ? (
                  <CurveStudio
                    selfId={focusId || ''}
                    atoms={arr((computed as any)?.snapshot?.atoms) as any}
                    preset={((decisionCurvePreset || 'smoothstep') as any) as CurvePreset}
                  />
                ) : null}
                {activeBottomTab === 'debug' ? (
                  <div className="space-y-4">
                    <pre className="text-[10px] text-slate-400 bg-black/30 border border-slate-800 rounded p-3 overflow-auto">
                      {JSON.stringify(
                        {
                          focusId,
                          castLen: (castRowsSafe || []).length,
                          tomRowsLen: (tomRows || []).length,
                          tomSample: (tomRows || [])[0] || null,
                        },
                        null,
                        2
                      )}
                    </pre>
                    <DebugShell
                      snapshotV1={snapshotV1 as any}
                      pipelineV1={pipelineV1 as any}
                      pipelineFrame={pipelineFrame as any}
                      pipelineStageId={currentPipelineStageId}
                      onChangePipelineStageId={setPipelineStageId}
                      castRows={castRowsSafe}
                      perspectiveId={focusId}
                      onSetPerspectiveId={setPerspectiveAgentId}
                      passportAtoms={passportAtoms}
                      passportMeta={canonicalAtoms as any}
                      contextualMind={contextualMind as any}
                      locationScores={locationScores as any}
                      tomScores={tomScores as any}
                      tom={(worldState as any)?.tom?.[focusId as any]}
                      atomDiff={atomDiff as any}
                      sceneDump={sceneDumpV2 as any}
                      onDownloadScene={onDownloadScene}
                      onImportScene={handleImportSceneClick}

                activeScenarioId={activeScenarioId}
                onSetActiveScenarioId={setActiveScenarioId}
                runSeed={normalizeSeedValue(runSeed)}
                onSetRunSeed={(n) => setRunSeed(String(n))}
                onApplySimSettings={onApplySimSettings}
                sceneParticipants={Array.from(sceneParticipants)}
                onSetSceneParticipants={(ids) => setSceneParticipants(new Set(ids))}
                sceneControl={sceneControl}
                onSetSceneControl={setSceneControl}
                onUpdateAgentVitals={handleUpdateAgentVitals}
                      manualAtoms={manualAtoms}
                      onChangeManualAtoms={setManualAtoms}
                      onExportPipelineStage={handleExportPipelineStage}
                      onExportPipelineAll={handleExportPipelineAll}
                      onExportFullDebug={handleExportFullDebug}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </main>

      {/* RIGHT: GoalLab results, pipeline export/import, etc. */}
      <aside className="w-[420px] border-l border-slate-800 bg-slate-950/50 flex flex-col shrink-0 min-h-0">
        <div className="p-3 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase">
          Passport + Atoms
        </div>
        <div
          className={
            uiMode === 'console'
              ? 'flex-1 min-h-0 overflow-hidden p-3'
              : 'flex-1 overflow-y-auto custom-scrollbar min-h-0 p-3 space-y-3'
          }
        >
          {uiMode === 'console' ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              <GoalLabConsoleResults
                snapshot={snapshot as any}
                frame={computed.frame as any}
                situation={situation as any}
                snapshotV1={snapshotV1 as any}
                pipelineV1={pipelineV1 as any}
                focusId={focusId as any}
                pomdpRun={pomdpRun as any}
                pomdpRawV1={pomdpPipelineV1 as any}
                observeLiteParams={observeLiteParams}
                onObserveLiteParamsChange={setObserveLiteParams}
                onForceAction={(actionId) => {
                  // Persist a single active force_action for this focus agent.
                  // This affects decision ranking in the console pipeline (without stepping world dynamics).
                  const agentId = String(focusId || '');
                  setInjectedEvents((prev) => {
                    const filtered = arr(prev).filter((e: any) => {
                      const t = String(e?.type || e?.kind || '');
                      const a = String(e?.agentId || e?.selfId || '');
                      return !(t === 'force_action' && a === agentId);
                    });
                    if (!actionId) return filtered;
                    const tick = Number((worldState as any)?.tick ?? 0);
                    return [...filtered, { type: 'force_action', agentId, actionId, tick }];
                  });
                  setDecisionNonce((n) => n + 1);
                }}
                sceneDump={sceneDumpV2 as any}
                onDownloadScene={onDownloadScene}
                onImportScene={handleImportSceneClick}

                activeScenarioId={activeScenarioId}
                onSetActiveScenarioId={setActiveScenarioId}
                runSeed={normalizeSeedValue(runSeed)}
                onSetRunSeed={(n) => setRunSeed(String(n))}
                onApplySimSettings={onApplySimSettings}
                sceneParticipants={Array.from(sceneParticipants)}
                onSetSceneParticipants={(ids) => setSceneParticipants(new Set(ids))}
                sceneControl={sceneControl}
                onSetSceneControl={setSceneControl}
                onUpdateAgentVitals={handleUpdateAgentVitals}
                manualAtoms={manualAtoms as any}
                onChangeManualAtoms={setManualAtoms as any}
                pipelineStageId={currentPipelineStageId}
                onChangePipelineStageId={setPipelineStageId as any}
                onExportPipelineStage={handleExportPipelineStage as any}
                onExportPipelineAll={handleExportPipelineAll as any}
                goalScores={goals as any}
                goalPreview={goalPreview as any}
                actorLabels={actorLabels as any}
                contextualMind={contextualMind as any}
                locationScores={locationScores as any}
                tomScores={tomScores as any}
                atomDiff={atomDiff as any}

                characters={allCharacters as any}
                locations={allLocations as any}
                selectedAgentId={selectedAgentId as any}
                onSelectAgentId={handleSelectAgent as any}
                locationMode={locationMode as any}
                onSetLocationMode={setLocationMode as any}
                selectedLocationId={selectedLocationId as any}
                onSelectLocationId={setSelectedLocationId as any}

                agents={(worldState as any)?.agents as any}
                onSetAgentLocation={handleSetAgentLocation as any}
                onSetAgentPosition={handleSetAgentPosition as any}
                onMoveAllToLocation={handleMoveAllToLocation as any}
                onRebuildWorld={() => {
                  // Rebuild the derived world so agent/location ids and roles/tom are consistent with editor state.
                  if (worldSource === 'imported') {
                    // Do not silently destroy imported scenes; just refresh derived fields.
                    setWorldState(prev => {
                      if (!prev) return prev;
                      try { return refreshWorldDerived(prev as any, arr((prev as any).agents) as any) as any; } catch { return prev; }
                    });
                    return;
                  }
                  setWorldSource('derived');
                  rebuildWorldFromParticipants(new Set(sceneParticipants));
                }}
              />
            </div>
          ) : (
            <>
              <DoNowCard decision={(snapshotV1 as any)?.decision ?? null} />
              <GoalLabResults
                context={snapshot as any}
                frame={computed.frame as any}
                goalScores={goals as any}
                situation={situation as any}
                goalPreview={goalPreview as any}
                actorLabels={actorLabels as any}
                contextualMind={contextualMind as any}
                locationScores={locationScores as any}
                tomScores={tomScores as any}
                atomDiff={atomDiff as any}
                snapshotV1={snapshotV1 as any}
                pipelineV1={pipelineV1 as any}
                perspectiveAgentId={focusId as any}
                sceneDump={sceneDumpV2 as any}
                onDownloadScene={onDownloadScene}
                onImportScene={handleImportSceneClick}

                activeScenarioId={activeScenarioId}
                onSetActiveScenarioId={setActiveScenarioId}
                runSeed={normalizeSeedValue(runSeed)}
                onSetRunSeed={(n) => setRunSeed(String(n))}
                onApplySimSettings={onApplySimSettings}
                sceneParticipants={Array.from(sceneParticipants)}
                onSetSceneParticipants={(ids) => setSceneParticipants(new Set(ids))}
                sceneControl={sceneControl}
                onSetSceneControl={setSceneControl}
                onUpdateAgentVitals={handleUpdateAgentVitals}
                manualAtoms={manualAtoms as any}
                onChangeManualAtoms={setManualAtoms as any}
                pipelineStageId={currentPipelineStageId}
                onChangePipelineStageId={setPipelineStageId as any}
                onExportPipelineStage={handleExportPipelineStage as any}
                onExportPipelineAll={handleExportPipelineAll as any}
              />
            </>
          )}
        </div>
      </aside>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleImportSceneFile(file);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
};
