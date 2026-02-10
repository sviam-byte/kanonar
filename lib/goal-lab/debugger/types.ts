export type DebugStageStatus = 'ok' | 'warning' | 'error';

export type DebugGraphNodeType = 'atom' | 'channel' | 'goal' | 'action';

export type DebugGraphNode = {
  id: string;
  type: DebugGraphNodeType;
  label: string;
  energy: number;
  cost?: number;
};

export type DebugGraphEdge = {
  from: string;
  to: string;
  weight: number;
  type: 'causal' | 'inhibitory';
};

export type DebugStageSummary = {
  status: DebugStageStatus;
  text: string;
  metrics?: Record<string, string | number>;
};

export type DebugStageRecord = {
  id: 's0_intake' | 's1_personality' | 's2_goal_seed' | 's3_propagation' | 's4_competition' | 's5_action_projection' | 's6_choice';
  title: string;
  summary: DebugStageSummary;
  payload: Record<string, any>;
};

export type PipelineSnapshotDebug = {
  tick: number;
  agentId: string;
  stageOrder: DebugStageRecord['id'][];
  stages: Record<DebugStageRecord['id'], DebugStageRecord>;
  graph: {
    nodes: DebugGraphNode[];
    edges: DebugGraphEdge[];
    energyHistory: Record<string, number[]>;
  };
  decision: {
    chosenAction: string | null;
    alternatives: Array<{ action: string; score: number; utility?: number }>;
    reasoning: string;
  };
};
