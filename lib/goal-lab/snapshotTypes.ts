
import { ContextAtom } from '../context/v2/types';
import {
  GOAL_LAB_SNAPSHOT_SCHEMA_VERSION,
  type GoalLabVersionStamp,
  type KanonarSystemVersion,
} from './versioning';

export type GoalLabSnapshotV1 = {
  schemaVersion: typeof GOAL_LAB_SNAPSHOT_SCHEMA_VERSION;
  systemVersion: KanonarSystemVersion;
  contractId: 'goal-lab-snapshot-v1';
  versionStamp: GoalLabVersionStamp<'goal-lab-snapshot-v1', typeof GOAL_LAB_SNAPSHOT_SCHEMA_VERSION>;
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
