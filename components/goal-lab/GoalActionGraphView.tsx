import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

import { buildGoalActionGraph } from '../../lib/graph/GraphAdapter';

/**
 * Render a static Action → Goal graph built from definition links.
 */
export const GoalActionGraphView: React.FC = () => {
  const graph = useMemo(() => {
    return buildGoalActionGraph(18);
  }, []);

  return (
    <div className="h-full min-h-0">
      <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView className="bg-canon-bg">
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};
