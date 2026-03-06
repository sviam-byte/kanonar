import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx } from '../context/layers';
import { clamp01 } from '../util/math';
import { getMag } from '../util/atoms';
import { FC } from '../config/formulaConfig';
import { curve01Param, type CurveSpec } from '../utils/curves';

function pickAnyId(atoms: ContextAtom[], idPrefix: string): string | null {
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (id.startsWith(idPrefix)) return id;
  }
  return null;
}

export function deriveDriversAtoms(input: {
  selfId: string;
  atoms: ContextAtom[];
  /** Per-agent curve overrides. Merged over FC.drivers.curves. */
  driverCurves?: Partial<Record<string, CurveSpec>>;
  /** Per-agent inhibition matrix overrides (source -> target -> weight). */
  inhibitionOverrides?: Record<string, Record<string, number>>;
  /** Per-agent accumulation inertia overrides (driverKey -> alpha). */
  driverInertia?: Partial<Record<string, number>>;
}): { atoms: ContextAtom[] } {
  const { selfId, atoms } = input;

  const danger = getCtx(atoms, selfId, 'danger', 0);
  const controlCtx = getCtx(atoms, selfId, 'control', 0);
  const publicness = getCtx(atoms, selfId, 'publicness', 0);
  const normP = getCtx(atoms, selfId, 'normPressure', 0);
  const unc = getCtx(atoms, selfId, 'uncertainty', 0);

  const emoFearId = pickAnyId(atoms, `emo:fear:${selfId}`) || pickAnyId(atoms, 'emo:fear:');
  const emoShameId = pickAnyId(atoms, `emo:shame:${selfId}`) || pickAnyId(atoms, 'emo:shame:');
  const emoCareId = pickAnyId(atoms, `emo:care:${selfId}`) || pickAnyId(atoms, 'emo:care:');
  const emoAngerId = pickAnyId(atoms, `emo:anger:${selfId}`) || pickAnyId(atoms, 'emo:anger:');

  const threat = danger.magnitude;
  const control = controlCtx.magnitude;
  const pub = publicness.magnitude;
  const norm = normP.magnitude;
  const uncertainty = unc.magnitude;

  const fear = emoFearId ? getMag(atoms, emoFearId) ?? 0 : 0;
  const shame = emoShameId ? getMag(atoms, emoShameId) ?? 0 : 0;
  const care = emoCareId ? getMag(atoms, emoCareId) ?? 0 : 0;
  const anger = emoAngerId ? getMag(atoms, emoAngerId) ?? 0 : 0;

  // Body signals for restNeed with NaN-safe fallbacks.
  const fatigueId = pickAnyId(atoms, `body:fatigue:${selfId}`)
    || pickAnyId(atoms, `cap:fatigue:${selfId}`)
    || pickAnyId(atoms, `world:body:fatigue:${selfId}`);
  const stressId = pickAnyId(atoms, `body:stress:${selfId}`)
    || pickAnyId(atoms, `cap:stress:${selfId}`);

  const fatigue = fatigueId ? getMag(atoms, fatigueId) ?? 0 : 0;
  const stress = stressId ? getMag(atoms, stressId) ?? 0 : 0;

  // Driver formulas are now config-backed to avoid hardcoded drift across modules.
  const D = FC.drivers;
  const safetyNeed = clamp01(D.safetyNeed.threatW * threat + D.safetyNeed.fearW * fear);
  const controlNeed = clamp01(D.controlNeed.antiControlW * (1 - control) + D.controlNeed.uncertaintyW * uncertainty);
  const statusNeed = clamp01(D.statusNeed.shameW * shame + D.statusNeed.publicnessW * pub + D.statusNeed.normW * norm);
  const affiliationNeed = clamp01(D.affiliationNeed.careW * care + D.affiliationNeed.antiThreatW * (1 - threat));
  const resolveNeed = clamp01(D.resolveNeed.angerW * anger + D.resolveNeed.threatW * threat);
  const restNeed = clamp01(D.restNeed.fatigueW * fatigue + D.restNeed.stressW * stress);
  const curiosityNeed = clamp01(
    D.curiosityNeed.uncertaintyW * uncertainty
    + D.curiosityNeed.antiThreatW * (1 - threat)
    + D.curiosityNeed.antiFearW * (1 - fear)
  );

  // Phase transition: apply nonlinear response curves after linear composition.
  const defaultCurves = D.curves ?? {};
  const overrideCurves = input.driverCurves ?? {};
  const getCurve = (key: string): CurveSpec =>
    overrideCurves[key] ?? defaultCurves[key] ?? { type: 'linear' };

  const rawNeeds = { safetyNeed, controlNeed, statusNeed, affiliationNeed, resolveNeed, restNeed, curiosityNeed };
  const shaped: Record<string, number> = {
    safetyNeed: curve01Param(safetyNeed, getCurve('safetyNeed')),
    controlNeed: curve01Param(controlNeed, getCurve('controlNeed')),
    statusNeed: curve01Param(statusNeed, getCurve('statusNeed')),
    affiliationNeed: curve01Param(affiliationNeed, getCurve('affiliationNeed')),
    resolveNeed: curve01Param(resolveNeed, getCurve('resolveNeed')),
    restNeed: curve01Param(restNeed, getCurve('restNeed')),
    curiosityNeed: curve01Param(curiosityNeed, getCurve('curiosityNeed')),
  };

  // Cross-inhibition: lateral suppression between needs after shaping.
  const INH = D.inhibition ?? { threshold: 0.3, maxSuppression: 0.6, matrix: {} };
  const driverKeys = ['safetyNeed', 'controlNeed', 'statusNeed', 'affiliationNeed', 'resolveNeed', 'restNeed', 'curiosityNeed'] as const;

  const inhMatrix: Record<string, Record<string, number>> = { ...((INH as any).matrix ?? {}) };
  const agentInh = input.inhibitionOverrides;
  if (agentInh) {
    for (const [src, targets] of Object.entries(agentInh)) {
      inhMatrix[src] = { ...(inhMatrix[src] ?? {}), ...(targets as Record<string, number>) };
    }
  }

  const inhibited: Record<string, number> = {};
  const inhibitionTrace: Record<string, { suppression: number; sources: Record<string, number> }> = {};

  for (const target of driverKeys) {
    let totalSuppression = 0;
    const sources: Record<string, number> = {};
    for (const source of driverKeys) {
      if (source === target) continue;
      const excess = Math.max(0, (shaped[source] ?? 0) - INH.threshold);
      if (excess <= 0) continue;
      const weight = (inhMatrix[source] ?? {})[target] ?? 0;
      if (weight <= 0) continue;
      const contribution = excess * weight;
      totalSuppression += contribution;
      sources[source] = contribution;
    }
    totalSuppression = Math.min(INH.maxSuppression, totalSuppression);
    inhibited[target] = clamp01((shaped[target] ?? 0) * (1 - totalSuppression));
    inhibitionTrace[target] = { suppression: totalSuppression, sources };
  }

  // Temporal accumulation: keep pressure memory in belief:pressure:* atoms.
  const ACC = D.accumulation ?? { alpha: {}, blend: 0 };
  const blend = clamp01((ACC as any).blend ?? 0);
  const agentInertia = input.driverInertia ?? {};

  const accumulated: Record<string, number> = {};
  const accTrace: Record<string, { prevPressure: number; alpha: number; instant: number; blended: number }> = {};
  for (const key of driverKeys) {
    const instant = inhibited[key] ?? 0;
    const prevAtomId = `belief:pressure:${key}:${selfId}`;
    let prevPressure = 0;
    for (const a of atoms) {
      if (String((a as any)?.id) === prevAtomId) {
        prevPressure = clamp01(Number((a as any)?.magnitude ?? 0));
        break;
      }
    }
    const alpha = clamp01((agentInertia as any)[key] ?? ((ACC as any).alpha ?? {})[key] ?? 0.5);
    const pressure = clamp01(alpha * prevPressure + (1 - alpha) * instant);
    accumulated[key] = clamp01(blend * pressure + (1 - blend) * instant);
    accTrace[key] = { prevPressure, alpha, instant, blended: accumulated[key] };
  }

  // Surprise feedback closes the belief loop: prediction error in S0 can shape S6 needs.
  const SF = D.surpriseFeedback;
  const surpriseBoosts: Record<string, number> = {
    safetyNeed: 0,
    controlNeed: 0,
    statusNeed: 0,
    affiliationNeed: 0,
    resolveNeed: 0,
    restNeed: 0,
    curiosityNeed: 0,
  };

  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith('belief:surprise:') || !id.endsWith(`:${selfId}`)) continue;

    const feature = id.split(':')[2];
    const surpriseMag = clamp01(Number((a as any)?.magnitude ?? 0));
    const routes = (SF.routing as Record<string, Record<string, number>>)[feature];
    if (!routes || surpriseMag < 0.05) continue;

    for (const [needKey, weight] of Object.entries(routes)) {
      if (typeof weight !== 'number') continue;
      surpriseBoosts[needKey] = (surpriseBoosts[needKey] ?? 0) + surpriseMag * weight;
    }
  }

  const cap = SF.maxBoost;
  const safetyNeedFinal = clamp01((accumulated.safetyNeed ?? 0) + Math.min(cap, surpriseBoosts.safetyNeed ?? 0));
  const controlNeedFinal = clamp01((accumulated.controlNeed ?? 0) + Math.min(cap, surpriseBoosts.controlNeed ?? 0));
  const statusNeedFinal = clamp01((accumulated.statusNeed ?? 0) + Math.min(cap, surpriseBoosts.statusNeed ?? 0));
  const affiliationNeedFinal = clamp01((accumulated.affiliationNeed ?? 0) + Math.min(cap, surpriseBoosts.affiliationNeed ?? 0));
  const resolveNeedFinal = clamp01((accumulated.resolveNeed ?? 0) + Math.min(cap, surpriseBoosts.resolveNeed ?? 0));
  const restNeedFinal = clamp01((accumulated.restNeed ?? 0) + Math.min(cap, surpriseBoosts.restNeed ?? 0));
  const curiosityNeedFinal = clamp01((accumulated.curiosityNeed ?? 0) + Math.min(cap, surpriseBoosts.curiosityNeed ?? 0));

  const out: ContextAtom[] = [];
  const mk = (id: string, magnitude: number, used: string[], parts: any, label: string) =>
    normalizeAtom({
      id,
      ns: 'drv',
      kind: 'need',
      code: id.replace(/:.+$/, ''),
      label,
      magnitude,
      confidence: 0.9,
      origin: 'derived',
      source: 'drv/deriveDriversAtoms',
      trace: { usedAtomIds: used.filter(Boolean), parts }
    } as any);

  out.push(mk(
    `drv:safetyNeed:${selfId}`,
    safetyNeedFinal,
    [danger.id || '', emoFearId || ''],
    {
      threat, threatLayer: danger.layer, fear,
      rawLinear: rawNeeds.safetyNeed,
      curveSpec: getCurve('safetyNeed'),
      shaped: shaped.safetyNeed,
      inhibition: inhibitionTrace.safetyNeed,
      postInhibition: inhibited.safetyNeed,
      accumulation: accTrace.safetyNeed,
      surpriseBoost: surpriseBoosts.safetyNeed ?? 0,
    },
    'Safety need'
  ));
  out.push(mk(
    `drv:controlNeed:${selfId}`,
    controlNeedFinal,
    [controlCtx.id || '', unc.id || ''],
    {
      control, controlLayer: controlCtx.layer, uncertainty, uncertaintyLayer: unc.layer,
      rawLinear: rawNeeds.controlNeed,
      curveSpec: getCurve('controlNeed'),
      shaped: shaped.controlNeed,
      inhibition: inhibitionTrace.controlNeed,
      postInhibition: inhibited.controlNeed,
      accumulation: accTrace.controlNeed,
      surpriseBoost: surpriseBoosts.controlNeed ?? 0,
    },
    'Control need'
  ));
  out.push(mk(
    `drv:statusNeed:${selfId}`,
    statusNeedFinal,
    [emoShameId || '', publicness.id || '', normP.id || ''],
    {
      shame, publicness: pub, publicnessLayer: publicness.layer, normPressure: norm, normPressureLayer: normP.layer,
      rawLinear: rawNeeds.statusNeed,
      curveSpec: getCurve('statusNeed'),
      shaped: shaped.statusNeed,
      inhibition: inhibitionTrace.statusNeed,
      postInhibition: inhibited.statusNeed,
      accumulation: accTrace.statusNeed,
      surpriseBoost: surpriseBoosts.statusNeed ?? 0,
    },
    'Status need'
  ));
  out.push(mk(
    `drv:affiliationNeed:${selfId}`,
    affiliationNeedFinal,
    [emoCareId || '', danger.id || ''],
    {
      care, threat, threatLayer: danger.layer,
      rawLinear: rawNeeds.affiliationNeed,
      curveSpec: getCurve('affiliationNeed'),
      shaped: shaped.affiliationNeed,
      inhibition: inhibitionTrace.affiliationNeed,
      postInhibition: inhibited.affiliationNeed,
      accumulation: accTrace.affiliationNeed,
      surpriseBoost: surpriseBoosts.affiliationNeed ?? 0,
    },
    'Affiliation need'
  ));
  out.push(mk(
    `drv:resolveNeed:${selfId}`,
    resolveNeedFinal,
    [emoAngerId || '', danger.id || ''],
    {
      anger, threat, threatLayer: danger.layer,
      rawLinear: rawNeeds.resolveNeed,
      curveSpec: getCurve('resolveNeed'),
      shaped: shaped.resolveNeed,
      inhibition: inhibitionTrace.resolveNeed,
      postInhibition: inhibited.resolveNeed,
      accumulation: accTrace.resolveNeed,
      surpriseBoost: surpriseBoosts.resolveNeed ?? 0,
    },
    'Resolve need'
  ));
  out.push(mk(
    `drv:restNeed:${selfId}`,
    restNeedFinal,
    [fatigueId || '', stressId || ''],
    {
      fatigue, stress,
      rawLinear: rawNeeds.restNeed,
      curveSpec: getCurve('restNeed'),
      shaped: shaped.restNeed,
      inhibition: inhibitionTrace.restNeed,
      postInhibition: inhibited.restNeed,
      accumulation: accTrace.restNeed,
      surpriseBoost: surpriseBoosts.restNeed ?? 0,
    },
    'Rest need'
  ));
  out.push(mk(
    `drv:curiosityNeed:${selfId}`,
    curiosityNeedFinal,
    [unc.id || '', danger.id || '', emoFearId || ''],
    {
      uncertainty, threat, fear,
      rawLinear: rawNeeds.curiosityNeed,
      curveSpec: getCurve('curiosityNeed'),
      shaped: shaped.curiosityNeed,
      inhibition: inhibitionTrace.curiosityNeed,
      postInhibition: inhibited.curiosityNeed,
      accumulation: accTrace.curiosityNeed,
      surpriseBoost: surpriseBoosts.curiosityNeed ?? 0,
    },
    'Curiosity need'
  ));

  return { atoms: out };
}
