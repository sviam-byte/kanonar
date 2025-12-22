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

  const threat = getMag(atoms, `app:threat:${selfId}`, getMag(atoms, `threat:final:${selfId}`, 0));
  const unc = getMag(atoms, `app:uncertainty:${selfId}`, getMag(atoms, `ctx:uncertainty:${selfId}`, 0));
  const control = getMag(atoms, `app:control:${selfId}`, 0.4);
  const pressure = getMag(atoms, `app:pressure:${selfId}`, 0);
  const attachment = getMag(atoms, `app:attachment:${selfId}`, 0);
  const loss = getMag(atoms, `app:loss:${selfId}`, 0);
  const goalBlock = getMag(atoms, `app:goalBlock:${selfId}`, 0);

  // core emotions (0..1)
  const fear = clamp01(threat * (1 - control) * (0.5 + 0.5 * unc));
  const anger = clamp01(threat * control * (1 - unc) * (1 - pressure));
  const shame = clamp01(pressure * (0.6 + 0.4 * threat) * (1 - attachment));
  const relief = clamp01((1 - threat) * control * (1 - goalBlock));
  const resolve = clamp01(0.55 * control + 0.30 * anger + 0.15 * (1 - unc));
  const care = clamp01(attachment * (0.65 + 0.35 * (1 - threat)));

  // derived mood axes
  const arousal = clamp01(0.60 * threat + 0.20 * unc + 0.20 * pressure);
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
      mk('fear', fear, { threat, control, unc, fear }),
      mk('anger', anger, { threat, control, unc, pressure, anger }),
      mk('shame', shame, { pressure, threat, attachment, shame }),
      mk('relief', relief, { threat, control, goalBlock, relief }),
      mk('resolve', resolve, { control, anger, unc, resolve }),
      mk('care', care, { attachment, threat, care }),
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
        trace: { usedAtomIds: used, notes: ['derived affect axis'], parts: { arousal } },
      } as any),
      mk11('valence', valence, { valence }),
    ],
    usedAtomIds: used,
  };
}
