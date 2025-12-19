// lib/tom/base/applyRelationPriors.ts
import type { ContextAtom } from '../../context/v2/types';
import { getAtom01, upsertAtom, mkTomCtxAtom, clamp01 } from '../atomsDyad';

const W_PRIOR = 0.35; // сколько весит prior vs текущий tom atom

export function applyRelationPriorsToDyads(args: {
  atoms: ContextAtom[];
  selfId: string;
  relationPriors: Array<{ otherId: string; trustPrior?: number; threatPrior?: number }>;
}): ContextAtom[] {
  const { atoms, selfId, relationPriors } = args;
  const out = [...atoms];

  for (const p of relationPriors ?? []) {
    const otherId = p.otherId;
    if (!otherId || otherId === selfId) continue;

    const trustBaseId = `tom:dyad:${selfId}:${otherId}:trust`;
    const threatBaseId = `tom:dyad:${selfId}:${otherId}:threat`;

    const trustBase = getAtom01(out, trustBaseId, 0);
    const threatBase = getAtom01(out, threatBaseId, 0);

    const trustPrior = clamp01(typeof p.trustPrior === 'number' ? p.trustPrior : trustBase);
    const threatPrior = clamp01(typeof p.threatPrior === 'number' ? p.threatPrior : threatBase);

    const trustPriorId = `tom:dyad:${selfId}:${otherId}:trust_prior`;
    const threatPriorId = `tom:dyad:${selfId}:${otherId}:threat_prior`;

    const trustAdj = clamp01((1 - W_PRIOR) * trustBase + W_PRIOR * trustPrior);
    const threatAdj = clamp01((1 - W_PRIOR) * threatBase + W_PRIOR * threatPrior);

    upsertAtom(out, mkTomCtxAtom({
      id: trustPriorId,
      selfId,
      otherId,
      magnitude: trustAdj,
      label: `tom trust prior→ ${otherId}`,
      used: [trustBaseId],
      parts: { trustBase, trustPrior, W_PRIOR }
    }));

    upsertAtom(out, mkTomCtxAtom({
      id: threatPriorId,
      selfId,
      otherId,
      magnitude: threatAdj,
      label: `tom threat prior→ ${otherId}`,
      used: [threatBaseId],
      parts: { threatBase, threatPrior, W_PRIOR }
    }));
  }

  return out;
}
