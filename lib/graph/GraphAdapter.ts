import type { Edge, Node } from 'reactflow';

import type { AgentContextFrame } from '../context/frame/types';
import type { ContextualGoalContribution, ContextualGoalScore } from '../context/v2/types';
import type { DecisionGraph as DecisionGraphSpec, DGNode } from '../decision-graph/types';
import { describeGoal } from '../goals/goalCatalog';
import { GOAL_DEFS, actionGoalMap } from '../goals/space';
import { arr } from '../utils/arr';
import { layoutWithDagre } from './layout';

type DecisionGraphParams = {
  frame?: AgentContextFrame | null;
  contextAtoms?: any[];
  goalScores: ContextualGoalScore[];
  decisionGraph?: DecisionGraphSpec | null;
  selectedGoalId: string | null;
  maxGoals: number;
  maxInputsPerGoal: number;
};

type GraphResult = {
  nodes: Node[];
  edges: Edge[];
};

const GOAL_NODE_WIDTH = 240;
const INPUT_NODE_WIDTH = 260;
const NODE_HEIGHT = 56;

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

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

function edgeStyleFromWeight(weight: number) {
  const w = Number.isFinite(weight) ? weight : 0;
  const isPositive = w >= 0;
  const strength = clamp01(Math.abs(w)); // assume roughly -1..1
  const opacity = Math.max(0.2, strength);
  const strokeWidth = Math.max(1, 1 + strength * 5);
  const stroke = isPositive ? '#22c55e' : '#ef4444';

  return {
    isPositive,
    strength,
    style: { stroke, strokeWidth, opacity },
    labelStyle: { fill: stroke, fontSize: 10, opacity: Math.max(0.35, opacity) },
    animated: strength > 0.35,
  };
}

type DecisionGraphSpecParams = {
  spec: DecisionGraphSpec;
  selectedGoalId: string | null;
  maxGoals: number;
  maxInputsPerGoal: number;
};

function clampFinite(value: any, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isGoalNode(node: DGNode): boolean {
  return node.kind === 'goal';
}

function isLensNode(node?: DGNode | null): boolean {
  return node?.kind === 'lens';
}

/**
 * Render a DecisionGraph spec into React Flow nodes/edges.
 * Lens inputs are visualized with a dashed, thicker edge.
 */
function buildDecisionGraphFromSpec({
  spec,
  selectedGoalId,
  maxGoals,
  maxInputsPerGoal,
}: DecisionGraphSpecParams): GraphResult {
  const nodesById = new Map(spec.nodes.map(node => [node.id, node]));
  const goalNodes = spec.nodes
    .filter(isGoalNode)
    .sort((a, b) => clampFinite(b.meta?.probability) - clampFinite(a.meta?.probability))
    .slice(0, Math.max(1, maxGoals));

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  goalNodes.forEach((goalNode) => {
    const isSelected = selectedGoalId && goalNode.meta?.goalId === selectedGoalId;

    nodes.push({
      id: goalNode.id,
      position: { x: 0, y: 0 },
      data: { label: goalNode.label },
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

    const incoming = spec.edges
      .filter(edge => edge.to === goalNode.id)
      .sort((a, b) => Math.abs(clampFinite(b.weight)) - Math.abs(clampFinite(a.weight)))
      .slice(0, Math.max(1, maxInputsPerGoal));

    incoming.forEach((edge, index) => {
      const sourceNode = nodesById.get(edge.from);
      const inputId = `input:${edge.from}:${goalNode.id}:${index}`;
      const w = clampFinite(edge.weight);
      const { isPositive, style, labelStyle, animated } = edgeStyleFromWeight(w);
      const isLens = isLensNode(sourceNode);

      nodes.push({
        id: inputId,
        position: { x: 0, y: 0 },
        data: {
          label: sourceNode?.label ?? edge.label ?? edge.from,
        },
        style: {
          width: INPUT_NODE_WIDTH,
          height: NODE_HEIGHT,
          borderRadius: 10,
          padding: '8px 10px',
          border: `1px solid ${isPositive ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)'}`,
          background: isPositive ? 'rgba(34, 197, 94, 0.10)' : 'rgba(239, 68, 68, 0.10)',
          color: '#e2e8f0',
          fontSize: '11px',
        },
      });

      edges.push({
        id: edge.id,
        source: inputId,
        target: goalNode.id,
        type: 'smoothstep',
        label: edge.label ?? formatContributionValue(w),
        animated,
        style: {
          ...style,
          strokeWidth: isLens ? Math.max(style.strokeWidth ?? 2, 3) : style.strokeWidth,
          strokeDasharray: isLens ? '6 4' : undefined,
        },
        labelStyle,
      });
    });
  });

  return layoutWithDagre(nodes, edges, {
    direction: 'LR',
    nodeWidth: 260,
    nodeHeight: NODE_HEIGHT,
    rankSep: 160,
    nodeSep: 40,
  });
}

export function buildDecisionGraph({
  frame: _frame,
  contextAtoms: _contextAtoms,
  goalScores,
  decisionGraph,
  selectedGoalId,
  maxGoals,
  maxInputsPerGoal,
}: DecisionGraphParams): GraphResult {
  if (decisionGraph && Array.isArray((decisionGraph as any).nodes) && Array.isArray((decisionGraph as any).edges)) {
    return buildDecisionGraphFromSpec({
      spec: decisionGraph,
      selectedGoalId,
      maxGoals,
      maxInputsPerGoal,
    });
  }

  const safeScores = arr(goalScores);
  const rankedScores = [...safeScores].sort((a, b) => (b.totalLogit ?? 0) - (a.totalLogit ?? 0));
  const trimmedScores = rankedScores.slice(0, Math.max(1, maxGoals));

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  trimmedScores.forEach((score) => {
    const goalId = `goal:${score.goalId}`;
    const isSelected = selectedGoalId && score.goalId === selectedGoalId;

    nodes.push({
      id: goalId,
      position: { x: 0, y: 0 },
      data: {
        kind: 'goal',
        label: formatGoalLabel(score),
        domain: score.domain,
        probability: score.probability,
      },
      style: {
        width: GOAL_NODE_WIDTH,
        height: NODE_HEIGHT,
        borderRadius: 14,
        padding: '8px 12px',
        border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.35)'}`,
        background: isSelected ? 'rgba(14, 116, 144, 0.28)' : 'rgba(15, 23, 42, 0.88)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 700,
        boxShadow: isSelected ? '0 0 0 1px rgba(56,189,248,0.35)' : 'none',
      },
    });

    const inputs = arr(score.contributions)
      .filter(input => Number.isFinite(input.value))
      .sort((a, b) => Math.abs((b.value ?? 0) as number) - Math.abs((a.value ?? 0) as number))
      .slice(0, Math.max(1, maxInputsPerGoal));

    inputs.forEach((input, index) => {
      const inputId = `input:${score.goalId}:${index}`;
      const w = Number(input.value ?? 0);
      const { isPositive, style, labelStyle, animated } = edgeStyleFromWeight(w);

      nodes.push({
        id: inputId,
        position: { x: 0, y: 0 },
        data: {
          kind: 'input',
          label: formatContributionLabel(input),
          value: w,
        },
        style: {
          width: INPUT_NODE_WIDTH,
          height: NODE_HEIGHT,
          borderRadius: 12,
          padding: '8px 10px',
          border: `1px solid ${isPositive ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)'}`,
          background: isPositive ? 'rgba(34, 197, 94, 0.10)' : 'rgba(239, 68, 68, 0.10)',
          color: '#e2e8f0',
          fontSize: '11px',
        },
      });

      edges.push({
        id: `edge:${inputId}:${goalId}`,
        source: inputId,
        target: goalId,
        type: 'smoothstep',
        label: formatContributionValue(w),
        animated,
        style,
        labelStyle,
      });
    });
  });

  // Auto-layout for readability: left → right.
  const layouted = layoutWithDagre(nodes, edges, {
    direction: 'LR',
    nodeWidth: 260,
    nodeHeight: NODE_HEIGHT,
    rankSep: 160,
    nodeSep: 40,
  });

  return layouted;
}

/**
 * Static Action → Goal graph from definition links.
 */
export function buildGoalActionGraph(maxGoals = 18): GraphResult {
  const goalIds = Object.keys(GOAL_DEFS).slice(0, Math.max(1, maxGoals));
  const goalSet = new Set(goalIds);

  const actionIds = Object.keys(actionGoalMap);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  goalIds.forEach((goalId) => {
    nodes.push({
      id: `goal:${goalId}`,
      position: { x: 0, y: 0 },
      data: { kind: 'goal', label: GOAL_DEFS[goalId as keyof typeof GOAL_DEFS]?.label_ru ?? goalId },
      style: {
        width: 300,
        height: NODE_HEIGHT,
        borderRadius: 12,
        padding: '8px 12px',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(15, 23, 42, 0.88)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 700,
      },
    });
  });

  actionIds.forEach((actionId) => {
    nodes.push({
      id: `act:${actionId}`,
      position: { x: 0, y: 0 },
      data: { kind: 'action', label: actionId },
      style: {
        width: 280,
        height: NODE_HEIGHT,
        borderRadius: 12,
        padding: '8px 12px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: 'rgba(2, 6, 23, 0.55)',
        color: '#e2e8f0',
        fontSize: '11px',
      },
    });

    for (const link of arr((actionGoalMap as Record<string, Array<{ goalId?: string; match?: number }>>)[actionId])) {
      const goalId = String(link?.goalId ?? '');
      if (!goalSet.has(goalId)) continue;
      const weight = Number(link?.match ?? 0);
      const { style, labelStyle, animated } = edgeStyleFromWeight(weight);
      edges.push({
        id: `e:${actionId}__${goalId}`,
        source: `act:${actionId}`,
        target: `goal:${goalId}`,
        type: 'smoothstep',
        label: Number.isFinite(weight) ? weight.toFixed(2) : undefined,
        animated,
        style,
        labelStyle,
      });
    }
  });

  return layoutWithDagre(nodes, edges, {
    direction: 'LR',
    nodeWidth: 300,
    nodeHeight: NODE_HEIGHT,
    rankSep: 170,
    nodeSep: 40,
  });
}
