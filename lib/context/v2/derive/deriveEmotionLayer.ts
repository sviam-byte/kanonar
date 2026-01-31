import type { ContextAtom } from '../types';
import type { WorldState } from '../../../../types';
import { normalizeAtom } from '../infer';
import { curve01Param, type CurvePreset } from '../../../utils/curves';

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const clamp11 = (x: number) => Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));

function get(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return typeof m === 'number' && Number.isFinite(m) ? m : fb;
}

function mk(
  id: string,
  magnitude: number,
  usedAtomIds: string[],
  parts: Record<string, any>,
  kind: string,
) {
  return normalizeAtom({
    id,
    ns: id.split(':')[0] as any,
    kind,
    origin: 'derived',
    source: 'emotionLayer',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: id.split(':')[id.split(':').length - 1],
    tags: ['emotionLayer', id.startsWith('app:') ? 'app' : 'emo'],
    label: id,
    trace: {
      usedAtomIds,
      notes: ['deriveEmotionLayer@v1'],
      parts,
    },
  } as any);
}

type EmotionCurveCfg = { preset?: CurvePreset; bias?: number; gain?: number };

function getCurveCfg(
  world: WorldState | null | undefined,
  selfId: string,
  emoKey: string,
  fallbackPreset: CurvePreset
): EmotionCurveCfg {
  const perSelf = (world as any)?.emotionCurves?.[selfId] as any;
  const cfg = perSelf?.[emoKey] || null;
  const preset = (cfg?.preset as CurvePreset) || ((world as any)?.decisionCurvePreset as CurvePreset) || fallbackPreset;
  return {
    preset,
    bias: typeof cfg?.bias === 'number' ? cfg.bias : 0.5,
    gain: typeof cfg?.gain === 'number' ? cfg.gain : 1,
  };
}

export function deriveAppraisalAndEmotionAtomsV2(
  selfId: string,
  atoms: ContextAtom[],
  world?: WorldState | null,
): ContextAtom[] {
  // --- Inputs expected to exist already ---
  const threat = get(atoms, `threat:final:${selfId}`, get(atoms, `mind:threat:${selfId}`, 0));
  const unc = get(atoms, `ctx:uncertainty:${selfId}`, get(atoms, `threat:unc:${selfId}`, 0));
  const pub = get(atoms, `ctx:publicness:${selfId}`, 0);
  const surv = get(atoms, `ctx:surveillance:${selfId}`, 0);
  const cover = get(atoms, `world:map:cover:${selfId}`, 0.5);
  const escape = get(atoms, `world:map:escape:${selfId}`, 0.5);

  // Optional axes if you have them
  const normPressure = get(atoms, `ctx:normPressure:${selfId}`, clamp01(0.65 * surv + 0.35 * pub));
  const intimacy = get(atoms, `ctx:intimacy:${selfId}`, clamp01(1 - pub));

  const usedBase = [
    `threat:final:${selfId}`,
    `mind:threat:${selfId}`,
    `ctx:uncertainty:${selfId}`,
    `ctx:publicness:${selfId}`,
    `ctx:surveillance:${selfId}`,
    `world:map:cover:${selfId}`,
    `world:map:escape:${selfId}`,
    `ctx:normPressure:${selfId}`,
    `ctx:intimacy:${selfId}`,
  ];

  // --- Appraisal ---
  const control = clamp01(0.45 * cover + 0.35 * escape + 0.20 * (1 - unc));
  const pressure = clamp01(0.65 * normPressure + 0.35 * pub);
  const attachment = clamp01(0.75 * intimacy + 0.25 * (1 - pub));

  const appAtoms: ContextAtom[] = [
    mk(`app:threat:${selfId}`, threat, usedBase, { threat }, 'appraisal'),
    mk(`app:uncertainty:${selfId}`, unc, usedBase, { unc }, 'appraisal'),
    mk(
      `app:control:${selfId}`,
      control,
      usedBase,
      { cover, escape, unc, formula: '0.45*cover + 0.35*escape + 0.20*(1-unc)' },
      'appraisal',
    ),
    mk(
      `app:pressure:${selfId}`,
      pressure,
      usedBase,
      { normPressure, pub, formula: '0.65*normPressure + 0.35*publicness' },
      'appraisal',
    ),
    mk(
      `app:attachment:${selfId}`,
      attachment,
      usedBase,
      { intimacy, pub, formula: '0.75*intimacy + 0.25*(1-publicness)' },
      'appraisal',
    ),
  ];

  // --- Emotions from appraisal ---
  const aThreat = threat;
  const aUnc = unc;
  const aControl = control;
  const aPressure = pressure;
  const aAttach = attachment;

  const rawFear = clamp01(aThreat * (1 - aControl) * (0.5 + 0.5 * aUnc));
  const rawAnger = clamp01(aThreat * aControl * (1 - aUnc) * (1 - aPressure));
  const rawShame = clamp01(aPressure * (0.6 + 0.4 * aThreat) * (1 - aAttach));
  const rawRelief = clamp01((1 - aThreat) * aControl);
  const rawResolve = clamp01(0.55 * aControl + 0.30 * rawAnger + 0.15 * (1 - aUnc));
  const rawCare = clamp01(aAttach * (0.65 + 0.35 * (1 - aThreat)));

  const fallbackPreset: CurvePreset = 'smoothstep';
  const fearCfg = getCurveCfg(world, selfId, 'fear', fallbackPreset);
  const angerCfg = getCurveCfg(world, selfId, 'anger', fallbackPreset);
  const shameCfg = getCurveCfg(world, selfId, 'shame', fallbackPreset);
  const reliefCfg = getCurveCfg(world, selfId, 'relief', fallbackPreset);
  const resolveCfg = getCurveCfg(world, selfId, 'resolve', fallbackPreset);
  const careCfg = getCurveCfg(world, selfId, 'care', fallbackPreset);

  const fearRes = curve01Param(rawFear, fearCfg.preset || fallbackPreset, { bias: fearCfg.bias, gain: fearCfg.gain });
  const angerRes = curve01Param(rawAnger, angerCfg.preset || fallbackPreset, { bias: angerCfg.bias, gain: angerCfg.gain });
  const shameRes = curve01Param(rawShame, shameCfg.preset || fallbackPreset, { bias: shameCfg.bias, gain: shameCfg.gain });
  const reliefRes = curve01Param(rawRelief, reliefCfg.preset || fallbackPreset, { bias: reliefCfg.bias, gain: reliefCfg.gain });
  const resolveRes = curve01Param(rawResolve, resolveCfg.preset || fallbackPreset, { bias: resolveCfg.bias, gain: resolveCfg.gain });
  const careRes = curve01Param(rawCare, careCfg.preset || fallbackPreset, { bias: careCfg.bias, gain: careCfg.gain });

  const fear = clamp01(fearRes.y);
  const anger = clamp01(angerRes.y);
  const shame = clamp01(shameRes.y);
  const relief = clamp01(reliefRes.y);
  const resolve = clamp01(resolveRes.y);
  const care = clamp01(careRes.y);

  const arousal = clamp01(0.60 * aThreat + 0.20 * aUnc + 0.20 * aPressure);
  const valenceSigned = clamp11((+0.55 * relief + 0.35 * care) - (0.60 * fear + 0.35 * shame + 0.25 * anger));
  const valence01 = clamp01((valenceSigned + 1) / 2);

  const usedEmo = [
    `app:threat:${selfId}`,
    `app:uncertainty:${selfId}`,
    `app:control:${selfId}`,
    `app:pressure:${selfId}`,
    `app:attachment:${selfId}`,
  ];

  const emoAtoms: ContextAtom[] = [
    mk(
      `emo:fear:${selfId}`,
      fear,
      usedEmo,
      { aThreat, aControl, aUnc, raw: rawFear, x1: fearRes.x1, preset: fearCfg.preset, bias: fearCfg.bias, gain: fearCfg.gain, fear },
      'emotion',
    ),
    mk(
      `emo:anger:${selfId}`,
      anger,
      usedEmo,
      { aThreat, aControl, aUnc, aPressure, raw: rawAnger, x1: angerRes.x1, preset: angerCfg.preset, bias: angerCfg.bias, gain: angerCfg.gain, anger },
      'emotion',
    ),
    mk(
      `emo:shame:${selfId}`,
      shame,
      usedEmo,
      { aPressure, aThreat, aAttach, raw: rawShame, x1: shameRes.x1, preset: shameCfg.preset, bias: shameCfg.bias, gain: shameCfg.gain, shame },
      'emotion',
    ),
    mk(
      `emo:relief:${selfId}`,
      relief,
      usedEmo,
      { aThreat, aControl, raw: rawRelief, x1: reliefRes.x1, preset: reliefCfg.preset, bias: reliefCfg.bias, gain: reliefCfg.gain, relief },
      'emotion',
    ),
    mk(
      `emo:resolve:${selfId}`,
      resolve,
      usedEmo,
      { aControl, rawAnger, aUnc, raw: rawResolve, x1: resolveRes.x1, preset: resolveCfg.preset, bias: resolveCfg.bias, gain: resolveCfg.gain, resolve },
      'emotion',
    ),
    mk(
      `emo:care:${selfId}`,
      care,
      usedEmo,
      { aAttach, aThreat, raw: rawCare, x1: careRes.x1, preset: careCfg.preset, bias: careCfg.bias, gain: careCfg.gain, care },
      'emotion',
    ),
    mk(`emo:arousal:${selfId}`, arousal, usedEmo, { arousal }, 'emotion'),
    mk(
      `emo:valence:${selfId}`,
      valence01,
      usedEmo,
      { valenceSigned, storedAs01: true },
      'emotion',
    ),
  ];

  return [...appAtoms, ...emoAtoms];
}
