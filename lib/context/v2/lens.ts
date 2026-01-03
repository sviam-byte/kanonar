import type { ContextAtom } from './types';
import { getCtx, sanitizeUsed } from '../layers';
import { normalizeAtom } from './infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);

// Soft amplification in [0..1].
const amp01 = (x: number, k: number) => {
  const xx = clamp01(x);
  const kk = Number.isFinite(k) ? Math.max(0, k) : 1;
  return clamp01(1 - Math.pow(1 - xx, kk));
};

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => String((x as any)?.id) === id) as any;
  const m = a?.magnitude;
  return typeof m === 'number' && Number.isFinite(m) ? m : fb;
}

/**
 * Apply a character lens to context axes and materialize ctx:final:* + lens:gain:*.
 * Keeps lens gains visible for debugging while ensuring final axes are stable.
 */
export function deriveLensCtxAtoms(args: { selfId: string; atoms: ContextAtom[]; agent?: any }) {
  const { selfId, atoms } = args;

  // traits/body (feat:char:* atoms should already be in the stream)
  const trParanoia = clamp01(getMag(atoms, `feat:char:${selfId}:trait.paranoia`, 0.5));
  const trSensitive = clamp01(getMag(atoms, `feat:char:${selfId}:trait.sensitivity`, 0.5));
  const trExperience = clamp01(getMag(atoms, `feat:char:${selfId}:trait.experience`, 0.2));

  const bStress = clamp01(getMag(atoms, `feat:char:${selfId}:body.stress`, 0));
  const bFatigue = clamp01(getMag(atoms, `feat:char:${selfId}:body.fatigue`, 0));
  const bSleepDebt = clamp01(getMag(atoms, `feat:char:${selfId}:body.sleepDebt`, 0));

  // Lens gains (distinct at context level).
  const gDanger = lerp(0.85, 1.85, trParanoia) * lerp(0.95, 1.25, bStress);
  const gUnc = lerp(0.80, 1.65, 1 - trExperience) * lerp(0.95, 1.25, bFatigue) * lerp(0.95, 1.25, bSleepDebt);
  const gPress = lerp(0.85, 1.70, trSensitive) * lerp(0.95, 1.20, bStress);

  // Control: experience ↑, paranoia ↓.
  const gCtrl = lerp(0.70, 1.40, trExperience) * lerp(1.25, 0.70, trParanoia) * lerp(1.10, 0.80, bFatigue);

  // Softer channels.
  const gSurv = lerp(0.95, 1.25, trParanoia);
  const gPub = lerp(0.95, 1.20, trSensitive);
  const gTime = lerp(0.90, 1.30, bStress);
  const gScar = lerp(0.95, 1.20, bFatigue);
  const gIntim = lerp(1.20, 0.85, trParanoia); // paranoia reduces perceived intimacy

  const gains: Record<string, number> = {
    danger: gDanger,
    uncertainty: gUnc,
    normPressure: gPress,
    control: gCtrl,
    surveillance: gSurv,
    publicness: gPub,
    timePressure: gTime,
    scarcity: gScar,
    intimacy: gIntim,
  };

  const usedTraitIds = [
    `feat:char:${selfId}:trait.paranoia`,
    `feat:char:${selfId}:trait.sensitivity`,
    `feat:char:${selfId}:trait.experience`,
    `feat:char:${selfId}:body.stress`,
    `feat:char:${selfId}:body.fatigue`,
    `feat:char:${selfId}:body.sleepDebt`,
  ].filter(id => atoms.some(a => String((a as any)?.id) === id));

  const out: ContextAtom[] = [];

  for (const axis of Object.keys(gains)) {
    const base = getCtx(atoms, selfId, axis, 0);
    const gain = gains[axis];

    const lensId = `lens:gain:${axis}:${selfId}`;
    out.push(normalizeAtom({
      id: lensId,
      ns: 'lens',
      kind: 'gain',
      origin: 'derived',
      source: 'lens',
      magnitude: clamp01(gain / 2), // keep in 0..1 while full gain is in parts
      confidence: 1,
      label: `lens gain ${axis} = ${gain.toFixed(2)}`,
      trace: {
        usedAtomIds: sanitizeUsed(lensId, [...usedTraitIds, base.id].filter(Boolean)),
        parts: { axis, gain, base: base.magnitude, layer: base.layer }
      }
    } as any));

    const finId = `ctx:final:${axis}:${selfId}`;
    const adjusted = amp01(base.magnitude, gain);

    out.push(normalizeAtom({
      id: finId,
      ns: 'ctx',
      kind: 'axis',
      origin: 'derived',
      source: 'lens',
      magnitude: adjusted,
      confidence: Math.min(1, base.confidence || 1),
      label: `ctx.${axis}.final=${Math.round(adjusted * 100)}%`,
      trace: {
        usedAtomIds: sanitizeUsed(finId, [base.id, lensId, ...usedTraitIds].filter(Boolean)),
        parts: { axis, base: base.magnitude, adjusted, gain }
      },
      code: `ctx.axis.${axis}.final`
    } as any));
  }

  return { atoms: out };
}
