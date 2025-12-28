import type { AtomOverrideLayer } from '../context/overrides/types';
import type { WorldState } from '../../types';
import { buildGoalLabExplain } from './explain';

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

  const quality = (() => {
    try {
      const cast = Array.isArray(castRows) ? castRows : [];
      const castSize = cast.length;
      const expectedDyads = castSize > 0 ? castSize * (castSize - 1) : 0;

      const perSelf = cast.map((r: any) => {
        const selfId = r?.id;
        const atoms: any[] = r?.snapshot?.atoms || [];
        const dyads = new Set<string>();
        let affectAtoms = 0;
        let emoAtoms = 0;
        for (const a of atoms) {
          const id = a?.id;
          if (typeof id !== 'string') continue;
          if (id.startsWith(`tom:dyad:${selfId}:`)) {
            const parts = id.split(':');
            if (parts.length >= 5) dyads.add(`${parts[2]}->${parts[3]}`);
          } else if (id.startsWith('affect:')) affectAtoms += 1;
          else if (id.startsWith('emo:')) emoAtoms += 1;
        }
        return { selfId, dyadCount: dyads.size, affectAtoms, emoAtoms };
      });

      const dyadsPresent = perSelf.reduce((acc, x) => acc + (x?.dyadCount || 0), 0);
      return { castSize, expectedDyads, dyadsPresent, perSelf };
    } catch {
      return { error: 'quality-metrics-failed' };
    }
  })();

  return {
    schemaVersion: 2,
    exportedAt,
    quality,
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
