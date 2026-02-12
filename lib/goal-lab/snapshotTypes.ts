
import { ContextAtom } from '../context/v2/types';

export type GoalLabSnapshotV1 = {
  schemaVersion: 1;
  tick: number;
  selfId: string;

  atoms: ContextAtom[];                 // SINGLE source of truth for panels
  events?: any[];
  actions?: any[];
  stages?: any[];
  warnings?: any[];
  atomDiff?: any[];

  // optional structured blocks
  contextMind?: any;                    // scoreboard (Threat/Pressure/Support/Crowd)
  possibilities?: any[];                // typed possibilities (from registry)
  decision?: any;                       // ranked actions
  tom?: any;                            // if you keep separate
  threat?: any;                         // if you keep separate
  meta?: Record<string, any>;
  debug?: {
    orchestrator?: any;                 // OrchestratorTraceV1 (kept loose here to avoid coupling)
    [key: string]: any;
  };
  
  coverage?: any;                       // Atom coverage report
};

/**
 * V2 is a strict UI/explainability view schema layered on top of V1.
 * Payloads are intentionally loose (`unknown`) while contracts are evolving.
 */
export type GoalLabArtifactKindV2 =
  | 'world.truth'
  | 'world.actors'
  | 'observation'
  | 'belief'
  | 'intrinsics'
  | 'domains'
  | 'goal.logits'
  | 'goals'
  | 'atoms'
  | 'tom'
  | 'decision'
  | 'dynamics'
  | 'validators'
  | 'modes';

export type GoalLabArtifactV2 = {
  kind: GoalLabArtifactKindV2;
  label: string;
  /** UI grouping layer (truth / observation / belief / derived / config). */
  layer?: 'truth' | 'observation' | 'belief' | 'derived' | 'config';
  payload: unknown;
};

export type GoalLabStageFrameV2 = {
  stageId: string;
  stageName: string;
  summary?: string;
  artifacts: GoalLabArtifactV2[];
};

export type GoalLabSnapshotV2 = {
  schemaVersion: 2;
  tick: number;
  selfId: string;
  actorIds?: string[];

  worldTruth?: unknown;
  worldActors?: unknown;
  observation?: unknown;
  belief?: unknown;
  intrinsics?: unknown;
  tom?: unknown;
  goals?: unknown;
  decision?: unknown;

  stages: GoalLabStageFrameV2[];

  /** Backward compatibility branch for existing tools/panels. */
  legacy?: GoalLabSnapshotV1;
};

export type GoalLabSnapshot = GoalLabSnapshotV1 | GoalLabSnapshotV2;
