import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const clamp11 = (x: number) => (Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

export function deriveEmotionAtoms(args: { selfId: string; atoms: ContextAtom[] }) {
  const { selfId, atoms } = args;

  // Soft personality modulation. Goal: emotions depend on character without overriding the scene context.
  // If trait atoms are missing, fallbacks keep behavior unchanged.
  const trHpa = clamp01(getMag(atoms, `feat:char:${selfId}:trait.hpaReactivity`, 0.5));
  const trSensitivity = clamp01(getMag(atoms, `feat:char:${selfId}:trait.sensitivity`, 0.5));
  const trCareTrait = clamp01(getMag(atoms, `feat:char:${selfId}:trait.care`, 0.4));
  const trSafety = clamp01(getMag(atoms, `feat:char:${selfId}:trait.safety`, 0.5));
  const trPowerDrive = clamp01(getMag(atoms, `feat:char:${selfId}:trait.powerDrive`, 0.4));
  const trNormSens = clamp01(getMag(atoms, `feat:char:${selfId}:trait.normSensitivity`, 0.5));

  const threat = getMag(atoms, `app:threat:${selfId}`, getMag(atoms, `threat:final:${selfId}`, 0));
  const unc = getMag(atoms, `app:uncertainty:${selfId}`, getMag(atoms, `ctx:uncertainty:${selfId}`, 0));
  const control = getMag(atoms, `app:control:${selfId}`, 0.4);
  const pressure = getMag(atoms, `app:pressure:${selfId}`, 0);
  const attachment = getMag(atoms, `app:attachment:${selfId}`, 0);
  const loss = getMag(atoms, `app:loss:${selfId}`, 0);
  const goalBlock = getMag(atoms, `app:goalBlock:${selfId}`, 0);

  // core emotions (0..1)
  const fear0 = clamp01(threat * (1 - control) * (0.5 + 0.5 * unc));
  const anger0 = clamp01(threat * control * (1 - unc) * (1 - pressure));
  const shame0 = clamp01(pressure * (0.6 + 0.4 * threat) * (1 - attachment));
  const relief0 = clamp01((1 - threat) * control * (1 - goalBlock));
  const resolve0 = clamp01(0.55 * control + 0.30 * anger0 + 0.15 * (1 - unc));
  const care0 = clamp01(attachment * (0.65 + 0.35 * (1 - threat)));

  // Personality tilt (keep small): blend base with modulated base.
  const alpha = 0.35;
  const fear = clamp01((1 - alpha) * fear0 + alpha * (fear0 * (0.75 + 0.60 * trHpa + 0.30 * trSensitivity + 0.25 * trSafety)));
  const anger = clamp01((1 - alpha) * anger0 + alpha * (anger0 * (0.75 + 0.55 * trPowerDrive - 0.35 * trNormSens)));
  const shame = clamp01((1 - alpha) * shame0 + alpha * (shame0 * (0.75 + 0.55 * trNormSens + 0.25 * trSensitivity)));
  const relief = clamp01((1 - alpha) * relief0 + alpha * (relief0 * (0.85 + 0.20 * (1 - trHpa))));
  const resolve = clamp01((1 - alpha) * resolve0 + alpha * (resolve0 * (0.80 + 0.45 * trPowerDrive + 0.20 * trSafety) + 0.05 * (1 - trSensitivity)));
  const care = clamp01((1 - alpha) * care0 + alpha * (care0 * (0.80 + 0.70 * trCareTrait)));

  // derived mood axes
  const arousal0 = clamp01(0.60 * threat + 0.20 * unc + 0.20 * pressure);
  const arousal = clamp01((1 - alpha) * arousal0 + alpha * (arousal0 * (0.80 + 0.70 * trHpa + 0.25 * trSensitivity)));
  const valence = clamp11(
    (+0.55 * relief + 0.35 * care) -
    (0.60 * fear + 0.35 * shame + 0.25 * anger + 0.55 * loss)
  );

  const used = [
    `app:threat:${selfId}`,
    `app:uncertainty:${selfId}`,
    `app:control:${selfId}`,
    `app:pressure:${selfId}`,
    `app:attachment:${selfId}`,
    `app:loss:${selfId}`,
    `app:goalBlock:${selfId}`,
    `feat:char:${selfId}:trait.hpaReactivity`,
    `feat:char:${selfId}:trait.sensitivity`,
    `feat:char:${selfId}:trait.care`,
    `feat:char:${selfId}:trait.safety`,
    `feat:char:${selfId}:trait.powerDrive`,
    `feat:char:${selfId}:trait.normSensitivity`,
  ];

  const mk = (key: string, v: number, parts: any) =>
    normalizeAtom({
      id: `emo:${key}:${selfId}`,
      ns: 'emo' as any,
      kind: 'emotion' as any,
      origin: 'derived',
      source: 'emotion_core',
      magnitude: clamp01(v),
      confidence: 1,
      subject: selfId,
      tags: ['emo', key],
      label: `emo.${key}:${Math.round(clamp01(v) * 100)}%`,
      trace: { usedAtomIds: used, notes: ['derived core emotion'], parts },
    } as any);

  const mk11 = (key: string, v: number, parts: any) =>
    normalizeAtom({
      id: `emo:${key}:${selfId}`,
      ns: 'emo' as any,
      kind: 'emotion_axis' as any,
      origin: 'derived',
      source: 'emotion_axes',
      magnitude: v as any, // valence: -1..1 (оставляем как есть)
      confidence: 1,
      subject: selfId,
      tags: ['emo', 'axis', key],
      label: `emo.${key}:${Math.round(v * 100)}%`,
      trace: { usedAtomIds: used, notes: ['derived affect axis'], parts },
    } as any);

  return {
    emotions: { fear, anger, shame, relief, resolve, care, arousal, valence },
    atoms: [
      mk('fear', fear, { threat, control, unc, fear0, fear, trHpa, trSensitivity, trSafety }),
      mk('anger', anger, { threat, control, unc, pressure, anger0, anger, trPowerDrive, trNormSens }),
      mk('shame', shame, { pressure, threat, attachment, shame0, shame, trNormSens, trSensitivity }),
      mk('relief', relief, { threat, control, goalBlock, relief0, relief, trHpa }),
      mk('resolve', resolve, { control, unc, resolve0, resolve, trPowerDrive, trSafety, trSensitivity }),
      mk('care', care, { attachment, threat, care0, care, trCareTrait }),
      normalizeAtom({ // arousal 0..1
        id: `emo:arousal:${selfId}`,
        ns: 'emo' as any,
        kind: 'emotion_axis' as any,
        origin: 'derived',
        source: 'emotion_axes',
        magnitude: arousal,
        confidence: 1,
        subject: selfId,
        tags: ['emo', 'axis', 'arousal'],
        label: `emo.arousal:${Math.round(arousal * 100)}%`,
        trace: { usedAtomIds: used, notes: ['derived affect axis'], parts: { arousal0, arousal, trHpa, trSensitivity } },
      } as any),
      mk11('valence', valence, { valence }),
    ],
    usedAtomIds: used,
  };
}
