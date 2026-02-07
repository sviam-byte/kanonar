import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import { arr } from '@/lib/utils/arr';

import { mockWorld } from './fixtures';

function stageAtoms(p: any, stage: string) {
  const st = arr(p?.stages).find((s: any) => String(s?.stage) === String(stage));
  return arr(st?.atoms);
}

function ids(xs: Array<{ id: string }>): string[] {
  return arr(xs).map(x => String(x.id));
}

function hasCycle(nodes: string[], edges: Array<[string, string]>): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  }

  const color = new Map<string, 0 | 1 | 2>();
  for (const n of nodes) color.set(n, 0);

  const dfs = (u: string): boolean => {
    const c = color.get(u) ?? 0;
    if (c === 1) return true;
    if (c === 2) return false;
    color.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      if (dfs(v)) return true;
    }
    color.set(u, 2);
    return false;
  };

  for (const n of nodes) {
    if ((color.get(n) ?? 0) === 0) {
      if (dfs(n)) return true;
    }
  }
  return false;
}

function findCycle(nodes: string[], edges: Array<[string, string]>): string[] | null {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  }

  const stack: string[] = [];
  const onStack = new Set<string>();
  const visited = new Set<string>();

  const dfs = (u: string): string[] | null => {
    visited.add(u);
    stack.push(u);
    onStack.add(u);
    for (const v of adj.get(u) ?? []) {
      if (!visited.has(v)) {
        const found = dfs(v);
        if (found) return found;
      } else if (onStack.has(v)) {
        const idx = stack.indexOf(v);
        return idx >= 0 ? [...stack.slice(idx), v] : [v, u, v];
      }
    }
    stack.pop();
    onStack.delete(u);
    return null;
  };

  for (const n of nodes) {
    if (!visited.has(n)) {
      const found = dfs(n);
      if (found) return found;
    }
  }
  return null;
}

describe('Pipeline: Stage isolation invariants', () => {
  it('S0 atoms must not have ctx:* namespace', () => {
    const p = runGoalLabPipelineV1({ world: mockWorld(), agentId: 'A', participantIds: ['A'] });
    const s0 = stageAtoms(p, 'S0');
    const ctxAtoms = s0.filter(a => String(a.id).startsWith('ctx:'));
    expect(ctxAtoms.length).toBe(0);
  });

  it('S2 must create ctx:* but not ctx:final:*', () => {
    const p = runGoalLabPipelineV1({ world: mockWorld(), agentId: 'A', participantIds: ['A'] });
    const s2 = stageAtoms(p, 'S2');
    const ctxBase = s2.filter(a => String(a.id).startsWith('ctx:') && !String(a.id).includes(':final:'));
    const ctxFinal = s2.filter(a => String(a.id).includes('ctx:final:'));
    expect(ctxBase.length).toBeGreaterThan(0);
    expect(ctxFinal.length).toBe(0);
  });

  it('S3 must create ctx:final:* from ctx:* (trace must reference base)', () => {
    const p = runGoalLabPipelineV1({ world: mockWorld(), agentId: 'A', participantIds: ['A'] });
    const s3 = stageAtoms(p, 'S3');
    const finalDanger = s3.find(a => String(a.id).includes('ctx:final:danger:A'));
    expect(finalDanger).toBeDefined();

    const used = arr((finalDanger as any)?.trace?.usedAtomIds).map(String);
    expect(used.some((id) => id.startsWith('ctx:danger:'))).toBe(true);
  });

  it('S7 goal atoms must use ctx:final:* (not ctx:* without final)', () => {
    const p = runGoalLabPipelineV1({ world: mockWorld(), agentId: 'A', participantIds: ['A'] });
    const s7 = stageAtoms(p, 'S7');
    const goals = s7.filter(a => String(a.id).startsWith('goal:'));
    expect(goals.length).toBeGreaterThan(0);

    for (const g of goals) {
      const used = arr((g as any)?.trace?.usedAtomIds).map(String);
      const hasCtxWithoutFinal = used.some((id) =>
        id.startsWith('ctx:') &&
        !id.includes(':final:') &&
        !id.startsWith('ctx:prio:') &&
        !id.includes(':base:')
      );
      expect(hasCtxWithoutFinal).toBe(false);
    }
  });

  it('S8 action atoms must use util:* not goal:* (goal isolation)', () => {
    const p = runGoalLabPipelineV1({ world: mockWorld(), agentId: 'A', participantIds: ['A'] });
    const s8 = stageAtoms(p, 'S8');
    const actions = s8.filter(a => String(a.id).startsWith('action:'));
    expect(actions.length).toBeGreaterThan(0);

    for (const a of actions) {
      const used = arr((a as any)?.trace?.usedAtomIds).map(String);
      expect(used.some((id) => id.startsWith('goal:'))).toBe(false);
    }
  });

  it('Within-stage trace subgraph must be acyclic', () => {
    const p = runGoalLabPipelineV1({ world: mockWorld(), agentId: 'A', participantIds: ['A'] });
    for (const st of arr(p?.stages)) {
      const atoms = arr(st?.atoms).filter((a) => {
        const id = String((a as any)?.id ?? '');
        return id.startsWith('goal:') || id.startsWith('action:') || id.startsWith('util:');
      });
      const nodeIds = ids(atoms);
      if (nodeIds.length < 2) continue;
      const set = new Set(nodeIds);
      const edges: Array<[string, string]> = [];
      for (const a of atoms) {
        const used = arr((a as any)?.trace?.usedAtomIds).map(String);
        for (const u of used) {
          if (set.has(u)) edges.push([String(a.id), u]);
        }
      }
      const cycle = findCycle(nodeIds, edges);
      expect(cycle).toBeNull();
    }
  });
});
