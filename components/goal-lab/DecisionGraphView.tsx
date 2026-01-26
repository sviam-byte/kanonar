import React, { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

import type { AgentContextFrame } from '../../lib/context/frame/types';
import type { ContextualGoalContribution, ContextualGoalScore } from '../../lib/context/v2/types';
import { buildDecisionGraph } from '../../lib/graph/GraphAdapter';
import { arr } from '../../lib/utils/arr';

export type DecisionGraphRenderMode = 'graph' | 'meta' | '3d';

type Props = {
  frame?: AgentContextFrame | null;
  goalScores: ContextualGoalScore[];
  selectedGoalId?: string | null;

  /** graph: full inputs→goals; meta: aggregated (Context/Lens); 3d: placeholder scaffold */
  mode?: DecisionGraphRenderMode;

  /** Smaller header for embedding inside the map frame */
  compact?: boolean;
};

function formatValue(v: number): string {
  const x = Number(v);
  if (!Number.isFinite(x)) return '0.00';
  const rounded = Math.round(x * 100) / 100;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

function isLensLabel(label: string): boolean {
  return /^lens:/i.test(label) || /trait/i.test(label);
}

/**
 * Meta graph: for each goal we show only two input buckets:
 *   Context  -> Goal
 *   Lens     -> Goal
 */
function buildMetaGraph(goalScores: ContextualGoalScore[], maxGoals: number) {
  const ranked = [...arr(goalScores)].sort((a, b) => (b.totalLogit ?? 0) - (a.totalLogit ?? 0));
  const trimmed = ranked.slice(0, Math.max(1, maxGoals));

  const nodes: any[] = [];
  const edges: any[] = [];

  const X_INPUT = 0;
  const X_GOAL = 360;
  const GOAL_GAP = 120;

  const INPUT_W = 220;
  const GOAL_W = 240;
  const H = 52;

  trimmed.forEach((g, i) => {
    const goalId = String(g.goalId);
    const goalNodeId = `goal:${goalId}`;
    const y = i * GOAL_GAP;

    const contribs = arr((g as any).contributions) as ContextualGoalContribution[];
    let sumContext = 0;
    let sumLens = 0;

    for (const c of contribs) {
      const v = Number((c as any).value);
      if (!Number.isFinite(v)) continue;
      const label = String((c as any).atomLabel || (c as any).explanation || '');
      if (isLensLabel(label)) sumLens += v;
      else sumContext += v;
    }

    nodes.push({
      id: goalNodeId,
      position: { x: X_GOAL, y },
      data: { label: goalId },
      style: {
        width: GOAL_W,
        height: H,
        borderRadius: 12,
        padding: '8px 12px',
        border: '1px solid rgba(148, 163, 184, 0.40)',
        background: 'rgba(15, 23, 42, 0.85)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 700,
      },
    });

    const ctxNodeId = `meta:ctx:${goalId}`;
    const lensNodeId = `meta:lens:${goalId}`;

    nodes.push({
      id: ctxNodeId,
      position: { x: X_INPUT, y: y - 40 },
      data: { label: 'Context' },
      style: {
        width: INPUT_W,
        height: H,
        borderRadius: 10,
        padding: '8px 10px',
        border: '1px solid rgba(56, 189, 248, 0.45)',
        background: 'rgba(56, 189, 248, 0.10)',
        color: '#e2e8f0',
        fontSize: '11px',
        fontWeight: 600,
      },
    });

    nodes.push({
      id: lensNodeId,
      position: { x: X_INPUT, y: y + 40 },
      data: { label: 'Lens (traits)' },
      style: {
        width: INPUT_W,
        height: H,
        borderRadius: 10,
        padding: '8px 10px',
        border: '1px solid rgba(217, 70, 239, 0.45)',
        background: 'rgba(217, 70, 239, 0.10)',
        color: '#e2e8f0',
        fontSize: '11px',
        fontWeight: 600,
      },
    });

    edges.push({
      id: `e:${ctxNodeId}->${goalNodeId}`,
      source: ctxNodeId,
      target: goalNodeId,
      label: formatValue(sumContext),
      style: { stroke: '#38bdf8', strokeWidth: 2 },
      labelStyle: { fill: '#38bdf8', fontSize: 10 },
      type: 'smoothstep',
    });

    edges.push({
      id: `e:${lensNodeId}->${goalNodeId}`,
      source: lensNodeId,
      target: goalNodeId,
      label: formatValue(sumLens),
      style: { stroke: '#d946ef', strokeWidth: 2, strokeDasharray: '6 4' },
      labelStyle: { fill: '#d946ef', fontSize: 10 },
      type: 'smoothstep',
    });
  });

  return { nodes, edges };
}

export const DecisionGraphView: React.FC<Props> = ({
  frame,
  goalScores,
  selectedGoalId,
  mode = 'graph',
  compact = false,
}) => {
  const [maxGoals, setMaxGoals] = useState(14);
  const [maxInputs, setMaxInputs] = useState(10);

  const safeScores = arr(goalScores);

  const graph = useMemo(() => {
    if (mode === '3d') return { nodes: [], edges: [] };

    if (mode === 'meta') {
      return buildMetaGraph(safeScores, maxGoals);
    }

    return buildDecisionGraph({
      frame,
      goalScores: safeScores,
      selectedGoalId: selectedGoalId ?? null,
      maxGoals,
      maxInputsPerGoal: maxInputs,
    });
  }, [frame, safeScores, selectedGoalId, maxGoals, maxInputs, mode]);

  if (mode === '3d') {
    return (
      <div className="h-full min-h-0 flex flex-col items-center justify-center text-slate-300">
        <div className="text-sm font-semibold mb-2">3D graph mode (scaffold)</div>
        <div className="text-xs opacity-70 max-w-[520px] text-center">
          Здесь будет 3D визуал (force-graph/three.js). Сейчас режим добавлен как точка расширения.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div
        className={`flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/30 ${
          compact ? 'px-2 py-1.5' : 'p-3'
        }`}
      >
        <div className="text-[10px] text-slate-300/80">
          {mode === 'meta' ? 'Meta graph: Context/Lens buckets → Goals' : 'Decision graph: Inputs → Goals'}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
            <span className="opacity-70">Goals</span>
            <input
              type="number"
              min={1}
              max={60}
              value={maxGoals}
              onChange={e => setMaxGoals(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              className="w-14 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px] font-mono"
            />
          </label>

          {mode === 'graph' ? (
            <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
              <span className="opacity-70">Inputs</span>
              <input
                type="number"
                min={1}
                max={30}
                value={maxInputs}
                onChange={e => setMaxInputs(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="w-14 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px] font-mono"
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView className="bg-black">
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};
