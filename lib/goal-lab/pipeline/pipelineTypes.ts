// lib/goal-lab/pipeline/pipelineTypes.ts
// Compat helpers over the canonical GoalLab pipeline result.
// Canonical runtime types live in `runPipelineV1.ts`.

import type { BeliefPersistOutput } from './beliefPersist';
import type { GoalLabPipelineV1, GoalLabStageFrame } from './runPipelineV1';

export type PipelineStageResult = GoalLabStageFrame;

export type BeliefPersistResult = BeliefPersistOutput;

export type GoalLabPipelineResult = GoalLabPipelineV1;

/** Typed accessor for finding a pipeline stage by id. */
export function findStage(pipeline: GoalLabPipelineResult | null | undefined, stageId: string): PipelineStageResult | undefined {
  return pipeline?.stages?.find(s => s.stage === stageId);
}

/** Typed accessor for stage artifacts. */
export function stageArtifacts(pipeline: GoalLabPipelineResult | null | undefined, stageId: string): Record<string, unknown> {
  return findStage(pipeline, stageId)?.artifacts ?? {};
}
