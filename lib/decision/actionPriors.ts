import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x?.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function mk(selfId: string, otherId: string, act: string, v: number, usedAtomIds: string[], parts: any): ContextAtom {
  return normalizeAtom({
    id: `act:prior:${selfId}:${otherId}:${act}`,
    ns: 'act' as any,
    kind: 'action_prior' as any,
    origin: 'derived',
    source: 'action_priors',
    magnitude: clamp01(v),
    confidence: 1,
    subject: selfId,
    target: otherId,
    tags: ['act', 'prior', act],
    label: `prior.${act}:${Math.round(clamp01(v) * 100)}%`,
    trace: { usedAtomIds, notes: ['base action priors'], parts }
  } as any);
}

export function deriveActionPriors(args: {
  selfId: string;
  otherIds: string[];
  atoms: ContextAtom[];
}): ContextAtom[] {
  const { selfId, otherIds, atoms } = args;
  const out: ContextAtom[] = [];

  const danger = clamp01(getMag(atoms, `ctx:danger:${selfId}`, 0));
  const norm = clamp01(getMag(atoms, `ctx:normPressure:${selfId}`, 0));
  const pub = clamp01(getMag(atoms, `ctx:publicness:${selfId}`, 0));
  const surv = clamp01(getMag(atoms, `ctx:surveillance:${selfId}`, 0));

  for (const otherId of otherIds) {
    if (!otherId || otherId === selfId) continue;

    // берём из rel:state (а если нет — уже там fallback на rel:base/дефолты через stage0+deriveRelState)
    const trust = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:trust`, 0.5));
    const host = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:hostility`, 0.0));
    const clos = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:closeness`, 0.2));
    const oblig = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:obligation`, 0.0));
    const respe = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:respect`, 0.0));

    // ToM если есть — уточняет priors, но не обязателен
    const tomThreat = clamp01(getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:threat`, getMag(atoms, `tom:dyad:${selfId}:${otherId}:threat`, 0.2)));
    const tomTrust = clamp01(getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:trust`, getMag(atoms, `tom:dyad:${selfId}:${otherId}:trust`, 0.5)));

    // База: помочь / навредить / запросить инфо / избегать / конфронтировать
    // Важно: норм/публичность/наблюдение сдвигают в сторону “безопасных” действий.
    const socialRisk = clamp01(0.45 * pub + 0.35 * surv + 0.20 * norm);

    const help = clamp01(
      0.55 * trust + 0.20 * clos + 0.20 * oblig + 0.10 * tomTrust - 0.30 * tomThreat
    ) * clamp01(1 - 0.45 * danger);

    const harm = clamp01(
      0.70 * host + 0.25 * tomThreat - 0.20 * trust
    ) * clamp01(1 - 0.60 * socialRisk);

    const askInfo = clamp01(
      0.35 + 0.25 * (1 - tomTrust) + 0.25 * (1 - clos) + 0.15 * respe
    ) * clamp01(1 - 0.25 * danger);

    const avoid = clamp01(
      0.25 + 0.55 * tomThreat + 0.25 * danger + 0.15 * socialRisk - 0.25 * oblig
    );

    const confront = clamp01(
      0.20 + 0.50 * host + 0.25 * (1 - socialRisk) + 0.15 * respe - 0.35 * danger
    );

    const used = [
      `ctx:danger:${selfId}`,
      `ctx:normPressure:${selfId}`,
      `ctx:publicness:${selfId}`,
      `ctx:surveillance:${selfId}`,
      `rel:state:${selfId}:${otherId}:trust`,
      `rel:state:${selfId}:${otherId}:hostility`,
      `rel:state:${selfId}:${otherId}:closeness`,
      `rel:state:${selfId}:${otherId}:obligation`,
      `rel:state:${selfId}:${otherId}:respect`,
      `tom:effective:dyad:${selfId}:${otherId}:trust`,
      `tom:effective:dyad:${selfId}:${otherId}:threat`,
      `tom:dyad:${selfId}:${otherId}:trust`,
      `tom:dyad:${selfId}:${otherId}:threat`,
    ].filter(id => atoms.some(a => a?.id === id));

    out.push(
      mk(selfId, otherId, 'help', help, used, { trust, clos, oblig, tomTrust, tomThreat, danger }),
      mk(selfId, otherId, 'harm', harm, used, { host, tomThreat, trust, socialRisk }),
      mk(selfId, otherId, 'ask_info', askInfo, used, { tomTrust, clos, respe, danger }),
      mk(selfId, otherId, 'avoid', avoid, used, { tomThreat, danger, socialRisk, oblig }),
      mk(selfId, otherId, 'confront', confront, used, { host, socialRisk, respe, danger }),
    );
  }

  return out;
}
