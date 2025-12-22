import type { Atom } from '../../atoms/types';
import { AtomBag } from '../../atoms/atomBag';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const clamp11 = (x: number) => (Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0);

function get(resolved: Map<string, Atom>, id: string, fb = 0) {
  const a = resolved.get(id);
  const m = a?.m;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function mkDerived(id: string, m: number, usedAtomIds: string[], parts: any): Atom {
  return {
    id,
    m: m,
    c: 1,
    o: 'derived',
    meta: {
      trace: {
        usedAtomIds,
        parts: Array.isArray(parts)
          ? parts
          : Object.entries(parts || {}).map(([name, value]) => ({
              name,
              value: typeof value === 'number' ? value : 0,
            })),
        notes: 'stage2: appraisal/emotions',
      },
    },
  };
}

export function applyStage2Emotion(bag: AtomBag, selfId: string) {
  // IMPORTANT: stage2 runs after stage3 (threat exists) and after stage1 (ctx axes exist)
  const resolved = bag.resolve();

  // --- Appraisal inputs ---
  const threat = get(resolved, `threat:final:${selfId}`, 0);
  const unc = get(resolved, `ctx:uncertainty:${selfId}`, 0);

  // normPressure часто ещё нет в MVP — берём прокси от surveillance/publicness
  const pub = get(resolved, `ctx:publicness:${selfId}`, 0);
  const surv = get(resolved, `ctx:surveillance:${selfId}`, 0);
  const norm = get(resolved, `ctx:normPressure:${selfId}`, clamp01(0.65 * surv + 0.35 * pub));

  const cover = get(resolved, `world:map:cover:${selfId}`, 0.5);
  const escape = get(resolved, `world:map:escape:${selfId}`, 0.5);

  const control = clamp01(0.45 * cover + 0.35 * escape + 0.20 * (1 - unc));
  const pressure = clamp01(0.65 * norm + 0.35 * pub);

  // intimacy в MVP нет — прокси: меньше публичности => больше “интимность”
  const intimacy = get(resolved, `ctx:intimacy:${selfId}`, clamp01(1 - pub));
  const attachment = clamp01(0.75 * intimacy + 0.25 * (1 - pub));

  const loss = get(resolved, `app:loss:${selfId}`, 0);
  const goalBlock = get(resolved, `app:goalBlock:${selfId}`, 0);

  const appUsed = [
    `threat:final:${selfId}`,
    `ctx:uncertainty:${selfId}`,
    `ctx:publicness:${selfId}`,
    `ctx:surveillance:${selfId}`,
    `world:map:cover:${selfId}`,
    `world:map:escape:${selfId}`,
  ];

  const appAtoms: Atom[] = [
    mkDerived(`app:threat:${selfId}`, clamp01(threat), appUsed, { threat }),
    mkDerived(`app:uncertainty:${selfId}`, clamp01(unc), appUsed, { unc }),
    mkDerived(`app:control:${selfId}`, clamp01(control), appUsed, { cover, escape, unc, control }),
    mkDerived(`app:pressure:${selfId}`, clamp01(pressure), appUsed, { norm, pub, pressure }),
    mkDerived(`app:attachment:${selfId}`, clamp01(attachment), appUsed, { intimacy, pub, attachment }),
    mkDerived(`app:loss:${selfId}`, clamp01(loss), appUsed, { loss }),
    mkDerived(`app:goalBlock:${selfId}`, clamp01(goalBlock), appUsed, { goalBlock }),
  ];

  bag.addMany(appAtoms);

  // --- Emotions from appraisal ---
  // Re-resolve so app:* are available
  const r2 = bag.resolve();
  const aThreat = get(r2, `app:threat:${selfId}`, threat);
  const aUnc = get(r2, `app:uncertainty:${selfId}`, unc);
  const aControl = get(r2, `app:control:${selfId}`, control);
  const aPressure = get(r2, `app:pressure:${selfId}`, pressure);
  const aAttach = get(r2, `app:attachment:${selfId}`, attachment);
  const aLoss = get(r2, `app:loss:${selfId}`, loss);
  const aGoalBlock = get(r2, `app:goalBlock:${selfId}`, goalBlock);

  const fear = clamp01(aThreat * (1 - aControl) * (0.5 + 0.5 * aUnc));
  const anger = clamp01(aThreat * aControl * (1 - aUnc) * (1 - aPressure));
  const shame = clamp01(aPressure * (0.6 + 0.4 * aThreat) * (1 - aAttach));
  const relief = clamp01((1 - aThreat) * aControl * (1 - aGoalBlock));
  const resolve = clamp01(0.55 * aControl + 0.30 * anger + 0.15 * (1 - aUnc));
  const care = clamp01(aAttach * (0.65 + 0.35 * (1 - aThreat)));

  const arousal = clamp01(0.60 * aThreat + 0.20 * aUnc + 0.20 * aPressure);
  const valence = clamp11((+0.55 * relief + 0.35 * care) - (0.60 * fear + 0.35 * shame + 0.25 * anger + 0.55 * aLoss));

  const emoUsed = [
    `app:threat:${selfId}`,
    `app:uncertainty:${selfId}`,
    `app:control:${selfId}`,
    `app:pressure:${selfId}`,
    `app:attachment:${selfId}`,
    `app:loss:${selfId}`,
    `app:goalBlock:${selfId}`,
  ];

  const emoAtoms: Atom[] = [
    mkDerived(`emo:fear:${selfId}`, fear, emoUsed, { aThreat, aControl, aUnc, fear }),
    mkDerived(`emo:anger:${selfId}`, anger, emoUsed, { aThreat, aControl, aUnc, aPressure, anger }),
    mkDerived(`emo:shame:${selfId}`, shame, emoUsed, { aPressure, aThreat, aAttach, shame }),
    mkDerived(`emo:relief:${selfId}`, relief, emoUsed, { aThreat, aControl, aGoalBlock, relief }),
    mkDerived(`emo:resolve:${selfId}`, resolve, emoUsed, { aControl, anger, aUnc, resolve }),
    mkDerived(`emo:care:${selfId}`, care, emoUsed, { aAttach, aThreat, care }),
    mkDerived(`emo:arousal:${selfId}`, arousal, emoUsed, { arousal }),

    // NOTE: MVP Atom magnitude is expected 0..1; keep valence as shifted 0..1 to avoid validator clamping.
    // If you want true -1..1 here too, extend validator/spec for emo:valence.
    mkDerived(`emo:valence:${selfId}`, clamp01((valence + 1) / 2), emoUsed, { valence, storedAs01: true }),
  ];

  bag.addMany(emoAtoms);
}
