import type { ContextAtom } from '../context/v2/types';
import { getCtx } from '../context/layers';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => String((x as any)?.id) === id) as any;
  const m = a?.magnitude;
  return typeof m === 'number' && Number.isFinite(m) ? m : fb;
}

/**
 * Compute snapshot.summary metrics from atoms for quick UI reads.
 * Keeps math simple while still reflecting contextual + emotional state.
 */
export function computeSnapshotSummary(atoms: ContextAtom[], selfId: string) {
  const danger = getCtx(atoms, selfId, 'danger', 0).magnitude;
  const control = getCtx(atoms, selfId, 'control', 0).magnitude;
  const unc = getCtx(atoms, selfId, 'uncertainty', 0).magnitude;
  const press = getCtx(atoms, selfId, 'normPressure', 0).magnitude;
  const pub = getCtx(atoms, selfId, 'publicness', 0).magnitude;
  const surv = getCtx(atoms, selfId, 'surveillance', 0).magnitude;
  const intim = getCtx(atoms, selfId, 'intimacy', 0).magnitude;
  const scar = getCtx(atoms, selfId, 'scarcity', 0).magnitude;
  const time = getCtx(atoms, selfId, 'timePressure', 0).magnitude;

  const fear = getMag(atoms, `emo:fear:${selfId}`, getMag(atoms, 'emo:fear', 0));
  const anger = getMag(atoms, `emo:anger:${selfId}`, getMag(atoms, 'emo:anger', 0));
  const shame = getMag(atoms, `emo:shame:${selfId}`, getMag(atoms, 'emo:shame', 0));

  // Prototype metrics (summary layer for UI).
  const threatLevel = clamp01(0.70 * danger + 0.30 * fear);
  const coping = clamp01(0.80 * control + 0.20 * (1 - unc));
  const tension = clamp01(0.55 * fear + 0.25 * anger + 0.20 * press);
  const clarity = clamp01(1 - unc);
  const credibility = clamp01(0.60 * clarity + 0.40 * (1 - shame));
  const socialExposure = clamp01(0.55 * surv + 0.45 * pub);
  const normRisk = clamp01(press);
  const intimacyIndex = clamp01(intim);

  let totalAtomMagnitude = 0;
  for (const a of atoms) {
    const m = (a as any)?.magnitude;
    if (typeof m === 'number' && Number.isFinite(m)) totalAtomMagnitude += Math.abs(m);
  }

  return {
    threatLevel,
    coping,
    tension,
    clarity,
    credibility,
    socialExposure,
    normRisk,
    intimacyIndex,
    scarcity: scar,
    timePressure: time,
    totalAtomMagnitude,
  };
}
