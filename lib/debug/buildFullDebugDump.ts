import { materializeStageAtoms } from '../../components/goal-lab/materializePipeline';
import type { ContextAtom } from '../context/v2/types';
import { getCanonicalAtomsFromSnapshot } from '../goal-lab/atoms/canonical';

function asArr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
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
  const canon = snapshotV1 ? getCanonicalAtomsFromSnapshot(snapshotV1) : null;

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
      legacyAtoms: atoms,
    },

    canonical: canon ? {
      stageId: canon.stageId,
      source: canon.source,
      warnings: canon.warnings,
      atoms: canon.atoms,
    } : null,

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
