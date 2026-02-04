import type { ContextAtom } from '../context/v2/types';
import type { EnergyChannel } from '../agents/energyProfiles';
import type { AtomGraph } from './atomGraph';
import type { SignalField } from '../goals/signalField';

export type AtomEnergyAttribution = Array<{ atomId: string; amount: number }>;

export type AtomEnergyResult = {
  nodeEnergyByChannel: Record<EnergyChannel, Record<string, number>>;
  edgeFlowByChannel: Record<EnergyChannel, Record<string, number>>;
  attributionByChannel: Record<EnergyChannel, Record<string, AtomEnergyAttribution>>;
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function atomWeight(a: ContextAtom): number {
  const m = Number((a as any)?.magnitude ?? 0);
  const c = Number((a as any)?.confidence ?? 1);
  if (!Number.isFinite(m) || !Number.isFinite(c)) return 0;
  return clamp01(m) * clamp01(c);
}

function mergeScaledTopK(dst: Map<string, number>, src: Map<string, number>, scale: number, topK: number) {
  if (!Number.isFinite(scale) || scale <= 0) return;
  for (const [k, v] of src.entries()) {
    const add = v * scale;
    if (!Number.isFinite(add) || add <= 0) continue;
    dst.set(k, (dst.get(k) ?? 0) + add);
  }
  // Prune to topK
  if (dst.size <= topK) return;
  const arr = Array.from(dst.entries()).sort((a, b) => b[1] - a[1]);
  dst.clear();
  for (let i = 0; i < Math.min(topK, arr.length); i++) dst.set(arr[i][0], arr[i][1]);
}

function topKArray(m: Map<string, number>, topK: number): AtomEnergyAttribution {
  const arr = Array.from(m.entries())
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK);
  return arr.map(([atomId, amount]) => ({ atomId, amount }));
}

/**
 * Multi-channel energy propagation on AtomGraph (used→derived edges).
 *
 * - Starts from SignalField channel sources (atom nodes).
 * - Spreads along graph edges for `steps` iterations.
 * - Keeps a bounded top-K attribution map per node per channel.
 *
 * Notes:
 * - This is intentionally simple and stable. It is meant as a backbone; you can later add
 *   edge weights, sign, channel-specific decay, or per-agent curves.
 */
export function propagateAtomEnergy(
  graph: AtomGraph,
  atoms: ContextAtom[],
  field: SignalField,
  opts?: {
    steps?: number;
    decay?: number;
    topK?: number;
    /**
     * Optional per-channel atom weight function.
     * If provided, it is used for seeding from SignalField.sources.
     * Useful for applying agent-specific channel curves at the source level.
     */
    atomWeightFn?: (ch: EnergyChannel, a: ContextAtom) => number;
  }
): AtomEnergyResult {
  const nodeIds = graph.nodes.map((n) => String(n.id)).filter(Boolean);
  const steps = Math.max(0, Math.min(64, Math.floor(Number(opts?.steps ?? 6))));
  const decay = clamp01(Number(opts?.decay ?? 0.25));
  const topK = Math.max(1, Math.min(24, Math.floor(Number(opts?.topK ?? 8))));
  const atomWeightFn = opts?.atomWeightFn;

  const nodeEnergyByChannel: Record<string, Record<string, number>> = {};
  const edgeFlowByChannel: Record<string, Record<string, number>> = {};
  const attributionByChannel: Record<string, Record<string, AtomEnergyAttribution>> = {};

  // Pre-index atoms by id so SignalField.sources objects can be swapped/normalized safely.
  const byId = new Map<string, ContextAtom>();
  for (const a of atoms || []) {
    const id = String((a as any)?.id ?? '');
    if (!id) continue;
    byId.set(id, a);
  }

  const channels = Object.keys(field.channels || {}) as EnergyChannel[];

  for (const ch of channels) {
    const start = field.channels[ch];
    const energy: Record<string, number> = Object.fromEntries(nodeIds.map((id) => [id, 0]));
    const contrib: Record<string, Map<string, number>> = Object.fromEntries(nodeIds.map((id) => [id, new Map()]));
    const edgeFlow: Record<string, number> = {};

    // Seed from sources
    for (const src0 of start?.sources || []) {
      const sid = String((src0 as any)?.id ?? '');
      if (!sid || !(sid in energy)) continue;
      const a = byId.get(sid) || src0;
      const w = atomWeightFn ? Number(atomWeightFn(ch, a)) : atomWeight(a);
      if (w <= 0) continue;
      energy[sid] += w;
      contrib[sid].set(sid, (contrib[sid].get(sid) ?? 0) + w);
    }

    // Propagate
    for (let step = 0; step < steps; step++) {
      const nextE: Record<string, number> = Object.fromEntries(nodeIds.map((id) => [id, 0]));
      const nextC: Record<string, Map<string, number>> = Object.fromEntries(nodeIds.map((id) => [id, new Map()]));

      for (const u of nodeIds) {
        const E = Number(energy[u] ?? 0);
        if (!Number.isFinite(E) || E <= 0) continue;

        const uContrib = contrib[u];

        // Retain (inertia inside the propagation itself)
        const retained = E * decay;
        if (retained > 0) {
          nextE[u] += retained;
          mergeScaledTopK(nextC[u], uContrib, retained / E, topK);
        }

        // Spread the remaining mass
        const injected = E * (1 - decay);
        if (injected <= 0) continue;

        const outs = graph.out.get(u) || [];
        if (!outs.length) {
          // Sink: keep it on the node
          nextE[u] += injected;
          mergeScaledTopK(nextC[u], uContrib, injected / E, topK);
          continue;
        }

        const share = injected / outs.length;
        for (const v of outs) {
          if (!(v in nextE)) continue;
          nextE[v] += share;
          mergeScaledTopK(nextC[v], uContrib, share / E, topK);
          const key = `${u}→${v}`;
          edgeFlow[key] = (edgeFlow[key] ?? 0) + share;
        }
      }

      // Swap
      for (const id of nodeIds) {
        energy[id] = nextE[id] ?? 0;
        contrib[id] = nextC[id] ?? new Map();
      }
    }

    nodeEnergyByChannel[ch] = energy;
    edgeFlowByChannel[ch] = edgeFlow;

    const attr: Record<string, AtomEnergyAttribution> = {};
    for (const id of nodeIds) {
      attr[id] = topKArray(contrib[id], topK);
    }
    attributionByChannel[ch] = attr;
  }

  return {
    nodeEnergyByChannel: nodeEnergyByChannel as any,
    edgeFlowByChannel: edgeFlowByChannel as any,
    attributionByChannel: attributionByChannel as any,
  };
}
