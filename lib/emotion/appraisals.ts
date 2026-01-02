import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx, pickCtxId } from '../context/layers';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);

// smooth amplify/attenuate in [0,1] without harsh saturation
const amp01 = (x: number, k: number) => {
  const xx = clamp01(x);
  const kk = (Number.isFinite(k) ? Math.max(0, k) : 1);
  return clamp01(1 - Math.pow(1 - xx, kk));
};

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}
function firstIdByPrefix(atoms: ContextAtom[], prefix: string) {
  return atoms.find(a => typeof a?.id === 'string' && a.id.startsWith(prefix))?.id || null;
}

export function deriveAppraisalAtoms(args: { selfId: string; atoms: ContextAtom[]; agent?: any }) {
  const { selfId, atoms, agent } = args;

  const w = (agent?.params?.appraisal_weights || agent?.appraisal_weights || {}) as any;

  // ---------- personality / body features ----------
  const trParanoia = clamp01(getMag(atoms, `feat:char:${selfId}:trait.paranoia`, 0.5));
  const trSensitive = clamp01(getMag(atoms, `feat:char:${selfId}:trait.sensitivity`, 0.5));
  const trExperience = clamp01(getMag(atoms, `feat:char:${selfId}:trait.experience`, 0.2));

  const bStress = clamp01(getMag(atoms, `feat:char:${selfId}:body.stress`, 0));
  const bFatigue = clamp01(getMag(atoms, `feat:char:${selfId}:body.fatigue`, 0));
  const bPain = clamp01(getMag(atoms, `feat:char:${selfId}:body.pain`, 0));
  const bSleepDebt = clamp01(getMag(atoms, `feat:char:${selfId}:body.sleepDebt`, 0));

  // make differences large enough to be visible:
  // paranoia amplifies threat/uncertainty, reduces perceived control
  // sensitivity amplifies pressure/shame channel
  // experience reduces uncertainty, increases control
  const kThreat = lerp(0.85, 1.85, trParanoia) * lerp(0.90, 1.25, bStress) * lerp(0.95, 1.20, bPain);
  const kUnc = lerp(1.35, 0.70, trExperience) * lerp(0.95, 1.25, bFatigue) * lerp(0.95, 1.25, bSleepDebt);
  const kCtrl = lerp(0.70, 1.35, trExperience) * lerp(1.15, 0.70, trParanoia) * lerp(1.00, 0.80, bFatigue);
  const kPress = lerp(0.80, 1.70, trSensitive) * lerp(0.95, 1.20, bStress);

  // ---------- base context inputs ----------
  const threatId = `threat:final:${selfId}`;
  const threat0 = getMag(atoms, threatId, getMag(atoms, 'threat:final', 0));
  const danger = getCtx(atoms, selfId, 'danger', 0);
  const unc0 = getCtx(atoms, selfId, 'uncertainty', 0);
  const norm0 = getCtx(atoms, selfId, 'normPressure', 0);
  const pub0 = getCtx(atoms, selfId, 'publicness', 0);
  const intimacy0 = getCtx(atoms, selfId, 'intimacy', 0);

  const coverId =
    firstIdByPrefix(atoms, `world:map:cover:${selfId}`) ||
    firstIdByPrefix(atoms, `map:cover:${selfId}`) ||
    firstIdByPrefix(atoms, `ctx:cover:${selfId}`);
  const escapeId =
    firstIdByPrefix(atoms, `world:map:escape:${selfId}`) ||
    firstIdByPrefix(atoms, `map:escape:${selfId}`) ||
    firstIdByPrefix(atoms, `ctx:escape:${selfId}`);

  const cover0 = coverId ? getMag(atoms, coverId, 0) : 0;
  const escape0 = escapeId ? getMag(atoms, escapeId, 0) : 0;

  // ---------- personalized appraisal ----------
  const threat = amp01(threat0, kThreat);
  const unc = amp01(unc0.magnitude, kUnc);

  const control0 = clamp01(0.45 * cover0 + 0.35 * escape0 + 0.20 * (1 - unc0.magnitude));
  const control = amp01(control0, kCtrl);

  const pressure0 = clamp01(0.65 * norm0.magnitude + 0.35 * pub0.magnitude);
  const pressure = amp01(pressure0, kPress);

  // после базового расчёта — “персонажные” сдвиги (делают различимость)
  // По умолчанию (если весов нет) всё остаётся как было.
  const threatBias = Number.isFinite(w.threat_bias) ? w.threat_bias : 0;
  const threatGain = Number.isFinite(w.threat_gain) ? w.threat_gain : 1;

  const pressureGain = Number.isFinite(w.pressure_gain) ? w.pressure_gain : 1;
  const controlGain = Number.isFinite(w.control_gain) ? w.control_gain : 1;
  const uncGain = Number.isFinite(w.uncertainty_gain) ? w.uncertainty_gain : 1;

  // Traits → appraisal:
  const threatAdj = clamp01(threatBias + (0.5 + (threat - 0.5) * threatGain) + 0.25 * (trParanoia - 0.5));
  const uncAdj = clamp01(0.5 + (unc - 0.5) * uncGain + 0.20 * (0.5 - trExperience));
  const pressureAdj = clamp01((0.5 + (pressure - 0.5) * pressureGain) + 0.30 * (trSensitive - 0.5));
  const controlAdj = clamp01(0.5 + (control - 0.5) * controlGain - 0.10 * (uncAdj - 0.5));

  // ---------- social layer (ToM -> appraisal) ----------
  // If a supportive person is nearby, it should reduce threat & boost control/attachment.
  // If a threatening person is nearby, it should do the opposite.
  const usedSocial: string[] = [];
  type DyadSlot = { trust?: number; support?: number; threat?: number };
  const dyads = new Map<string, DyadSlot>();

  for (const a of atoms) {
    const id = String((a as any)?.id ?? '');
    if (!id.startsWith(`tom:effective:dyad:${selfId}:`)) continue;
    const parts = id.split(':'); // tom:effective:dyad:self:other:metric
    if (parts.length < 6) continue;
    const otherId = parts[4];
    const metric = parts[5];
    const m = (a as any)?.magnitude;
    if (typeof m !== 'number') continue;
    const slot = dyads.get(otherId) ?? (dyads.set(otherId, {}), dyads.get(otherId)!);
    if (metric === 'trust') slot.trust = m;
    if (metric === 'support') slot.support = m;
    if (metric === 'threat') slot.threat = m;
    usedSocial.push(id);
  }

  const proximity01 = (otherId: string): number => {
    // Prefer explicit observation, then proximity atoms, then relationship closeness.
    const idObs = `obs:nearby:${selfId}:${otherId}`;
    const obs = getMag(atoms, idObs, null as any);
    if (typeof obs === 'number') {
      usedSocial.push(idObs);
      return clamp01(obs);
    }

    let best = 0;
    for (const a of atoms) {
      const id = String((a as any)?.id ?? '');
      const m = (a as any)?.magnitude;
      if (typeof m !== 'number') continue;
      if ((id.startsWith('prox:') || id.startsWith('soc:')) && id.includes(`:${selfId}:`) && id.endsWith(`:${otherId}`)) {
        best = Math.max(best, m);
        usedSocial.push(id);
      }
    }

    if (best > 0) return clamp01(best);
    const idRel = `rel:base:${selfId}:${otherId}:closeness`;
    const rel = getMag(atoms, idRel, 0);
    if (typeof rel === 'number') usedSocial.push(idRel);
    return clamp01(rel);
  };

  let pNoSupport = 1;
  let pNoThreat = 1;
  for (const [otherId, slot] of dyads.entries()) {
    const close = proximity01(otherId);
    if (close <= 0) continue;
    const trust = clamp01(slot.trust ?? 0.5);
    const support = clamp01(slot.support ?? 0);
    const threatToMe = clamp01(slot.threat ?? 0);

    const s_i = clamp01(close * support * (0.35 + 0.65 * trust));
    const t_i = clamp01(close * threatToMe * (0.30 + 0.70 * (1 - trust)));

    pNoSupport *= (1 - s_i);
    pNoThreat *= (1 - t_i);
  }

  const socialSupport01 = clamp01(1 - pNoSupport);
  const socialThreat01 = clamp01(1 - pNoThreat);

  const threatAdj2 = clamp01(threatAdj + 0.45 * socialThreat01 - 0.30 * socialSupport01);
  const uncAdj2 = clamp01(uncAdj + 0.10 * socialThreat01 - 0.08 * socialSupport01);
  const controlAdj2 = clamp01(controlAdj + 0.25 * socialSupport01 - 0.20 * socialThreat01);

  // pressure is mostly normative/contextual, but social threat slightly increases it
  const pressureAdj2 = clamp01(pressureAdj + 0.10 * socialThreat01);

  // attachment: keep mostly contextual, but allow mild stress erosion
  const attachment0 = clamp01(0.75 * intimacy0.magnitude + 0.25 * (1 - pub0.magnitude));
  const attachmentBase = amp01(attachment0, lerp(1.00, 0.80, bStress));
  const attachment = clamp01(
    attachmentBase
    - 0.12 * (threatAdj2 - 0.5)
    - 0.05 * (pressureAdj2 - 0.5)
    + 0.35 * socialSupport01
    - 0.15 * socialThreat01
  );

  const grief0 = getCtx(atoms, selfId, 'grief', 0);
  const pain0 = getCtx(atoms, selfId, 'pain', 0);
  const loss = clamp01(0.65 * grief0.magnitude + 0.35 * pain0.magnitude);

  const tp0 = getMag(atoms, `ctx:timePressure:${selfId}`, 0);
  const sc0 = getMag(atoms, `ctx:scarcity:${selfId}`, 0);
  const goalBlock = clamp01(0.55 * tp0 + 0.45 * sc0);

  const used = [
    threatId,
    ...(danger.id ? [danger.id] : pickCtxId('danger', selfId)),
    ...(unc0.id ? [unc0.id] : pickCtxId('uncertainty', selfId)),
    ...(norm0.id ? [norm0.id] : pickCtxId('normPressure', selfId)),
    ...(pub0.id ? [pub0.id] : pickCtxId('publicness', selfId)),
    ...(intimacy0.id ? [intimacy0.id] : pickCtxId('intimacy', selfId)),
    coverId,
    escapeId,
    ...(grief0.id ? [grief0.id] : pickCtxId('grief', selfId)),
    ...(pain0.id ? [pain0.id] : pickCtxId('pain', selfId)),
    `ctx:timePressure:${selfId}`,
    `ctx:scarcity:${selfId}`,
    `feat:char:${selfId}:trait.paranoia`,
    `feat:char:${selfId}:trait.sensitivity`,
    `feat:char:${selfId}:trait.experience`,
    `feat:char:${selfId}:body.stress`,
    `feat:char:${selfId}:body.fatigue`,
    `feat:char:${selfId}:body.pain`,
    `feat:char:${selfId}:body.sleepDebt`,
    ...usedSocial,
  ].filter(id => typeof id === 'string' && atoms.some(a => a?.id === id));

  const mk = (key: string, v: number, parts: any) =>
    normalizeAtom({
      id: `app:${key}:${selfId}`,
      ns: 'app' as any,
      kind: 'appraisal' as any,
      origin: 'derived',
      source: 'emotion_appraisal',
      magnitude: clamp01(v),
      confidence: 1,
      subject: selfId,
      tags: ['appraisal', key],
      label: `app.${key}:${Math.round(clamp01(v) * 100)}%`,
      trace: { usedAtomIds: used, notes: ['derived appraisal (personalized)'], parts },
    } as any);

  const partsBase = {
    traits: { paranoia: trParanoia, sensitivity: trSensitive, experience: trExperience },
    body: { stress: bStress, fatigue: bFatigue, pain: bPain, sleepDebt: bSleepDebt },
    gains: { kThreat, kUnc, kCtrl, kPress },
    weights: { threatBias, threatGain, pressureGain, controlGain, uncGain },
  };

  const atomsOut: ContextAtom[] = [
    mk('socialSupport', socialSupport01, { note: 'from tom:effective dyads + proximity' }),
    mk('socialThreat', socialThreat01, { note: 'from tom:effective dyads + proximity' }),
    mk('threat', threatAdj2, { ...partsBase, threat0, threat, danger: danger.magnitude, dangerLayer: danger.layer, threatAdj: threatAdj2, socialSupport01, socialThreat01 }),
    mk('uncertainty', uncAdj2, { ...partsBase, unc0: unc0.magnitude, uncLayer: unc0.layer, unc, uncAdj: uncAdj2, socialSupport01, socialThreat01 }),
    mk('control', controlAdj2, { ...partsBase, cover0, escape0, control0, control, controlAdj: controlAdj2, socialSupport01, socialThreat01 }),
    mk('pressure', pressureAdj2, { ...partsBase, norm0: norm0.magnitude, normLayer: norm0.layer, pub0: pub0.magnitude, pubLayer: pub0.layer, pressure0, pressure, pressureAdj: pressureAdj2, socialThreat01 }),
    mk('attachment', attachment, { ...partsBase, intimacy0: intimacy0.magnitude, intimacyLayer: intimacy0.layer, pub0: pub0.magnitude, pubLayer: pub0.layer, attachment0, attachmentBase, attachment, socialSupport01, socialThreat01 }),
    mk('loss', loss, { grief0: grief0.magnitude, griefLayer: grief0.layer, pain0: pain0.magnitude, painLayer: pain0.layer, loss }),
    mk('goalBlock', goalBlock, { tp0, sc0, goalBlock }),
  ];

  return {
    appraisal: {
      socialSupport: socialSupport01,
      socialThreat: socialThreat01,
      threat: threatAdj2,
      uncertainty: uncAdj2,
      control: controlAdj2,
      pressure: pressureAdj2,
      attachment,
      loss,
      goalBlock,
    },
    atoms: atomsOut,
    usedAtomIds: used,
  };
}
