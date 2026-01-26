import dagre from 'dagre';
import type { Edge, Node } from 'reactflow';

type DagreLayoutOptions = {
  direction?: 'LR' | 'TB';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
};

/**
 * Dagre auto-layout for ReactFlow graphs.
 * We use it to keep the "river" structure readable: Inputs → Traits → Goals.
 */
export function layoutWithDagre(
  nodes: Node[],
  edges: Edge[],
  opts: DagreLayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const direction = opts.direction ?? 'LR';
  const nodeWidth = opts.nodeWidth ?? 220;
  const nodeHeight = opts.nodeHeight ?? 56;
  const rankSep = opts.rankSep ?? 140;
  const nodeSep = opts.nodeSep ?? 50;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep });

  for (const n of nodes) {
    g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((n) => {
    const p = g.node(n.id);
    if (!p) return n;

    return {
      ...n,
      position: {
        x: p.x - nodeWidth / 2,
        y: p.y - nodeHeight / 2,
      },
      targetPosition: direction === 'LR' ? 'left' : 'top',
      sourcePosition: direction === 'LR' ? 'right' : 'bottom',
    };
  });

  return { nodes: layoutedNodes, edges };
}
