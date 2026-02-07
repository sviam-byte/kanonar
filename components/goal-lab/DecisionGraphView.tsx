import React, { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, type EdgeTypes, type NodeTypes } from 'reactflow';
import 'reactflow/dist/style.css';

import type { AgentContextFrame } from '../../lib/context/frame/types';
import type { ContextualGoalContribution, ContextualGoalScore } from '../../lib/context/v2/types';
import { buildDecisionTripletGraph } from '../../lib/graph/GraphAdapter';
import { applyDecisionGraphEnergy, type EdgeLabelMode } from '../../lib/graph/decisionGraphEnergy';
import { arr } from '../../lib/utils/arr';
import { type CurvePreset } from '../../lib/utils/curves';

import { EnergyEdge } from './EnergyEdge';
import { GoalNode, LensNode, SourceNode } from './DecisionGraphNodes';
import { DecisionGraph3DView } from './DecisionGraph3DView';
import { GoalExplanationPanel } from './GoalExplanationPanel';

export type DecisionGraphRenderMode = 'overview' | 'goals-detail' | 'graph' | 'meta' | 'dual' | 'explain' | '3d';

type Props = {
  frame?: AgentContextFrame | null;
  /** Full atom set (typically snapshot atoms) used for dual-layer visualization. */
  contextAtoms?: any[];
  /** Agent id for ctx:*:selfId addressing in dual-layer visualization. */
  selfId?: string;
  goalScores: ContextualGoalScore[];
  selectedGoalId?: string | null;

  /** graph: full; overview/goals-detail/dual/meta/explain: simplified; 3d: 3D */
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

function buildOverviewGraph(goalScores: ContextualGoalScore[]) {
  const goals = arr(goalScores);
  const goalCount = goals.length;
  const nodes = [
    {
      id: 'meta:context',
      position: { x: 0, y: 0 },
      data: { label: 'Context' },
      style: {
        width: 220,
        height: 60,
        borderRadius: 14,
        padding: '10px 12px',
        border: '1px solid rgba(56, 189, 248, 0.45)',
        background: 'rgba(56, 189, 248, 0.10)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 700,
      },
    },
    {
      id: 'meta:goals',
      position: { x: 320, y: 0 },
      data: { label: `Goals (${goalCount})` },
      style: {
        width: 220,
        height: 60,
        borderRadius: 14,
        padding: '10px 12px',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(15, 23, 42, 0.85)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 700,
      },
    },
  ];

  const edges = [
    {
      id: 'e:meta:context->meta:goals',
      source: 'meta:context',
      target: 'meta:goals',
      type: 'smoothstep',
      label: '→',
      style: { stroke: 'rgba(148, 163, 184, 0.55)', strokeWidth: 2 },
      labelStyle: { fill: 'rgba(148, 163, 184, 0.9)', fontSize: 10 },
    },
  ];

  return { nodes, edges };
}

/**
 * Goals-detail graph: collapse inputs and actions, keep goals expanded.
 */
function buildGoalsDetailGraph(goalScores: ContextualGoalScore[], maxGoals: number) {
  const ranked = [...arr(goalScores)].sort((a, b) => (b.totalLogit ?? 0) - (a.totalLogit ?? 0));
  const trimmed = ranked.slice(0, Math.max(1, maxGoals));

  const nodes: any[] = [];
  const edges: any[] = [];

  nodes.push({
    id: 'meta:context',
    position: { x: 0, y: 0 },
    data: { label: 'Context (collapsed)' },
    style: {
      width: 240,
      height: 60,
      borderRadius: 14,
      padding: '10px 12px',
      border: '1px solid rgba(56, 189, 248, 0.45)',
      background: 'rgba(56, 189, 248, 0.10)',
      color: '#e2e8f0',
      fontSize: '12px',
      fontWeight: 700,
    },
  });

  const yGap = 86;
  trimmed.forEach((s, i) => {
    nodes.push({
      id: `goal:${s.goalId}`,
      position: { x: 320, y: i * yGap },
      data: {
        label: `${String(s.goalId)} · ${(Number(s.probability) || 0).toFixed(2)}`,
        value: s.totalLogit,
      },
      style: {
        width: 320,
        height: 60,
        borderRadius: 14,
        padding: '10px 12px',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(15, 23, 42, 0.85)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 600,
      },
    });

    edges.push({
      id: `e:meta:context->goal:${s.goalId}`,
      source: 'meta:context',
      target: `goal:${s.goalId}`,
      type: 'smoothstep',
      label: '→',
      style: { stroke: 'rgba(148, 163, 184, 0.45)', strokeWidth: 2 },
      labelStyle: { fill: 'rgba(148, 163, 184, 0.85)', fontSize: 10 },
    });

    edges.push({
      id: `e:goal:${s.goalId}->meta:actions`,
      source: `goal:${s.goalId}`,
      target: 'meta:actions',
      type: 'smoothstep',
      label: '→',
      style: { stroke: 'rgba(148, 163, 184, 0.35)', strokeWidth: 2 },
      labelStyle: { fill: 'rgba(148, 163, 184, 0.75)', fontSize: 10 },
    });
  });

  nodes.push({
    id: 'meta:actions',
    position: { x: 720, y: 0 },
    data: { label: 'Actions (collapsed)' },
    style: {
      width: 240,
      height: 60,
      borderRadius: 14,
      padding: '10px 12px',
      border: '1px solid rgba(148, 163, 184, 0.35)',
      background: 'rgba(2, 6, 23, 0.65)',
      color: '#e2e8f0',
      fontSize: '12px',
      fontWeight: 700,
    },
  });

  return { nodes, edges };
}

function buildDualLayerGraph(atoms: any[], selfId: string) {
  const axes = [
    'danger', 'control', 'intimacy', 'hierarchy', 'publicness',
    'normPressure', 'surveillance', 'scarcity', 'timePressure',
    'uncertainty', 'legitimacy', 'secrecy', 'grief', 'pain',
  ];

  const getMag = (id: string) => {
    const a = arr(atoms).find((x: any) => String(x?.id || '') === id);
    const v = Number((a as any)?.magnitude);
    return Number.isFinite(v) ? v : 0;
  };

  const nodes: any[] = [];
  const edges: any[] = [];
  const X_BASE = 0;
  const X_FINAL = 340;
  const Y_GAP = 74;

  axes.forEach((axis, i) => {
    const baseId = `ctx:${axis}:${selfId}`;
    const finId = `ctx:final:${axis}:${selfId}`;
    const baseVal = getMag(baseId);
    const finVal = getMag(finId);
    const y = i * Y_GAP;

    nodes.push({
      id: baseId,
      position: { x: X_BASE, y },
      data: { label: `${axis}: ${baseVal.toFixed(2)}` },
      style: {
        width: 280,
        height: 52,
        borderRadius: 12,
        padding: '8px 12px',
        border: '1px solid rgba(59, 130, 246, 0.60)',
        background: 'rgba(59, 130, 246, 0.12)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 600,
      },
    });

    nodes.push({
      id: finId,
      position: { x: X_FINAL, y },
      data: { label: `${axis}: ${finVal.toFixed(2)}` },
      style: {
        width: 280,
        height: 52,
        borderRadius: 12,
        padding: '8px 12px',
        border: '1px solid rgba(239, 68, 68, 0.55)',
        background: 'rgba(239, 68, 68, 0.10)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontWeight: 600,
      },
    });

    const delta = finVal - baseVal;
    const label = delta >= 0 ? `+${delta.toFixed(2)}` : `${delta.toFixed(2)}`;
    edges.push({
      id: `e:${baseId}->${finId}`,
      source: baseId,
      target: finId,
      type: 'smoothstep',
      label,
      style: {
        stroke: delta >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(245, 158, 11, 0.85)',
        strokeWidth: 1 + Math.min(6, Math.abs(delta) * 10),
      },
      labelStyle: { fill: 'rgba(148, 163, 184, 0.9)', fontSize: 10 },
    });
  });

  return { nodes, edges };
}

export const DecisionGraphView: React.FC<Props> = ({
  frame: _frame,
  contextAtoms,
  selfId,
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
  const [edgeLabelMode, setEdgeLabelMode] = useState<EdgeLabelMode>('flow');
  const [spreadSteps, setSpreadSteps] = useState(6);
  const [spreadDecay, setSpreadDecay] = useState(0.2);
  const [spreadStart, setSpreadStart] = useState<string | null>(null);
  const [spreadDirection, setSpreadDirection] = useState<'backward' | 'forward' | 'undirected'>('backward');

  const safeScores = arr(goalScores);

  const graph = useMemo(() => {
    if (mode === 'explain') {
      return { nodes: [], edges: [] };
    }
    if (mode === 'meta') return buildMetaGraph(safeScores, maxGoals);
    if (mode === 'overview') return buildOverviewGraph(safeScores);
    if (mode === 'goals-detail') return buildGoalsDetailGraph(safeScores, maxGoals);
    if (mode === 'dual') {
      const atoms = arr(contextAtoms);
      const sid = String(selfId || '').trim();
      if (!atoms.length || !sid) return { nodes: [], edges: [] };
      return buildDualLayerGraph(atoms, sid);
    }

    // "graph" / "3d" = strict clean-flow triplet (Sources → Lenses → Goals)
    // Uses fixed x-columns and edge filtering to avoid spaghetti.
    return buildDecisionTripletGraph({
      goalScores: safeScores,
      selectedGoalId: selectedGoalId ?? null,
      maxGoals,
      maxInputsPerGoal: maxInputs,
      edgeThreshold,
    });
  }, [mode, safeScores, selectedGoalId, maxGoals, maxInputs, edgeThreshold, contextAtoms, selfId]);

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
    if (mode !== 'graph' && mode !== '3d') return graph;

    return applyDecisionGraphEnergy(graph, {
      enabled: spreadOn,
      edgeLabelMode,
      startNodeId: spreadStart,
      steps: spreadSteps,
      decay: spreadDecay,
      temperature,
      curvePreset,
      direction: spreadDirection,
    });
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
    edgeLabelMode,
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

  if (mode === 'explain') {
    return (
      <div className="w-full h-full rounded-xl border border-slate-800/70 bg-black/20 overflow-hidden">
        <GoalExplanationPanel goalScores={safeScores} selectedGoalId={selectedGoalId ?? undefined} />
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
          {mode === 'overview'
            ? 'Overview: Context → Goals (collapsed)'
            : mode === 'goals-detail'
              ? 'Goals detail: Context collapsed → Goals expanded → Actions collapsed'
              : mode === 'meta'
                ? 'Meta graph: Context/Lens buckets → Goals'
                : mode === 'dual'
                  ? 'Dual-layer: ctx:* (objective) → ctx:final:* (after Character Lens)'
                  : mode === 'explain'
                    ? 'Goal explanations (catalog + current scores)'
                    : mode === '3d'
                      ? '3D graph: layered (atom/lens/goal/action), contrib + flow'
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
              <option value="overview">Overview</option>
              <option value="goals-detail">Goals detail</option>
              <option value="graph">2D</option>
              <option value="3d">3D</option>
              <option value="meta">Meta</option>
              <option value="dual">Dual</option>
              <option value="explain">Explain</option>
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
                <span className="opacity-70">Edge labels</span>
                <select
                  value={edgeLabelMode}
                  onChange={e => setEdgeLabelMode(e.target.value as EdgeLabelMode)}
                  className="bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[10px]"
                >
                  <option value="flow">flow</option>
                  <option value="weight">weight</option>
                </select>
              </label>
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
