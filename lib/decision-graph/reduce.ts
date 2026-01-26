import type { DecisionGraph } from './types';

/**
 * Reduce a DecisionGraph into per-goal additive logits.
 * This intentionally ignores non-additive edges (if you later add them).
 */
export function reduceGoalLogitsFromGraph(graph: DecisionGraph): Record<string, number> {
  const goalLogits: Record<string, number> = {};
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));

  for (const edge of graph.edges || []) {
    const target = nodes.get(edge.to);
    if (!target || target.kind !== 'goal') continue;
    const goalId = String(target.meta?.goalId ?? target.label ?? edge.to);
    goalLogits[goalId] = (goalLogits[goalId] ?? 0) + (Number.isFinite(edge.weight) ? edge.weight : 0);
  }

  return goalLogits;
}
