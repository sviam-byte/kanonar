import type { ContextAtom } from '../context/v2/types';

function asArr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

// IMPORTANT:
// This file must NOT import UI/components.
// Importing from components can create ESM circular dependencies and trigger TDZ
// crashes like "Cannot access '<x>' before initialization" in production bundles.
//
// Re-implementation of `components/goal-lab/materializePipeline.ts` to keep lib → UI dependency-free.
function materializeStageAtoms(pipeline: any, stageId: string): any[] {
  if (!Array.isArray(pipeline) || !pipeline.length) return [];

  const byId = new Map<string, any>(
    asArr<any>(pipeline)
      .map(s => [String((s as any)?.id || ''), s] as const)
      .filter(([id]) => !!id)
  );

  const target: any = byId.get(String(stageId));
  if (!target) return [];

  const s0: any = asArr<any>(pipeline).find(s => Array.isArray((s as any).full));
  if (!s0 || !Array.isArray((s0 as any).full)) return [];

  const chain: any[] = [];
  const visited = new Set<string>();
  let cur: any = target;
  while (cur) {
    const id = String((cur as any)?.id || '');
    if (!id || visited.has(id)) break;
    visited.add(id);
    chain.push(cur);
    if (id === String((s0 as any).id)) break;
    cur = (cur as any).baseId ? byId.get(String((cur as any).baseId)) : undefined;
  }
  chain.reverse();

  const m = new Map<string, any>(
    asArr<any>((s0 as any).full)
      .map(a => [String(a?.id || ''), a] as const)
      .filter(([id]) => !!id)
  );

  for (const st of chain) {
    if (String((st as any).id) === String((s0 as any).id)) continue;
    for (const rid of asArr<any>((st as any).removedIds)) m.delete(String(rid));
    for (const a of asArr<any>((st as any).added)) m.set(String(a?.id), a);
    for (const a of asArr<any>((st as any).changed)) m.set(String(a?.id), a);
  }

  return Array.from(m.values());
}
export function buildFullDebugDump(args: {
  snapshotV1: any;
  pipelineV1?: any;
  pipelineFrame?: any;
  worldState?: any;
  sceneDump?: any;
  castRows?: any[];
  manualAtoms?: ContextAtom[];
  selectedEventIds?: string[] | Set<string>;
  selectedLocationId?: string | null;
  selectedAgentId?: string | null;
  uiMeta?: any;
}) {
  const {
    snapshotV1,
    pipelineV1,
    pipelineFrame,
    worldState,
    sceneDump,
    castRows,
    manualAtoms,
    selectedEventIds,
    selectedLocationId,
    selectedAgentId,
    uiMeta,
  } = args;

  const exportedAt = new Date().toISOString();

  // pipeline deltas from snapshot meta (fallback)
  const pipelineDeltasRaw = snapshotV1?.meta?.pipelineDeltas;
  const pipelineDeltas = asArr<any>(pipelineDeltasRaw);

  const materializedByStage: Record<string, any[]> = {};
  try {
    for (const st of pipelineDeltas) {
      const id = String(st?.id || '');
      if (!id) continue;
      materializedByStage[id] = materializeStageAtoms(pipelineDeltas, id);
    }
  } catch {}

  // useful computed slices
  const atoms = asArr<any>(snapshotV1?.atoms);

  const payload = {
    schema: 'GoalLabFullDebugDumpV1',
    exportedAt,

    selection: {
      selectedAgentId: selectedAgentId ?? snapshotV1?.selfId ?? null,
      selectedLocationId: selectedLocationId ?? null,
      selectedEventIds:
        selectedEventIds instanceof Set ? Array.from(selectedEventIds).map(String) :
        Array.isArray(selectedEventIds) ? selectedEventIds.map(String) : [],
    },

    inputs: {
      worldState: worldState ?? null,
      sceneDump: sceneDump ?? null,
      manualAtoms: asArr<any>(manualAtoms),
    },

    snapshot: {
      tick: snapshotV1?.tick ?? 0,
      selfId: snapshotV1?.selfId ?? null,
      decision: snapshotV1?.decision ?? null,
      meta: snapshotV1?.meta ?? null,
      finalAtoms: atoms,
    },

    pipeline: pipelineV1
      ? { kind: 'pipelineV1', pipelineV1 }
      : {
          kind: 'deltas',
          pipelineDeltas,
          materializedByStage,
        },

    frame: pipelineFrame ?? null,

    cast: {
      rows: asArr<any>(castRows),
    },

    uiMeta: uiMeta ?? null,
  };

  return payload;
}
