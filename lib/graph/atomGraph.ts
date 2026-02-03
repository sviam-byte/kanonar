import { ContextAtom } from '../context/v2/types';

export type AtomGraphNode = {
  id: string;
  ns?: string;
  kind?: string;
  label?: string;
};

export type AtomGraphEdge = {
  from: string;
  to: string;
};

export type AtomGraph = {
  nodes: AtomGraphNode[];
  edges: AtomGraphEdge[];
  byId: Map<string, AtomGraphNode>;
  out: Map<string, string[]>;
  into: Map<string, string[]>;
  missing: Set<string>;
  topo?: {
    ok: boolean;
    order?: string[];
    cycleSample?: string[];
  };
};

const uniqSorted = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();

/**
 * Build an atom-level dependency graph from `trace.usedAtomIds`.
 * This is the "real" causality DAG (or near-DAG, if something went wrong).
 */
export const buildAtomGraph = (
  atoms: ContextAtom[],
  opts?: { includeIsolated?: boolean; maxCycleSample?: number }
): AtomGraph => {
  const includeIsolated = opts?.includeIsolated ?? true;
  const maxCycleSample = Math.max(3, Math.min(64, opts?.maxCycleSample ?? 20));

  const byId = new Map<string, AtomGraphNode>();
  for (const a of atoms || []) {
    if (!a || !a.id) continue;
    byId.set(a.id, {
      id: a.id,
      ns: (a as any).ns,
      kind: (a as any).kind,
      label: (a as any).label,
    });
  }

  const out = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  const edges: AtomGraphEdge[] = [];
  const missing = new Set<string>();

  const pushEdge = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    edges.push({ from, to });
    if (!out.has(from)) out.set(from, []);
    out.get(from)!.push(to);
    if (!into.has(to)) into.set(to, []);
    into.get(to)!.push(from);
  };

  for (const a of atoms || []) {
    const tr = (a as any)?.trace;
    const used = Array.isArray(tr?.usedAtomIds) ? tr.usedAtomIds.map(String) : [];
    const usedIds = uniqSorted(used);

    for (const u of usedIds) {
      if (!byId.has(u)) missing.add(u);
      pushEdge(u, a.id);
    }
  }

  // De-dup adjacency lists
  for (const [k, v] of out.entries()) out.set(k, uniqSorted(v));
  for (const [k, v] of into.entries()) into.set(k, uniqSorted(v));

  // Optionally drop isolated nodes (nodes with no in/out edges)
  let nodes: AtomGraphNode[] = [];
  if (includeIsolated) {
    nodes = Array.from(byId.values());
  } else {
    const used = new Set<string>();
    for (const e of edges) {
      used.add(e.from);
      used.add(e.to);
    }
    nodes = Array.from(byId.values()).filter(n => used.has(n.id));
  }

  const topo = topoSortWithCycleSample(nodes.map(n => n.id), out, into, maxCycleSample);

  return { nodes, edges, byId, out, into, missing, topo };
};

const topoSortWithCycleSample = (
  nodeIds: string[],
  out: Map<string, string[]>,
  into: Map<string, string[]>,
  maxSample: number
): { ok: boolean; order?: string[]; cycleSample?: string[] } => {
  const indeg = new Map<string, number>();
  for (const id of nodeIds) indeg.set(id, 0);

  for (const [to, ins] of into.entries()) {
    if (!indeg.has(to)) continue;
    indeg.set(to, ins.length);
  }

  const q: string[] = [];
  for (const [id, d] of indeg.entries()) if (d === 0) q.push(id);

  const order: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    const outs = out.get(id) || [];
    for (const to of outs) {
      if (!indeg.has(to)) continue;
      const nd = (indeg.get(to) || 0) - 1;
      indeg.set(to, nd);
      if (nd === 0) q.push(to);
    }
  }

  if (order.length === nodeIds.length) return { ok: true, order };

  // Cycle exists: sample remaining nodes with indeg>0
  const cyc: string[] = [];
  for (const [id, d] of indeg.entries()) {
    if (d > 0) {
      cyc.push(id);
      if (cyc.length >= maxSample) break;
    }
  }
  return { ok: false, order, cycleSample: cyc };
};

export const summarizeAtomGraph = (g: AtomGraph) => {
  const n = g.nodes.length;
  const m = g.edges.length;

  let maxOut = 0;
  let maxOutId: string | null = null;
  let maxIn = 0;
  let maxInId: string | null = null;

  for (const node of g.nodes) {
    const o = (g.out.get(node.id) || []).length;
    const i = (g.into.get(node.id) || []).length;
    if (o > maxOut) {
      maxOut = o;
      maxOutId = node.id;
    }
    if (i > maxIn) {
      maxIn = i;
      maxInId = node.id;
    }
  }

  return {
    nodes: n,
    edges: m,
    missingRefs: g.missing.size,
    topoOk: g.topo?.ok ?? true,
    cycleSample: g.topo?.ok ? [] : g.topo?.cycleSample || [],
    maxOut,
    maxOutId,
    maxIn,
    maxInId,
  };
};
