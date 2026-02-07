import type { Edge, Node } from 'reactflow';

import { curve01, type CurvePreset } from '../utils/curves';
import { spreadEnergy } from './energySpread';

export type EdgeLabelMode = 'flow' | 'weight';

export type DecisionGraphEnergyParams = {
  enabled: boolean;
  edgeLabelMode: EdgeLabelMode;
  startNodeId?: string | null;
  steps: number;
  decay: number;
  temperature: number;
  curvePreset: CurvePreset;
  direction: 'forward' | 'backward' | 'undirected';
};

export type GraphResult = { nodes: Node[]; edges: Edge[] };

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function formatSigned2(v: number): string {
  const x = Number(v);
  if (!Number.isFinite(x)) return '0.00';
  const r = Math.round(x * 100) / 100;
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}`;
}

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
    return Object.fromEntries(nodeIds.map((id) => [id, 0]));
  }
  const span = max - min;
  const out: Record<string, number> = {};
  for (const id of nodeIds) out[id] = (Number(base[id] ?? 0) - min) / span;
  return out;
}

/**
 * Apply (optional) spread-energy overlay to a DecisionGraph-style ReactFlow graph.
 * This is intentionally UI-oriented: node.data.energy/importance and edge.data.label/strength.
 */
export function applyDecisionGraphEnergy(graph: GraphResult, p: DecisionGraphEnergyParams): GraphResult {
  if (!p.enabled) {
    if (p.edgeLabelMode !== 'weight') return graph;
    return {
      nodes: graph.nodes,
      edges: graph.edges.map((e) => {
        const rawWeight = Number((e.data as any)?.rawWeight ?? (e.data as any)?.weight ?? 0);
        return {
          ...e,
          data: {
            ...(e.data as any),
            rawWeight,
            label: formatSigned2(rawWeight),
          },
        };
      }),
    };
  }

  const nodeIds = graph.nodes.map((n) => String(n.id));
  if (!nodeIds.length) return graph;

  const nodeBase: Record<string, number> = {};
  for (const n of graph.nodes) {
    const raw = Number((n.data as any)?.value ?? 0);
    if (Number.isFinite(raw)) nodeBase[String(n.id)] = Math.abs(raw);
  }

  const base01 = normalizeBase(nodeIds, nodeBase);

  const edgeInputs = graph.edges.map((e) => ({
    source: String(e.source),
    target: String(e.target),
    weight: Number((e.data as any)?.rawWeight ?? (e.data as any)?.weight ?? 0),
  }));

  const startId = p.startNodeId && nodeIds.includes(String(p.startNodeId)) ? String(p.startNodeId) : null;
  const starts = startId ? [startId] : [];

  const result = spreadEnergy({
    nodeIds,
    edges: edgeInputs,
    startNodeIds: starts,
    steps: p.steps,
    decay: p.decay,
    temperature: p.temperature,
    curvePreset: p.curvePreset,
    nodeBase,
    direction: p.direction,
    signedFlow: true,
  });

  const nodes = graph.nodes.map((n) => {
    const id = String(n.id);
    const importance = clamp01(curve01(base01[id] ?? 0, p.curvePreset));
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
    const label =
      p.edgeLabelMode === 'weight'
        ? formatSigned2(rawWeight)
        : `w=${formatSigned2(rawWeight)} · f=${formatSigned2(flow)}`;

    return {
      ...e,
      data: {
        ...(e.data as any),
        rawWeight,
        // Keep sign-carrying weight for coloring; show flow separately.
        weight: rawWeight,
        strength,
        label,
      },
      animated: strength > 0.35,
    };
  });

  return { nodes, edges };
}
