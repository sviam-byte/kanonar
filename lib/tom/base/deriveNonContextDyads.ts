import type { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb: number) {
  const a: any = atoms.find(x => x?.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function mk(selfId: string, otherId: string, metric: string, v: number, used: string[], parts: any): ContextAtom {
  return normalizeAtom({
    id: `tom:dyad:${selfId}:${otherId}:${metric}`,
    ns: 'tom',
    kind: 'tom_dyad' as any,
    origin: 'derived',
    source: 'tom_noncontext',
    subject: selfId,
    target: otherId,
    magnitude: clamp01(v),
    confidence: 1,
    tags: ['tom', 'dyad', metric],
    label: `tom.${metric}:${Math.round(clamp01(v) * 100)}%`,
    trace: { usedAtomIds: Array.from(new Set(used.filter(Boolean))), notes: ['rel:state -> tom:dyad'], parts }
  } as any);
}

/**
 * “Обычный ToM”: минимальный слой, который всегда есть,
 * чтобы decision/actionPriors не зависели только от contextual ToM.
 *
 * Источник: rel:state:* (trust/hostility/closeness/respect/obligation).
 */
export function deriveNonContextDyadAtoms(args: {
  selfId: string;
  otherIds: string[];
  atoms: ContextAtom[];
}): { atoms: ContextAtom[] } {
  const { selfId, otherIds, atoms } = args;
  const out: ContextAtom[] = [];

  for (const otherId of otherIds) {
    if (!otherId || otherId === selfId) continue;

    const idTrust = `rel:state:${selfId}:${otherId}:trust`;
    const idHost = `rel:state:${selfId}:${otherId}:hostility`;
    const idClos = `rel:state:${selfId}:${otherId}:closeness`;
    const idResp = `rel:state:${selfId}:${otherId}:respect`;
    const idObl = `rel:state:${selfId}:${otherId}:obligation`;

    const trust = clamp01(getMag(atoms, idTrust, 0.5));
    const host = clamp01(getMag(atoms, idHost, 0.0));
    const clos = clamp01(getMag(atoms, idClos, 0.2));
    const resp = clamp01(getMag(atoms, idResp, 0.0));
    const obl = clamp01(getMag(atoms, idObl, 0.0));

    // “Угроза” как функция враждебности + недоверия (простая, но стабильная).
    const threat = clamp01(0.70 * host + 0.30 * (1 - trust));

    const used = [idTrust, idHost, idClos, idResp, idObl].filter(id => atoms.some(a => a?.id === id));

    out.push(
      mk(selfId, otherId, 'trust', trust, used, { trust, host, clos, resp, obl }),
      mk(selfId, otherId, 'threat', threat, used, { trust, host }),
      mk(selfId, otherId, 'closeness', clos, used, { clos }),
      mk(selfId, otherId, 'respect', resp, used, { resp }),
      mk(selfId, otherId, 'obligation', obl, used, { obl })
    );
  }

  return { atoms: out };
}
