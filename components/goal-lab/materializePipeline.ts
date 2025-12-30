type PipelineStageDelta = {
  id: string;
  label: string;
  baseId?: string;
  atomCount: number;
  full?: any[];
  added?: any[];
  changed?: any[];
  removedIds?: string[];
  notes?: string[];
};

export function materializeStageAtoms(
  pipeline: PipelineStageDelta[],
  stageId: string
): any[] {
  if (!pipeline?.length) return [];

  const byId = new Map(pipeline.map(s => [s.id, s]));
  const target = byId.get(stageId);
  if (!target) return [];

  let s0: PipelineStageDelta | undefined = pipeline.find(s => Array.isArray(s.full));
  if (!s0) return [];

  const chain: PipelineStageDelta[] = [];
  const visited = new Set<string>();

  let cur: PipelineStageDelta | undefined = target;
  while (cur) {
    if (visited.has(cur.id)) break;
    visited.add(cur.id);
    chain.push(cur);
    if (cur.id === s0.id) break;
    cur = cur.baseId ? byId.get(cur.baseId) : undefined;
  }
  chain.reverse();

  const m = new Map<string, any>((s0.full || []).map((a: any) => [String(a.id), a]));

  for (const st of chain) {
    if (st.id === s0.id) continue;

    for (const rid of st.removedIds || []) m.delete(String(rid));
    for (const a of st.added || []) m.set(String(a.id), a);
    for (const a of st.changed || []) m.set(String(a.id), a);
  }

  return Array.from(m.values());
}
