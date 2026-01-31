import { curve01, type CurvePreset } from '../utils/curves';

export type EnergySpreadParams = {
  nodeIds: string[];
  edges: Array<{ source: string; target: string; weight: number }>;

  startNodeIds: string[];
  steps: number;
  decay: number;

  temperature: number;
  curvePreset: CurvePreset;

  nodeBase?: Record<string, number>;
};

export type EnergySpreadResult = {
  nodeEnergy: Record<string, number>;
  edgeFlow: Record<string, number>;
};

/**
 * Clamp any numeric input into [0..1].
 * This keeps accumulation predictable even if callers send noisy values.
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Ensure temperature stays positive and finite.
 * Small temperatures sharpen the softmax but still remain stable.
 */
function safeTemp(t: number): number {
  const x = Number(t);
  if (!Number.isFinite(x)) return 1.0;
  return Math.max(0.05, x);
}

/**
 * Normalize a base importance map into 0..1 so we can apply curve presets.
 */
function normalizeBase(nodeIds: string[], base?: Record<string, number>): Record<string, number> {
  if (!base) return {};
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
  const out: Record<string, number> = {};
  const span = max - min;
  for (const id of nodeIds) {
    out[id] = (Number(base[id] ?? 0) - min) / span;
  }
  return out;
}

/**
 * Spread energy across a directed weighted graph.
 * The output includes per-node energy and signed edge flow totals.
 */
export function spreadEnergy(params: EnergySpreadParams): EnergySpreadResult {
  const nodeIds = params.nodeIds;
  const edges = params.edges;
  const steps = Math.max(0, Math.min(50, Math.floor(Number(params.steps) || 0)));
  const decay = clamp01(Number(params.decay) || 0);
  const T = safeTemp(params.temperature);
  const preset = params.curvePreset;

  const base01 = normalizeBase(nodeIds, params.nodeBase);

  const outEdges = new Map<string, Array<{ target: string; w: number; key: string }>>();
  for (const e of edges) {
    const s = String(e.source);
    const t = String(e.target);
    const w = Number(e.weight ?? 0);
    const key = `${s}→${t}`;
    if (!outEdges.has(s)) outEdges.set(s, []);
    outEdges.get(s)!.push({ target: t, w, key });
  }

  const nodeEnergy: Record<string, number> = Object.fromEntries(nodeIds.map(id => [id, 0]));
  const edgeFlow: Record<string, number> = {};

  for (const s of params.startNodeIds || []) {
    const id = String(s);
    if (id in nodeEnergy) nodeEnergy[id] = 1;
  }

  for (let k = 0; k < steps; k++) {
    const next: Record<string, number> = Object.fromEntries(nodeIds.map(id => [id, 0]));

    for (const u of nodeIds) {
      const E = Number(nodeEnergy[u] ?? 0);
      if (!Number.isFinite(E) || E <= 0) continue;

      const outs = outEdges.get(u) || [];
      if (!outs.length) {
        next[u] += E * (1 - decay);
        continue;
      }

      const baseImportance = clamp01(curve01(clamp01(Number(base01[u] ?? 0)), preset));
      const injected = E * (1 - decay) * (0.35 + 0.65 * baseImportance);

      const scores = outs.map(o => ({ ...o, a: Math.abs(o.w) }));
      const Z = scores.reduce((acc, o) => acc + Math.exp(o.a / T), 0);
      const denom = Z > 0 ? Z : 1;

      for (const o of scores) {
        const p = Math.exp(o.a / T) / denom;
        const flow = injected * p;
        const signedFlow = flow * Math.sign(o.w || 0);

        next[o.target] += flow;
        edgeFlow[o.key] = (edgeFlow[o.key] ?? 0) + signedFlow;
      }
    }

    for (const id of nodeIds) {
      nodeEnergy[id] = clamp01(next[id]);
    }
  }

  return { nodeEnergy, edgeFlow };
}
