import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

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

  const unc0 = getMag(atoms, `ctx:uncertainty:${selfId}`, 0);
  const norm0 = getMag(atoms, `ctx:normPressure:${selfId}`, 0);
  const pub0 = getMag(atoms, `ctx:publicness:${selfId}`, 0);
  const intimacy0 = getMag(atoms, `ctx:intimacy:${selfId}`, 0);

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
  const unc = amp01(unc0, kUnc);

  const control0 = clamp01(0.45 * cover0 + 0.35 * escape0 + 0.20 * (1 - unc0));
  const control = amp01(control0, kCtrl);

  const pressure0 = clamp01(0.65 * norm0 + 0.35 * pub0);
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

  // attachment: keep mostly contextual, but allow mild stress erosion
  const attachment0 = clamp01(0.75 * intimacy0 + 0.25 * (1 - pub0));
  const attachment = amp01(attachment0, lerp(1.00, 0.80, bStress));

  const grief0 = getMag(atoms, `ctx:grief:${selfId}`, 0);
  const pain0 = getMag(atoms, `ctx:pain:${selfId}`, 0);
  const loss = clamp01(0.65 * grief0 + 0.35 * pain0);

  const tp0 = getMag(atoms, `ctx:timePressure:${selfId}`, 0);
  const sc0 = getMag(atoms, `ctx:scarcity:${selfId}`, 0);
  const goalBlock = clamp01(0.55 * tp0 + 0.45 * sc0);

  const used = [
    threatId,
    `ctx:uncertainty:${selfId}`,
    `ctx:normPressure:${selfId}`,
    `ctx:publicness:${selfId}`,
    `ctx:intimacy:${selfId}`,
    coverId,
    escapeId,
    `ctx:grief:${selfId}`,
    `ctx:pain:${selfId}`,
    `ctx:timePressure:${selfId}`,
    `ctx:scarcity:${selfId}`,
    `feat:char:${selfId}:trait.paranoia`,
    `feat:char:${selfId}:trait.sensitivity`,
    `feat:char:${selfId}:trait.experience`,
    `feat:char:${selfId}:body.stress`,
    `feat:char:${selfId}:body.fatigue`,
    `feat:char:${selfId}:body.pain`,
    `feat:char:${selfId}:body.sleepDebt`,
  ].filter(Boolean) as string[];

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
    mk('threat', threatAdj, { ...partsBase, threat0, threat, threatAdj }),
    mk('uncertainty', uncAdj, { ...partsBase, unc0, unc, uncAdj }),
    mk('control', controlAdj, { ...partsBase, cover0, escape0, control0, control, controlAdj }),
    mk('pressure', pressureAdj, { ...partsBase, norm0, pub0, pressure0, pressure, pressureAdj }),
    mk('attachment', attachment, { ...partsBase, intimacy0, pub0, attachment0, attachment }),
    mk('loss', loss, { grief0, pain0, loss }),
    mk('goalBlock', goalBlock, { tp0, sc0, goalBlock }),
  ];

  return {
    appraisal: { threat: threatAdj, uncertainty: uncAdj, control: controlAdj, pressure: pressureAdj, attachment, loss, goalBlock },
    atoms: atomsOut,
    usedAtomIds: used,
  };
}
