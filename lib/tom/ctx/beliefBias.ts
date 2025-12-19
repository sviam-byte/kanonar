// lib/tom/ctx/beliefBias.ts
import { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';
import { getAtom01, upsertAtom, mkTomCtxAtom, clamp01 } from '../atomsDyad';

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

export function buildBeliefToMBias(args: {
  atoms: ContextAtom[];
  selfId: string;
  beliefs?: any;
  rumors?: any;
  access?: any;
}): { atoms: ContextAtom[]; dyads: Array<{ otherId: string; trustCtx: number; threatCtx: number; bias: number }> } {
  const { atoms, selfId } = args;

  const believedHostility = getMag(atoms, 'belief:scene:hostility', NaN);
  const uncertainty = getMag(atoms, 'ctx:uncertainty', 0);

  const bias = clamp01(
    (Number.isFinite(believedHostility) ? 0.7 * believedHostility : 0) + 0.3 * uncertainty
  );

  const out: ContextAtom[] = [...atoms];
  const biasAtomId = `tom:ctx:bias:${selfId}`;

  upsertAtom(out, normalizeAtom({
    id: biasAtomId,
    kind: 'tom_belief',
    ns: 'tom',
    origin: 'derived',
    source: 'tom_ctx',
    magnitude: bias,
    confidence: 1,
    tags: ['tom', 'ctx', 'bias'],
    label: `interpretation bias:${Math.round(bias * 100)}%`,
    trace: {
      usedAtomIds: [
        Number.isFinite(believedHostility) ? 'belief:scene:hostility' : null,
        'ctx:uncertainty'
      ].filter(Boolean) as string[],
      notes: ['bias from belief hostility + uncertainty'],
      parts: { believedHostility: Number.isFinite(believedHostility) ? believedHostility : null, uncertainty }
    }
  } as any));

  const dyads: Array<{ otherId: string; trustCtx: number; threatCtx: number; bias: number }> = [];
  const dyadAtoms = out.filter(a => a.id.startsWith(`tom:dyad:${selfId}:`));
  const otherIds = Array.from(new Set(dyadAtoms.map(a => a.id.split(':')[3]).filter(Boolean)));

  for (const otherId of otherIds) {
    if (!otherId || otherId === selfId) continue;

    const trustBaseId = `tom:dyad:${selfId}:${otherId}:trust`;
    const threatBaseId = `tom:dyad:${selfId}:${otherId}:threat`;
    const trustPriorId = `tom:dyad:${selfId}:${otherId}:trust_prior`;
    const threatPriorId = `tom:dyad:${selfId}:${otherId}:threat_prior`;

    const trustBase = getAtom01(out, trustBaseId, 0);
    const threatBase = getAtom01(out, threatBaseId, 0);
    const trustPrior = getAtom01(out, trustPriorId, trustBase);
    const threatPrior = getAtom01(out, threatPriorId, threatBase);

    const trustCtx = clamp01(trustPrior * (1 - 0.6 * bias));
    const threatCtx = clamp01(threatPrior + 0.6 * bias * (1 - threatPrior));

    upsertAtom(out, mkTomCtxAtom({
      id: `tom:dyad:${selfId}:${otherId}:trust_ctx`,
      selfId,
      otherId,
      magnitude: trustCtx,
      label: `tom trust ctx→ ${otherId}`,
      used: [trustBaseId, trustPriorId, biasAtomId],
      parts: { trustBase, trustPrior, bias }
    }));

    upsertAtom(out, mkTomCtxAtom({
      id: `tom:dyad:${selfId}:${otherId}:threat_ctx`,
      selfId,
      otherId,
      magnitude: threatCtx,
      label: `tom threat ctx→ ${otherId}`,
      used: [threatBaseId, threatPriorId, biasAtomId],
      parts: { threatBase, threatPrior, bias }
    }));

    dyads.push({ otherId, trustCtx, threatCtx, bias });
  }

  return { atoms: out, dyads };
}
