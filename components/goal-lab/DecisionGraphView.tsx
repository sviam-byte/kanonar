import React, { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, type EdgeTypes, type NodeTypes } from 'reactflow';
import 'reactflow/dist/style.css';

import type { AgentContextFrame } from '../../lib/context/frame/types';
import type { ContextualGoalContribution, ContextualGoalScore } from '../../lib/context/v2/types';
import { buildDecisionTripletGraph } from '../../lib/graph/GraphAdapter';
import { spreadEnergy } from '../../lib/graph/energySpread';
import { arr } from '../../lib/utils/arr';
import { curve01, type CurvePreset } from '../../lib/utils/curves';

import { EnergyEdge } from './EnergyEdge';
import { GoalNode, LensNode, SourceNode } from './DecisionGraphNodes';

export type DecisionGraphRenderMode = 'graph' | 'meta' | '3d';

type Props = {
  frame?: AgentContextFrame | null;
  goalScores: ContextualGoalScore[];
  selectedGoalId?: string | null;

  /** graph: full inputs→goals; meta: aggregated (Context/Lens); 3d: placeholder scaffold */
  mode?: DecisionGraphRenderMode;

  /** Smaller header for embedding inside the map frame */
  compact?: boolean;

  /** Temperature for energy spreading */
  temperature?: number;
  /** Curve preset for energy spreading */
  curvePreset?: CurvePreset;
};

/**
 * Format a signed decimal with two fractional digits.
 */
function formatValue(v: number): string {
  const x = Number(v);
  if (!Number.isFinite(x)) return '0.00';
  const rounded = Math.round(x * 100) / 100;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

/**
 * Clamp any numeric input to [0..1].
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Normalize a record of weights into 0..1 per node.
 */
function normalizeTo01(nodeIds: string[], values: Record<string, number>): Record<string, number> {
  let min = Infinity;
  let max = -Infinity;
  for (const id of nodeIds) {
    const v = Number(values[id] ?? 0);
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return Object.fromEntries(nodeIds.map(id => [id, 0]));
  }

  const span = max - min;
  const out: Record<string, number> = {};
  for (const id of nodeIds) {
    out[id] = (Number(values[id] ?? 0) - min) / span;
  }
  return out;
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
  frame: _frame,
  goalScores,
  selectedGoalId,
  mode = 'graph',
  compact = false,
  temperature = 1.0,
  curvePreset = 'smoothstep',
}) => {
  const [maxGoals, setMaxGoals] = useState(14);
  const [maxInputs, setMaxInputs] = useState(10);
  const [edgeThreshold, setEdgeThreshold] = useState(0.1);
  const [spreadOn, setSpreadOn] = useState(true);
  const [spreadStart, setSpreadStart] = useState<string | null>(null);

  // Conservative defaults for the energy spread simulation.
  const spreadSteps = 7;
  const spreadDecay = 0.3;

  const safeScores = arr(goalScores);

  const graph = useMemo(() => {
    if (mode === '3d') return { nodes: [], edges: [] };

    if (mode === 'meta') {
      return buildMetaGraph(safeScores, maxGoals);
    }

    // "graph" = strict clean-flow triplet (Sources → Lenses → Goals)
    // Uses fixed x-columns and edge filtering to avoid spaghetti.
    return buildDecisionTripletGraph({
      goalScores: safeScores,
      selectedGoalId: selectedGoalId ?? null,
      maxGoals,
      maxInputsPerGoal: maxInputs,
      edgeThreshold,
    });
  }, [safeScores, selectedGoalId, maxGoals, maxInputs, edgeThreshold, mode]);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      source: SourceNode,
      lens: LensNode,
      goal: GoalNode,
    }),
    []
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      energy: EnergyEdge,
    }),
    []
  );

  const enrichedGraph = useMemo(() => {
    if (mode !== 'graph') {
      return { nodes: graph.nodes, edges: graph.edges };
    }

    const nodeIds = graph.nodes.map(node => String(node.id));
    const importanceRaw: Record<string, number> = Object.fromEntries(nodeIds.map(id => [id, 0]));

    const edgeSpecs = graph.edges.map(edge => {
      const rawWeight = Number((edge.data as any)?.rawWeight ?? (edge.data as any)?.weight ?? 0);
      const source = String(edge.source);
      const target = String(edge.target);

      importanceRaw[source] = (importanceRaw[source] ?? 0) + Math.abs(rawWeight);
      importanceRaw[target] = (importanceRaw[target] ?? 0) + Math.abs(rawWeight);

      return { source, target, weight: rawWeight };
    });

    const normalizedImportance = normalizeTo01(nodeIds, importanceRaw);
    const curvedImportance: Record<string, number> = {};
    for (const id of nodeIds) {
      curvedImportance[id] = clamp01(curve01(normalizedImportance[id] ?? 0, curvePreset));
    }

    const spread = spreadOn && spreadStart
      ? spreadEnergy({
          nodeIds,
          edges: edgeSpecs,
          startNodeIds: [spreadStart],
          steps: spreadSteps,
          decay: spreadDecay,
          temperature,
          curvePreset,
          nodeBase: normalizedImportance,
        })
      : { nodeEnergy: Object.fromEntries(nodeIds.map(id => [id, 0])), edgeFlow: {} };

    const nodes = graph.nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        energy: clamp01(Number(spread.nodeEnergy[String(node.id)] ?? 0)),
        importance: curvedImportance[String(node.id)] ?? 0,
      },
    }));

    const edges = graph.edges.map(edge => {
      const data = (edge.data ?? {}) as any;
      const rawWeight = Number(data.rawWeight ?? data.weight ?? 0);
      const key = `${String(edge.source)}→${String(edge.target)}`;
      const flow = Number(spread.edgeFlow[key] ?? 0);
      const flowStrength = clamp01(Math.abs(flow));
      const baseLabel = data.label ? String(data.label) : '';
      const flowLabel =
        spreadOn && spreadStart && Math.abs(flow) > 1e-4 ? `F:${formatValue(flow)}` : '';
      const label = baseLabel && flowLabel ? `${baseLabel} · ${flowLabel}` : baseLabel || flowLabel || undefined;

      return {
        ...edge,
        data: {
          ...data,
          rawWeight,
          weight: rawWeight,
          strength: spreadOn && spreadStart ? flowStrength : data.strength,
          label,
        },
      };
    });

    return { nodes, edges };
  }, [
    graph.edges,
    graph.nodes,
    mode,
    spreadOn,
    spreadStart,
    spreadSteps,
    spreadDecay,
    temperature,
    curvePreset,
  ]);

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
          {mode === 'meta' ? 'Meta graph: Context/Lens buckets → Goals' : 'Decision graph: Sources → Lenses → Goals'}
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

          {mode === 'graph' ? (
            <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
              <span className="opacity-70">Threshold</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={edgeThreshold}
                onChange={e => setEdgeThreshold(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                className="w-16 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px] font-mono"
              />
            </label>
          ) : null}

          {mode === 'graph' ? (
            <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
              <input
                type="checkbox"
                checked={spreadOn}
                onChange={e => setSpreadOn(e.target.checked)}
              />
              <span className="opacity-70">Spread</span>
            </label>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={enrichedGraph.nodes}
          edges={enrichedGraph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          onNodeClick={(_, n) => {
            if (!spreadOn) return;
            setSpreadStart(String(n.id));
          }}
          panOnDrag
          className="bg-black"
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};
