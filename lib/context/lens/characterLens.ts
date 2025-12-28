import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function mkDerived(id: string, selfId: string, magnitude: number, usedAtomIds: string[], parts: any, tags: string[]) {
  return normalizeAtom({
    id,
    ns: 'ctx' as any,
    kind: 'ctx_lens' as any,
    origin: 'derived',
    source: 'character_lens',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: selfId,
    target: selfId,
    tags,
    label: `lens:${id.split(':').slice(0, 2).join(':')}:${Math.round(clamp01(magnitude) * 100)}%`,
    trace: { usedAtomIds, notes: ['subjective lens override'], parts },
  } as any);
}

function mkDyadDerived(id: string, selfId: string, otherId: string, metric: string, magnitude: number, usedAtomIds: string[], parts: any) {
  return normalizeAtom({
    id,
    ns: 'tom' as any,
    kind: 'tom_dyad_metric' as any,
    origin: 'derived',
    source: 'character_lens',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: selfId,
    target: otherId,
    tags: ['tom', 'dyad', metric, 'lens'],
    label: `lens.${metric}:${Math.round(clamp01(magnitude) * 100)}%`,
    trace: { usedAtomIds, notes: ['dyad lens'], parts },
  } as any);
}

/**
 * CharacterLens:
 * - НЕ трогает world/obs факты.
 * - Перезаписывает (derived) субъективные ctx:* и tom:dyad:* на основе:
 *   trait.paranoia, trait.sensitivity, trait.experience, body.stress/fatigue, ctx:*.
 */
export function applyCharacterLens(args: {
  selfId: string;
  atoms: ContextAtom[];
  agent?: any;
}): { atoms: ContextAtom[]; lens: any } {
  const { selfId, atoms } = args;

  // traits/body из feat:char:*
  const paranoia = getMag(atoms, `feat:char:${selfId}:trait.paranoia`, 0.5);
  const sensitivity = getMag(atoms, `feat:char:${selfId}:trait.sensitivity`, 0.5);
  const experience = getMag(atoms, `feat:char:${selfId}:trait.experience`, 0.2);
  const stress = getMag(atoms, `feat:char:${selfId}:body.stress`, 0.3);
  const fatigue = getMag(atoms, `feat:char:${selfId}:body.fatigue`, 0.3);

  // базовые контекстные оси (как “сырьё” линзы)
  const danger0 = getMag(atoms, `ctx:danger:${selfId}`, 0);
  const unc0 = getMag(atoms, `ctx:uncertainty:${selfId}`, 0);
  const norm0 = getMag(atoms, `ctx:normPressure:${selfId}`, 0);
  const pub0 = getMag(atoms, `ctx:publicness:${selfId}`, 0);
  const surv0 = getMag(atoms, `ctx:surveillance:${selfId}`, getMag(atoms, `world:loc:control_level:${selfId}`, 0));
  const intim0 = getMag(atoms, `ctx:intimacy:${selfId}`, 0);
  const crowd0 = getMag(atoms, `ctx:crowd:${selfId}`, 0);

  // “сжатый” параметр подозрительности: растёт от паранойи/стресса/наблюдения/опасности
  const suspicion = clamp01(
    0.55 * paranoia +
    0.20 * stress +
    0.15 * surv0 +
    0.10 * danger0
  );

  // линза: делаем не просто +/-, а “усиление отклонения от 0.5”
  const amplify = (x: number, k: number) => clamp01(0.5 + (x - 0.5) * k);

  // коэффициенты усиления (чтобы персонажи реально расходились)
  const kDanger = 1.0 + 1.2 * (paranoia - 0.5) + 0.6 * (stress - 0.5);           // паранойя ↑ => danger субъективно ↑
  const kUnc = 1.0 + 0.8 * (0.5 - experience) + 0.5 * (fatigue - 0.5);        // опыт ↓/усталость ↑ => uncertainty ↑
  const kNorm = 1.0 + 1.4 * (sensitivity - 0.5) + 0.4 * (pub0 - 0.5);          // чувствит. к репутации ↑ => normPressure ↑
  const kPub = 1.0 + 0.8 * (sensitivity - 0.5);                               // социальная чувствит. ↑ => publicness “ощущается” выше
  const kSurv = 1.0 + 1.1 * (paranoia - 0.5);                                  // паранойя ↑ => surveillance субъективно выше
  const kCrowd = 1.0 + 0.7 * (stress - 0.5) + 0.7 * (paranoia - 0.5);            // стресс/паранойя ↑ => crowd “давит” сильнее
  const kIntim = 1.0 - 0.9 * (paranoia - 0.5) - 0.4 * (danger0 - 0.5);           // паранойя/опасность ↑ => интимность ощущается ниже

  const danger = amplify(danger0, kDanger);
  const unc = amplify(unc0, kUnc);
  const norm = amplify(norm0, kNorm);
  const pub = amplify(pub0, kPub);
  const surv = amplify(surv0, kSurv);
  const crowd = amplify(crowd0, kCrowd);
  const intim = amplify(intim0, kIntim);

  const usedCtx = [
    `feat:char:${selfId}:trait.paranoia`,
    `feat:char:${selfId}:trait.sensitivity`,
    `feat:char:${selfId}:trait.experience`,
    `feat:char:${selfId}:body.stress`,
    `feat:char:${selfId}:body.fatigue`,
    `ctx:danger:${selfId}`,
    `ctx:uncertainty:${selfId}`,
    `ctx:normPressure:${selfId}`,
    `ctx:publicness:${selfId}`,
    `ctx:surveillance:${selfId}`,
    `world:loc:control_level:${selfId}`,
    `ctx:intimacy:${selfId}`,
    `ctx:crowd:${selfId}`,
  ].filter(Boolean);

  const out: ContextAtom[] = [
    // перезаписываем ключевые оси, которыми питаются threat/appraisal/tomBias
    mkDerived(`ctx:danger:${selfId}`, selfId, danger, usedCtx, { danger0, kDanger, paranoia, stress }, ['ctx', 'lens', 'danger']),
    mkDerived(`ctx:uncertainty:${selfId}`, selfId, unc, usedCtx, { unc0, kUnc, experience, fatigue }, ['ctx', 'lens', 'uncertainty']),
    mkDerived(`ctx:normPressure:${selfId}`, selfId, norm, usedCtx, { norm0, kNorm, sensitivity, pub0 }, ['ctx', 'lens', 'normPressure']),
    mkDerived(`ctx:publicness:${selfId}`, selfId, pub, usedCtx, { pub0, kPub, sensitivity }, ['ctx', 'lens', 'publicness']),
    mkDerived(`ctx:surveillance:${selfId}`, selfId, surv, usedCtx, { surv0, kSurv, paranoia }, ['ctx', 'lens', 'surveillance']),
    mkDerived(`ctx:crowd:${selfId}`, selfId, crowd, usedCtx, { crowd0, kCrowd, stress, paranoia }, ['ctx', 'lens', 'crowd']),
    mkDerived(`ctx:intimacy:${selfId}`, selfId, intim, usedCtx, { intim0, kIntim, paranoia, danger0 }, ['ctx', 'lens', 'intimacy']),

    // отдельный агрегат — удобно дебажить “почему ToM/эмоции сдвинулись”
    normalizeAtom({
      id: `lens:suspicion:${selfId}`,
      ns: 'lens' as any,
      kind: 'lens' as any,
      origin: 'derived',
      source: 'character_lens',
      magnitude: suspicion,
      confidence: 1,
      subject: selfId,
      tags: ['lens', 'suspicion'],
      label: `suspicion:${Math.round(suspicion * 100)}%`,
      trace: { usedAtomIds: usedCtx, notes: ['suspicion aggregate'], parts: { suspicion, paranoia, stress, surv0, danger0 } },
    } as any),
  ];

  // ToM-линза: сдвигаем dyad-* в зависимости от suspicion + social sensitivity + публичности/наблюдения
  const dyadIds = atoms
    .map(a => (typeof a.id === 'string' ? a.id : ''))
    .filter(id => id.startsWith(`tom:dyad:${selfId}:`));

  // выделяем уникальные otherId по уже существующим dyad-атомам
  const otherIds = Array.from(new Set(dyadIds.map(id => id.split(':')[3]).filter(Boolean)));

  for (const otherId of otherIds) {
    const trust0 = getMag(atoms, `tom:dyad:${selfId}:${otherId}:trust`, 0.5);
    const thr0 = getMag(atoms, `tom:dyad:${selfId}:${otherId}:threat`, 0.3);
    const uncT0 = getMag(atoms, `tom:dyad:${selfId}:${otherId}:uncertainty`, unc);

    // социальная напряжённость усиливает “оборонительную интерпретацию”
    const socialTension = clamp01(0.45 * pub + 0.35 * surv + 0.20 * norm);
    const bias = clamp01(0.70 * suspicion + 0.30 * socialTension);

    const trust = clamp01(trust0 * (1 - 0.65 * bias));                // подозрительность “съедает” доверие
    const thr = clamp01(thr0 + (1 - thr0) * (0.75 * bias));        // threat растёт к 1
    const uncT = clamp01(uncT0 + (1 - uncT0) * (0.40 * bias));       // uncertainty растёт

    const usedDy = [
      `tom:dyad:${selfId}:${otherId}:trust`,
      `tom:dyad:${selfId}:${otherId}:threat`,
      `tom:dyad:${selfId}:${otherId}:uncertainty`,
      `lens:suspicion:${selfId}`,
      `ctx:publicness:${selfId}`,
      `ctx:surveillance:${selfId}`,
      `ctx:normPressure:${selfId}`,
    ];

    out.push(
      mkDyadDerived(`tom:dyad:${selfId}:${otherId}:trust`, selfId, otherId, 'trust', trust, usedDy, { trust0, bias, trust }),
      mkDyadDerived(`tom:dyad:${selfId}:${otherId}:threat`, selfId, otherId, 'threat', thr, usedDy, { thr0, bias, thr }),
      mkDyadDerived(`tom:dyad:${selfId}:${otherId}:uncertainty`, selfId, otherId, 'uncertainty', uncT, usedDy, { uncT0, bias, uncT }),
    );
  }

  return {
    atoms: out,
    lens: { paranoia, sensitivity, experience, stress, fatigue, suspicion, danger, unc, norm, pub, surv, crowd, intim }
  };
}
