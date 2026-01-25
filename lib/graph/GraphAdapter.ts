import type { Edge, Node } from 'reactflow';

import type { AgentContextFrame } from '../context/frame/types';
import type { ContextualGoalContribution, ContextualGoalScore } from '../context/v2/types';
import { describeGoal } from '../goals/goalCatalog';
import { arr } from '../utils/arr';

type DecisionGraphParams = {
  frame?: AgentContextFrame | null;
  goalScores: ContextualGoalScore[];
  selectedGoalId: string | null;
  maxGoals: number;
  maxInputsPerGoal: number;
};

type GraphResult = {
  nodes: Node[];
  edges: Edge[];
};

const GOAL_NODE_WIDTH = 220;
const INPUT_NODE_WIDTH = 240;
const NODE_HEIGHT = 56;
const COLUMN_GAP = 280;
const GOAL_GAP = 110;
const INPUT_GAP = 72;

function formatGoalLabel(score: ContextualGoalScore): string {
  const entry = describeGoal(score.goalId);
  return entry?.label || score.goalId;
}

function formatContributionLabel(contribution: ContextualGoalContribution): string {
  return (
    contribution.atomLabel ||
    contribution.atomKind ||
    contribution.atomId ||
    contribution.explanation ||
    'Input'
  );
}

function formatContributionValue(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

export function buildDecisionGraph({
  frame: _frame,
  goalScores,
  selectedGoalId,
  maxGoals,
  maxInputsPerGoal,
}: DecisionGraphParams): GraphResult {
  const safeScores = arr(goalScores);
  const rankedScores = [...safeScores].sort((a, b) => (b.totalLogit ?? 0) - (a.totalLogit ?? 0));
  const trimmedScores = rankedScores.slice(0, Math.max(1, maxGoals));

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  trimmedScores.forEach((score, goalIndex) => {
    const goalId = `goal:${score.goalId}`;
    const isSelected = selectedGoalId && score.goalId === selectedGoalId;
    const goalY = goalIndex * GOAL_GAP;

    nodes.push({
      id: goalId,
      position: { x: COLUMN_GAP, y: goalY },
      data: {
        label: formatGoalLabel(score),
      },
      style: {
        width: GOAL_NODE_WIDTH,
        height: NODE_HEIGHT,
        borderRadius: 12,
        padding: '8px 12px',
        border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)'}`,
        background: isSelected ? 'rgba(14, 116, 144, 0.25)' : 'rgba(15, 23, 42, 0.85)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 600,
      },
    });

    const inputs = arr(score.contributions)
      .filter(input => Number.isFinite(input.value))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, Math.max(1, maxInputsPerGoal));

    if (!inputs.length) {
      return;
    }

    const totalHeight = (inputs.length - 1) * INPUT_GAP;
    inputs.forEach((input, index) => {
      const inputId = `input:${score.goalId}:${index}`;
      const inputY = goalY - totalHeight / 2 + index * INPUT_GAP;
      const isPositive = input.value >= 0;

      nodes.push({
        id: inputId,
        position: { x: 0, y: inputY },
        data: {
          label: formatContributionLabel(input),
        },
        style: {
          width: INPUT_NODE_WIDTH,
          height: NODE_HEIGHT,
          borderRadius: 10,
          padding: '8px 10px',
          border: `1px solid ${isPositive ? 'rgba(16, 185, 129, 0.5)' : 'rgba(248, 113, 113, 0.5)'}`,
          background: isPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(248, 113, 113, 0.12)',
          color: '#e2e8f0',
          fontSize: '11px',
        },
      });

      edges.push({
        id: `edge:${inputId}:${goalId}`,
        source: inputId,
        target: goalId,
        label: formatContributionValue(input.value),
        style: {
          stroke: isPositive ? '#34d399' : '#f87171',
          strokeWidth: 2,
        },
        labelStyle: {
          fill: isPositive ? '#34d399' : '#f87171',
          fontSize: 10,
        },
      });
    });
  });

  return { nodes, edges };
}
