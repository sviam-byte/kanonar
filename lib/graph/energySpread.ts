import { curve01, curve01Param, type CurvePreset, type CurveSpec } from '../utils/curves';

// -----------------------------
// V2: multi-channel spread (optional)
// -----------------------------
export type EnergyChannel = string;

export type EnergySeed = { nodeId: string; amount: number };

export type EnergySpreadParamsV2 = {
  nodeIds: string[];
  edges: Array<{ source: string; target: string; weight: number; kind?: EnergyChannel }>;

  /** Seeds per channel (energies start at these nodes). */
  start: Record<EnergyChannel, EnergySeed[]>;

  steps: number;
  decay: number;
  temperature: number;

  /** Per-channel curve shaping on base importance (agent-specific upstream can provide these). */
  curveByKind?: Record<EnergyChannel, CurvePreset | CurveSpec>;
  /** Optional base importance values per node (will be normalized to 0..1). */
  nodeBase?: Record<string, number>;

  /** Optional: deterministic seed for edge sampling. */
  seed?: number;
};

export type EnergySpreadResultV2 = {
  nodeEnergyByKind: Record<EnergyChannel, Record<string, number>>;
  edgeFlowByKind: Record<EnergyChannel, Record<string, number>>;
};

// ---------------------------------------------------------------------
// Existing API below (kept for backwards compatibility with current UI)
// ---------------------------------------------------------------------

export type SpreadEnergyInput =
  | {
      // Canonical API (used by non-UI callers).
      nodes: Array<{ id: string; label?: string; meta?: any }>;
      edges: Array<{ from: string; to: string; weight?: number; meta?: any }>;
      sources: Record<string, number>;
      nodeBase?: Record<string, number>;
      steps?: number;
      decay?: number;
      temperature?: number;
      curve?: CurvePreset;
    }
  | {
      // Legacy API (DecisionGraphView).
      nodeIds: string[];
      edges: Array<{ source?: string; target?: string; from?: string; to?: string; weight?: number; meta?: any }>;
      startNodeIds?: string[];
      steps?: number;
      decay?: number;
      temperature?: number;
      curvePreset?: CurvePreset;
      nodeBase?: Record<string, number>;
    };

export type SpreadEnergyOutput = {
  nodeEnergy: Record<string, number>;
  edgeFlow: Record<string, number>;
};

/**
 * Clamp any number into the [0..1] range.
 */
function clamp01(x: number): number {
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
  // NOTE: There are two call sites / historical APIs:
  //   A) "new": { nodes, edges, sources, steps, decay, temperature, curve }
  //   B) "legacy": { nodeIds, edges, startNodeIds, steps, decay, temperature, curvePreset, nodeBase }
  // DecisionGraphView currently uses the legacy shape. We support both.

  const p: any = params as any;

  // --- Normalize to canonical shape: nodes[], edges[], sources{} ---
  let nodes: Array<{ id: string; label?: string; meta?: any }> = [];
  let edges: Array<{ from: string; to: string; weight?: number; meta?: any }> = [];
  let sources: Record<string, number> = {};
  let steps = 2;
  let decay = 0.75;
  let temperature = 1;
  let curve: CurvePreset = 'smoothstep';

  // Optional per-node base importance (0..1) — legacy API.
  let nodeBase: Record<string, number> | undefined;

  if (Array.isArray(p?.nodes) || Array.isArray(p?.edges) || p?.sources) {
    // Canonical API
    nodes = Array.isArray(p?.nodes) ? p.nodes : [];
    edges = Array.isArray(p?.edges) ? p.edges : [];
    sources = (p?.sources && typeof p.sources === 'object') ? p.sources : {};
    steps = p?.steps ?? steps;
    decay = p?.decay ?? decay;
    temperature = p?.temperature ?? temperature;
    curve = (p?.curve ?? curve) as CurvePreset;
    nodeBase = p?.nodeBase;
  } else if (Array.isArray(p?.nodeIds)) {
    // Legacy API (DecisionGraphView)
    const nodeIds = p.nodeIds as string[];
    nodes = nodeIds.map((id) => ({ id: String(id) }));
    const eIn = Array.isArray(p?.edges) ? p.edges : [];
    edges = eIn
      .map((e: any) => ({
        from: String(e?.from ?? e?.source ?? ''),
        to: String(e?.to ?? e?.target ?? ''),
        weight: (e?.weight ?? 1),
        meta: e?.meta,
      }))
      .filter((e: any) => e.from && e.to);

    const starts: string[] = Array.isArray(p?.startNodeIds) ? p.startNodeIds : [];
    // Seed sources: if multiple start nodes, split mass equally.
    const mass = starts.length ? (1 / starts.length) : 0;
    for (const id of starts) sources[String(id)] = mass;

    steps = p?.steps ?? steps;
    decay = p?.decay ?? decay;
    temperature = p?.temperature ?? temperature;
    curve = (p?.curvePreset ?? curve) as CurvePreset;
    nodeBase = p?.nodeBase;
  } else {
    // Unknown input shape — be safe.
    return { nodeEnergy: {}, edgeFlow: {} };
  }

  // Defensive defaults: UI can briefly pass empty graph while building.
  if (!Array.isArray(nodes) || nodes.length === 0) return { nodeEnergy: {}, edgeFlow: {} };
  if (!Array.isArray(edges)) edges = [];

  // Normalize sources to avoid NaNs.
  const safeSources: Record<string, number> = {};
  for (const [k, v] of Object.entries(sources || {})) {
    const n = Number(v);
    if (Number.isFinite(n)) safeSources[String(k)] = clamp01(n);
  }

  const nodeIds = nodes.map((n: any) => n?.id).filter(Boolean).map(String);
  if (nodeIds.length === 0) {
    return { nodeEnergy: {}, edgeFlow: {} };
  }

  const stepsCount = Math.max(0, Math.min(50, Math.floor(Number(steps) || 0)));
  const decayRatio = clamp01(Number(decay) || 0);
  const T = safeTemp(temperature);
  const preset = curve ?? 'smoothstep';

  const base01 = normalizeBase(nodeIds, nodeBase);

  const outEdges = new Map<string, Array<{ target: string; w: number; key: string }>>();
  for (const e of edges) {
    const s = String((e as any)?.from);
    const t = String((e as any)?.to);
    if (!s || !t) continue;
    const w = Number((e as any)?.weight ?? 0);
    const key = `${s}→${t}`;
    if (!outEdges.has(s)) outEdges.set(s, []);
    outEdges.get(s)!.push({ target: t, w, key });
  }

  const nodeEnergy: Record<string, number> = Object.fromEntries(nodeIds.map(id => [id, 0]));
  const edgeFlow: Record<string, number> = {};

  for (const [k, v] of Object.entries(safeSources)) {
    if (k in nodeEnergy) nodeEnergy[k] = v;
  }

  for (let k = 0; k < stepsCount; k++) {
    const next: Record<string, number> = Object.fromEntries(nodeIds.map(id => [id, 0]));

    for (const u of nodeIds) {
      const E = Number(nodeEnergy[u] ?? 0);
      if (!Number.isFinite(E) || E <= 0) continue;

      const outs = outEdges.get(u) || [];
      if (!outs.length) {
        next[u] += E * (1 - decayRatio);
        continue;
      }

      // baseImportance:
      // - if nodeBase is provided, use it (normalized to 0..1)
      // - otherwise, fall back to 0 so behavior stays stable.
      const baseImportance = clamp01(curve01(clamp01(Number(base01[u] ?? 0)), preset));
      const injected = E * (1 - decayRatio) * (0.35 + 0.65 * baseImportance);

      const scores = outs.map(o => ({ ...o, a: Math.abs(o.w) }));
      const Z = scores.reduce((acc, o) => acc + Math.exp(o.a / T), 0);
      const denom = Z > 0 ? Z : 1;

      for (const o of scores) {
        const p = Math.exp(o.a / T) / denom;
        const flow = injected * p;

        next[o.target] += flow;
        edgeFlow[o.key] = (edgeFlow[o.key] ?? 0) + flow;
      }
    }

    for (const id of nodeIds) {
      nodeEnergy[id] = clamp01(next[id]);
    }
  }

  return { nodeEnergy, edgeFlow };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * V2 spread:
 * - edges have `kind` (energy channel)
 * - start is per kind
 * - curveByKind can be preset or spec
 * - deterministic if `seed` provided
 */
export function spreadEnergyV2(params: EnergySpreadParamsV2): EnergySpreadResultV2 {
  const nodeIds = params.nodeIds;
  const edges = params.edges;
  const steps = Math.max(0, Math.min(50, Math.floor(Number(params.steps) || 0)));
  const decay = clamp01(Number(params.decay) || 0);
  const T = safeTemp(params.temperature);
  const base01 = normalizeBase(nodeIds, params.nodeBase);
  const curveByKind = params.curveByKind || {};
  const rng = mulberry32(Number.isFinite(params.seed as any) ? Number(params.seed) : 1234567);

  // Build adjacency by kind.
  const outByKind = new Map<string, Map<string, Array<{ target: string; w: number; key: string }>>>();
  for (const e of edges) {
    const kind = String((e as any).kind ?? 'base');
    const s = String(e.source);
    const t = String(e.target);
    const w = Number(e.weight ?? 0);
    const key = `${kind}:${s}→${t}`;
    if (!outByKind.has(kind)) outByKind.set(kind, new Map());
    const m = outByKind.get(kind)!;
    if (!m.has(s)) m.set(s, []);
    m.get(s)!.push({ target: t, w, key });
  }

  const kinds = Object.keys(params.start || {});
  const nodeEnergyByKind: Record<string, Record<string, number>> = {};
  const edgeFlowByKind: Record<string, Record<string, number>> = {};

  for (const kind of kinds) {
    nodeEnergyByKind[kind] = Object.fromEntries(nodeIds.map(id => [id, 0]));
    edgeFlowByKind[kind] = {};
    for (const s of params.start[kind] || []) {
      const id = String(s.nodeId);
      if (id in nodeEnergyByKind[kind]) nodeEnergyByKind[kind][id] = clamp01(Number(s.amount) || 0);
    }
  }

  for (let step = 0; step < steps; step++) {
    for (const kind of kinds) {
      const next: Record<string, number> = Object.fromEntries(nodeIds.map(id => [id, 0]));
      const outEdges = outByKind.get(kind) || new Map();
      const curve = (curveByKind as any)[kind] ?? (curveByKind as any).base ?? 'smoothstep';

      for (const u of nodeIds) {
        const E = Number(nodeEnergyByKind[kind][u] ?? 0);
        if (!Number.isFinite(E) || E <= 0) continue;

        const outs = outEdges.get(u) || [];
        if (!outs.length) {
          next[u] += E * (1 - decay);
          continue;
        }

        const baseImportance = clamp01(curve01Param(clamp01(Number(base01[u] ?? 0)), curve));
        const injected = E * (1 - decay) * (0.35 + 0.65 * baseImportance);

        // Softmax over |w|.
        const scores = outs.map(o => ({ ...o, a: Math.abs(o.w) }));
        const Z = scores.reduce((acc, o) => acc + Math.exp(o.a / T), 0);
        const denom = Z > 0 ? Z : 1;

        // Deterministic tie-breaking in case all weights ~0: shuffle order by RNG.
        if (Z === 0) {
          scores.sort(() => rng() - 0.5);
        }

        for (const o of scores) {
          const p = Math.exp(o.a / T) / denom;
          const flow = injected * p;
          const signedFlow = flow * Math.sign(o.w || 0);

          next[o.target] += flow;
          edgeFlowByKind[kind][o.key] = (edgeFlowByKind[kind][o.key] ?? 0) + signedFlow;
        }
      }

      for (const id of nodeIds) {
        nodeEnergyByKind[kind][id] = clamp01(next[id]);
      }
    }
  }

  return { nodeEnergyByKind, edgeFlowByKind };
}
