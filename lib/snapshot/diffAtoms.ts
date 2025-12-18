
import { ContextAtom } from '../context/v2/types';

export type AtomDiff = {
  id: string;
  type: 'added' | 'removed' | 'changed';
  before?: number;
  after?: number;
  label?: string;
};

export function diffAtoms(prev: ContextAtom[], next: ContextAtom[], eps = 1e-6): AtomDiff[] {
  const mapPrev = new Map<string, number>();
  const labelMap = new Map<string, string>();
  
  for (const a of prev) {
      if (a.id && typeof a.magnitude === 'number') {
          mapPrev.set(a.id, a.magnitude);
          if (a.label) labelMap.set(a.id, a.label);
      }
  }

  const out: AtomDiff[] = [];
  const visitedNext = new Set<string>();

  for (const a of next) {
    if (!a.id || typeof a.magnitude !== 'number') continue;
    visitedNext.add(a.id);
    
    const prevVal = mapPrev.get(a.id);
    
    if (prevVal === undefined) {
        out.push({ id: a.id, type: 'added', after: a.magnitude, label: a.label });
    } else {
        if (Math.abs(prevVal - a.magnitude) > eps) {
            out.push({ id: a.id, type: 'changed', before: prevVal, after: a.magnitude, label: a.label });
        }
    }
  }
  
  for (const [id, val] of mapPrev) {
      if (!visitedNext.has(id)) {
          out.push({ id, type: 'removed', before: val, label: labelMap.get(id) });
      }
  }

  const score = { changed: 0, added: 1, removed: 2 };
  out.sort((a,b) => (score[a.type] - score[b.type]) || a.id.localeCompare(b.id));

  return out;
}
