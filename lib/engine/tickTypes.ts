
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
