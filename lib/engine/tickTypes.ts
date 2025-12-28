
export type TickConfig = {
  dt: number;    // usually 1
  steps: number; // for multi-step runs
  seed?: number;
  // Process the whole cast each step.
  allAgents?: boolean;
  // Optional explicit list of agents to process (ordered).
  agentIds?: string[];
};

export type TickResult = {
  tick: number;
  snapshots: any[]; // per-step ContextSnapshot
  diffs?: any[];    // optional diff objects
  agentId: string;
};
