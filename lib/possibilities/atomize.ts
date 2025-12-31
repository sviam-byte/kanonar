
import { Possibility } from './catalog';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { arr } from '../utils/arr';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Defensive: sometimes a "registry" object was passed instead of a list.
export function atomizePossibilities(poss: Possibility[] | any): ContextAtom[] {
  const out: ContextAtom[] = [];
  const list = arr<Possibility>((poss && (poss.possibilities || poss)) || []);
  for (const p of list) {
    if (!p?.id) continue;
    out.push(normalizeAtom({
      id: p.id,
      ns: p.kind as any,
      kind: `possibility_${p.kind}` as any,
      origin: 'derived',
      source: 'possibilities',
      magnitude: clamp01(p.magnitude),
      confidence: clamp01(p.confidence),
      subject: p.subjectId,
      target: p.targetId,
      tags: ['poss', p.kind, p.label],
      label: p.label,
      trace: { usedAtomIds: p.trace?.usedAtomIds || [], notes: p.trace?.notes || [], parts: p.trace?.parts || {} },
      meta: { blockedBy: p.blockedBy || [], requires: p.requires || [], ...p.meta }
    } as any));
  }
  return out;
}
