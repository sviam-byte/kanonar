import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { clamp01 } from '../math/normalize';

function mag(a?: any, fb = 0) {
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function pick(atoms: ContextAtom[], id: string) {
  return atoms.find(a => String((a as any)?.id || '') === id) as any;
}

const METRICS = ['trust', 'hostility', 'closeness', 'obligation', 'respect'] as const;
type Metric = typeof METRICS[number];

export function deriveRelFinalAtoms(args: {
  selfId: string;
  atoms: ContextAtom[];
  participantIds: string[];
  wState?: number; // weight of rel:state
  wTom?: number; // weight of tom:effective
}) {
  const { selfId, atoms, participantIds, wState = 0.55, wTom = 0.45 } = args;
  const out: ContextAtom[] = [];

  for (const otherId of participantIds) {
    if (!otherId || otherId === selfId) continue;

    for (const metric of METRICS) {
      const idState = `rel:state:${selfId}:${otherId}:${metric}`;
      const idTom = `tom:effective:dyad:${selfId}:${otherId}:${metric}`;
      const aState = pick(atoms, idState);
      const aTom = pick(atoms, idTom);

      // If neither exists, do nothing.
      if (!aState && !aTom) continue;

      const ms = clamp01(mag(aState, 0));
      const mt = clamp01(mag(aTom, 0));
      const mFinal = clamp01(wState * ms + wTom * mt);

      const idFinal = `rel:final:${selfId}:${otherId}:${metric}`;
      out.push(
        normalizeAtom({
          id: idFinal,
          ns: 'rel',
          kind: 'rel_final',
          origin: 'derived',
          magnitude: mFinal,
          confidence: Math.min(1, (aState?.confidence ?? 1) * 0.75 + (aTom?.confidence ?? 1) * 0.25),
          tags: ['rel', 'final', metric],
          label: `rel.final.${metric}:${selfId}→${otherId}`,
          trace: {
            usedAtomIds: [aState?.id, aTom?.id].filter(Boolean),
            notes: ['rel:final = mix(rel:state, tom:effective)'],
            parts: { metric, wState, wTom, ms, mt, mFinal },
          },
        } as any)
      );
    }
  }

  return { atoms: out };
}
