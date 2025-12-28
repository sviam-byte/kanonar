import type { AtomOverrideLayer } from '../context/overrides/types';
import type { WorldState } from '../../types';
import { buildGoalLabExplain } from './explain';
import { ensureTomMatrix } from '../tom/ensureMatrix';
import { normalizeAffectState } from '../affect/normalize';
import { defaultAffect } from '../affect/engine';

type SceneDumpInput = {
  world: WorldState | null;
  selectedAgentId?: string | null;
  perspectiveId?: string | null;
  selectedLocationId?: string | null;
  locationMode?: any;
  participantIds?: string[];
  activeMap?: any;
  selectedEventIds?: Set<string> | string[];
  manualAtoms?: any;
  atomOverridesLayer?: AtomOverrideLayer;
  affectOverrides?: any;
  injectedEvents?: any;
  sceneControl?: any;
  glCtx?: any;
  snapshot?: any;
  snapshotV1?: any;
  goals?: any;
  locationScores?: any;
  tomScores?: any;
  situation?: any;
  goalPreview?: any;
  contextualMind?: any;
  pipelineFrame?: any;
  tomMatrixForPerspective?: any;
  castRows?: any;
};

export function buildGoalLabSceneDumpV2(input: SceneDumpInput) {
  if (!input.world) return null;

  const exportedAt = new Date().toISOString();
  const {
    world,
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
    tomMatrixForPerspective,
    castRows,
  } = input;

  // Ensure exported world contains full affect + full ToM matrix
  try {
    const w: any = world as any;
    const ids = (w.agents || []).map((a: any) => a.entityId).filter(Boolean);
    for (const a of w.agents || []) {
      if (!a.affect) a.affect = defaultAffect(w.tick ?? 0);
      a.affect = normalizeAffectState(a.affect);
      a.state = { ...(a.state || {}), affect: a.affect };
    }
    if (ids.length >= 2) ensureTomMatrix(world as any, ids);
  } catch {}

  return {
    schemaVersion: 2,
    exportedAt,
    tick: (world as any)?.tick ?? 0,
    focus: {
      selectedAgentId: selectedAgentId ?? null,
      perspectiveId: perspectiveId ?? null,
      selectedLocationId: selectedLocationId ?? null,
      locationMode,
      participantIds: participantIds ? participantIds.slice() : [],
    },
    inputs: {
      activeMapId: (activeMap as any)?.id ?? null,
      selectedEventIds: Array.from(selectedEventIds ?? []),
      manualAtoms,
      atomOverridesLayer,
      affectOverrides,
      injectedEvents,
      sceneControl,
    },
    world,
    pipeline: {
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
    },
    explain: buildGoalLabExplain(snapshot ?? null),
    tomMatrixForPerspective,
    castRows,
  };
}

export function downloadJson(payload: any, fileName: string) {
  const replacer = (_k: string, v: any) => {
    if (v instanceof Map) return Object.fromEntries(Array.from(v.entries()));
    if (v instanceof Set) return Array.from(v.values());
    if (typeof v === 'function') return undefined;
    return v;
  };

  try {
    const json = JSON.stringify(payload, replacer, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('[sceneDump] failed to export scene JSON', e);
  }
}
