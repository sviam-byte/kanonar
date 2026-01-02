import type { ContextAtom } from '../v2/types';

type Violation = { level: 'error' | 'warn'; msg: string; atomId?: string };

function isDerived(a: any): boolean {
  return String(a?.origin) === 'derived';
}

export function validateAtomInvariants(atoms: ContextAtom[]): Violation[] {
  const v: Violation[] = [];
  const ids = new Set<string>();
  const byId = new Map<string, any>();

  for (const a of atoms as any[]) {
    const id = String(a?.id ?? '');
    if (!id) continue;
    if (ids.has(id)) v.push({ level: 'warn', msg: `Duplicate atom id (will be deduped): ${id}`, atomId: id });
    ids.add(id);
    byId.set(id, a);
  }

  for (const a of atoms as any[]) {
    const id = String(a?.id ?? '');
    if (!id) continue;

    const trace = a?.trace;
    const used: string[] = Array.isArray(trace?.usedAtomIds) ? trace.usedAtomIds.filter((x: any) => typeof x === 'string') : [];

    if (used.includes(id)) {
      v.push({ level: 'error', msg: `Atom depends on itself (usedAtomIds contains self): ${id}`, atomId: id });
    }

    if (isDerived(a)) {
      if (!Array.isArray(trace?.usedAtomIds) || used.length === 0) {
        v.push({ level: 'error', msg: `Derived atom missing usedAtomIds: ${id}`, atomId: id });
      }
      if (!trace || typeof trace !== 'object') {
        v.push({ level: 'error', msg: `Derived atom missing trace object: ${id}`, atomId: id });
      }
    }
  }

  // Optional: cycle detection on usedAtomIds graph (best-effort, only if refs exist)
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string, stack: string[]): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      v.push({ level: 'error', msg: `Cycle detected in trace graph: ${[...stack, id].join(' -> ')}`, atomId: id });
      return;
    }
    visiting.add(id);
    const a: any = byId.get(id);
    const used: string[] = Array.isArray(a?.trace?.usedAtomIds) ? a.trace.usedAtomIds : [];
    for (const u of used) {
      if (!byId.has(u)) continue; // external ref ok
      dfs(u, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of byId.keys()) dfs(id, []);

  return v;
}
