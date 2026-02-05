import React, { Suspense, useMemo, useRef, useState } from 'react';

// NOTE: Isolated component so non-3D modes keep dependency surface small.
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
  // Layering axis.
  switch (kind) {
    case 'atom':
      return 0;
    case 'lens':
      return 120;
    case 'goal':
      return 240;
    case 'action':
      return 360;
    default:
      return 180;
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

    // In DecisionGraphView we store spread flow in edge.data.label as signed decimal string.
    // Example: "+0.12" or "-0.07".
    const label = String(e.data?.label ?? '0');
    const parsed = Number.parseFloat(label);
    const f = Number.isFinite(parsed) ? parsed : 0;

    return {
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      kind: 'contrib',
      weight: Number.isFinite(weight) ? weight : 0,
      flow: f,
    };
  });

  return { nodes: outNodes, links: outLinks };
}

type Props = {
  nodes: RFNode[];
  edges: RFEdge[];
  onPickNode?: (id: string) => void;
};

export const DecisionGraph3DView: React.FC<Props> = ({ nodes, edges, onPickNode }) => {
  const fgRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = useMemo(() => build3DGraph(nodes, edges), [nodes, edges]);
  const selected = selectedId ? data.nodes.find((n) => n.id === selectedId) : null;

  // Encoding:
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
    if (f <= 0.05) return 0;
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
        return 'rgba(56,189,248,0.90)';
      case 'lens':
        return 'rgba(217,70,239,0.90)';
      case 'goal':
        return 'rgba(226,232,240,0.92)';
      case 'action':
        return 'rgba(245,158,11,0.92)';
      default:
        return 'rgba(148,163,184,0.75)';
    }
  };

  return (
    <div className="h-full min-h-0 relative bg-black">
      <div className="absolute z-10 left-2 top-2 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-200 max-w-[420px]">
        <div className="font-semibold">3D Decision Graph</div>
        <div className="opacity-80">
          Узлы по слоям (Z): atom/lens/goal/action. Рёбра: толщина=|weight|, частицы=|flow|.
        </div>
      </div>

      {selected ? (
        <div className="absolute z-10 right-2 top-2 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-200 max-w-[420px]">
          <div className="font-semibold truncate">{selected.label}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 opacity-90">
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
          graphData={data as any}
          backgroundColor="rgba(0,0,0,1)"
          showNavInfo={false}
          nodeLabel={(n: any) => `${n.label} (${n.kind})`}
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
            // Center camera once the layout settles.
            const api = fgRef.current;
            if (!api) return;
            try {
              api.zoomToFit?.(400, 40);
            } catch {
              // ignore
            }
          }}
        />
      </Suspense>
    </div>
  );
};

