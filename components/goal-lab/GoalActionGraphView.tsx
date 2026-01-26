import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';

import type { ContextualGoalScore } from '../../lib/context/v2/types';
import { buildGoalActionGraph } from '../../lib/graph/GraphAdapter';

type Props = {
  goalScores?: ContextualGoalScore[];
  maxGoals?: number;
  includeAllActions?: boolean;
};

/**
 * Render a static Action → Goal graph built from definition links.
 */
export const GoalActionGraphView: React.FC<Props> = ({
  goalScores,
  maxGoals = 18,
  includeAllActions = false,
}) => {
  const graph = useMemo(() => {
    return buildGoalActionGraph({
      goalScores: goalScores ?? null,
      maxGoals,
      includeAllActions,
    });
  }, [goalScores, maxGoals, includeAllActions]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="px-3 py-2 text-[11px] border-b border-canon-border/40 bg-black/20 flex items-center justify-between gap-2">
        <div className="text-canon-text-light">
          <span className="font-bold text-canon-text">Goal Graph</span>
          <span className="ml-2 opacity-70">(Action → Goal links from defs)</span>
        </div>
        <div className="text-[10px] font-mono text-canon-text-light/70">
          nodes={graph.nodes.length} · edges={graph.edges.length}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
};
