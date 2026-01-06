// lib/orchestrator/registry.ts
// Deterministic producer registry ordering.

import type { ProducerSpec } from './types';

export function buildRegistry(specs: ProducerSpec[]) {
  const list = [...specs];
  // stable deterministic ordering: stageId, priority desc, name
  list.sort((a, b) => {
    const sa = a.stageId.localeCompare(b.stageId);
    if (sa !== 0) return sa;
    const pa = (b.priority ?? 0) - (a.priority ?? 0);
    if (pa !== 0) return pa;
    return a.name.localeCompare(b.name);
  });
  return list;
}
