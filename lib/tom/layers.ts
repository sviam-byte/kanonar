import type { ContextAtom } from '../context/v2/types';
import { AtomIndex } from '../util/AtomIndex';

// WeakMap cache: same atoms array reference → same AtomIndex.
const _indexCache = new WeakMap<readonly ContextAtom[], AtomIndex>();

function ensureIndex(atoms: readonly ContextAtom[]): AtomIndex {
  let idx = _indexCache.get(atoms);
  if (!idx) {
    idx = AtomIndex.from(atoms as ContextAtom[]);
    _indexCache.set(atoms, idx);
  }
  return idx;
}

function findAtom(atoms: ContextAtom[], id: string): ContextAtom | undefined {
  return ensureIndex(atoms).get(id);
}

export function dyadBaseId(selfId: string, otherId: string, metric: string): string {
  return `tom:dyad:${selfId}:${otherId}:${metric}`;
}

export function dyadFinalId(selfId: string, otherId: string, metric: string): string {
  return `tom:dyad:final:${selfId}:${otherId}:${metric}`;
}

/**
 * Prefer tom:dyad:final:* if present; otherwise fall back to tom:dyad:*.
 * (Later we can extend to *_ctx or effective, but canonical should be final→base.)
 */
export function pickDyadId(atoms: ContextAtom[], selfId: string, otherId: string, metric: string): string {
  const fin = dyadFinalId(selfId, otherId, metric);
  if (findAtom(atoms, fin)) return fin;
  return dyadBaseId(selfId, otherId, metric);
}

export function getDyadMag(atoms: ContextAtom[], selfId: string, otherId: string, metric: string, fb = 0): { id: string; mag: number } {
  const id = pickDyadId(atoms, selfId, otherId, metric);
  const a: any = findAtom(atoms, id);
  const m = a?.magnitude;
  const mag = (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
  return { id, mag };
}

/** Collect dyad entries for selfId from both base and final layers. */
export function collectDyadEntries(atoms: ContextAtom[], selfId: string): Array<{ target: string; metric: string; id: string }> {
  const out: Array<{ target: string; metric: string; id: string }> = [];
  for (const a of atoms) {
    const id = String((a as any)?.id ?? '');
    if (!id.startsWith('tom:dyad:')) continue;

    // base: tom:dyad:self:target:metric
    // final: tom:dyad:final:self:target:metric
    const parts = id.split(':');
    if (parts[2] === 'final') {
      const s = parts[3];
      const t = parts[4];
      const m = parts[5];
      if (s === selfId && t && m) out.push({ target: t, metric: m, id });
    } else {
      const s = parts[2];
      const t = parts[3];
      const m = parts[4];
      if (s === selfId && t && m) out.push({ target: t, metric: m, id });
    }
  }
  return out;
}
