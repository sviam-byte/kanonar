
// lib/context/overrides/types.ts
import { ContextAtom } from '../v2/types';

export type AtomOverrideOp =
  | { op: 'upsert'; atom: ContextAtom }
  | { op: 'delete'; id: string };

export type AtomOverrideLayer = {
  layerId: string;        // e.g. "goal-lab"
  updatedAt: number;      // Date.now()
  ops: AtomOverrideOp[];
};

export type ApplyOverridesResult = {
  atoms: ContextAtom[];
  deletedIds: Set<string>;
  upsertedIds: Set<string>;
};

export function applyAtomOverrides(base: ContextAtom[], layer?: AtomOverrideLayer | null): ApplyOverridesResult {
  const deletedIds = new Set<string>();
  const upsertedIds = new Set<string>();

  // 1) Index base atoms
  const map = new Map<string, ContextAtom>();
  for (const a of base) map.set(a.id, a);

  if (!layer || !Array.isArray(layer.ops) || layer.ops.length === 0) {
    return { atoms: Array.from(map.values()), deletedIds, upsertedIds };
  }

  // 2) Apply ops in order
  for (const op of layer.ops) {
    if (op.op === 'delete') {
      deletedIds.add(op.id);
      map.delete(op.id);
    } else if (op.op === 'upsert') {
      const atom = op.atom;
      if (!atom?.id) continue;
      upsertedIds.add(atom.id);
      deletedIds.delete(atom.id);
      map.set(atom.id, atom);
    }
  }

  return { atoms: Array.from(map.values()), deletedIds, upsertedIds };
}
