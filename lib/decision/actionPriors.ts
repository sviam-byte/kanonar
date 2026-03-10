import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx, pickCtxId } from '../context/layers';
import { getDyadMag } from '../tom/layers';
import { getMag } from '../util/atoms';
import { clamp01 } from '../util/math';
import { FC } from '../config/formulaConfig';

function getGoalDomainMag(atoms: ContextAtom[], selfId: string, domain: string, fb = 0) {
  // Goal layer projects into util:* atoms in S7b; Action layer must not read goal:* directly.
  // Canonical ids: util:domain:<domain>:<selfId>
  return clamp01(getMag(atoms, `util:domain:${domain}:${selfId}`, fb));
}

function getRel(
  atoms: ContextAtom[],
  selfId: string,
  otherId: string,
  metric: string,
  fb: number
): { id: string; mag: number } {
  // Prefer final over state over base.
  const idF = `rel:final:${selfId}:${otherId}:${metric}`;
  const aF = atoms.find(a => a?.id === idF) as any;
  if (aF && typeof aF.magnitude === 'number' && Number.isFinite(aF.magnitude)) return { id: idF, mag: aF.magnitude };

  const idS = `rel:state:${selfId}:${otherId}:${metric}`;
  const aS = atoms.find(a => a?.id === idS) as any;
  if (aS && typeof aS.magnitude === 'number' && Number.isFinite(aS.magnitude)) return { id: idS, mag: aS.magnitude };

  const idB = `rel:base:${selfId}:${otherId}:${metric}`;
  const aB = atoms.find(a => a?.id === idB) as any;
  if (aB && typeof aB.magnitude === 'number' && Number.isFinite(aB.magnitude)) return { id: idB, mag: aB.magnitude };

  // keep stable id for traces even if absent
  return { id: idS, mag: fb };
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
    trace: { usedAtomIds, notes: ['base action priors', 'goal ecology modulation'], parts }
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
  const timeP = getCtx(atoms, selfId, 'timePressure', 0);

  const danger = clamp01(dangerP.magnitude);
  const norm = clamp01(normP.magnitude);
  const pub = clamp01(pubP.magnitude);
  const surv = clamp01(survP.magnitude);
  const time = clamp01(timeP.magnitude);

  // Goal ecology (domain weights). If goal atoms are missing, these are 0 and priors are unchanged.
  const gSafety = getGoalDomainMag(atoms, selfId, 'safety', 0);
  const gControl = getGoalDomainMag(atoms, selfId, 'control', 0);
  const gAff = getGoalDomainMag(atoms, selfId, 'affiliation', 0);
  const gStatus = getGoalDomainMag(atoms, selfId, 'status', 0);
  const gExplore = getGoalDomainMag(atoms, selfId, 'exploration', 0);
  const gOrder = getGoalDomainMag(atoms, selfId, 'order', 0);

  // --- SELF priors: make escape/hide/wait not depend purely on map affordances ---
  {
    const threatFinal = clamp01(getMag(atoms, `threat:final:${selfId}`, danger));
    const protocol = clamp01(getMag(atoms, `ctx:proceduralStrict:${selfId}`, getMag(atoms, `norm:proceduralStrict:${selfId}`, 0)));

    const selfUsed = [
      ...(dangerP.id ? [dangerP.id] : pickCtxId('danger', selfId)),
      ...(timeP.id ? [timeP.id] : pickCtxId('timePressure', selfId)),
      ...(pubP.id ? [pubP.id] : pickCtxId('publicness', selfId)),
      ...(survP.id ? [survP.id] : pickCtxId('surveillance', selfId)),
      `threat:final:${selfId}`,
      `ctx:proceduralStrict:${selfId}`,
      `norm:proceduralStrict:${selfId}`,
      `util:domain:safety:${selfId}`,
      `util:domain:order:${selfId}`,
      `util:domain:control:${selfId}`,
    ].filter(id => atoms.some(a => a?.id === id));

    // base
    const esc = FC.priors.escape;
    let escape = clamp01(esc.base + esc.dangerW * danger + esc.threatW * threatFinal + esc.timeW * time - esc.protocolPenalty * protocol);
    const hd = FC.priors.hide;
    let hide = clamp01(hd.base + hd.dangerW * danger + hd.survW * surv + hd.pubW * pub);
    const wt = FC.priors.wait;
    let wait = clamp01(wt.base + wt.safeW * (1 - danger) + wt.relaxW * (1 - time) - wt.threatPenalty * threatFinal);

    // goal ecology modulation (small)
    escape = clamp01(escape + esc.gSafety * gSafety + esc.gControl * gControl - esc.gAffPenalty * gAff);
    hide = clamp01(hide + hd.gSafety * gSafety + hd.gOrder * gOrder - hd.gStatusPenalty * gStatus);
    wait = clamp01(wait + wt.gOrder * gOrder - wt.gExplorePenalty * gExplore);

    out.push(
      mk(selfId, selfId, 'escape', escape, selfUsed, { danger, threatFinal, time, protocol, gSafety, gControl, gAff }),
      mk(selfId, selfId, 'hide', hide, selfUsed, { danger, surv, pub, gSafety, gOrder, gStatus }),
      mk(selfId, selfId, 'wait', wait, selfUsed, { danger, time, threatFinal, gOrder, gExplore }),
    );
  }

  // Cache character traits once per derive call to keep priors deterministic and cheap.
  const traitCache: Record<string, number> = {};
  const getTrait = (name: string, fb: number) => {
    if (name in traitCache) return traitCache[name];
    const v = clamp01(getMag(atoms, `feat:char:${selfId}:trait.${name}`, fb));
    traitCache[name] = v;
    return v;
  };

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

    // Prefer rel:final → rel:state → rel:base (prevents "all defaults" collapse).
    const trustP = getRel(atoms, selfId, otherId, 'trust', 0.5);
    const hostP = getRel(atoms, selfId, otherId, 'hostility', 0.0);
    const closP = getRel(atoms, selfId, otherId, 'closeness', 0.2);
    const obligP = getRel(atoms, selfId, otherId, 'obligation', 0.0);
    const respeP = getRel(atoms, selfId, otherId, 'respect', 0.0);

    const trust = clamp01(trustP.mag);
    const host = clamp01(hostP.mag);
    const clos = clamp01(closP.mag);
    const oblig = clamp01(obligP.mag);
    const respe = clamp01(respeP.mag);

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
    const sr = FC.priors.socialRisk;
    const socialRisk = clamp01(sr.pub * pub + sr.surv * surv + sr.norm * norm);

    const hp = FC.priors.help;
    let help = clamp01(
      hp.trust * trust + hp.closeness * clos + hp.obligation * oblig
      + hp.tomTrust * tomTrust + hp.tomIntimacy * tomIntimacy - hp.tomThreatPenalty * tomThreat
    ) * clamp01(1 - hp.dangerDampen * danger);
    // affiliation/order -> more help; safety -> less help towards perceived threat.
    help = clamp01(help * (1 + hp.gAff * gAff + hp.gOrder * gOrder) * (1 - hp.gSafetyThreatPenalty * gSafety * tomThreat));

    const hm = FC.priors.harm;
    let harm = clamp01(
      hm.hostility * host + hm.tomThreat * tomThreat - hm.trustPenalty * trust
    ) * clamp01(1 - hm.socialRiskDampen * socialRisk);
    // order/affiliation/safety reduce harm.
    harm = clamp01(harm * (1 - hm.gOrderPenalty * gOrder) * (1 - hm.gAffPenalty * gAff) * (1 - hm.gSafetyPenalty * gSafety));

    const ai = FC.priors.askInfo;
    let askInfo = clamp01(
      ai.base + ai.distrust * (1 - tomTrust) + ai.distance * (1 - clos) + ai.respect * respe
    ) * clamp01(1 - ai.dangerDampen * danger);
    // exploration/control increase info-seeking; safety slightly increases cautionary info-seeking.
    askInfo = clamp01(askInfo * (1 + ai.gExplore * gExplore + ai.gControl * gControl + ai.gSafety * gSafety));

    // Avoid should not spike just because "danger is high".
    // It should spike because THIS other is dangerous/hostile or recently harmed self.
    const recentHarmId = `soc:recentHarmBy:${otherId}:${selfId}`;
    const recentHarm = clamp01(getMag(atoms, recentHarmId, 0));

    const av = FC.priors.avoid;
    let avoid = clamp01(
      av.base
      + av.tomThreat * tomThreat
      + av.hostility * host
      + av.recentHarm * recentHarm
      + av.danger * danger
      - av.trustPenalty * trust
      - av.tomIntimacyPenalty * tomIntimacy
      - av.closenessPenalty * clos
      - av.obligationPenalty * oblig
      - av.socialRiskPenalty * socialRisk
    );
    // safety increases avoidance; affiliation decreases avoidance.
    avoid = clamp01(avoid + av.gSafety * gSafety - av.gAffPenalty * gAff);

    const cf = FC.priors.confront;
    let confront = clamp01(
      cf.base + cf.hostility * host + cf.antiSocialRisk * (1 - socialRisk) + cf.respect * respe - cf.dangerPenalty * danger
    );
    // control/status increase confrontation; safety/order reduce it.
    confront = clamp01(confront + cf.gControl * gControl + cf.gStatus * gStatus - cf.gSafetyPenalty * gSafety - cf.gOrderPenalty * gOrder);

    const used = [
      ...(dangerP.id ? [dangerP.id] : pickCtxId('danger', selfId)),
      ...(normP.id ? [normP.id] : pickCtxId('normPressure', selfId)),
      ...(pubP.id ? [pubP.id] : pickCtxId('publicness', selfId)),
      ...(survP.id ? [survP.id] : pickCtxId('surveillance', selfId)),
      ...(timeP.id ? [timeP.id] : pickCtxId('timePressure', selfId)),

      `util:domain:safety:${selfId}`,
      `util:domain:control:${selfId}`,
      `util:domain:affiliation:${selfId}`,
      `util:domain:status:${selfId}`,
      `util:domain:exploration:${selfId}`,
      `util:domain:order:${selfId}`,

      trustP.id,
      hostP.id,
      closP.id,
      obligP.id,
      respeP.id,
      recentHarmId,

      tomTrustP.id,
      tomThreatP.id,
      tomIntimacyP.id,
      tomTrustId,
      tomThreatId,
      tomIntimacyId,
    ].filter(id => atoms.some(a => a?.id === id));


    out.push(
      mk(selfId, otherId, 'help', help, used, { trust, clos, oblig, tomTrust, tomIntimacy, tomThreat, danger, dangerLayer: dangerP.layer, gAff, gOrder, gSafety }),
      mk(selfId, otherId, 'harm', harm, used, { host, tomThreat, trust, socialRisk, gOrder, gAff, gSafety }),
      mk(selfId, otherId, 'ask_info', askInfo, used, { tomTrust, clos, respe, danger, dangerLayer: dangerP.layer, gExplore, gControl, gSafety }),
      mk(selfId, otherId, 'avoid', avoid, used, { tomThreat, host, recentHarm, trust, tomIntimacy, clos, oblig, danger, dangerLayer: dangerP.layer, socialRisk, gSafety, gAff }),
      mk(selfId, otherId, 'confront', confront, used, { host, socialRisk, respe, danger, dangerLayer: dangerP.layer, gControl, gStatus, gSafety, gOrder }),
    );

    // ── Personality-driven social priors ──
    // Reads character traits and maps them to action tendencies via PERSONALITY_ACTION_MAP.
    {
      const PAM = (FC as any).personalityActionMap;
      if (PAM && typeof PAM === 'object') {
        for (const [act, spec] of Object.entries(PAM) as [string, { base: number; traits: Record<string, number> }][]) {
          let v = spec.base;
          for (const [traitName, weight] of Object.entries(spec.traits)) {
            v += getTrait(traitName, 0.5) * weight;
          }

          // Context modulation: social risk dampens aggressive priors.
          const isAggressive = /command|threaten|accuse/.test(act);
          if (isAggressive) {
            v *= clamp01(1 - 0.3 * socialRisk);
          }

          // Dyadic modulation: trust/hostility tilts social actions.
          const isProsocial = /comfort|praise|apologize|share|treat|guard|escort/.test(act);
          if (isProsocial) {
            v = v * (0.7 + 0.3 * trust) * (1 - 0.2 * host);
          }

          out.push(
            mk(selfId, otherId, act, clamp01(v), used, {
              personalityDriven: true,
              base: spec.base,
              traits: spec.traits,
              trust,
              host,
              socialRisk,
            })
          );
        }
      }
    }
  }

  return out;
}
