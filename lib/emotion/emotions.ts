import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function mag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const v = a?.magnitude;
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

function mk(selfId: string, key: string, magnitude: number, usedAtomIds: string[], parts: any): ContextAtom {
  return normalizeAtom({
    id: `emo:${key}:${selfId}`,
    ns: 'mind',
    kind: 'emotion',
    origin: 'derived',
    source: 'emotionModule',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: selfId,
    tags: ['mind', 'emotion'],
    trace: { usedAtomIds: Array.from(new Set(usedAtomIds)), notes: [], parts },
    meta: parts,
    label: `emo:${key}`,
  });
}

export function deriveEmotionAtoms(selfId: string, atoms: ContextAtom[]): ContextAtom[] {
  const aThreat = mag(atoms, `app:threat:${selfId}`, 0);
  const aUnc = mag(atoms, `app:uncertainty:${selfId}`, 0);
  const aNorm = mag(atoms, `app:normPressure:${selfId}`, 0);
  const aPub = mag(atoms, `app:publicness:${selfId}`, 0);
  const aCtrl = mag(atoms, `app:control:${selfId}`, 0);
  const aAttach = mag(atoms, `app:attachment:${selfId}`, 0);
  const aBlock = mag(atoms, `app:goalBlock:${selfId}`, 0);
  const aLoss = mag(atoms, `app:loss:${selfId}`, 0);

  const used = [
    `app:threat:${selfId}`,
    `app:uncertainty:${selfId}`,
    `app:normPressure:${selfId}`,
    `app:publicness:${selfId}`,
    `app:control:${selfId}`,
    `app:attachment:${selfId}`,
    `app:goalBlock:${selfId}`,
    `app:loss:${selfId}`,
  ];

  // Core emotions
  const fear = aThreat * (0.6 + 0.4 * aUnc) * (1 - aCtrl);
  const anger = aBlock * (1 - aUnc) * (0.4 + 0.6 * aCtrl);
  const shame = aNorm * aPub * (1 - aAttach);
  const relief = (1 - aThreat) * (1 - aUnc) * aCtrl;
  const attachment = aAttach * (0.7 + 0.3 * (1 - aThreat));
  const resolve = aThreat * aCtrl * (1 - aNorm);

  // Meta axes
  const arousal = clamp01(Math.max(fear, anger) * 0.9 + aThreat * 0.1);
  const valence = clamp01(0.55 * relief + 0.45 * attachment - 0.6 * fear - 0.4 * shame);

  return [
    mk(selfId, 'fear', fear, used, { aThreat, aUnc, aCtrl }),
    mk(selfId, 'anger', anger, used, { aBlock, aUnc, aCtrl }),
    mk(selfId, 'shame', shame, used, { aNorm, aPub, aAttach }),
    mk(selfId, 'relief', relief, used, { aThreat, aUnc, aCtrl }),
    mk(selfId, 'attachment', attachment, used, { aAttach, aThreat }),
    mk(selfId, 'resolve', resolve, used, { aThreat, aCtrl, aNorm }),
    mk(selfId, 'arousal', arousal, used, { fear, anger, aThreat }),
    mk(selfId, 'valence', valence, used, { relief, attachment, fear, shame }),
  ];
}
