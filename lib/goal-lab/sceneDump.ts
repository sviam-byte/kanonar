import type { AtomOverrideLayer } from '../context/overrides/types';
import type { WorldState } from '../../types';
import { buildGoalLabExplain } from './explain';
import { arr } from '../utils/arr';

type PipelineStageDeltaLite = {
  id: string;
  baseId?: string;
  full?: any[];
  added?: any[];
  changed?: any[];
  removedIds?: string[];
};

// Reconstruct the atom list at a specific stage by replaying pipeline deltas.
function materializeStageAtoms(pipeline: PipelineStageDeltaLite[] | any, stageId: string): any[] {
  if (!Array.isArray(pipeline) || !pipeline.length) return [];

  const byId = new Map(arr(pipeline).map((s: any) => [s.id, s]));
  const target: PipelineStageDeltaLite | undefined = byId.get(stageId);
  if (!target) return [];

  const s0: PipelineStageDeltaLite | undefined = arr(pipeline).find((s: any) => Array.isArray((s as any).full));
  if (!s0) return [];

  const chain: PipelineStageDeltaLite[] = [];
  const visited = new Set<string>();

  let cur: PipelineStageDeltaLite | undefined = target;
  while (cur) {
    if (visited.has(cur.id)) break;
    visited.add(cur.id);
    chain.push(cur);
    if (cur.id === s0.id) break;
    cur = cur.baseId ? byId.get(cur.baseId) : undefined;
  }
  chain.reverse();

  const m = new Map<string, any>(
    arr((s0 as any).full)
      .map((a: any) => [String(a?.id), a])
      .filter(([id]) => id)
  );

  for (const st of chain) {
    if (st.id === s0.id) continue;
    for (const rid of arr((st as any).removedIds)) m.delete(String(rid));
    for (const a of arr((st as any).added)) m.set(String(a?.id), a);
    for (const a of arr((st as any).changed)) m.set(String(a?.id), a);
  }

  return Array.from(m.values());
}

// Keep scene dumps readable: store only atom ids + counts per stage (cap list size).
function safeAtomIdList(atoms: any[], limit = 2000): string[] {
  const out: string[] = [];
  for (const a of Array.isArray(atoms) ? atoms : []) {
    const id = String((a as any)?.id || '');
    if (!id) continue;
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

type SceneDumpInput = {
  world: WorldState | null;
  includePipelineFrames?: boolean;
  includePipelineDeltas?: boolean;
  includeViolations?: boolean;
  pipelineV1?: any;
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
    includePipelineFrames,
    includePipelineDeltas,
    includeViolations,
    pipelineV1,
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
          if (id.startsWith(`tom:dyad:${selfId}:`) || id.startsWith(`tom:effective:dyad:${selfId}:`)) {
            const parts = id.split(':');
            // tom:dyad:self:other:metric
            // tom:effective:dyad:self:other:metric
            if (parts.length >= 5) {
              const selfIdx = parts[1] === 'effective' ? 3 : 2;
              const otherIdx = parts[1] === 'effective' ? 4 : 3;
              dyads.add(`${parts[selfIdx]}->${parts[otherIdx]}`);
            }
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

  const pipelineFrames = includePipelineFrames
    ? (pipelineV1?.stages || []).map((s: any) => ({
      name: s.title || s.stage || s.id,
      atoms: s.atoms || []
    }))
    : null;

  const pipelineDeltas = includePipelineDeltas
    ? (snapshot as any)?.meta?.pipelineDeltas ?? null
    : null;

  // Provide a compact view of S0..S* materialized atoms without bloating the dump.
  const pipelineMaterialized = (() => {
    if (!Array.isArray(pipelineDeltas)) return null;
    try {
      const byStage: Record<string, { atomCount: number; atomIds: string[] }> = {};
      for (const st of pipelineDeltas) {
        const id = String((st as any)?.id || '');
        if (!id) continue;
        const atoms = materializeStageAtoms(pipelineDeltas as any, id);
        const atomIds = safeAtomIdList(atoms, 4000);
        byStage[id] = { atomCount: atoms.length, atomIds };
      }
      return byStage;
    } catch {
      return { error: { message: 'materialize-failed' } } as any;
    }
  })();

  const pipelineViolations = includeViolations
    ? (Array.isArray(pipelineDeltas) ? pipelineDeltas.filter((s: any) => s?.id === 'VALIDATE' || s?.meta?.violations) : [])
    : null;

  return {
    schemaVersion: 3,
    exportedAt,
    quality,
    tick: (world as any)?.tick ?? 0,
    provenance: {
      inputPaths: {
        perspectiveId: 'components/GoalSandbox/GoalSandbox.tsx::perspectiveId',
        participantIds: 'components/GoalSandbox/GoalSandbox.tsx::participantIds',
        manualAtoms: 'components/GoalSandbox/GoalSandbox.tsx::manualAtoms',
        injectedEvents: 'components/GoalSandbox/GoalSandbox.tsx::selectedEventIds + world.eventRegistry',
        overrides: 'components/GoalSandbox/GoalSandbox.tsx::{atomOverridesLayer,sceneControl,affectOverrides}'
      },
      worldPaths: {
        agents: 'worldState.agents',
        locations: 'worldState.map.locations',
        eventLog: 'worldState.eventLog.events'
      },
      pipeline: {
        pipelineV1: 'lib/goal-lab/pipeline/runPipelineV1.ts::runGoalLabPipelineV1'
      }
    },
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
      pipelineV1,
    },
    pipelineFrames,
    pipelineDeltas,
    pipelineMaterialized,
    pipelineViolations,
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
