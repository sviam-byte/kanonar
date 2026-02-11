import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';

import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';
import { layoutWithDagre } from '../../lib/graph/layout';

type Props = {
  atom: ContextAtom;
  allAtoms: ContextAtom[];
  depth?: number; // 1..4
  maxNodes?: number; // safety guard
  onJumpToAtomId?: (id: string) => void;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function nsColor(ns: string) {
  if (ns === 'ctx') return 'rgba(250,204,21,0.10)';
  if (ns === 'drv') return 'rgba(249,115,22,0.10)';
  if (ns === 'goal') return 'rgba(34,197,94,0.10)';
  if (ns === 'util') return 'rgba(45,212,191,0.10)';
  if (ns === 'action') return 'rgba(244,114,182,0.10)';
  if (ns === 'emo') return 'rgba(168,85,247,0.10)';
  return 'rgba(148,163,184,0.08)';
}

export const AtomDependencyGraph: React.FC<Props> = ({ atom, allAtoms, depth = 2, maxNodes = 80, onJumpToAtomId }) => {
  const byId = useMemo(() => new Map(arr(allAtoms).map((a) => [String((a as any)?.id || ''), a])), [allAtoms]);

  const graph = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const seen = new Set<string>();

    const pushNode = (id: string) => {
      if (!id || seen.has(id)) return;
      if (nodes.length >= maxNodes) return;
      seen.add(id);

      const a = byId.get(id);
      const ns = String((a as any)?.ns ?? '').trim();
      const mag = a ? clamp01(Number((a as any)?.magnitude ?? 0)) : 0;

      nodes.push({
        id,
        type: 'default',
        position: { x: 0, y: 0 },
        data: { label: `${id}\n${a ? `m=${mag.toFixed(2)}` : 'missing'}` },
        style: {
          width: 320,
          borderRadius: 14,
          padding: 10,
          border: `1px solid rgba(148,163,184,${a ? 0.30 : 0.15})`,
          background: a ? nsColor(ns) : 'rgba(148,163,184,0.04)',
          color: '#e2e8f0',
          fontSize: 10,
          fontWeight: 700,
          whiteSpace: 'pre-line',
        },
      });
    };

    const walk = (id: string, d: number) => {
      pushNode(id);
      if (d <= 0) return;

      const a = byId.get(id);
      const used = arr((a as any)?.trace?.usedAtomIds).map(String).filter(Boolean);

      for (const u of used) {
        pushNode(u);
        edges.push({
          id: `${u}→${id}`,
          source: u,
          target: id,
          type: 'smoothstep',
          style: { stroke: 'rgba(148,163,184,0.35)' },
        });

        walk(u, d - 1);
        if (nodes.length >= maxNodes) return;
      }
    };

    walk(String((atom as any)?.id || ''), Math.max(1, Math.min(4, depth)));
    return layoutWithDagre(nodes, edges, {
      direction: 'LR',
      nodeWidth: 320,
      nodeHeight: 70,
      rankSep: 140,
      nodeSep: 30,
    });
  }, [atom, byId, depth, maxNodes]);

  return (
    <div className="h-[520px] border border-white/10 rounded-xl overflow-hidden bg-black/20">
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        fitView
        className="bg-canon-bg"
        onNodeClick={(_, n) => onJumpToAtomId?.(String(n.id))}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};
