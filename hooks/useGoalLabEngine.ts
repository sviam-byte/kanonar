/**
 * useGoalLabEngine — computation pipeline for GoalLab.
 *
 * Takes world + overrides → produces snapshot, pipeline, goals, cast rows, VM.
 * All the heavy useMemo chains from GoalSandbox live here now.
 *
 * Intentionally lazy: expensive computations (cast rows, contextualMind, POMDP)
 * are gated by `needs.*` flags so inactive tabs don't burn CPU.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import type { WorldState, AffectState, AgentState, LocationEntity } from '../types';
import type { ContextAtom, ContextualGoalScore } from '../lib/context/v2/types';
import type { AtomOverrideLayer } from '../lib/context/overrides/types';
import type { ContextualMindReport } from '../lib/tom/contextual/types';
import type { GoalLabSnapshotV1 } from '../lib/goal-lab/snapshotTypes';
import type { AtomDiff } from '../lib/snapshot/diffAtoms';

import { buildGoalLabContext } from '../lib/goals/goalLabContext';
import { scoreContextualGoals } from '../lib/context/v2/scoring';
import { computeLocationGoalsForAgent } from '../lib/context/v2/locationGoals';
import { computeTomGoalsForAgent } from '../lib/context/v2/tomGoals';
import { computeContextualMind } from '../lib/tom/contextual/engine';
import { adaptToSnapshotV1, normalizeSnapshot } from '../lib/goal-lab/snapshotAdapter';
import { runGoalLabPipelineV1 } from '../lib/goal-lab/pipeline/runPipelineV1';
import { adaptPipelineV1ToContract } from '../lib/goal-lab/pipeline/adaptV1ToContract';
import { buildDebugFrameFromSnapshot } from '../lib/goal-lab/debugFrameFromSnapshot';
import { getCanonicalAtomsFromSnapshot } from '../lib/goal-lab/atoms/canonical';
import { buildGoalLabSceneDumpV2, downloadJson } from '../lib/goal-lab/sceneDump';
import { normalizeAtom } from '../lib/context/v2/infer';
import { eventRegistry } from '../data/events-registry';
import { arr } from '../lib/utils/arr';
import { useDebouncedValueWithFlush } from './useDebouncedValue';

import type { GoalLabWorldHandle } from './useGoalLabWorld';

export interface EngineOverrides {
  affectOverrides: Partial<AffectState>;
  manualAtoms: ContextAtom[];
  selectedEventIds: Set<string>;
  atomOverridesLayer: AtomOverrideLayer;
  injectedEvents: any[];
  sceneControl: any;
  decisionNonce: number;
  observeLiteParams: { radius: number; maxAgents: number; noiseSigma: number; seed: number };
}

export interface EngineNeeds {
  contextualMind: boolean;
  castRows: boolean;
  pomdpPipeline: boolean;
}

export interface GoalLabEngineResult {
  snapshot: any | null;
  snapshotV1: GoalLabSnapshotV1 | null;
  pipelineV1: any | null;
  pipelineFrame: any | null;
  goals: any[];
  situation: any | null;
  goalPreview: any | null;
  contextualMind: ContextualMindReport | null;
  locationScores: any[];
  tomScores: any[];
  pipelineStageId: string;
  setPipelineStageId: (id: string) => void;
  pipelineStageOptions: string[];
  passportAtoms: ContextAtom[];
  canonicalAtoms: any;
  castRows: any[];
  pomdpPipelineV1: any | null;
  pomdpRun: any | null;
  atomDiff: AtomDiff[];
  sceneDump: any;
  downloadScene: () => void;
  error: string | null;
  vm: GoalLabVM;
}

export type GoalLabVM = {
  sceneDump: any;
  snapshotV1: any;
  pipelineV1: any;
  pipelineFrame: any;
  pipelineStageId: string;
  perspectiveId: string;
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
  onChangePipelineStageId: (id: string) => void;
  onSetPerspectiveId: (id: string) => void;
  onDownloadScene: () => void;
  onChangeManualAtoms: (atoms: any[]) => void;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function collectLocationTags(location: LocationEntity | null | undefined): string[] {
  if (!location) return [];
  const direct = Array.isArray((location as any).tags) ? (location as any).tags : [];
  const propTags = Array.isArray(location.properties?.tags) ? location.properties?.tags : [];
  const mapTags = Array.isArray((location as any)?.map?.tags) ? (location as any).map.tags : [];
  return Array.from(new Set([...direct, ...propTags, ...mapTags].map(String)));
}

function deriveManualContextAxes(location: LocationEntity | null | undefined) {
  const tags = collectLocationTags(location);
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  const props: Record<string, unknown> = (location as any)?.properties ?? {};
  return {
    privacy: clamp01(Number((props as any).privacy ?? (tagSet.has('private') || tagSet.has('bedroom') ? 1.0 : 0.1))),
    social: clamp01(Number((props as any).social ?? (tagSet.has('public') || tagSet.has('bar') ? 1.0 : 0.0))),
    duty: clamp01(Number((props as any).duty ?? (tagSet.has('work') || tagSet.has('office') ? 1.0 : 0.0))),
    danger: clamp01(Number((props as any).danger ?? (tagSet.has('dangerous') ? 0.8 : 0.0))),
    comfort: clamp01(Number((props as any).comfort ?? 0.5)),
    hygiene: clamp01(Number((props as any).hygiene ?? 0.5)),
    authorityPresence: clamp01(Number((props as any).authorityPresence ?? (tagSet.has('throne') ? 1.0 : 0.0))),
    crowding: clamp01(Number((props as any).crowding ?? clamp01(Number((props as any).social ?? 0)))),
    noise: clamp01(Number((props as any).noise ?? 0.2)),
  };
}

function buildManualContextAxisAtoms(selfId: string, axes: ReturnType<typeof deriveManualContextAxes>): ContextAtom[] {
  const raw = [
    { id: `world:loc:privacy:${selfId}`, magnitude: axes.privacy },
    { id: `ctx:privacy:${selfId}`, magnitude: axes.privacy },
    { id: `ctx:publicness:${selfId}`, magnitude: axes.social },
    { id: `ctx:crowding:${selfId}`, magnitude: axes.crowding },
    { id: `world:loc:normative_pressure:${selfId}`, magnitude: axes.duty },
    { id: `ctx:normPressure:${selfId}`, magnitude: axes.duty },
    { id: `world:map:danger:${selfId}`, magnitude: axes.danger },
    { id: `ctx:danger:${selfId}`, magnitude: axes.danger },
    { id: `ctx:comfort:${selfId}`, magnitude: axes.comfort },
    { id: `ctx:hygiene:${selfId}`, magnitude: axes.hygiene },
    { id: `ctx:noise:${selfId}`, magnitude: axes.noise },
    { id: `ctx:authorityPresence:${selfId}`, magnitude: axes.authorityPresence },
  ];
  return raw.map(a => normalizeAtom({ ...a, source: 'manual', kind: 'ctx', confidence: 0.8, label: `Manual ${a.id}` }));
}

function dedupeAtomsById(atoms: ContextAtom[]): ContextAtom[] {
  const seen = new Map<string, ContextAtom>();
  for (const a of arr(atoms)) {
    const id = String((a as any).id || '');
    if (!seen.has(id) || ((a as any).magnitude ?? 0) > ((seen.get(id) as any)?.magnitude ?? 0)) {
      seen.set(id, a);
    }
  }
  return Array.from(seen.values());
}

function mergeManualAtoms(manual: ContextAtom[], auto: ContextAtom[]): ContextAtom[] {
  const byId = new Map<string, ContextAtom>();
  for (const a of auto) byId.set(String((a as any).id), a);
  for (const a of manual) byId.set(String((a as any).id), a);
  return Array.from(byId.values());
}

function collectTraitIds(agent: AgentState): Set<string> {
  const traitIds = new Set<string>();
  const identity: any = (agent as any)?.identity || {};
  const push = (t: any) => {
    if (typeof t === 'string') traitIds.add(t);
    else if (typeof t?.id === 'string') traitIds.add(t.id);
    else if (typeof t?.key === 'string') traitIds.add(t.key);
  };
  (Array.isArray(identity?.traits) ? identity.traits : []).forEach(push);
  (Array.isArray((agent as any)?.traits) ? (agent as any).traits : []).forEach(push);
  if (typeof identity?.arch_true_dominant_id === 'string') traitIds.add(identity.arch_true_dominant_id);
  return traitIds;
}

type ManualContextAxes = ReturnType<typeof deriveManualContextAxes>;

function applyUiPersonalization(
  goals: ContextualGoalScore[],
  agent: AgentState,
  frame: any,
): (ContextualGoalScore & { uiMultiplier?: number; uiReasons?: string[] })[] {
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

    if (traitIds.has('Introvert')) {
      if (locTags.has('public') || locTags.has('Public')) {
        if (isSocial) { m *= 0.3; reasons.push('Introvert×public'); }
        if (isRelax) { m *= 0.6; reasons.push('Relax↓public'); }
      }
      if (locTags.has('private') || locTags.has('Private') || isSafeCell) {
        if (isRelax) { m *= 1.4; reasons.push('Relax↑private'); }
      }
    }
    if (traitIds.has('Extrovert') && isSocial) { m *= 1.4; reasons.push('Extrovert'); }
    if (traitIds.has('NeatFreak') && isClean) { m *= 1.6; reasons.push('NeatFreak'); }
    if (traitIds.has('Lazy')) {
      if (isWork || isClean) { m *= 0.6; reasons.push('Lazy↓work/clean'); }
      if (isRelax) { m *= 1.2; reasons.push('Lazy↑rest'); }
    }
    if (isSafeCell || locTags.has('safe_hub') || locTags.has('private')) {
      if (/escape|flee|panic|hide/i.test(goalId)) { m *= 0.7; reasons.push('Safe↓panic'); }
      if (isRelax) { m *= 1.1; reasons.push('Safe↑rest'); }
    }

    const rawProb = Number((goal as any).probability ?? 0);
    return {
      ...goal,
      totalLogit: Number((goal as any).totalLogit ?? 0) * m,
      probability: clamp01(rawProb * m),
      uiMultiplier: Math.abs(m - 1) > 1e-3 ? Number(m.toFixed(3)) : undefined,
      uiReasons: reasons.length ? reasons : undefined,
    };
  }).sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
}

function applyLabVariability(
  goals: (ContextualGoalScore & { uiMultiplier?: number; uiReasons?: string[] })[],
  traitIds: Set<string>,
  axes: ManualContextAxes,
  locationTags: string[],
) {
  const traitList = Array.from(traitIds);
  const roomTags = locationTags.map(String);

  return (goals || []).map(goal => {
    let finalProb = Number((goal as any).probability ?? 0);
    let finalLogit = Number((goal as any).totalLogit ?? 0);
    const modifiers: string[] = [];
    const goalId = String((goal as any).goalId || '');

    if (traitIds.has('Coward') && axes.danger > 0.1) {
      finalProb *= 0.1; finalLogit *= 0.1; modifiers.push('Coward (Fear)');
    }
    if (traitIds.has('Introvert') && axes.social > 0.5) {
      if (goalId === 'Socialize') { finalProb *= 0.5; finalLogit *= 0.5; modifiers.push('Introvert (Social drain)'); }
      if (goalId === 'GoHome') { finalProb *= 1.5; finalLogit *= 1.5; modifiers.push('Introvert (Escape)'); }
    }

    return {
      ...goal,
      totalLogit: finalLogit,
      probability: clamp01(finalProb),
      _debugModifiers: modifiers.length ? modifiers : undefined,
      debug: { inputValues: axes, traits: traitList, roomTags },
    };
  }).sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
}

export function useGoalLabEngine(
  world: GoalLabWorldHandle,
  overrides: EngineOverrides,
  needs: EngineNeeds,
): GoalLabEngineResult {
  const {
    worldState, perspectiveId, selectedAgentId, participantIds,
    activeMap, getSelectedLocationEntity,
  } = world;

  const {
    affectOverrides, manualAtoms, selectedEventIds, atomOverridesLayer,
    injectedEvents, sceneControl, decisionNonce, observeLiteParams,
  } = overrides;

  const [pipelineStageId, setPipelineStageId] = useState<string>('S5');
  const [error, setError] = useState<string | null>(null);

  const labLocationCtx = useMemo(() => {
    const location = getSelectedLocationEntity();
    const tags = collectLocationTags(location);
    const axes = deriveManualContextAxes(location);
    return { location, tags, axes };
  }, [getSelectedLocationEntity]);

  const devValidateAtoms = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

  const glCtx = useMemo(() => {
    if (!worldState || !perspectiveId) return null;
    const { location, axes } = labLocationCtx;
    const autoAxisAtoms = buildManualContextAxisAtoms(perspectiveId, axes);
    const merged = mergeManualAtoms(arr(manualAtoms), autoAxisAtoms);
    const worldForCtx = { ...(worldState as any), contextAxes: axes } as WorldState;
    const agent = worldForCtx.agents.find(a => a.entityId === perspectiveId);
    if (!agent) return null;
    try {
      const activeEvents = eventRegistry.getAll().filter(e => selectedEventIds.has(e.id));
      return buildGoalLabContext(worldForCtx, perspectiveId, {
        snapshotOptions: {
          activeEvents, participantIds, overrideLocation: location,
          manualAtoms: merged, gridMap: activeMap, atomOverridesLayer,
          overrideEvents: injectedEvents, sceneControl, affectOverrides, decisionNonce,
        },
        timeOverride: (worldForCtx as any).tick,
        devValidateAtoms,
      });
    } catch (e: any) {
      console.error('[useGoalLabEngine] buildGoalLabContext failed', e);
      setError(String(e?.message || e));
      return null;
    }
  }, [worldState, perspectiveId, labLocationCtx, manualAtoms, selectedEventIds, activeMap,
    atomOverridesLayer, injectedEvents, sceneControl, affectOverrides, decisionNonce, participantIds, devValidateAtoms]);

  const computed = useMemo(() => {
    if (!glCtx || !worldState) return { goals: [], locationScores: [], tomScores: [], situation: null, goalPreview: null, contextualMind: null, snapshot: null, frame: null };
    try {
      const { agent, frame, snapshot, situation, goalPreview } = glCtx as any;
      snapshot.atoms = dedupeAtomsById(snapshot.atoms);
      const rawGoals = scoreContextualGoals(agent, worldState, snapshot, undefined, frame || undefined);
      const uiGoals = applyUiPersonalization(rawGoals, agent, frame);
      const traitIds = collectTraitIds(agent);
      const { axes, tags: locationTags } = labLocationCtx;
      const goals = applyLabVariability(uiGoals, traitIds, axes, locationTags);

      const locScores = computeLocationGoalsForAgent(worldState, agent.entityId, (agent as any).locationId || null);
      const tomScores = computeTomGoalsForAgent(worldState, agent.entityId);
      let cm: ContextualMindReport | null = null;
      if (needs.contextualMind) {
        try {
          cm = computeContextualMind({
            world: worldState, agent, frame: frame || null,
            goalPreview: goalPreview?.goals ?? null,
            domainMix: { ...(snapshot?.domains ?? {}), ...(goalPreview?.debug?.d_mix ?? {}) } as any,
            atoms: snapshot.atoms,
          }).report;
        } catch (e) { console.error(e); }
      }
      return { goals, locationScores: locScores, tomScores, situation, goalPreview, contextualMind: cm, snapshot, frame };
    } catch (e: any) {
      console.error('[useGoalLabEngine] compute failed', e);
      setError(String(e?.message || e));
      return { goals: [], locationScores: [], tomScores: [], situation: null, goalPreview: null, contextualMind: null, snapshot: null, frame: null };
    }
  }, [glCtx, worldState, needs.contextualMind, labLocationCtx]);

  const snapshotV1 = useMemo<GoalLabSnapshotV1 | null>(() => {
    if (!glCtx) return null;
    return normalizeSnapshot(adaptToSnapshotV1(glCtx as any, { selfId: perspectiveId } as any));
  }, [glCtx, perspectiveId]);

  const pipelineV1 = useMemo(() => {
    if (!snapshotV1) return null;
    const stages = arr((snapshotV1 as any)?.meta?.pipelineDeltas);
    return { schema: 'GoalLabPipelineV1', agentId: perspectiveId, selfId: perspectiveId, tick: (snapshotV1 as any)?.meta?.tick ?? 0, stages };
  }, [snapshotV1, perspectiveId]);

  const pipelineStageOptions = useMemo(() => {
    if (pipelineV1?.stages?.length) {
      return pipelineV1.stages.map((s: any, i: number) => String(s?.stage || s?.id || `S${i}`)).filter(Boolean);
    }
    return ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
  }, [pipelineV1]);

  const resolvedStageId = useMemo(() => {
    const i = pipelineStageOptions.indexOf(pipelineStageId);
    return i >= 0 ? pipelineStageOptions[i] : pipelineStageOptions[pipelineStageOptions.length - 1] || pipelineStageId;
  }, [pipelineStageOptions, pipelineStageId]);

  const canonicalAtoms = useMemo(() => {
    if (!snapshotV1) return { stageId: resolvedStageId, atoms: [], source: 'empty' as const, warnings: [] };
    return getCanonicalAtomsFromSnapshot(snapshotV1 as any, resolvedStageId);
  }, [snapshotV1, resolvedStageId]);

  const passportAtoms = useMemo(() => arr(canonicalAtoms?.atoms), [canonicalAtoms]);

  const pipelineFrame = useMemo(() => {
    if (!snapshotV1) return null;
    return buildDebugFrameFromSnapshot(snapshotV1 as any, resolvedStageId);
  }, [snapshotV1, resolvedStageId]);

  const buildCastRow = useCallback((agentId: string) => {
    if (!worldState) return null;
    const char = world.allCharacters?.find?.((c: any) => c.entityId === agentId);
    try {
      const res = buildGoalLabContext(worldState, agentId, {
        snapshotOptions: {
          activeEvents: eventRegistry.getAll().filter(e => selectedEventIds.has(e.id)),
          participantIds, overrideLocation: getSelectedLocationEntity(),
          manualAtoms, gridMap: activeMap, atomOverridesLayer,
          overrideEvents: injectedEvents, sceneControl, affectOverrides, decisionNonce,
        },
        timeOverride: (worldState as any).tick,
        devValidateAtoms,
      });
      return { id: agentId, label: (char as any)?.title || agentId, snapshot: res?.snapshot ?? null };
    } catch {
      return { id: agentId, label: (char as any)?.title || agentId, snapshot: null };
    }
  }, [worldState, participantIds, selectedEventIds, getSelectedLocationEntity, manualAtoms, activeMap, atomOverridesLayer, injectedEvents, sceneControl, affectOverrides, decisionNonce]);

  const castRows = useMemo(() => {
    if (!needs.castRows || !worldState) return [];
    const ids = participantIds.length ? participantIds : arr((worldState as any).agents).map((a: any) => a.entityId).filter(Boolean);
    return ids.map(id => buildCastRow(String(id))).filter(Boolean);
  }, [needs.castRows, worldState, participantIds, buildCastRow]);

  const debounceMs = 120;
  const [debouncedWorld] = useDebouncedValueWithFlush(worldState, debounceMs);

  const pomdpPipelineV1 = useMemo(() => {
    if (!needs.pomdpPipeline || !debouncedWorld) return null;
    const agentId = perspectiveId || selectedAgentId || '';
    if (!agentId) return null;
    try {
      return runGoalLabPipelineV1({
        world: debouncedWorld as any, agentId,
        participantIds: participantIds as any,
        manualAtoms: manualAtoms as any,
        injectedEvents, sceneControl,
        tickOverride: Number((debouncedWorld as any)?.tick ?? 0),
        observeLiteParams,
      });
    } catch (e) { console.error('[useGoalLabEngine] POMDP pipeline failed', e); return null; }
  }, [needs.pomdpPipeline, debouncedWorld, perspectiveId, selectedAgentId, participantIds, manualAtoms, injectedEvents, sceneControl, observeLiteParams]);

  const pomdpRun = useMemo(() => adaptPipelineV1ToContract(pomdpPipelineV1 as any), [pomdpPipelineV1]);

  const [atomDiff] = useState<AtomDiff[]>([]);

  const sceneDump = useMemo(() => {
    return buildGoalLabSceneDumpV2({
      world: worldState, selectedAgentId, perspectiveId,
      selectedLocationId: world.selectedLocationId,
      locationMode: world.locationMode,
      participantIds, activeMap,
      sceneControl, manualAtoms,
      selectedEventIds: Array.from(selectedEventIds),
    } as any);
  }, [worldState, selectedAgentId, perspectiveId, world.selectedLocationId, world.locationMode, participantIds, activeMap, sceneControl, manualAtoms, selectedEventIds]);

  const downloadScene = useCallback(() => {
    const tag = participantIds.slice(0, 3).join('-') || 'scene';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(sceneDump, `goal-lab-scene__${tag}__${ts}.json`);
  }, [sceneDump, participantIds]);

  const vm = useMemo<GoalLabVM>(() => ({
    sceneDump, snapshotV1: snapshotV1 as any, pipelineV1, pipelineFrame,
    pipelineStageId: resolvedStageId, perspectiveId,
    castRows, passportAtoms: passportAtoms as any, passportMeta: canonicalAtoms as any,
    contextualMind: computed.contextualMind, locationScores: computed.locationScores,
    tomScores: computed.tomScores,
    tom: (worldState as any)?.tom?.[perspectiveId],
    atomDiff, manualAtoms, worldState: worldState as any,
    onChangePipelineStageId: setPipelineStageId,
    onSetPerspectiveId: world.setPerspectiveAgentId,
    onDownloadScene: downloadScene,
    onChangeManualAtoms: () => {},
  }), [sceneDump, snapshotV1, pipelineV1, pipelineFrame, resolvedStageId, perspectiveId,
    castRows, passportAtoms, canonicalAtoms, computed, worldState, atomDiff, manualAtoms, downloadScene, world]);

  return {
    snapshot: computed.snapshot, snapshotV1, pipelineV1, pipelineFrame,
    goals: computed.goals, situation: computed.situation, goalPreview: computed.goalPreview,
    contextualMind: computed.contextualMind, locationScores: computed.locationScores,
    tomScores: computed.tomScores,
    pipelineStageId: resolvedStageId, setPipelineStageId, pipelineStageOptions,
    passportAtoms, canonicalAtoms,
    castRows, pomdpPipelineV1, pomdpRun, atomDiff, sceneDump, downloadScene,
    error, vm,
  };
}
