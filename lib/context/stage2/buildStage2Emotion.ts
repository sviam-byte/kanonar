// lib/context/stage2/buildStage2Emotion.ts
import type { Atom } from '../../atoms/types';
import { AtomBag } from '../../atoms/atomBag';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function get(resolved: Map<string, Atom>, id: string, fb = 0) {
  const a = resolved.get(id);
  const m = a?.m;
  return typeof m === 'number' && Number.isFinite(m) ? m : fb;
}

function mkDerived(id: string, m: number, usedAtomIds: string[], parts: Record<string, any>): Atom {
  // IMPORTANT: Atom meta.trace.parts must be an array in Atom model.
  const partsArr = Object.entries(parts || {}).map(([name, value]) => ({
    name,
    value: typeof value === 'number' && Number.isFinite(value) ? value : 0,
  }));

  return {
    id,
    m: clamp01(m),
    c: 1,
    o: 'derived',
    meta: {
      trace: {
        usedAtomIds,
        parts: partsArr,
        notes: 'stage2: appraisal/emotions (mvp)',
      },
    },
  };
}

export function applyStage2Emotion(bag: AtomBag, selfId: string) {
  const r = bag.resolve();

  // Inputs (must exist after stage1+stage3):
  const threat = get(r, `threat:final:${selfId}`, 0);
  const unc = get(r, `ctx:uncertainty:${selfId}`, 0);
  const pub = get(r, `ctx:publicness:${selfId}`, 0);
  const surv = get(r, `ctx:surveillance:${selfId}`, 0);

  const cover = get(r, `world:map:cover:${selfId}`, 0.5);
  const escape = get(r, `world:map:escape:${selfId}`, 0.5);

  // Proxies (если отдельные атомы отсутствуют):
  const normPressure = get(r, `ctx:normPressure:${selfId}`, clamp01(0.65 * surv + 0.35 * pub));
  const intimacy = get(r, `ctx:intimacy:${selfId}`, clamp01(1 - pub));

  const control = clamp01(0.45 * cover + 0.35 * escape + 0.20 * (1 - unc));
  const pressure = clamp01(0.65 * normPressure + 0.35 * pub);
  const attachment = clamp01(0.75 * intimacy + 0.25 * (1 - pub));

  const used = [
    `threat:final:${selfId}`,
    `ctx:uncertainty:${selfId}`,
    `ctx:publicness:${selfId}`,
    `ctx:surveillance:${selfId}`,
    `world:map:cover:${selfId}`,
    `world:map:escape:${selfId}`,
  ];

  // --- Appraisal atoms ---
  const appAtoms: Atom[] = [
    mkDerived(`app:threat:${selfId}`, threat, used, { threat }),
    mkDerived(`app:uncertainty:${selfId}`, unc, used, { unc }),
    mkDerived(`app:control:${selfId}`, control, used, { cover, escape, unc, control }),
    mkDerived(`app:pressure:${selfId}`, pressure, used, { normPressure, pub, pressure }),
    mkDerived(`app:attachment:${selfId}`, attachment, used, { intimacy, pub, attachment }),
  ];
  bag.addMany(appAtoms);

  // Re-resolve to include app:*
  const r2 = bag.resolve();
  const aThreat = get(r2, `app:threat:${selfId}`, threat);
  const aUnc = get(r2, `app:uncertainty:${selfId}`, unc);
  const aControl = get(r2, `app:control:${selfId}`, control);
  const aPressure = get(r2, `app:pressure:${selfId}`, pressure);
  const aAttach = get(r2, `app:attachment:${selfId}`, attachment);

  // --- Emotions (simple, stable MVP mapping) ---
  const fear = clamp01(aThreat * (1 - aControl) * (0.5 + 0.5 * aUnc));
  const anger = clamp01(aThreat * aControl * (1 - aUnc) * (1 - aPressure));
  const shame = clamp01(aPressure * (0.6 + 0.4 * aThreat) * (1 - aAttach));
  const relief = clamp01((1 - aThreat) * aControl);
  const resolve = clamp01(0.55 * aControl + 0.30 * anger + 0.15 * (1 - aUnc));
  const care = clamp01(aAttach * (0.65 + 0.35 * (1 - aThreat)));

  const emoUsed = [
    `app:threat:${selfId}`,
    `app:uncertainty:${selfId}`,
    `app:control:${selfId}`,
    `app:pressure:${selfId}`,
    `app:attachment:${selfId}`,
  ];

  const emoAtoms: Atom[] = [
    mkDerived(`emo:fear:${selfId}`, fear, emoUsed, { aThreat, aControl, aUnc, fear }),
    mkDerived(`emo:anger:${selfId}`, anger, emoUsed, { aThreat, aControl, aUnc, aPressure, anger }),
    mkDerived(`emo:shame:${selfId}`, shame, emoUsed, { aPressure, aThreat, aAttach, shame }),
    mkDerived(`emo:relief:${selfId}`, relief, emoUsed, { aThreat, aControl, relief }),
    mkDerived(`emo:resolve:${selfId}`, resolve, emoUsed, { aControl, anger, aUnc, resolve }),
    mkDerived(`emo:care:${selfId}`, care, emoUsed, { aAttach, aThreat, care }),
  ];
  bag.addMany(emoAtoms);
}
