import type { ContextAtom } from '../v2/types';

export type QuarkIndexEntry = {
  // Chosen representative value for a quark code (0..1 or -1..1 depending on the code).
  v: number;
  // Confidence of the chosen representative.
  c: number;
  // Atom ids that contributed (kept for debug/explain).
  atomIds: string[];
};

export type QuarkIndex = Record<string, QuarkIndexEntry>;

/**
 * Build a lightweight quark index from atoms.
 * Rule: per quark code keep the atom with maximum (magnitude * confidence).
 * This is stable, deterministic, and matches typical "one atom per code" usage.
 */
export function buildQuarkIndex(atoms: ContextAtom[]): QuarkIndex {
  const idx: QuarkIndex = {};
  for (const a of atoms) {
    const code = (a as any)?.code;
    const id = (a as any)?.id;
    if (!code || typeof code !== 'string') continue;
    if (typeof id !== 'string' || !id) continue;
    const v = Number((a as any)?.magnitude ?? 0);
    const c = Number((a as any)?.confidence ?? 1);
    const score = v * c;

    const prev = idx[code];
    if (!prev) {
      idx[code] = { v, c, atomIds: [id] };
      continue;
    }
    const prevScore = prev.v * prev.c;
    // Keep the best representative; still accumulate ids for debug.
    prev.atomIds.push(id);
    if (score > prevScore) {
      idx[code] = { v, c, atomIds: prev.atomIds };
    }
  }
  return idx;
}

export function getQuark(idx: QuarkIndex, code: string, fallback: number): number {
  const e = idx[code];
  if (!e) return fallback;
  const v = Number(e.v);
  return Number.isFinite(v) ? v : fallback;
}
