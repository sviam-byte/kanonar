// lib/goal-lab/pipeline/pipelineTypes.ts
// Canonical type for GoalLab pipeline result (runGoalLabPipelineV1 return).

export interface PipelineStageResult {
  stage: string;        // 'S0' | 'S1' | ... | 'S9'
  title?: string;
  atoms?: unknown[];
  atomsAddedIds?: string[];
  warnings?: string[];
  stats?: Record<string, unknown>;
  artifacts?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

export interface BeliefPersistResult {
  beliefAtoms?: unknown[];
}

export interface GoalLabPipelineResult {
  schemaVersion: number;
  selfId: string;
  tick: number;
  step: number;
  participantIds: string[];
  stages: PipelineStageResult[];
  beliefPersist?: BeliefPersistResult;
}

/** Typed accessor for finding a pipeline stage by id. */
export function findStage(pipeline: GoalLabPipelineResult | null | undefined, stageId: string): PipelineStageResult | undefined {
  return pipeline?.stages?.find(s => s.stage === stageId);
}

/** Typed accessor for stage artifacts. */
export function stageArtifacts(pipeline: GoalLabPipelineResult | null | undefined, stageId: string): Record<string, unknown> {
  return findStage(pipeline, stageId)?.artifacts ?? {};
}
