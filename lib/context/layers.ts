import type { ContextAtom } from './v2/types';
import { AtomIndex } from '../util/AtomIndex';
import { clamp01 } from '../util/math';

export type Picked = {
  id: string | null;
  magnitude: number;
  confidence: number;
  layer: 'final' | 'base' | 'global' | 'missing';
};

function asNum(x: any): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

// WeakMap cache: same atoms array reference → same AtomIndex.
// This avoids rebuilding the map on every getCtx call within the same pipeline tick.
const _indexCache = new WeakMap<readonly ContextAtom[], AtomIndex>();

function ensureIndex(atoms: readonly ContextAtom[]): AtomIndex {
  let idx = _indexCache.get(atoms);
  if (!idx) {
    idx = AtomIndex.from(atoms as ContextAtom[]);
    _indexCache.set(atoms, idx);
  }
  return idx;
}

function findAtom(atoms: ContextAtom[], id: string): ContextAtom | null {
  const a = ensureIndex(atoms).get(id) as any;
  return a || null;
}

function pickExact(atoms: ContextAtom[], id: string, layer: Picked['layer']): Picked | null {
  const a = findAtom(atoms, id) as any;
  if (!a) return null;
  const mag = asNum(a.magnitude);
  if (mag === null) return null;
  const conf = asNum(a.confidence) ?? 1;
  return { id, magnitude: mag, confidence: clamp01(conf), layer };
}

export function pickCtxId(axis: string, selfId: string): string[] {
  // порядок важен: final → base → global
  return [
    `ctx:final:${axis}:${selfId}`,
    `ctx:${axis}:${selfId}`,
    `ctx:${axis}`,
  ];
}

export function getCtx(atoms: ContextAtom[], selfId: string, axis: string, fallback = 0): Picked {
  const [fin, base, glob] = pickCtxId(axis, selfId);
  return (
    pickExact(atoms, fin, 'final') ||
    pickExact(atoms, base, 'base') ||
    pickExact(atoms, glob, 'global') || {
      id: null,
      magnitude: fallback,
      confidence: 0,
      layer: 'missing'
    }
  );
}

export function sanitizeUsed(outId: string, used: unknown): string[] {
  if (!Array.isArray(used)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of used) {
    if (typeof x !== 'string' || !x) continue;
    if (x === outId) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}
