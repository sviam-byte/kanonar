export type DGNodeKind = 'source' | 'lens' | 'goal';

export type DGNode = {
  id: string;
  kind: DGNodeKind;
  label: string;
  meta?: Record<string, any>;
};

/**
 * Edge weight is interpreted as an *additive* logit contribution to the target.
 * (i.e. target.logit += edge.weight)
 */
export type DGEdge = {
  id: string;
  from: string;
  to: string;
  weight: number;
  label?: string;
  meta?: Record<string, any>;
};

export type DecisionGraph = {
  nodes: DGNode[];
  edges: DGEdge[];
};
