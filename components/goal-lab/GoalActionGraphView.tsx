import React, { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';

import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';
import { layoutWithDagre } from '../../lib/graph/layout';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmt2(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function edgeVisual(w: number) {
  const abs = Math.min(1, Math.abs(w));
  const strokeWidth = 1 + abs * 5;
  const stroke = w >= 0 ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';
  return {
    style: { stroke, strokeWidth, opacity: Math.max(0.25, abs) },
    labelStyle: { fill: stroke, fontSize: 10, opacity: Math.max(0.35, abs) },
    animated: abs > 0.35,
  };
}

type Props = {
  atoms: ContextAtom[];
  decision: any;
  selfId: string;
  onJumpToAtomId?: (id: string) => void;
};

// Goal: graph only from current decision snapshot (no static catalog graph).
export const GoalActionGraphView: React.FC<Props> = ({ atoms, decision, selfId, onJumpToAtomId }) => {
  const [maxGoals, setMaxGoals] = useState(8);
  const [maxActions, setMaxActions] = useState(8);
  const [minAbsEdge, setMinAbsEdge] = useState(0.02);

  const goalEnergy = useMemo(() => {
    const out: Record<string, number> = {};
    const pref = `util:activeGoal:${selfId}:`;

    for (const a of arr(atoms)) {
      const id = String((a as any)?.id || '');
      if (!id.startsWith(pref)) continue;
      const goalId = id.slice(pref.length);
      out[goalId] = clamp01(Number((a as any)?.magnitude ?? 0));
    }
    if (Object.keys(out).length) return out;

    // Fallback: goal:domain:*:<selfId> for mixed / legacy snapshots.
    for (const a of arr(atoms)) {
      const id = String((a as any)?.id || '');
      if (!id.startsWith('goal:domain:')) continue;
      const parts = id.split(':');
      const domain = parts[2];
      const owner = parts[3];
      if (owner !== selfId || !domain) continue;
      out[domain] = clamp01(Number((a as any)?.magnitude ?? 0));
    }
    return out;
  }, [atoms, selfId]);

  const ranked = useMemo(() => {
    const r = arr(decision?.ranked);
    // New format: [{ action, q }]
    if (r.length && r[0]?.action) return r as any[];
    // Old format: ActionCandidate[] (q may be missing)
    if (r.length && r[0]?.id) return r.map((a: any) => ({ action: a, q: Number(a?.q ?? a?.score ?? 0) }));
    return [];
  }, [decision]);

  const bestId = String(decision?.best?.id || decision?.best?.action?.id || '');

  const graph = useMemo(() => {
    const goals = Object.entries(goalEnergy)
      .map(([goalId, E]) => ({ goalId, E: clamp01(Number(E)) }))
      .sort((a, b) => b.E - a.E)
      .slice(0, Math.max(3, maxGoals));

    const actions = ranked
      .slice(0, Math.max(3, maxActions))
      .map((r: any) => ({ action: r.action, q: Number(r.q ?? 0) }));

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    for (const g of goals) {
      nodes.push({
        id: `g:${g.goalId}`,
        type: 'default',
        position: { x: 0, y: 0 },
        data: { label: `${g.goalId}\nE=${fmt2(g.E)}` },
        style: {
          width: 240,
          borderRadius: 14,
          padding: 10,
          border: '1px solid rgba(148,163,184,0.35)',
          background: 'rgba(15,23,42,0.85)',
          color: '#e2e8f0',
          fontSize: 11,
          fontWeight: 800,
          whiteSpace: 'pre-line',
        },
      });
    }

    for (const it of actions) {
      const a = it.action;
      const aid = String(a?.id || '');
      if (!aid) continue;
      const kind = String(a?.kind || 'action');
      const isBest = bestId && aid === bestId;

      nodes.push({
        id: `a:${aid}`,
        type: 'default',
        position: { x: 0, y: 0 },
        data: { label: `${kind}${a?.targetId ? ` → ${String(a.targetId)}` : ''}\nQ=${fmt2(it.q)}` },
        style: {
          width: 280,
          borderRadius: 14,
          padding: 10,
          border: `1px solid ${isBest ? 'rgba(56,189,248,0.75)' : 'rgba(148,163,184,0.35)'}`,
          background: isBest ? 'rgba(56,189,248,0.08)' : 'rgba(2,6,23,0.60)',
          color: '#e2e8f0',
          fontSize: 11,
          fontWeight: 800,
          whiteSpace: 'pre-line',
        },
      });

      const deltaGoals: Record<string, number> = (a?.deltaGoals || a?.why?.parts?.deltaGoals || {}) as any;

      const contribs = goals
        .map((g) => {
          const d = Number((deltaGoals as any)?.[g.goalId] ?? 0);
          const w = g.E * d;
          return { goalId: g.goalId, w };
        })
        .filter((x) => Math.abs(x.w) >= minAbsEdge)
        .sort((x, y) => Math.abs(y.w) - Math.abs(x.w))
        .slice(0, 6);

      for (const c of contribs) {
        const vis = edgeVisual(c.w);
        edges.push({
          id: `e:g:${c.goalId}->a:${aid}`,
          source: `g:${c.goalId}`,
          target: `a:${aid}`,
          type: 'smoothstep',
          label: `${c.w >= 0 ? '+' : ''}${fmt2(c.w)}`,
          style: vis.style,
          labelStyle: vis.labelStyle,
          animated: vis.animated,
        });
      }
    }

    return layoutWithDagre(nodes, edges, {
      direction: 'LR',
      nodeWidth: 260,
      nodeHeight: 70,
      rankSep: 160,
      nodeSep: 38,
    });
  }, [goalEnergy, ranked, maxGoals, maxActions, minAbsEdge, bestId]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-canon-border bg-canon-bg-light/20">
        <div className="text-[10px] text-canon-text-light">edge = E(goal) × Δ(goal|action) (signed)</div>
        <div className="flex items-center gap-3 text-[10px] text-canon-text-light">
          <label className="flex items-center gap-2">
            Goals
            <input
              className="w-14 bg-black/25 border border-canon-border rounded px-2 py-0.5"
              type="number"
              min={3}
              max={20}
              value={maxGoals}
              onChange={(e) => setMaxGoals(Math.max(3, Math.min(20, Number(e.target.value) || 8)))}
            />
          </label>
          <label className="flex items-center gap-2">
            Actions
            <input
              className="w-14 bg-black/25 border border-canon-border rounded px-2 py-0.5"
              type="number"
              min={3}
              max={20}
              value={maxActions}
              onChange={(e) => setMaxActions(Math.max(3, Math.min(20, Number(e.target.value) || 8)))}
            />
          </label>
          <label className="flex items-center gap-2">
            |edge| ≥
            <input
              className="w-16 bg-black/25 border border-canon-border rounded px-2 py-0.5"
              type="number"
              step={0.01}
              min={0}
              max={0.5}
              value={minAbsEdge}
              onChange={(e) => setMinAbsEdge(Math.max(0, Math.min(0.5, Number(e.target.value) || 0)))}
            />
          </label>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          fitView
          className="bg-canon-bg"
          onNodeClick={(_, n) => {
            if (!onJumpToAtomId) return;
            const id = String(n.id || '');
            if (id.startsWith('g:')) onJumpToAtomId(`util:activeGoal:${selfId}:${id.slice(2)}`);
            if (id.startsWith('a:')) onJumpToAtomId(`action:score:${selfId}:${id.slice(2)}`);
          }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};
