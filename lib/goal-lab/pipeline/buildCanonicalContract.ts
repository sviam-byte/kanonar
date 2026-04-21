import type { GoalLabPipelineV1, GoalLabStageFrame } from './runPipelineV1';
import { adaptPipelineV1ToContract } from './adaptV1ToContract';
import type { PipelineRun } from './contracts';
import type { GoalLabSnapshotV1 } from '../snapshotTypes';
import { arr } from '../../utils/arr';

export type CanonicalGoalLabContract = {
  pipelineV1: GoalLabPipelineV1;
  pipelineRun: PipelineRun | null;
  snapshotV1: GoalLabSnapshotV1;
};

function findStage(stages: GoalLabStageFrame[], stageId: string): GoalLabStageFrame | null {
  return stages.find((s) => String(s?.stage) === stageId) ?? null;
}

function firstArtifact<T = any>(stages: GoalLabStageFrame[], stageIds: string[], key: string): T | null {
  for (const stageId of stageIds) {
    const stage = findStage(stages, stageId);
    const value = stage?.artifacts?.[key];
    if (value != null) return value as T;
  }
  return null;
}

function collectWarnings(stages: GoalLabStageFrame[]): string[] {
  const out: string[] = [];
  for (const stage of stages) {
    for (const warning of arr<string>(stage?.warnings)) {
      if (warning) out.push(String(warning));
    }
  }
  return out;
}

export function buildCanonicalGoalLabContract(pipelineV1: GoalLabPipelineV1 | null): CanonicalGoalLabContract | null {
  if (!pipelineV1) return null;

  const stages = arr(pipelineV1.stages);
  const finalStage = stages[stages.length - 1] ?? null;
  const finalAtoms = arr(finalStage?.atoms);

  const decisionSnapshot = firstArtifact<any>(stages, ['S8'], 'decisionSnapshot');
  const transitionSnapshot = firstArtifact<any>(stages, ['S9'], 'transitionSnapshot');

  const snapshotV1: GoalLabSnapshotV1 = {
    schemaVersion: 1,
    tick: Number(pipelineV1.tick ?? 0),
    selfId: String(pipelineV1.selfId),
    atoms: finalAtoms,
    warnings: collectWarnings(stages),
    contextMind: firstArtifact(stages, ['S6'], 'contextMind'),
    possibilities: firstArtifact(stages, ['S8'], 'accessDecisions'),
    decision: decisionSnapshot
      ? { ...decisionSnapshot, transitionSnapshot: transitionSnapshot ?? decisionSnapshot?.transitionSnapshot ?? null }
      : {
          ranked: firstArtifact(stages, ['S8'], 'ranked') ?? [],
          best: firstArtifact(stages, ['S8'], 'best') ?? null,
          transitionSnapshot,
        },
    meta: {
      pipelineDeltas: stages,
      tick: Number(pipelineV1.tick ?? 0),
    },
  };

  // Several existing helpers still expect snapshot.pipelineV1 to exist even though
  // it is not part of the strict snapshot type.
  (snapshotV1 as any).pipelineV1 = pipelineV1;

  return {
    pipelineV1,
    pipelineRun: adaptPipelineV1ToContract(pipelineV1),
    snapshotV1,
  };
}
