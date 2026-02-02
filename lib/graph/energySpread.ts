import { CurvePreset, curve01 } from '../utils/curves';

// -------------------------
// Seeded RNG (deterministic)
// -------------------------
const hashSeedToUint32 = (seed: number | string | undefined): number => {
  if (seed === undefined) return 0x12345678;
  if (typeof seed === 'number') return (seed >>> 0) || 0x12345678;
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 0x12345678;
};

const mulberry32 = (a: number) => {
  let t = a >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clampSigned1 = (x: number) => (x < -1 ? -1 : x > 1 ? 1 : x);

export type SpreadGraphNode = { id: string; [k: string]: any };
export type SpreadGraphEdge = {
  from: string;
  to: string;
  weight?: number; // signed: + supports, - suppresses
  [k: string]: any;
};
export type SpreadGraph = { nodes: SpreadGraphNode[]; edges: SpreadGraphEdge[] };

export type ChannelVector = Record<string, number>; // channel -> value

export type SpreadEnergyV2Input = {
  graph: SpreadGraph;
  // sources can be:
  // - scalar (single unnamed channel "base"), or
  // - vector by channel
  sources: Record<string, number | ChannelVector>;
  steps?: number;
  decay?: number;
  temperature?: number;
  curve?: CurvePreset;
  // If true: keep signed node energies in [-1,1]. If false: track pos/neg separately.
  signed?: boolean;
  seed?: number | string;
  // Optional whitelist of channels; otherwise inferred from sources.
  channels?: string[];
};

export type SpreadEnergyV2Output = {
  channels: string[];
  // nodeEnergy[channel][nodeId] -> value
  nodeEnergy: Record<string, Record<string, number>>;
  // optional aggregate per node (for convenience in UI)
  nodeAggregate: Record<string, number>;
  // edgeFlow[channel]["from->to"] -> signed flow used on that step accumulation
  edgeFlow: Record<string, Record<string, number>>;
};

/**
 * spreadEnergyV2:
 * - supports multi-channel energy (vectors),
 * - supports signed edges: negative edges suppress (or carry negative energy if signed=true),
 * - deterministic tie-breaking via seed.
 *
 * This is meant as a "real" propagation primitive (not just UI paint).
 */
export const spreadEnergyV2 = (input: SpreadEnergyV2Input): SpreadEnergyV2Output => {
  const steps = Math.max(0, Math.min(50, input.steps ?? 2));
  const decay = input.decay ?? 0.8;
  const temperature = Math.max(1e-6, input.temperature ?? 1.0);
  const curve: CurvePreset = input.curve ?? 'smoothstep';
  const signed = input.signed ?? true;

  const nodes = input.graph.nodes || [];
  const edges = input.graph.edges || [];
  const byId = new Map<string, SpreadGraphNode>();
  for (const n of nodes) byId.set(n.id, n);

  // Build adjacency for propagation
  const out = new Map<string, SpreadGraphEdge[]>();
  for (const e of edges) {
    if (!e?.from || !e?.to) continue;
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e);
  }

  // Infer channel list
  const inferred = new Set<string>();
  for (const v of Object.values(input.sources || {})) {
    if (typeof v === 'number') inferred.add('base');
    else for (const k of Object.keys(v || {})) inferred.add(k);
  }
  const channels = (input.channels && input.channels.length ? input.channels : Array.from(inferred)).slice();
  if (!channels.length) channels.push('base');

  // Init nodeEnergy[channel][id] = 0
  const nodeEnergy: Record<string, Record<string, number>> = {};
  const edgeFlow: Record<string, Record<string, number>> = {};
  for (const ch of channels) {
    nodeEnergy[ch] = {};
    edgeFlow[ch] = {};
    for (const n of nodes) nodeEnergy[ch][n.id] = 0;
  }

  // Seeded RNG for stable iteration order (only used for tie-break shuffles)
  const rnd = mulberry32(hashSeedToUint32(input.seed));

  // Initialize from sources
  for (const [nodeId, v] of Object.entries(input.sources || {})) {
    if (!byId.has(nodeId)) continue;
    if (typeof v === 'number') {
      nodeEnergy['base'][nodeId] = clampSigned1(nodeEnergy['base'][nodeId] + v);
    } else {
      for (const ch of channels) {
        const add = v[ch];
        if (add === undefined) continue;
        nodeEnergy[ch][nodeId] = clampSigned1(nodeEnergy[ch][nodeId] + add);
      }
    }
  }

  // Helper: normalize outgoing edge weights into probabilities (softmax-like), but keep sign separate.
  const outProbs = (fromId: string): { edge: SpreadGraphEdge; p: number; sign: number }[] => {
    const outs = (out.get(fromId) || []).slice();
    if (!outs.length) return [];

    // Shuffle deterministically to avoid hidden dependence on insertion order when equal.
    for (let i = outs.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [outs[i], outs[j]] = [outs[j], outs[i]];
    }

    // Use |w| for probability mass, sign for effect.
    const mags = outs.map(e => Math.abs(e.weight ?? 1));
    // Softmax temperature on magnitudes (prevents single edge dominating too hard)
    const exps = mags.map(m => Math.exp(m / temperature));
    const Z = exps.reduce((a, b) => a + b, 0) || 1;
    return outs.map((e, i) => ({
      edge: e,
      p: exps[i] / Z,
      sign: (e.weight ?? 1) >= 0 ? 1 : -1,
    }));
  };

  // Propagation steps
  for (let t = 0; t < steps; t++) {
    // accumulate next delta per channel
    const nextDelta: Record<string, Record<string, number>> = {};
    for (const ch of channels) {
      nextDelta[ch] = {};
      for (const n of nodes) nextDelta[ch][n.id] = 0;
    }

    for (const n of nodes) {
      const fromId = n.id;
      const outs = outProbs(fromId);
      if (!outs.length) continue;

      // baseImportance for this node: curve(nodeAggregatePos) used as a damping factor
      // (keeps the "curvePreset" behavior, but now it modulates propagation, not only UI)
      let aggAbs = 0;
      for (const ch of channels) aggAbs += Math.abs(nodeEnergy[ch][fromId] || 0);
      const baseImportance = curve01(clamp01(aggAbs), curve);

      for (const { edge, p, sign } of outs) {
        const key = `${edge.from}->${edge.to}`;
        for (const ch of channels) {
          const cur = nodeEnergy[ch][fromId] || 0;
          if (cur === 0) continue;

          // Flow amount: proportional to current energy, prob mass, decay and importance
          const flow = cur * p * decay * (0.25 + 0.75 * baseImportance);
          const signedFlow = sign * flow;

          if (signed) {
            // Signed mode: negative edges propagate negative contribution directly.
            nextDelta[ch][edge.to] += signedFlow;
          } else {
            // Split mode: suppress means "subtract from target" but clamp at [0,1] later.
            nextDelta[ch][edge.to] += signedFlow;
          }

          edgeFlow[ch][key] = (edgeFlow[ch][key] || 0) + signedFlow;
        }
      }
    }

    // Apply deltas with clamping
    for (const ch of channels) {
      for (const n of nodes) {
        const id = n.id;
        const v = (nodeEnergy[ch][id] || 0) + (nextDelta[ch][id] || 0);
        nodeEnergy[ch][id] = signed ? clampSigned1(v) : clamp01(v);
      }
    }
  }

  // Aggregate convenience scalar per node (sum abs over channels)
  const nodeAggregate: Record<string, number> = {};
  for (const n of nodes) {
    let s = 0;
    for (const ch of channels) s += Math.abs(nodeEnergy[ch][n.id] || 0);
    nodeAggregate[n.id] = s;
  }

  return { channels, nodeEnergy, nodeAggregate, edgeFlow };
};

// ---------------------------------------------------------------------
// Existing API below (kept for backwards compatibility with current UI)
// ---------------------------------------------------------------------

export type SpreadEnergyInput = {
  nodes: Array<{ id: string; label?: string; meta?: any }>;
  edges: Array<{ from: string; to: string; weight?: number; meta?: any }>;
  sources: Record<string, number>;
  steps?: number;
  decay?: number;
  temperature?: number;
  curve?: CurvePreset;
};

export type SpreadEnergyOutput = {
  nodeEnergy: Record<string, number>;
  edgeFlow: Record<string, number>;
};

/**
 * Clamp any number into the [0..1] range.
 */
function clamp01Compat(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Provide a stable, bounded temperature for the softmax.
 */
function safeTemp(t: number): number {
  const x = Number(t);
  if (!Number.isFinite(x)) return 1.0;
  return Math.max(0.05, x);
}

/**
 * Normalize a base importance map to [0..1] per node.
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
 * Spread energy from start nodes across edges, returning node energy and edge flows.
 */
export function spreadEnergy(params: SpreadEnergyInput): SpreadEnergyOutput {
  const nodeIds = params.nodes.map(n => n.id);
  const edges = params.edges.map(e => ({ source: e.from, target: e.to, weight: e.weight ?? 0 }));
  const steps = Math.max(0, Math.min(50, Math.floor(Number(params.steps) || 0)));
  const decay = clamp01Compat(Number(params.decay) || 0);
  const T = safeTemp(params.temperature);
  const preset = params.curve ?? 'smoothstep';

  const base01 = normalizeBase(nodeIds, undefined);

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

  for (const s of Object.keys(params.sources || {})) {
    const id = String(s);
    if (id in nodeEnergy) nodeEnergy[id] = clamp01Compat(Number(params.sources[id] ?? 0));
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

      const baseImportance = clamp01Compat(curve01(clamp01Compat(Number(base01[u] ?? 0)), preset));
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
      nodeEnergy[id] = clamp01Compat(next[id]);
    }
  }

  return { nodeEnergy, edgeFlow };
}
