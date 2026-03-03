import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx } from '../context/layers';
import { clamp01 } from '../util/math';
import { getMag } from '../util/atoms';
import { FC } from '../config/formulaConfig';

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

  // Driver formulas are now config-backed to avoid hardcoded drift across modules.
  const D = FC.drivers;
  const safetyNeed = clamp01(D.safetyNeed.threatW * threat + D.safetyNeed.fearW * fear);
  const controlNeed = clamp01(D.controlNeed.antiControlW * (1 - control) + D.controlNeed.uncertaintyW * uncertainty);
  const statusNeed = clamp01(D.statusNeed.shameW * shame + D.statusNeed.publicnessW * pub + D.statusNeed.normW * norm);
  const affiliationNeed = clamp01(D.affiliationNeed.careW * care + D.affiliationNeed.antiThreatW * (1 - threat));
  const resolveNeed = clamp01(D.resolveNeed.angerW * anger + D.resolveNeed.threatW * threat);

  // Surprise feedback closes the belief loop: prediction error in S0 can shape S6 needs.
  const SF = D.surpriseFeedback;
  const surpriseBoosts: Record<string, number> = {
    safetyNeed: 0,
    controlNeed: 0,
    statusNeed: 0,
    affiliationNeed: 0,
    resolveNeed: 0,
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
  const safetyNeedFinal = clamp01(safetyNeed + Math.min(cap, surpriseBoosts.safetyNeed ?? 0));
  const controlNeedFinal = clamp01(controlNeed + Math.min(cap, surpriseBoosts.controlNeed ?? 0));
  const statusNeedFinal = clamp01(statusNeed + Math.min(cap, surpriseBoosts.statusNeed ?? 0));
  const affiliationNeedFinal = clamp01(affiliationNeed + Math.min(cap, surpriseBoosts.affiliationNeed ?? 0));
  const resolveNeedFinal = clamp01(resolveNeed + Math.min(cap, surpriseBoosts.resolveNeed ?? 0));

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
    { threat, threatLayer: danger.layer, fear, surpriseBoost: surpriseBoosts.safetyNeed ?? 0 },
    'Safety need'
  ));
  out.push(mk(
    `drv:controlNeed:${selfId}`,
    controlNeedFinal,
    [controlCtx.id || '', unc.id || ''],
    { control, controlLayer: controlCtx.layer, uncertainty, uncertaintyLayer: unc.layer, surpriseBoost: surpriseBoosts.controlNeed ?? 0 },
    'Control need'
  ));
  out.push(mk(
    `drv:statusNeed:${selfId}`,
    statusNeedFinal,
    [emoShameId || '', publicness.id || '', normP.id || ''],
    { shame, publicness: pub, publicnessLayer: publicness.layer, normPressure: norm, normPressureLayer: normP.layer, surpriseBoost: surpriseBoosts.statusNeed ?? 0 },
    'Status need'
  ));
  out.push(mk(
    `drv:affiliationNeed:${selfId}`,
    affiliationNeedFinal,
    [emoCareId || '', danger.id || ''],
    { care, threat, threatLayer: danger.layer, surpriseBoost: surpriseBoosts.affiliationNeed ?? 0 },
    'Affiliation need'
  ));
  out.push(mk(
    `drv:resolveNeed:${selfId}`,
    resolveNeedFinal,
    [emoAngerId || '', danger.id || ''],
    { anger, threat, threatLayer: danger.layer, surpriseBoost: surpriseBoosts.resolveNeed ?? 0 },
    'Resolve need'
  ));

  return { atoms: out };
}
