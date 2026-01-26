import type { Edge, Node } from 'reactflow';

import type { AgentContextFrame } from '../context/frame/types';
import type { ContextualGoalContribution, ContextualGoalScore } from '../context/v2/types';
import { describeGoal } from '../goals/goalCatalog';
import { GOAL_DEFS, actionGoalMap } from '../goals/space';
import type { CharacterGoalId, SocialActionId } from '../../types';
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

type GoalActionGraphParams = {
  goalScores?: ContextualGoalScore[] | null;
  maxGoals?: number;
  includeAllActions?: boolean;
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

/**
 * Resolve a display label for goal definitions that exist in the goal space.
 */
function goalLabelFromDefs(goalId: string): string {
  const def = (GOAL_DEFS as Record<CharacterGoalId, { label_ru?: string }>)[goalId as CharacterGoalId];
  return def?.label_ru || describeGoal(goalId)?.label || goalId;
}

/**
 * Build a static Action → Goal graph from `actionGoalMap`.
 * This visualizes definition links (not contextual contributions).
 */
export function buildGoalActionGraph(params: GoalActionGraphParams = {}): GraphResult {
  const maxGoals = Math.max(1, params.maxGoals ?? 18);
  const scores = arr(params.goalScores ?? []);

  // Choose goal nodes from top scores or fall back to definitions.
  let chosenGoalIds: string[];
  if (scores.length) {
    chosenGoalIds = [...scores]
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
      .slice(0, maxGoals)
      .map(s => String(s.goalId))
      .filter(Boolean);
  } else {
    chosenGoalIds = Object.keys(GOAL_DEFS).slice(0, maxGoals);
  }
  const chosenGoalSet = new Set(chosenGoalIds);

  const allActionIds = Object.keys(actionGoalMap) as SocialActionId[];
  const actionIds: SocialActionId[] = [];
  for (const actionId of allActionIds) {
    const links = arr(actionGoalMap[actionId as keyof typeof actionGoalMap]);
    const hits = links.some(link => chosenGoalSet.has(String((link as { goalId?: string })?.goalId)));
    if (params.includeAllActions || hits) actionIds.push(actionId);
  }

  // Layout: actions on the left, goals on the right.
  const ACTION_NODE_WIDTH = 240;
  const GOAL_NODE_WIDTH_LOCAL = 260;
  const X_ACTION = 0;
  const X_GOAL = ACTION_NODE_WIDTH + 320;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Goal nodes.
  chosenGoalIds.forEach((goalId, i) => {
    nodes.push({
      id: `goal:${goalId}`,
      type: 'default',
      position: { x: X_GOAL, y: i * 110 },
      data: { label: goalLabelFromDefs(goalId), subtitle: goalId },
      style: {
        width: GOAL_NODE_WIDTH_LOCAL,
        height: 56,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.15)',
        background: 'rgba(0,0,0,0.35)',
        color: 'white',
      },
    });
  });

  // Action nodes + edges.
  actionIds.forEach((actionId, i) => {
    nodes.push({
      id: `act:${actionId}`,
      type: 'default',
      position: { x: X_ACTION, y: i * 72 },
      data: { label: String(actionId), subtitle: 'action' },
      style: {
        width: ACTION_NODE_WIDTH,
        height: 56,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(0,0,0,0.20)',
        color: 'white',
      },
    });

    const links = arr(actionGoalMap[actionId as keyof typeof actionGoalMap]);
    for (const link of links) {
      const goalId = String((link as { goalId?: string })?.goalId || '');
      if (!chosenGoalSet.has(goalId)) continue;
      const match = Number((link as { match?: number })?.match ?? 0);
      edges.push({
        id: `e:${actionId}__${goalId}`,
        source: `act:${actionId}`,
        target: `goal:${goalId}`,
        type: 'smoothstep',
        label: Number.isFinite(match) ? match.toFixed(2) : undefined,
        style: { strokeWidth: 1.5, opacity: 0.75 },
      });
    }
  });

  return { nodes, edges };
}
