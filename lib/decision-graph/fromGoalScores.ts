import type { ContextualGoalScore } from '../context/v2/types';
import type { DecisionGraph, DGEdge, DGNode } from './types';

function clampFinite(n: any, fallback = 0): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function safeIdPart(value: any): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-:.]+/g, '_')
    .slice(0, 80);
}

/**
 * Canonical translation: ContextualGoalScore[] -> DecisionGraph.
 *
 * Goal nodes:   goal:<goalId>
 * Source nodes: src:<atomLabel or explanation>
 *
 * Edge weight: additive contribution to goal logit.
 */
export function buildDecisionGraphFromGoalScores(goalScores: ContextualGoalScore[]): DecisionGraph {
  const nodes = new Map<string, DGNode>();
  const edges: DGEdge[] = [];

  const addNode = (node: DGNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  for (const score of goalScores || []) {
    const goalNodeId = `goal:${safeIdPart(score.goalId)}`;
    addNode({
      id: goalNodeId,
      kind: 'goal',
      label: String(score.goalId),
      meta: {
        goalId: score.goalId,
        targetId: score.targetAgentId ?? null,
        probability: clampFinite(score.probability, 0),
        totalLogit: clampFinite(score.totalLogit, 0),
        domain: (score as any).domain ?? null,
      },
    });

    const contributions = Array.isArray((score as any).contributions) ? (score as any).contributions : [];
    for (const contribution of contributions) {
      const label = String(
        (contribution as any).atomLabel ||
          (contribution as any).explanation ||
          (contribution as any).atomKind ||
          (contribution as any).atomId ||
          'input'
      );

      const nodeKind: 'source' | 'lens' = /^lens:/i.test(label) ? 'lens' : 'source';
      const srcId = `${nodeKind === 'lens' ? 'lens' : 'src'}:${safeIdPart(label)}`;

      addNode({
        id: srcId,
        kind: nodeKind,
        label,
        meta: {
          source: (contribution as any).source ?? null,
          atomId: (contribution as any).atomId ?? null,
          atomKind: (contribution as any).atomKind ?? null,
          formula: (contribution as any).formula ?? null,
        },
      });

      const weight = clampFinite((contribution as any).value, 0);
      edges.push({
        id: `e:${srcId}->${goalNodeId}:${edges.length}`,
        from: srcId,
        to: goalNodeId,
        weight,
        label: `${weight >= 0 ? '+' : ''}${weight.toFixed(2)}`,
        meta: {
          explanation: (contribution as any).explanation ?? null,
        },
      });
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}
