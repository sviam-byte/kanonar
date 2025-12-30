import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

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

  // NOTE: ids здесь специально “префиксные”, чтобы не зависеть от точных схем id.
  // Если у тебя стабильные id (ctx:danger:${selfId}), заменишь на точные.
  const ctxThreatId = pickAnyId(atoms, `ctx:danger:${selfId}`) || pickAnyId(atoms, `ctx:threat:${selfId}`) || pickAnyId(atoms, `ctx:danger:`);
  const ctxControlId = pickAnyId(atoms, `ctx:control:${selfId}`) || pickAnyId(atoms, `ctx:control:`);
  const ctxPublicId = pickAnyId(atoms, `ctx:publicness:${selfId}`) || pickAnyId(atoms, `ctx:publicness:`);
  const ctxNormId = pickAnyId(atoms, `ctx:norm_pressure:${selfId}`) || pickAnyId(atoms, `ctx:normPressure:${selfId}`) || pickAnyId(atoms, `ctx:norm`);
  const ctxUncId = pickAnyId(atoms, `ctx:uncertainty:${selfId}`) || pickAnyId(atoms, `ctx:uncertainty:`);

  const emoFearId = pickAnyId(atoms, `emo:fear:${selfId}`) || pickAnyId(atoms, `emo:fear:`);
  const emoShameId = pickAnyId(atoms, `emo:shame:${selfId}`) || pickAnyId(atoms, `emo:shame:`);
  const emoCareId = pickAnyId(atoms, `emo:care:${selfId}`) || pickAnyId(atoms, `emo:care:`);
  const emoAngerId = pickAnyId(atoms, `emo:anger:${selfId}`) || pickAnyId(atoms, `emo:anger:`);

  const threat = ctxThreatId ? getAtomValue(atoms, ctxThreatId) ?? 0 : 0;
  const control = ctxControlId ? getAtomValue(atoms, ctxControlId) ?? 0 : 0;
  const publicness = ctxPublicId ? getAtomValue(atoms, ctxPublicId) ?? 0 : 0;
  const normP = ctxNormId ? getAtomValue(atoms, ctxNormId) ?? 0 : 0;
  const unc = ctxUncId ? getAtomValue(atoms, ctxUncId) ?? 0 : 0;

  const fear = emoFearId ? getAtomValue(atoms, emoFearId) ?? 0 : 0;
  const shame = emoShameId ? getAtomValue(atoms, emoShameId) ?? 0 : 0;
  const care = emoCareId ? getAtomValue(atoms, emoCareId) ?? 0 : 0;
  const anger = emoAngerId ? getAtomValue(atoms, emoAngerId) ?? 0 : 0;

  // Минимальные “физические” формулы. Потом заменишь на твои молекулы.
  const safetyNeed = clamp01(0.6 * threat + 0.4 * fear);
  const controlNeed = clamp01(0.7 * (1 - control) + 0.3 * unc);
  const statusNeed = clamp01(0.5 * shame + 0.25 * publicness + 0.25 * normP);
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
    [ctxThreatId || '', emoFearId || ''],
    { threat, fear },
    'Safety need'
  ));
  out.push(mk(
    `drv:controlNeed:${selfId}`,
    controlNeed,
    [ctxControlId || '', ctxUncId || ''],
    { control, uncertainty: unc },
    'Control need'
  ));
  out.push(mk(
    `drv:statusNeed:${selfId}`,
    statusNeed,
    [emoShameId || '', ctxPublicId || '', ctxNormId || ''],
    { shame, publicness, normPressure: normP },
    'Status need'
  ));
  out.push(mk(
    `drv:affiliationNeed:${selfId}`,
    affiliationNeed,
    [emoCareId || '', ctxThreatId || ''],
    { care, threat },
    'Affiliation need'
  ));
  out.push(mk(
    `drv:resolveNeed:${selfId}`,
    resolveNeed,
    [emoAngerId || '', ctxThreatId || ''],
    { anger, threat },
    'Resolve need'
  ));

  return { atoms: out };
}
