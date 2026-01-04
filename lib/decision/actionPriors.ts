import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx, pickCtxId } from '../context/layers';
import { getDyadMag } from '../tom/layers';

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

  const dangerP = getCtx(atoms, selfId, 'danger', 0);
  const normP = getCtx(atoms, selfId, 'normPressure', 0);
  const pubP = getCtx(atoms, selfId, 'publicness', 0);
  const survP = getCtx(atoms, selfId, 'surveillance', 0);

  const danger = clamp01(dangerP.magnitude);
  const norm = clamp01(normP.magnitude);
  const pub = clamp01(pubP.magnitude);
  const surv = clamp01(survP.magnitude);

  function getEffectiveOrDyad(otherId: string, metric: string, fb = 0): { id: string; mag: number } {
    const effId = `tom:effective:dyad:${selfId}:${otherId}:${metric}`;
    const eff = atoms.find(a => a.id === effId) as any;
    if (eff && typeof eff.magnitude === 'number' && Number.isFinite(eff.magnitude)) {
      return { id: effId, mag: eff.magnitude };
    }
    return getDyadMag(atoms, selfId, otherId, metric, fb);
  }

  for (const otherId of otherIds) {
    if (!otherId || otherId === selfId) continue;

    // берём из rel:state (а если нет — уже там fallback на rel:base/дефолты через stage0+deriveRelState)
    const trust = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:trust`, 0.5));
    const host = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:hostility`, 0.0));
    const clos = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:closeness`, 0.2));
    const oblig = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:obligation`, 0.0));
    const respe = clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:respect`, 0.0));

    // ToM если есть — уточняет priors, но не обязателен.
    // fallback: если нет tom:dyad, используем rel:state как минимальный ordinary ToM
    const tomThreatP = getEffectiveOrDyad(otherId, 'threat', 0.2);
    const tomTrustP = getEffectiveOrDyad(otherId, 'trust', 0.5);
    const tomIntimacyP = getEffectiveOrDyad(otherId, 'intimacy', 0.1);
    const tomThreatId = `tom:dyad:${selfId}:${otherId}:threat`;
    const tomTrustId = `tom:dyad:${selfId}:${otherId}:trust`;
    const tomIntimacyId = `tom:dyad:${selfId}:${otherId}:intimacy`;
    const tomThreatFallback = getMag(atoms, tomThreatId, getMag(atoms, `rel:state:${selfId}:${otherId}:hostility`, 0.0));
    const tomTrustFallback = getMag(atoms, tomTrustId, getMag(atoms, `rel:state:${selfId}:${otherId}:trust`, 0.5));
    const tomThreat = clamp01(tomThreatP.id ? tomThreatP.mag : tomThreatFallback);
    const tomTrust = clamp01(tomTrustP.id ? tomTrustP.mag : tomTrustFallback);
    const tomIntimacy = clamp01(
      tomIntimacyP.id
        ? tomIntimacyP.mag
        : getMag(atoms, tomIntimacyId, 0.1)
    );

    // База: помочь / навредить / запросить инфо / избегать / конфронтировать
    // Важно: норм/публичность/наблюдение сдвигают в сторону “безопасных” действий.
    const socialRisk = clamp01(0.45 * pub + 0.35 * surv + 0.20 * norm);

    const help = clamp01(
      0.50 * trust + 0.18 * clos + 0.18 * oblig + 0.10 * tomTrust + 0.18 * tomIntimacy - 0.30 * tomThreat
    ) * clamp01(1 - 0.45 * danger);

    const harm = clamp01(
      0.70 * host + 0.25 * tomThreat - 0.20 * trust
    ) * clamp01(1 - 0.60 * socialRisk);

    const askInfo = clamp01(
      0.35 + 0.25 * (1 - tomTrust) + 0.25 * (1 - clos) + 0.15 * respe
    ) * clamp01(1 - 0.25 * danger);

    const avoid = clamp01(
      0.25 + 0.55 * tomThreat + 0.25 * danger + 0.15 * socialRisk
      - 0.25 * oblig - 0.35 * tomIntimacy - 0.10 * clos
    );

    const confront = clamp01(
      0.20 + 0.50 * host + 0.25 * (1 - socialRisk) + 0.15 * respe - 0.35 * danger
    );

    const used = [
      ...(dangerP.id ? [dangerP.id] : pickCtxId('danger', selfId)),
      ...(normP.id ? [normP.id] : pickCtxId('normPressure', selfId)),
      ...(pubP.id ? [pubP.id] : pickCtxId('publicness', selfId)),
      ...(survP.id ? [survP.id] : pickCtxId('surveillance', selfId)),
      `rel:state:${selfId}:${otherId}:trust`,
      `rel:state:${selfId}:${otherId}:hostility`,
      `rel:state:${selfId}:${otherId}:closeness`,
      `rel:state:${selfId}:${otherId}:obligation`,
      `rel:state:${selfId}:${otherId}:respect`,
      tomTrustP.id,
      tomThreatP.id,
      tomIntimacyP.id,
      tomTrustId,
      tomThreatId,
      tomIntimacyId,
    ].filter(id => atoms.some(a => a?.id === id));

    out.push(
      mk(selfId, otherId, 'help', help, used, { trust, clos, oblig, tomTrust, tomIntimacy, tomThreat, danger, dangerLayer: dangerP.layer }),
      mk(selfId, otherId, 'harm', harm, used, { host, tomThreat, trust, socialRisk }),
      mk(selfId, otherId, 'ask_info', askInfo, used, { tomTrust, clos, respe, danger, dangerLayer: dangerP.layer }),
      mk(selfId, otherId, 'avoid', avoid, used, { tomThreat, tomIntimacy, danger, dangerLayer: dangerP.layer, socialRisk, oblig, clos }),
      mk(selfId, otherId, 'confront', confront, used, { host, socialRisk, respe, danger, dangerLayer: dangerP.layer }),
    );
  }

  return out;
}
