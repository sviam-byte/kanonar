import type { ContextAtom } from '../context/v2/types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (v: any, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export type PreGoals = Record<string, number>;

export function atomizePreGoals(selfId: string, pre?: PreGoals | null): ContextAtom[] {
  if (!pre) return [];
  const out: ContextAtom[] = [];
  for (const [k, raw] of Object.entries(pre)) {
    const v = clamp01(num(raw, 0));
    out.push({
      id: `goal:pre:${selfId}:${k}`,
      ns: 'goal',
      kind: 'pre_goal',
      origin: 'manual',
      source: 'pre_goal',
      magnitude: v,
      confidence: 1,
      subject: selfId,
      tags: ['goal', 'pre'],
      label: `pre.${k}=${Math.round(v * 100)}%`,
      trace: { usedAtomIds: [], notes: ['from GoalLab pre-goals UI'], parts: { key: k } },
    } as any);
  }
  return out;
}

export function readPreGoal01(atoms: ContextAtom[] | undefined, selfId: string, key: string, d = 0): number {
  if (!atoms?.length) return d;
  const id = `goal:pre:${selfId}:${key}`;
  const a = atoms.find(x => String(x?.id) === id);
  const v = typeof a?.magnitude === 'number' && Number.isFinite(a.magnitude) ? a.magnitude : d;
  return clamp01(v);
}
