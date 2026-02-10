import type { PipelineSnapshotDebug, DebugGraphEdge, DebugGraphNode, DebugStageRecord } from './types';

const STAGE_ORDER: DebugStageRecord['id'][] = [
  's0_intake',
  's1_personality',
  's2_goal_seed',
  's3_propagation',
  's4_competition',
  's5_action_projection',
  's6_choice',
];

/**
 * Adapts the existing GoalLab payload (`pipelineV1` + `snapshotV1`) to a strict
 * debugger model without changing pipeline semantics.
 */
export function buildDebugSnapshot(input: {
  tick?: number;
  agentId?: string;
  pipelineV1?: any;
  snapshotV1?: any;
  decisionRows?: any[];
  chosenActionId?: string | null;
  reasoning?: string;
}): PipelineSnapshotDebug {
  const { pipelineV1, snapshotV1 } = input;
  const stageFrames = Array.isArray(pipelineV1?.stages) ? pipelineV1.stages : [];

  const currentAtoms = Array.isArray(snapshotV1?.atoms) ? snapshotV1.atoms : [];
  const currentTick = Number(input.tick ?? snapshotV1?.tick ?? 0);
  const agentId = String(input.agentId ?? snapshotV1?.selfId ?? 'unknown');

  const channelAtoms = currentAtoms.filter((a: any) => String(a?.id || '').startsWith('ctx:'));
  const goalAtoms = currentAtoms.filter((a: any) => String(a?.id || '').startsWith('goal:'));

  const decisions = Array.isArray(input.decisionRows) ? input.decisionRows : [];
  const alternatives = decisions.slice(0, 8).map((d: any) => ({
    action: String(d?.id ?? d?.actionId ?? d?.p?.action ?? 'action:unknown'),
    score: Number(d?.score ?? 0),
    utility: Number(d?.score ?? d?.utility ?? 0),
  }));

  const stages = makeStages(stageFrames, channelAtoms, goalAtoms, decisions, input.chosenActionId);
  const graph = buildGraph(channelAtoms, goalAtoms, alternatives);

  return {
    tick: currentTick,
    agentId,
    stageOrder: STAGE_ORDER,
    stages,
    graph,
    decision: {
      chosenAction: input.chosenActionId ?? alternatives[0]?.action ?? null,
      alternatives,
      reasoning: String(input.reasoning ?? ''),
    },
  };
}

function makeStages(
  frames: any[],
  channels: any[],
  goals: any[],
  decisions: any[],
  chosenActionId?: string | null,
): Record<DebugStageRecord['id'], DebugStageRecord> {
  const s0Atoms = Array.isArray(frames.find(f => String(f?.stage) === 'S0')?.atoms)
    ? frames.find(f => String(f?.stage) === 'S0').atoms
    : [];

  const s3Frame = frames.find(f => String(f?.stage) === 'S3');
  const s4Frame = frames.find(f => String(f?.stage) === 'S4');

  const activeGoals = goals
    .map(g => ({ id: String(g?.id), name: String(g?.label ?? g?.id), energy: Number(g?.magnitude ?? 0) }))
    .sort((a, b) => b.energy - a.energy);

  const chosen = chosenActionId
    ? { action: chosenActionId, probability: 1 }
    : null;

  return {
    s0_intake: {
      id: 's0_intake',
      title: 'S0 Intake',
      summary: {
        status: s0Atoms.length > 0 ? 'ok' : 'warning',
        text: `${s0Atoms.length} atoms → ${channels.length} ctx channels`,
        metrics: { atoms: s0Atoms.length, channels: channels.length },
      },
      payload: { atoms: s0Atoms, channels },
    },
    s1_personality: {
      id: 's1_personality',
      title: 'S1 Personality',
      summary: {
        status: 'ok',
        text: 'Lens applied over context channels',
      },
      payload: {
        channels: channels.map((c: any) => ({
          id: c.id,
          original: Number(c?.magnitude ?? 0),
          modulated: Number(c?.magnitude ?? 0),
          boost: 0,
        })),
      },
    },
    s2_goal_seed: {
      id: 's2_goal_seed',
      title: 'S2 Goal Seed',
      summary: {
        status: activeGoals.length ? 'ok' : 'warning',
        text: `${activeGoals.length} goal atoms visible`,
      },
      payload: { goals: activeGoals },
    },
    s3_propagation: {
      id: 's3_propagation',
      title: 'S3 Propagation',
      summary: {
        status: 'warning',
        text: 'No iterative history in current snapshot; showing single-step state',
        metrics: { iterations: 1 },
      },
      payload: {
        converged: false,
        iterations: 1,
        final_delta: 0,
        notes: Array.isArray(s3Frame?.warnings) ? s3Frame.warnings : [],
      },
    },
    s4_competition: {
      id: 's4_competition',
      title: 'S4 Competition',
      summary: {
        status: activeGoals.length ? 'ok' : 'warning',
        text: `${Math.min(5, activeGoals.length)} active goals (top slice)`,
      },
      payload: {
        active_goals: activeGoals.slice(0, 5),
        suppressed_goals: activeGoals.slice(5),
        notes: Array.isArray(s4Frame?.warnings) ? s4Frame.warnings : [],
      },
    },
    s5_action_projection: {
      id: 's5_action_projection',
      title: 'S5 Action Projection',
      summary: {
        status: decisions.length ? 'ok' : 'warning',
        text: `${decisions.length} actions scored`,
      },
      payload: {
        actions: decisions.map((d: any) => ({
          action: String(d?.id ?? d?.actionId ?? d?.p?.action ?? 'action:unknown'),
          utility: Number(d?.score ?? d?.utility ?? 0),
          score: Number(d?.score ?? 0),
        })),
      },
    },
    s6_choice: {
      id: 's6_choice',
      title: 'S6 Choice',
      summary: {
        status: chosen ? 'ok' : 'warning',
        text: chosen ? `Chosen: ${chosen.action}` : 'No chosen action',
      },
      payload: { chosen },
    },
  };
}

function buildGraph(channels: any[], goals: any[], actions: Array<{ action: string; score: number }>) {
  const nodes: DebugGraphNode[] = [];
  const edges: DebugGraphEdge[] = [];

  for (const c of channels.slice(0, 16)) {
    nodes.push({
      id: String(c?.id),
      type: 'channel',
      label: String(c?.id).replace('ctx:', ''),
      energy: Number(c?.magnitude ?? 0),
    });
  }

  for (const g of goals.slice(0, 12)) {
    const id = String(g?.id);
    nodes.push({
      id,
      type: 'goal',
      label: id.replace('goal:', ''),
      energy: Number(g?.magnitude ?? 0),
    });

    for (const c of channels.slice(0, 6)) {
      const weight = Number(c?.magnitude ?? 0) >= 0.5 ? 0.6 : 0.2;
      edges.push({
        from: String(c?.id),
        to: id,
        weight,
        type: 'causal',
      });
    }
  }

  for (const a of actions.slice(0, 8)) {
    const actionNodeId = `action:${a.action}`;
    nodes.push({
      id: actionNodeId,
      type: 'action',
      label: a.action,
      energy: Number(a.score ?? 0),
    });

    for (const g of goals.slice(0, 5)) {
      edges.push({
        from: String(g?.id),
        to: actionNodeId,
        weight: 0.5,
        type: 'causal',
      });
    }
  }

  return {
    nodes,
    edges,
    energyHistory: {},
  };
}
