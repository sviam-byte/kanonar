import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function makeBaseId(outId: string): string {
  // Keep namespaces recognizable; produce a stable "base copy" id for tracing overrides.
  if (outId.startsWith('ctx:')) return outId.replace(/^ctx:/, 'ctx:base:');
  if (outId.startsWith('tom:dyad:')) return outId.replace(/^tom:dyad:/, 'tom:base:dyad:');
  if (outId.startsWith('tom:')) return outId.replace(/^tom:/, 'tom:base:');
  return `base:${outId}`;
}

function hasAtom(atoms: ContextAtom[], id: string): boolean {
  return atoms.some(a => a && (a as any).id === id);
}

function ensureBaseCopy(atoms: ContextAtom[], out: ContextAtom[], outId: string, sourceNote: string): string {
  const baseId = makeBaseId(outId);
  if (hasAtom(atoms, baseId) || hasAtom(out, baseId)) return baseId;

  // Base copy is taken from the current input atom (pre-override).
  const current = atoms.find(a => a && (a as any).id === outId) as any;
  if (!current) return baseId;

  // Prefer the original atom's own dependencies for the base copy trace.
  // This keeps the base copy explainable even if `outId` gets overridden and deduped later.
  const currentUsed = sanitizeUsedAtomIds(outId, current?.trace?.usedAtomIds);

  const copied: any = {
    ...current,
    id: baseId,
    origin: 'derived',
    source: `base_copy:${sourceNote}`,
    label: `${current.label ?? outId} (base)`,
    trace: {
      usedAtomIds: currentUsed.length ? currentUsed : [outId],
      notes: ['base copy before override', sourceNote],
      parts: { from: outId }
    }
  };

  out.push(normalizeAtom(copied));
  return baseId;
}

function sanitizeUsedAtomIds(outId: string, usedAtomIds: unknown): string[] {
  if (!Array.isArray(usedAtomIds)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of usedAtomIds) {
    if (typeof x !== 'string' || x.length === 0) continue;
    if (x === outId) continue; // critical: no self-cycles
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

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
    trace: { usedAtomIds: sanitizeUsedAtomIds(id, usedAtomIds), notes: ['subjective lens override'], parts },
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
    trace: { usedAtomIds: sanitizeUsedAtomIds(id, usedAtomIds), notes: ['dyad lens'], parts },
  } as any);
}

/**
 * CharacterLens:
 * - НЕ трогает world/obs факты.
 * - Пишет (derived) субъективные ctx:final:* и tom:dyad:final:* на основе:
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
  const ambiguityTol = getMag(atoms, `feat:char:${selfId}:trait.ambiguityTolerance`, 0.5);
  const hpaReactivity = getMag(atoms, `feat:char:${selfId}:trait.hpaReactivity`, 0.5);
  const normSens = getMag(atoms, `feat:char:${selfId}:trait.normSensitivity`, sensitivity);
  const stress = getMag(atoms, `feat:char:${selfId}:body.stress`, 0.3);
  const fatigue = getMag(atoms, `feat:char:${selfId}:body.fatigue`, 0.3);

  // базовые контекстные оси (как “сырьё” линзы) — это base-слой
  const danger0 = getMag(atoms, `ctx:danger:${selfId}`, 0);
  const unc0 = getMag(atoms, `ctx:uncertainty:${selfId}`, 0);
  const norm0 = getMag(atoms, `ctx:normPressure:${selfId}`, 0);
  const pub0 = getMag(atoms, `ctx:publicness:${selfId}`, 0);
  const surv0 = getMag(atoms, `ctx:surveillance:${selfId}`, getMag(atoms, `world:loc:control_level:${selfId}`, 0));
  const intim0 = getMag(atoms, `ctx:intimacy:${selfId}`, 0);
  const crowd0 = getMag(atoms, `ctx:crowd:${selfId}`, 0);
  // дополнительные оси контекста (важно: теперь линза влияет и на них)
  const control0 = getMag(atoms, `ctx:control:${selfId}`, 0);
  const time0 = getMag(atoms, `ctx:timePressure:${selfId}`, 0);
  const secrecy0 = getMag(atoms, `ctx:secrecy:${selfId}`, 0);
  const legitimacy0 = getMag(atoms, `ctx:legitimacy:${selfId}`, 0);
  const hierarchy0 = getMag(atoms, `ctx:hierarchy:${selfId}`, 0);
  const privacy0 = getMag(atoms, `ctx:privacy:${selfId}`, 0);

  // “сжатый” параметр подозрительности: растёт от паранойи/стресса/наблюдения/опасности
  const suspicion = clamp01(
    0.55 * paranoia +
    0.20 * stress +
    0.15 * surv0 +
    0.10 * danger0
  );

  // Personality modulation must include:
  // - sensitivity: how strongly the axis reacts to evidence (slope)
  // - bias: baseline shift (e.g. a paranoiac “sees danger” even when danger0≈0)
  //
  // NOTE: we keep the math simple and stable:
  //   y = x + bias + (x - 0.5) * (sensitivity - 1)
  // This keeps neutrality at traits=0.5 (bias=0, sensitivity≈1),
  // but allows baseline shifts + stronger/nonlinear reactions.
  const clampBias = (b: number) => Math.max(-0.5, Math.min(0.5, b));
  const modulate = (x: number, bias: number, sensitivity: number) => {
    const k = Number.isFinite(sensitivity) ? sensitivity : 1;
    const b = clampBias(Number.isFinite(bias) ? bias : 0);
    return clamp01(x + b + (x - 0.5) * (k - 1));
  };

  // коэффициенты усиления (чтобы персонажи реально расходились)
  const kDanger = 1.0 + 1.2 * (paranoia - 0.5) + 0.6 * (stress - 0.5) + 0.45 * (hpaReactivity - 0.5); // паранойя ↑ => danger субъективно ↑
  const kUnc = 1.0 + 0.9 * (0.5 - ambiguityTol) + 0.8 * (0.5 - experience) + 0.5 * (fatigue - 0.5); // опыт ↓/усталость ↑ => uncertainty ↑
  const kNorm = 1.0 + 1.4 * (normSens - 0.5) + 0.4 * (pub0 - 0.5);          // чувствит. к репутации ↑ => normPressure ↑
  const kPub = 1.0 + 0.8 * (sensitivity - 0.5);                               // социальная чувствит. ↑ => publicness “ощущается” выше
  const kSurv = 1.0 + 1.1 * (paranoia - 0.5);                                  // паранойя ↑ => surveillance субъективно выше
  const kCrowd = 1.0 + 0.7 * (stress - 0.5) + 0.7 * (paranoia - 0.5);            // стресс/паранойя ↑ => crowd “давит” сильнее
  const kIntim = 1.0 - 0.9 * (paranoia - 0.5) - 0.4 * (danger0 - 0.5);           // паранойя/опасность ↑ => интимность ощущается ниже
  // Новые коэффициенты усиления (контроль/цейтнот/секретность/легитимность/иерархия/приватность)
  const kControl = 1.0 + 0.9 * (0.5 - experience) + 0.6 * (stress - 0.5) + 0.5 * (paranoia - 0.5);
  const kTime = 1.0 + 1.0 * (0.5 - ambiguityTol) + 0.7 * (fatigue - 0.5) + 0.3 * (danger0 - 0.5);
  const kSecrecy = 1.0 + 1.1 * (paranoia - 0.5) + 0.5 * (surv0 - 0.5) + 0.4 * (pub0 - 0.5);
  const kLegit = 1.0 - 0.9 * (paranoia - 0.5) + 0.6 * (experience - 0.5) + 0.4 * (normSens - 0.5);
  const kHier = 1.0 + 0.8 * (normSens - 0.5) + 0.5 * (paranoia - 0.5);
  const kPriv = 1.0 - 0.8 * (sensitivity - 0.5) - 0.5 * (paranoia - 0.5);

  // bias terms (baseline shifts). Keep them linear in (trait - 0.5) so that
  // when everything is 0.5 the lens becomes (almost) identity.
  const bDanger =
    1.1 * (paranoia - 0.5) +
    0.4 * (stress - 0.5) +
    0.25 * (hpaReactivity - 0.5) -
    0.35 * (experience - 0.5);
  const bUnc =
    0.75 * (0.5 - ambiguityTol) +
    0.6 * (0.5 - experience) +
    0.35 * (fatigue - 0.5) +
    0.15 * (stress - 0.5);
  const bNorm = 0.55 * (normSens - 0.5) + 0.25 * (pub0 - 0.5);
  const bPub = 0.35 * (sensitivity - 0.5) + 0.15 * (stress - 0.5);
  const bSurv = 0.9 * (paranoia - 0.5) + 0.25 * (danger0 - 0.5);
  const bCrowd = 0.35 * (stress - 0.5) + 0.5 * (paranoia - 0.5);
  const bIntim = -0.75 * (paranoia - 0.5) - 0.35 * (danger0 - 0.5);
  const bControl =
    0.55 * (0.5 - experience) +
    0.35 * (stress - 0.5) +
    0.35 * (paranoia - 0.5);
  const bTime =
    0.55 * (0.5 - ambiguityTol) +
    0.4 * (fatigue - 0.5) +
    0.2 * (danger0 - 0.5);
  const bSecrecy =
    0.85 * (paranoia - 0.5) +
    0.35 * (surv0 - 0.5) +
    0.2 * (pub0 - 0.5);
  const bLegit = -0.55 * (paranoia - 0.5) + 0.45 * (experience - 0.5) + 0.25 * (normSens - 0.5);
  const bHier = 0.45 * (normSens - 0.5) + 0.25 * (paranoia - 0.5);
  const bPriv = -0.45 * (sensitivity - 0.5) - 0.35 * (paranoia - 0.5);

  const danger = modulate(danger0, bDanger, kDanger);
  const unc = modulate(unc0, bUnc, kUnc);
  const norm = modulate(norm0, bNorm, kNorm);
  const pub = modulate(pub0, bPub, kPub);
  const surv = modulate(surv0, bSurv, kSurv);
  const crowd = modulate(crowd0, bCrowd, kCrowd);
  const intim = modulate(intim0, bIntim, kIntim);
  const control = modulate(control0, bControl, kControl);
  const timeP = modulate(time0, bTime, kTime);
  const secrecy = modulate(secrecy0, bSecrecy, kSecrecy);
  const legitimacy = modulate(legitimacy0, bLegit, kLegit);
  const hierarchy = modulate(hierarchy0, bHier, kHier);
  const privacy = modulate(privacy0, bPriv, kPriv);

  const usedCtx = [
    `feat:char:${selfId}:trait.paranoia`,
    `feat:char:${selfId}:trait.sensitivity`,
    `feat:char:${selfId}:trait.experience`,
    `feat:char:${selfId}:trait.ambiguityTolerance`,
    `feat:char:${selfId}:trait.hpaReactivity`,
    `feat:char:${selfId}:trait.normSensitivity`,
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
    `ctx:control:${selfId}`,
    `ctx:timePressure:${selfId}`,
    `ctx:secrecy:${selfId}`,
    `ctx:legitimacy:${selfId}`,
    `ctx:hierarchy:${selfId}`,
    `ctx:privacy:${selfId}`,
  ].filter(Boolean);

  const out: ContextAtom[] = [];
  const usedCtxBase = (axisId: string, baseId: string) => [
    ...usedCtx.filter(id => id !== axisId),
    baseId
  ];

  out.push(
    // ВАЖНО: линза НЕ перетирает ctx:*, а создаёт ctx:final:*
    mkDerived(
      `ctx:final:danger:${selfId}`,
      selfId,
      danger,
      usedCtxBase(
        `ctx:final:danger:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:danger:${selfId}`, 'characterLens.ctx')
      ),
      { danger0, kDanger, paranoia, stress },
      ['ctx', 'lens', 'danger']
    ),
    mkDerived(
      `ctx:final:uncertainty:${selfId}`,
      selfId,
      unc,
      usedCtxBase(
        `ctx:final:uncertainty:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:uncertainty:${selfId}`, 'characterLens.ctx')
      ),
      { unc0, kUnc, experience, fatigue },
      ['ctx', 'lens', 'uncertainty']
    ),
    mkDerived(
      `ctx:final:normPressure:${selfId}`,
      selfId,
      norm,
      usedCtxBase(
        `ctx:final:normPressure:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:normPressure:${selfId}`, 'characterLens.ctx')
      ),
      { norm0, kNorm, sensitivity, pub0 },
      ['ctx', 'lens', 'normPressure']
    ),
    mkDerived(
      `ctx:final:publicness:${selfId}`,
      selfId,
      pub,
      usedCtxBase(
        `ctx:final:publicness:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:publicness:${selfId}`, 'characterLens.ctx')
      ),
      { pub0, kPub, sensitivity },
      ['ctx', 'lens', 'publicness']
    ),
    mkDerived(
      `ctx:final:surveillance:${selfId}`,
      selfId,
      surv,
      usedCtxBase(
        `ctx:final:surveillance:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:surveillance:${selfId}`, 'characterLens.ctx')
      ),
      { surv0, kSurv, paranoia },
      ['ctx', 'lens', 'surveillance']
    ),
    mkDerived(
      `ctx:final:crowd:${selfId}`,
      selfId,
      crowd,
      usedCtxBase(
        `ctx:final:crowd:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:crowd:${selfId}`, 'characterLens.ctx')
      ),
      { crowd0, kCrowd, stress, paranoia },
      ['ctx', 'lens', 'crowd']
    ),
    mkDerived(
      `ctx:final:intimacy:${selfId}`,
      selfId,
      intim,
      usedCtxBase(
        `ctx:final:intimacy:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:intimacy:${selfId}`, 'characterLens.ctx')
      ),
      { intim0, kIntim, paranoia, danger0 },
      ['ctx', 'lens', 'intimacy']
    ),
    mkDerived(
      `ctx:final:control:${selfId}`,
      selfId,
      control,
      usedCtxBase(
        `ctx:final:control:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:control:${selfId}`, 'characterLens.ctx')
      ),
      { control0, kControl, paranoia, stress, experience },
      ['ctx', 'lens', 'control']
    ),
    mkDerived(
      `ctx:final:timePressure:${selfId}`,
      selfId,
      timeP,
      usedCtxBase(
        `ctx:final:timePressure:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:timePressure:${selfId}`, 'characterLens.ctx')
      ),
      { time0, kTime, ambiguityTol, fatigue, danger0 },
      ['ctx', 'lens', 'timePressure']
    ),
    mkDerived(
      `ctx:final:secrecy:${selfId}`,
      selfId,
      secrecy,
      usedCtxBase(
        `ctx:final:secrecy:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:secrecy:${selfId}`, 'characterLens.ctx')
      ),
      { secrecy0, kSecrecy, paranoia, surv0, pub0 },
      ['ctx', 'lens', 'secrecy']
    ),
    mkDerived(
      `ctx:final:legitimacy:${selfId}`,
      selfId,
      legitimacy,
      usedCtxBase(
        `ctx:final:legitimacy:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:legitimacy:${selfId}`, 'characterLens.ctx')
      ),
      { legitimacy0, kLegit, experience, paranoia, normSens },
      ['ctx', 'lens', 'legitimacy']
    ),
    mkDerived(
      `ctx:final:hierarchy:${selfId}`,
      selfId,
      hierarchy,
      usedCtxBase(
        `ctx:final:hierarchy:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:hierarchy:${selfId}`, 'characterLens.ctx')
      ),
      { hierarchy0, kHier, normSens, paranoia },
      ['ctx', 'lens', 'hierarchy']
    ),
    mkDerived(
      `ctx:final:privacy:${selfId}`,
      selfId,
      privacy,
      usedCtxBase(
        `ctx:final:privacy:${selfId}`,
        ensureBaseCopy(atoms, out, `ctx:privacy:${selfId}`, 'characterLens.ctx')
      ),
      { privacy0, kPriv, sensitivity, paranoia },
      ['ctx', 'lens', 'privacy']
    ),

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
  );

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

    // dyad-линза должна ссылаться на итоговые ctx:final оси,
    // иначе дебаг будет врать “почему” сдвинулось
    const usedDyBase = (axisId: string, baseId: string) => [
      ...[
        `tom:dyad:${selfId}:${otherId}:trust`,
        `tom:dyad:${selfId}:${otherId}:threat`,
        `tom:dyad:${selfId}:${otherId}:uncertainty`,
      ].filter(id => id !== axisId),
      baseId,
      `lens:suspicion:${selfId}`,
      `ctx:final:publicness:${selfId}`,
      `ctx:final:surveillance:${selfId}`,
      `ctx:final:normPressure:${selfId}`,
    ];

    out.push(
      // ВАЖНО: не перетирать tom:dyad:* (это prior/base), а писать final-слой
      mkDyadDerived(
        `tom:dyad:final:${selfId}:${otherId}:trust`,
        selfId,
        otherId,
        'trust',
        trust,
        usedDyBase(
          `tom:dyad:final:${selfId}:${otherId}:trust`,
          ensureBaseCopy(atoms, out, `tom:dyad:${selfId}:${otherId}:trust`, 'characterLens.tom')
        ),
        { trust0, bias, trust }
      ),
      mkDyadDerived(
        `tom:dyad:final:${selfId}:${otherId}:threat`,
        selfId,
        otherId,
        'threat',
        thr,
        usedDyBase(
          `tom:dyad:final:${selfId}:${otherId}:threat`,
          ensureBaseCopy(atoms, out, `tom:dyad:${selfId}:${otherId}:threat`, 'characterLens.tom')
        ),
        { thr0, bias, thr }
      ),
      mkDyadDerived(
        `tom:dyad:final:${selfId}:${otherId}:uncertainty`,
        selfId,
        otherId,
        'uncertainty',
        uncT,
        usedDyBase(
          `tom:dyad:final:${selfId}:${otherId}:uncertainty`,
          ensureBaseCopy(atoms, out, `tom:dyad:${selfId}:${otherId}:uncertainty`, 'characterLens.tom')
        ),
        { uncT0, bias, uncT }
      ),
    );
  }

  return {
    atoms: out,
    lens: {
      paranoia,
      sensitivity,
      experience,
      stress,
      fatigue,
      suspicion,
      danger,
      unc,
      norm,
      pub,
      surv,
      crowd,
      intim,
      control,
      timeP,
      secrecy,
      legitimacy,
      hierarchy,
      privacy
    }
  };
}
