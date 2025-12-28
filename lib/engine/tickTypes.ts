
export type TickConfig = {
  dt: number;    // usually 1
  steps: number; // for multi-step runs
  seed?: number;
};

export type TickResult = {
  tick: number;
  snapshots: any[]; // per-step ContextSnapshot
  diffs?: any[];    // optional diff objects
  agentId: string;
};

export type TickResultCast = {
  tick: number;
  participantIds: string[];
  snapshotsByAgentId: Record<string, any[]>; // per agent: per-step ContextSnapshot
  diffsByAgentId?: Record<string, any[]>;
};
