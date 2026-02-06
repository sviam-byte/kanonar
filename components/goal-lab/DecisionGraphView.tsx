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
import { DecisionGraph3DView } from './DecisionGraph3DView';

export type DecisionGraphRenderMode = 'graph' | 'meta' | 'overview' | 'goals' | '3d';

type Props = {
  frame?: AgentContextFrame | null;
  goalScores: ContextualGoalScore[];
  selectedGoalId?: string | null;

/**
 * graph: full inputs→lenses→goals
 * goals: collapsed inputs (2 buckets) → goals
 * overview: 3 meta-nodes (Context, Lens, Goals)
 * meta: per-goal (Context+Lens) buckets (legacy)
 * 3d: 3D view
 */
  mode?: DecisionGraphRenderMode;

  /** Smaller header for embedding inside the map frame */
  compact?: boolean;

  /** Temperature for spread energy (softmax over edge weights). */
  temperature?: number;
  /** Curve preset for importance weighting in spread. */
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
 * Clamp any numeric value into [0..1].
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Normalize a numeric record to [0..1] for display purposes.
 */
function normalizeBase(nodeIds: string[], base: Record<string, number>): Record<string, number> {
  let min = Infinity;
  let max = -Infinity;
  for (const id of nodeIds) {
    const v = Number(base[id] ?? 0);
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return Object.fromEntries(nodeIds.map(id => [id, 0]));
  }
  const span = max - min;
  const out: Record<string, number> = {};
  for (const id of nodeIds) {
    out[id] = (Number(base[id] ?? 0) - min) / span;
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

/**
 * Overview graph: a 3-node summary (Context + Lens → Goals).
 * This is the default "no clutter" view.
 */
function buildOverviewGraph(goalScores: ContextualGoalScore[], maxGoals: number) {
  const ranked = [...arr(goalScores)].sort((a, b) => (b.totalLogit ?? 0) - (a.totalLogit ?? 0));
  const trimmed = ranked.slice(0, Math.max(1, maxGoals));

  let sumContext = 0;
  let sumLens = 0;
  for (const g of trimmed) {
    const contribs = arr((g as any).contributions) as ContextualGoalContribution[];
    for (const c of contribs) {
      const v = Number((c as any).value);
      if (!Number.isFinite(v)) continue;
      const label = String((c as any).atomLabel || (c as any).explanation || '');
      if (isLensLabel(label)) sumLens += v;
      else sumContext += v;
    }
  }

  const nodes: any[] = [
    {
      id: 'meta:context',
      type: 'lens',
      position: { x: 0, y: 20 },
      data: { label: `Context (${trimmed.length} goals)` },
      style: { width: 220, height: 52 },
    },
    {
      id: 'meta:lens',
      type: 'lens',
      position: { x: 0, y: 120 },
      data: { label: 'Lens' },
      style: { width: 220, height: 52 },
    },
    {
      id: 'meta:goals',
      type: 'goal',
      position: { x: 360, y: 70 },
      data: { label: `Goals (top ${trimmed.length})` },
      style: { width: 240, height: 52 },
    },
  ];

  const edges: any[] = [
    {
      id: 'meta:context->meta:goals',
      source: 'meta:context',
      target: 'meta:goals',
      type: 'energy',
      data: { weight: sumContext, rawWeight: sumContext, label: formatValue(sumContext) },
    },
    {
      id: 'meta:lens->meta:goals',
      source: 'meta:lens',
      target: 'meta:goals',
      type: 'energy',
      data: { weight: sumLens, rawWeight: sumLens, label: formatValue(sumLens) },
    },
  ];

  return { nodes, edges };
}

/**
 * Goals-detail graph: collapse inputs into two buckets (Context / Lens), keep goals expanded.
 */
function buildGoalsDetailGraph(goalScores: ContextualGoalScore[], maxGoals: number) {
  const ranked = [...arr(goalScores)].sort((a, b) => (b.totalLogit ?? 0) - (a.totalLogit ?? 0));
  const trimmed = ranked.slice(0, Math.max(1, maxGoals));

  const nodes: any[] = [];
  const edges: any[] = [];

  const X_INPUT = 0;
  const X_GOAL = 360;
  const GOAL_GAP = 92;

  nodes.push({
    id: 'meta:context',
    type: 'lens',
    position: { x: X_INPUT, y: 0 },
    data: { label: 'Context' },
    style: { width: 220, height: 52 },
  });
  nodes.push({
    id: 'meta:lens',
    type: 'lens',
    position: { x: X_INPUT, y: 80 },
    data: { label: 'Lens' },
    style: { width: 220, height: 52 },
  });

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
      type: 'goal',
      position: { x: X_GOAL, y },
      data: { label: goalId },
      style: { width: 240, height: 52 },
    });

    edges.push({
      id: `meta:context->${goalNodeId}`,
      source: 'meta:context',
      target: goalNodeId,
      type: 'energy',
      data: { weight: sumContext, rawWeight: sumContext, label: formatValue(sumContext) },
    });
    edges.push({
      id: `meta:lens->${goalNodeId}`,
      source: 'meta:lens',
      target: goalNodeId,
      type: 'energy',
      data: { weight: sumLens, rawWeight: sumLens, label: formatValue(sumLens) },
    });
  });

  return { nodes, edges };
}

export const DecisionGraphView: React.FC<Props> = ({
  frame: _frame,
  goalScores,
  selectedGoalId,
  mode: externalMode = 'graph',
  compact = false,
  temperature = 1,
  curvePreset = 'smoothstep',
}) => {
  const [mode, setMode] = useState<DecisionGraphRenderMode>(externalMode);
  React.useEffect(() => setMode(externalMode), [externalMode]);

  const [maxGoals, setMaxGoals] = useState(14);
  const [maxInputs, setMaxInputs] = useState(10);
  const [edgeThreshold, setEdgeThreshold] = useState(0.1);
  const [spreadOn, setSpreadOn] = useState(true);
  const [spreadSteps, setSpreadSteps] = useState(6);
  const [spreadDecay, setSpreadDecay] = useState(0.2);
  const [spreadStart, setSpreadStart] = useState<string | null>(null);
  const [spreadDirection, setSpreadDirection] = useState<'backward' | 'forward' | 'undirected'>('backward');

  const safeScores = arr(goalScores);

  const graph = useMemo(() => {
    if (mode === 'overview') return buildOverviewGraph(safeScores, maxGoals);
    if (mode === 'goals') return buildGoalsDetailGraph(safeScores, maxGoals);
    if (mode === 'meta') return buildMetaGraph(safeScores, maxGoals);

    // "graph" / "3d" = strict clean-flow triplet (Sources → Lenses → Goals)
    // Uses fixed x-columns and edge filtering to avoid spaghetti.
    return buildDecisionTripletGraph({
      goalScores: safeScores,
      selectedGoalId: selectedGoalId ?? null,
      maxGoals,
      maxInputsPerGoal: maxInputs,
      edgeThreshold,
    });
  }, [safeScores, selectedGoalId, maxGoals, maxInputs, edgeThreshold, mode]);

  // Keep a sensible default for the spread start node.
  React.useEffect(() => {
    if (mode !== 'graph' && mode !== '3d') return;
    if (selectedGoalId && !spreadStart) {
      setSpreadStart(`goal:${selectedGoalId}`);
    }
    if (graph.nodes.length && spreadStart && !graph.nodes.some(n => String(n.id) === spreadStart)) {
      setSpreadStart(String(graph.nodes[0].id));
    }
  }, [mode, selectedGoalId, spreadStart, graph.nodes]);

  const enrichedGraph = useMemo(() => {
    if ((mode !== 'graph' && mode !== '3d') || !spreadOn) return graph;

    const nodeIds = graph.nodes.map(n => String(n.id));
    const nodeBase: Record<string, number> = {};
    for (const n of graph.nodes) {
      const raw = Number((n.data as any)?.value ?? 0);
      if (Number.isFinite(raw)) nodeBase[String(n.id)] = Math.abs(raw);
    }

    const base01 = normalizeBase(nodeIds, nodeBase);
    const edgeInputs = graph.edges.map(e => ({
      source: String(e.source),
      target: String(e.target),
      weight: Number((e.data as any)?.rawWeight ?? (e.data as any)?.weight ?? 0),
    }));

    const starts = spreadStart && nodeIds.includes(spreadStart) ? [spreadStart] : [];
    const result = spreadEnergy({
      nodeIds,
      edges: edgeInputs,
      startNodeIds: starts,
      steps: spreadSteps,
      decay: spreadDecay,
      temperature,
      curvePreset,
      nodeBase,
      direction: spreadDirection,
      signedFlow: true,
    });

    const nodes = graph.nodes.map((n) => {
      const id = String(n.id);
      const importance = clamp01(curve01(base01[id] ?? 0, curvePreset));
      return {
        ...n,
        data: {
          ...(n.data as any),
          energy: result.nodeEnergy[id] ?? 0,
          importance,
        },
      };
    });

    const edges = graph.edges.map((e) => {
      const rawWeight = Number((e.data as any)?.rawWeight ?? (e.data as any)?.weight ?? 0);
      const key = `${String(e.source)}→${String(e.target)}`;
      const flow = Number(result.edgeFlow[key] ?? 0);
      const strength = clamp01(Math.abs(flow));
      return {
        ...e,
        data: {
          ...(e.data as any),
          rawWeight,
          // Keep sign-carrying weight for coloring; show flow separately.
          weight: rawWeight,
          strength,
          // Show both the dynamic flow (after diffusion) and the raw model weight.
          label: `${formatValue(flow)}  |  w=${formatValue(rawWeight)}`,
        },
        animated: strength > 0.35,
      };
    });

    return { nodes, edges };
  }, [
    graph,
    mode,
    spreadOn,
    spreadStart,
    spreadSteps,
    spreadDecay,
    spreadDirection,
    temperature,
    curvePreset,
  ]);

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

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div
        className={`flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/30 ${
          compact ? 'px-2 py-1.5' : 'p-3'
        }`}
      >
        <div className="text-[10px] text-slate-300/80">
          {mode === 'overview'
            ? 'Overview: Context + Lens → Goals (3 nodes)'
            : mode === 'goals'
              ? 'Goals-detail: Context/Lens buckets → Goals'
              : mode === 'meta'
                ? 'Meta: per-goal Context/Lens buckets → Goal'
                : mode === '3d'
                  ? '3D graph: layered, contrib + flow'
                  : 'Decision graph: Sources → Lenses → Goals'}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
            <span className="opacity-70">Mode</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px]"
            >
              <option value="overview">overview</option>
              <option value="goals">goals</option>
              <option value="graph">full 2D</option>
              <option value="3d">3D</option>
              <option value="meta">meta</option>
            </select>
          </label>

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

          {mode === 'graph' || mode === '3d' ? (
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

          {mode === 'graph' || mode === '3d' ? (
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

          {mode === 'graph' || mode === '3d' ? (
            <>
              <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
                <span className="opacity-70">Spread</span>
                <input
                  type="checkbox"
                  checked={spreadOn}
                  onChange={e => setSpreadOn(e.target.checked)}
                  className="accent-cyan-400"
                />
              </label>
              <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
                <span className="opacity-70">Dir</span>
                <select
                  value={spreadDirection}
                  onChange={e => setSpreadDirection(e.target.value as any)}
                  className="bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px]"
                >
                  <option value="backward">goal → inputs</option>
                  <option value="forward">inputs → goal</option>
                  <option value="undirected">both</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
                <span className="opacity-70">Steps</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={spreadSteps}
                  onChange={e => setSpreadSteps(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-12 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px] font-mono"
                />
              </label>
              <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
                <span className="opacity-70">Decay</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={spreadDecay}
                  onChange={e => setSpreadDecay(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                  className="w-12 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px] font-mono"
                />
              </label>
              <label className="flex items-center gap-2 text-[10px] text-slate-300/80">
                <span className="opacity-70">Dir</span>
                <select
                  value={spreadDirection}
                  onChange={e => setSpreadDirection(e.target.value as any)}
                  className="bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px]"
                >
                  <option value="backward">goal→inputs</option>
                  <option value="forward">inputs→goal</option>
                  <option value="undirected">both</option>
                </select>
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {mode === '3d' ? (
          <DecisionGraph3DView
            nodes={enrichedGraph.nodes as any}
            edges={enrichedGraph.edges as any}
            initialFocusId={spreadStart}
            onPickNode={(id) => {
              if (!spreadOn) return;
              setSpreadStart(String(id));
            }}
          />
        ) : (
          <ReactFlow
            nodes={enrichedGraph.nodes}
            edges={enrichedGraph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag
            className="bg-black"
            onNodeClick={(_, n) => {
              if (!spreadOn) return;
              setSpreadStart(String(n.id));
            }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  );
};
