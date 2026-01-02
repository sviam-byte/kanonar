import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx } from '../context/layers';

function getAtomValue(atoms: ContextAtom[], idPrefix: string): number | null {
  // ищем по префиксу (в твоём коде ctx часто содержит selfId в id)
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (id.startsWith(idPrefix)) return Number((a as any)?.magnitude ?? 0);
  }
  return null;
}

function pickAnyId(atoms: ContextAtom[], idPrefix: string): string | null {
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (id.startsWith(idPrefix)) return id;
  }
  return null;
}

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
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

  const emoFearId = pickAnyId(atoms, `emo:fear:${selfId}`) || pickAnyId(atoms, `emo:fear:`);
  const emoShameId = pickAnyId(atoms, `emo:shame:${selfId}`) || pickAnyId(atoms, `emo:shame:`);
  const emoCareId = pickAnyId(atoms, `emo:care:${selfId}`) || pickAnyId(atoms, `emo:care:`);
  const emoAngerId = pickAnyId(atoms, `emo:anger:${selfId}`) || pickAnyId(atoms, `emo:anger:`);

  const threat = danger.magnitude;
  const control = controlCtx.magnitude;
  const pub = publicness.magnitude;
  const norm = normP.magnitude;
  const uncertainty = unc.magnitude;

  const fear = emoFearId ? getAtomValue(atoms, emoFearId) ?? 0 : 0;
  const shame = emoShameId ? getAtomValue(atoms, emoShameId) ?? 0 : 0;
  const care = emoCareId ? getAtomValue(atoms, emoCareId) ?? 0 : 0;
  const anger = emoAngerId ? getAtomValue(atoms, emoAngerId) ?? 0 : 0;

  // Минимальные “физические” формулы. Потом заменишь на твои молекулы.
  const safetyNeed = clamp01(0.6 * threat + 0.4 * fear);
  const controlNeed = clamp01(0.7 * (1 - control) + 0.3 * uncertainty);
  const statusNeed = clamp01(0.5 * shame + 0.25 * pub + 0.25 * norm);
  const affiliationNeed = clamp01(0.7 * care + 0.3 * (1 - threat));
  const resolveNeed = clamp01(0.5 * anger + 0.5 * threat);

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
    safetyNeed,
    [danger.id || '', emoFearId || ''],
    { threat, threatLayer: danger.layer, fear },
    'Safety need'
  ));
  out.push(mk(
    `drv:controlNeed:${selfId}`,
    controlNeed,
    [controlCtx.id || '', unc.id || ''],
    { control, controlLayer: controlCtx.layer, uncertainty, uncertaintyLayer: unc.layer },
    'Control need'
  ));
  out.push(mk(
    `drv:statusNeed:${selfId}`,
    statusNeed,
    [emoShameId || '', publicness.id || '', normP.id || ''],
    { shame, publicness: pub, publicnessLayer: publicness.layer, normPressure: norm, normPressureLayer: normP.layer },
    'Status need'
  ));
  out.push(mk(
    `drv:affiliationNeed:${selfId}`,
    affiliationNeed,
    [emoCareId || '', danger.id || ''],
    { care, threat, threatLayer: danger.layer },
    'Affiliation need'
  ));
  out.push(mk(
    `drv:resolveNeed:${selfId}`,
    resolveNeed,
    [emoAngerId || '', danger.id || ''],
    { anger, threat, threatLayer: danger.layer },
    'Resolve need'
  ));

  return { atoms: out };
}
