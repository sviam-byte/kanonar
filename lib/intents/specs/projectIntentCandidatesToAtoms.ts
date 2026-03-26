import type { ContextAtom } from '../../context/v2/types';
import type { DerivedIntentCandidateV1 } from './types';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Projects Layer-F candidates into intent:* atoms for UI/traceability only. */
export function projectIntentCandidatesToAtoms(items: DerivedIntentCandidateV1[]): ContextAtom[] {
  return items.map((x) => ({
    id: `intent:v1:${x.intentId}`,
    kind: 'intent.candidate',
    ns: 'util',
    source: 'system',
    origin: 'derived',
    magnitude: clamp01(x.score),
    label: x.label,
    trace: {
      usedAtomIds: x.trace.usedAtomIds,
      notes: [...x.trace.notes, 'Projected from IntentSpecV1'],
      parts: { ...x.trace.parts, reasons: x.reasons },
    },
    meta: {
      intentId: x.intentId,
      score: x.score,
      goalContribs: x.goalContribs,
    },
  }) as ContextAtom);
}
