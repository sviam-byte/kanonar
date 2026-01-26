import React, { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

import type { AgentContextFrame } from '../../lib/context/frame/types';
import type { ContextualGoalScore } from '../../lib/context/v2/types';
import { buildDecisionGraph } from '../../lib/graph/GraphAdapter';
import type { DecisionGraph as DecisionGraphSpec } from '../../lib/decision-graph/types';
import { arr } from '../../lib/utils/arr';

type Props = {
  frame?: AgentContextFrame | null;
  goalScores: ContextualGoalScore[];
  selectedGoalId?: string | null;
  contextAtoms?: any[];
  decisionGraph?: DecisionGraphSpec | null;
};

export const DecisionGraphView: React.FC<Props> = ({
  frame,
  goalScores,
  selectedGoalId,
  contextAtoms,
  decisionGraph,
}) => {
  const [maxGoals, setMaxGoals] = useState(14);
  const [maxInputs, setMaxInputs] = useState(10);

  const safeScores = arr(goalScores);

  const { nodes, edges } = useMemo(() => {
    return buildDecisionGraph({
      frame,
      goalScores: safeScores,
      selectedGoalId: selectedGoalId ?? null,
      contextAtoms: arr(contextAtoms),
      decisionGraph: decisionGraph ?? null,
      maxGoals,
      maxInputsPerGoal: maxInputs,
    });
  }, [frame, safeScores, selectedGoalId, contextAtoms, decisionGraph, maxGoals, maxInputs]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-canon-border/40 bg-black/15">
        <div className="text-xs text-canon-text-light">
          Decision graph: inputs → goals (from contributions). Traits are a separate layer (connected if mentioned in explanations).
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-canon-text-light">
            <span className="opacity-70">Top goals</span>
            <input
              type="number"
              min={1}
              max={60}
              value={maxGoals}
              onChange={e => setMaxGoals(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              className="w-16 bg-black/30 border border-canon-border/40 rounded px-2 py-1 text-[11px] font-mono"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-canon-text-light">
            <span className="opacity-70">Inputs/goal</span>
            <input
              type="number"
              min={1}
              max={30}
              value={maxInputs}
              onChange={e => setMaxInputs(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
              className="w-16 bg-black/30 border border-canon-border/40 rounded px-2 py-1 text-[11px] font-mono"
            />
          </label>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow nodes={nodes} edges={edges} fitView className="bg-canon-bg">
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};
