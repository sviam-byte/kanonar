import type { ContextAtom } from '../context/v2/types';

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function getAtom01(atoms: ContextAtom[], id: string, d = 0): number {
  const a = atoms.find(x => x?.id === id);
  const v = typeof a?.magnitude === 'number' ? a.magnitude : d;
  return clamp01(v);
}

export function upsertAtom(atoms: ContextAtom[], atom: ContextAtom): void {
  const i = atoms.findIndex(a => a?.id === atom.id);
  if (i >= 0) atoms[i] = atom;
  else atoms.push(atom);
}

export function mkTomCtxAtom(args: {
  id: string;
  selfId: string;
  otherId: string;
  magnitude: number;
  label: string;
  used: string[];
  parts?: Record<string, any>;
}): ContextAtom {
  return {
    id: args.id,
    ns: 'tom',
    kind: 'tom_dyad_ctx',
    origin: 'derived',
    source: 'tom',
    magnitude: clamp01(args.magnitude),
    confidence: 1,
    subject: args.selfId,
    object: args.otherId,
    tags: ['tom', 'dyad', 'ctx'],
    label: args.label,
    trace: {
      usedAtomIds: args.used,
      notes: ['context overlay'],
      parts: args.parts ?? {},
    },
  } as any;
}
