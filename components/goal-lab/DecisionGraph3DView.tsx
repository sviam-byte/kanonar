import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';

// Keep 3D deps out of the initial bundle.
const ForceGraph3D = React.lazy(() => import('react-force-graph-3d'));

type RFNode = {
  id: string;
  type?: string;
  position?: { x?: number; y?: number };
  data?: any;
};

type RFEdge = {
  id: string;
  source: string;
  target: string;
  data?: any;
};

export type Decision3DNodeKind = 'atom' | 'lens' | 'goal' | 'action' | 'aux';
export type Decision3DLinkKind = 'contrib' | 'flow';

export type Decision3DNode = {
  id: string;
  kind: Decision3DNodeKind;
  label: string;
  value: number;
  energy: number;
  importance: number;
  x?: number;
  y?: number;
  z?: number;
};

export type Decision3DLink = {
  id: string;
  source: string;
  target: string;
  kind: Decision3DLinkKind;
  weight: number;
  flow: number;
};

type GraphData = {
  nodes: Decision3DNode[];
  links: Decision3DLink[];
};

function clamp01(x: number): number {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function inferKindFromReactFlowType(t?: string): Decision3DNodeKind {
  const s = String(t || '').toLowerCase();
  if (s === 'source') return 'atom';
  if (s === 'lens') return 'lens';
  if (s === 'goal') return 'goal';
  if (s === 'action') return 'action';
  return 'aux';
}

function zForKind(kind: Decision3DNodeKind): number {
  // Layering axis: atom → lens → goal → action.
  switch (kind) {
    case 'atom':
      return 0;
    case 'lens':
      return 140;
    case 'goal':
      return 280;
    case 'action':
      return 420;
    default:
      return 210;
  }
}

function build3DGraph(nodes: RFNode[], edges: RFEdge[]): GraphData {
  const outNodes: Decision3DNode[] = nodes.map((n) => {
    const kind = inferKindFromReactFlowType(n.type);
    const label = String(n.data?.label ?? n.id);
    const value = Number(n.data?.value ?? 0);
    const energy = Number(n.data?.energy ?? 0);
    const importance = Number(n.data?.importance ?? 0);

    // Use the 2D embedding as stable initial coords.
    const x = Number(n.position?.x ?? 0);
    const y = Number(n.position?.y ?? 0);
    const z = zForKind(kind);

    return {
      id: String(n.id),
      kind,
      label,
      value: Number.isFinite(value) ? value : 0,
      energy: Number.isFinite(energy) ? energy : 0,
      importance: Number.isFinite(importance) ? importance : 0,
      x,
      y,
      z,
    };
  });

  const outLinks: Decision3DLink[] = edges.map((e) => {
    const weight = Number(e.data?.rawWeight ?? e.data?.weight ?? 0);

    // DecisionGraphView stores signed flow in edge.data.label (string), e.g. "+0.12".
    const label = String(e.data?.label ?? '0');
    const parsed = Number.parseFloat(label);
    const signedFlow = Number.isFinite(parsed) ? parsed : 0;

    // Direction semantics:
    // If flow < 0, reverse direction for particles; store flow as abs(flow).
    const src = String(e.source);
    const tgt = String(e.target);
    const source = signedFlow < 0 ? tgt : src;
    const target = signedFlow < 0 ? src : tgt;
    const flow = Math.abs(signedFlow);

    return {
      id: String(e.id),
      source,
      target,
      kind: 'contrib',
      weight: Number.isFinite(weight) ? weight : 0,
      flow,
    };
  });

  return { nodes: outNodes, links: outLinks };
}

function bfsSubgraph(nodeIds: Set<string>, links: Decision3DLink[], startId: string, hops: number): Set<string> {
  if (!nodeIds.has(startId)) return new Set();
  const visited = new Set<string>();
  const q: Array<{ id: string; d: number }> = [{ id: startId, d: 0 }];
  visited.add(startId);

  const adj = new Map<string, string[]>();
  for (const l of links) {
    if (!adj.has(l.source)) adj.set(l.source, []);
    if (!adj.has(l.target)) adj.set(l.target, []);
    adj.get(l.source)!.push(l.target);
    adj.get(l.target)!.push(l.source);
  }

  while (q.length) {
    const cur = q.shift()!;
    if (cur.d >= hops) continue;
    for (const nxt of adj.get(cur.id) || []) {
      if (!nodeIds.has(nxt)) continue;
      if (visited.has(nxt)) continue;
      visited.add(nxt);
      q.push({ id: nxt, d: cur.d + 1 });
    }
  }
  return visited;
}

type ViewMode = 'overview' | 'focus';

type Props = {
  nodes: RFNode[];
  edges: RFEdge[];
  initialFocusId?: string | null;
  onPickNode?: (id: string) => void;
};

export const DecisionGraph3DView: React.FC<Props> = ({ nodes, edges, initialFocusId, onPickNode }) => {
  const fgRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  const [selectedId, setSelectedId] = useState<string | null>(initialFocusId ?? null);
  const [viewMode, setViewMode] = useState<ViewMode>('focus');
  const [hops, setHops] = useState(2);

  const [minAbsWeight, setMinAbsWeight] = useState(0.15);
  const [minAbsFlow, setMinAbsFlow] = useState(0.08);
  const [showContrib, setShowContrib] = useState(false);
  const [showFlow, setShowFlow] = useState(true);
  const [capLinks, setCapLinks] = useState(600);

  /**
   * Preset to highlight the spread flow quickly.
   * Keeps only flows, relaxes filters, and focuses the subgraph view.
   */
  const applyFlowPreset = () => {
    setShowContrib(false);
    setShowFlow(true);
    setMinAbsWeight(0);
    setMinAbsFlow(0.08);
    setCapLinks(600);
    setViewMode('focus');
    setHops(2);
  };

  const base = useMemo(() => build3DGraph(nodes, edges), [nodes, edges]);
  const selected = selectedId ? base.nodes.find((n) => n.id === selectedId) : null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      // Fallback: keep the default size when ResizeObserver is not available.
      return;
    }
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.max(320, Math.floor(r.width));
      const h = Math.max(240, Math.floor(r.height));
      setSize({ w, h });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: Math.max(320, Math.floor(r.width)), h: Math.max(240, Math.floor(r.height)) });
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const nodeIdSet = new Set(base.nodes.map((n) => n.id));

    const linkPass = (l: Decision3DLink) => {
      const wOk = Math.abs(l.weight) >= minAbsWeight;
      const fOk = Math.abs(l.flow) >= minAbsFlow;
      return (showContrib && wOk) || (showFlow && fOk);
    };

    let links = base.links.filter(linkPass);

    // Link cap: keep the strongest edges to avoid 3D spaghetti.
    if (Number.isFinite(capLinks) && capLinks > 0 && links.length > capLinks) {
      links = [...links]
        .sort((a, b) => {
          const sa = Math.max(Math.abs(a.weight), Math.abs(a.flow));
          const sb = Math.max(Math.abs(b.weight), Math.abs(b.flow));
          return sb - sa;
        })
        .slice(0, capLinks);
    }

    let keepIds: Set<string>;
    if (viewMode === 'focus' && selectedId && nodeIdSet.has(selectedId)) {
      keepIds = bfsSubgraph(nodeIdSet, links, selectedId, Math.max(1, Math.min(4, hops)));
    } else {
      keepIds = nodeIdSet;
    }

    // Keep nodes stable: never drop nodes just because links were filtered out.
    // In focus mode we only restrict LINKS (to reduce clutter), but keep all nodes visible.
    const nodesOut = base.nodes;
    const linksOut =
      viewMode === 'focus' && selectedId && nodeIdSet.has(selectedId)
        ? links.filter((l) => keepIds.has(l.source) && keepIds.has(l.target))
        : links;

    return { nodes: nodesOut, links: linksOut };
  }, [base, viewMode, selectedId, hops, minAbsWeight, minAbsFlow, showContrib, showFlow, capLinks]);

  // zoomToFit is triggered only manually or when the engine settles.

  // Visual encoding:
  // - node size: importance + |energy|
  // - link width: |weight|
  // - particles: |flow|
  const linkWidth = (l: Decision3DLink) => {
    const w = Math.abs(Number(l.weight) || 0);
    return Math.max(0.3, Math.min(6, 0.3 + w * 5));
  };

  const linkColor = (l: Decision3DLink) =>
    l.weight >= 0 ? 'rgba(34,197,94,0.70)' : 'rgba(239,68,68,0.70)';
  const particleCount = (l: Decision3DLink) => {
    const f = Math.abs(Number(l.flow) || 0);
    if (!showFlow) return 0;
    if (f < minAbsFlow) return 0;
    return Math.min(10, Math.ceil(f * 10));
  };

  const nodeVal = (n: Decision3DNode) => {
    const imp = clamp01(n.importance);
    const e = Math.abs(Number(n.energy) || 0);
    return 2 + imp * 6 + Math.min(6, e * 4);
  };

  const nodeColor = (n: Decision3DNode) => {
    switch (n.kind) {
      case 'atom':
        return 'rgba(56,189,248,0.92)';
      case 'lens':
        return 'rgba(217,70,239,0.92)';
      case 'goal':
        return 'rgba(226,232,240,0.94)';
      case 'action':
        return 'rgba(245,158,11,0.94)';
      default:
        return 'rgba(148,163,184,0.78)';
    }
  };

  return (
    <div ref={wrapRef} className="h-full w-full min-h-0 relative bg-black overflow-hidden">
      {/* Legend */}
      <div className="absolute z-10 left-2 top-2 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-200 max-w-[460px]">
        <div className="font-semibold">3D Decision Graph</div>
        <div className="opacity-80">
          Z-слои: atom → lens → goal → action. Толщина ребра = |weight| (вклад). Частицы = |flow|
          (spread).
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
          <span className="px-2 py-0.5 rounded border border-slate-700/60">atom</span>
          <span className="px-2 py-0.5 rounded border border-slate-700/60">lens</span>
          <span className="px-2 py-0.5 rounded border border-slate-700/60">goal</span>
          <span className="px-2 py-0.5 rounded border border-slate-700/60">action</span>
          <span className="px-2 py-0.5 rounded border border-slate-700/60">зел/красн = знак weight</span>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute z-10 left-2 bottom-2 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-200 max-w-[520px]">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="opacity-80">mode</span>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className="bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[11px]"
            >
              <option value="focus">focus</option>
              <option value="overview">overview</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="opacity-80">hops</span>
            <input
              type="number"
              min={1}
              max={4}
              value={hops}
              onChange={(e) => setHops(Math.max(1, Math.min(4, Number(e.target.value) || 2)))}
              className="w-12 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[11px] font-mono"
              disabled={viewMode !== 'focus'}
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="opacity-80">|w|≥</span>
            <input
              type="number"
              min={0}
              max={5}
              step={0.05}
              value={minAbsWeight}
              onChange={(e) => setMinAbsWeight(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[11px] font-mono"
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="opacity-80">|f|≥</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={minAbsFlow}
              onChange={(e) => setMinAbsFlow(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[11px] font-mono"
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="opacity-80">cap</span>
            <input
              type="number"
              min={50}
              max={5000}
              step={50}
              value={capLinks}
              onChange={(e) =>
                setCapLinks(Math.max(50, Math.min(5000, Number(e.target.value) || 800)))
              }
              className="w-16 bg-black/25 border border-slate-700/60 rounded px-2 py-0.5 text-[11px] font-mono"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showContrib}
              onChange={(e) => setShowContrib(e.target.checked)}
              className="accent-cyan-400"
            />
            <span className="opacity-80">contrib</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showFlow}
              onChange={(e) => setShowFlow(e.target.checked)}
              className="accent-cyan-400"
            />
            <span className="opacity-80">flow</span>
          </label>

          <button
            className="ml-auto px-2 py-0.5 rounded border border-slate-700/60 hover:bg-white/10"
            onClick={applyFlowPreset}
          >
            flow preset
          </button>
        </div>
      </div>

      {/* Inspector */}
      {selected ? (
        <div className="absolute z-10 right-2 top-2 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-200 max-w-[420px]">
          <div className="font-semibold truncate">{selected.label}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 opacity-90">
            <div>id</div>
            <div className="text-right font-mono truncate">{selected.id}</div>
            <div>kind</div>
            <div className="text-right font-mono">{selected.kind}</div>
            <div>value</div>
            <div className="text-right font-mono">{Number(selected.value).toFixed(3)}</div>
            <div>energy</div>
            <div className="text-right font-mono">{Number(selected.energy).toFixed(3)}</div>
            <div>importance</div>
            <div className="text-right font-mono">{Number(selected.importance).toFixed(3)}</div>
          </div>
        </div>
      ) : null}

      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center text-slate-300 text-sm">
            Loading 3D…
          </div>
        }
      >
        <ForceGraph3D
          ref={fgRef}
          graphData={filtered as any}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,1)"
          showNavInfo={false}
          nodeLabel={(n: any) => `${n.label} (${n.kind})`}
          linkLabel={(l: any) =>
            `weight=${Number(l.weight).toFixed(3)} | flow=${Number(l.flow).toFixed(3)} | ${l.source} → ${l.target}`
          }
          nodeVal={(n: any) => nodeVal(n)}
          nodeColor={(n: any) => nodeColor(n)}
          linkWidth={(l: any) => linkWidth(l)}
          linkColor={(l: any) => linkColor(l)}
          linkDirectionalParticles={(l: any) => particleCount(l)}
          linkDirectionalParticleWidth={(l: any) => Math.max(0.5, Math.min(3, Math.abs(l.flow) * 2))}
          linkDirectionalParticleSpeed={(l: any) =>
            Math.max(0.002, Math.min(0.03, Math.abs(l.flow) * 0.02))
          }
          enableNodeDrag={false}
          onNodeClick={(n: any) => {
            const id = String(n.id);
            setSelectedId(id);
            onPickNode?.(id);
          }}
          onEngineStop={() => {
            const api = fgRef.current;
            if (!api) return;
            try {
              api.zoomToFit?.(400, 60);
            } catch {
              // ignore
            }
          }}
        />
      </Suspense>
    </div>
  );
};
