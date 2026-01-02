import type { ContextAtom } from './v2/types';

/**
 * Layering conventions (incremental migration):
 *
 * BASE (objective / pre-lens):
 *   ctx:<axis>:<selfId>
 *
 * FINAL (subjective / post-lens):
 *   ctx:final:<axis>:<selfId>
 *
 * Readers MUST prefer FINAL when present, and fall back to BASE.
 */
export function ctxBaseId(axis: string, selfId: string): string {
  return `ctx:${axis}:${selfId}`;
}

export function ctxFinalId(axis: string, selfId: string): string {
  return `ctx:final:${axis}:${selfId}`;
}

export function findAtom(atoms: ContextAtom[], id: string): ContextAtom | undefined {
  return atoms.find(a => a && (a as any).id === id);
}

export function getMagnitude(atoms: ContextAtom[], id: string, fallback = 0): number {
  const a: any = findAtom(atoms, id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

/** Prefer FINAL ctx axis if present; otherwise fall back to BASE. */
export function getCtx(atoms: ContextAtom[], axis: string, selfId: string, fallback = 0): number {
  const fin = ctxFinalId(axis, selfId);
  const base = ctxBaseId(axis, selfId);
  const finAtom = findAtom(atoms, fin);
  if (finAtom) return getMagnitude(atoms, fin, fallback);
  return getMagnitude(atoms, base, fallback);
}

/** Returns the chosen ctx id (FINAL if exists, else BASE). */
export function pickCtxId(atoms: ContextAtom[], axis: string, selfId: string): string {
  const fin = ctxFinalId(axis, selfId);
  if (findAtom(atoms, fin)) return fin;
  return ctxBaseId(axis, selfId);
}
