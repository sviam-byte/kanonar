import { normalizeAtom } from '../v2/infer';

type AnyAtom = any;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (x: any, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

function pickById(atoms: AnyAtom[], id: string) {
  return atoms.find(a => String(a?.id || '') === id) || null;
}

function getCtx(atoms: AnyAtom[], selfId: string, axis: string, d = 0, used?: string[]) {
  // Prefer final perceptions after S3, fallback to base.
  const a =
    pickById(atoms, `ctx:final:${axis}:${selfId}`) ||
    pickById(atoms, `ctx:${axis}:${selfId}`) ||
    null;
  if (a) {
    used?.push(String(a.id));
    return num(a.magnitude ?? a.m ?? 0, d);
  }
  // Fallback non-scoped (legacy).
  const b = pickById(atoms, `ctx:final:${axis}`) || pickById(atoms, `ctx:${axis}`) || null;
  if (b) used?.push(String(b.id));
  return b ? num(b.magnitude ?? b.m ?? 0, d) : d;
}

function getEmo(atoms: AnyAtom[], selfId: string, emo: string, d = 0, used?: string[]) {
  const a = pickById(atoms, `emo:${emo}:${selfId}`) || null;
  if (a) used?.push(String(a.id));
  return a ? num(a.magnitude ?? a.m ?? 0, d) : d;
}

function atom(
  id: string,
  selfId: string,
  magnitude: number,
  usedAtomIds: string[],
  parts: Record<string, any>,
  label: string
) {
  return normalizeAtom({
    id,
    ns: 'sum',
    kind: 'summary',
    origin: 'derived',
    source: 'deriveSummaryAtoms',
    target: selfId,
    magnitude: clamp01(magnitude),
    confidence: 0.9,
    label,
    trace: {
      usedAtomIds: Array.from(new Set(usedAtomIds)).filter(Boolean),
      parts,
      notes: ['prototype summary metric'],
    },
  } as any);
}

/**
 * Derive summary UI metrics from context + emotion atoms.
 * These are meant for display; keep formulas stable to avoid UI drift.
 */
export function deriveSummaryAtoms(args: { atoms: AnyAtom[]; selfId: string }): AnyAtom[] {
  const { atoms, selfId } = args;
  if (!selfId) return [];
  const used: string[] = [];

  // Core axes.
  const danger = getCtx(atoms, selfId, 'danger', 0, used);
  const control = getCtx(atoms, selfId, 'control', 0, used);
  const uncertainty = getCtx(atoms, selfId, 'uncertainty', 0.2, used);
  const normPressure = getCtx(atoms, selfId, 'normPressure', 0, used);
  const publicness = getCtx(atoms, selfId, 'publicness', 0, used);
  const surveillance = getCtx(atoms, selfId, 'surveillance', 0, used);
  const scarcity = getCtx(atoms, selfId, 'scarcity', 0, used);
  const timePressure = getCtx(atoms, selfId, 'timePressure', 0, used);
  const intimacy = getCtx(atoms, selfId, 'intimacy', 0, used);

  // Emotions.
  const fear = getEmo(atoms, selfId, 'fear', 0, used);
  const anger = getEmo(atoms, selfId, 'anger', 0, used);
  const shame = getEmo(atoms, selfId, 'shame', 0, used);

  const idCtx = (k: string) => `ctx:${k}:${selfId}`;
  const idEmo = (k: string) => `emo:${k}:${selfId}`;

  // threatLevel = 0.65*danger + 0.20*(1-control) + 0.15*uncertainty
  const threatLevel = clamp01(0.65 * danger + 0.20 * (1 - control) + 0.15 * uncertainty);
  // coping = 0.55*control + 0.25*(1-scarcity) + 0.20*(1-timePressure)
  const coping = clamp01(0.55 * control + 0.25 * (1 - scarcity) + 0.20 * (1 - timePressure));
  // tension = 0.5*fear + 0.3*anger + 0.2*shame
  const tension = clamp01(0.5 * fear + 0.3 * anger + 0.2 * shame);
  // clarity = 1 - uncertainty (softened by surveillance; high surveillance can make "clarity" feel higher)
  const clarity = clamp01(0.85 * (1 - uncertainty) + 0.15 * surveillance);
  // socialExposure = 0.6*publicness + 0.4*surveillance
  const socialExposure = clamp01(0.6 * publicness + 0.4 * surveillance);
  // normRisk = 0.7*normPressure + 0.3*socialExposure
  const normRisk = clamp01(0.7 * normPressure + 0.3 * socialExposure);
  // intimacyIndex = intimacy (kept as is, but summarized for UI)
  const intimacyIndex = clamp01(intimacy);

  return [
    atom(
      `sum:threatLevel:${selfId}`,
      selfId,
      threatLevel,
      [idCtx('danger'), idCtx('control'), idCtx('uncertainty'), ...used],
      { danger, control, uncertainty, formula: '0.65*danger + 0.20*(1-control) + 0.15*uncertainty' },
      `threatLevel=${threatLevel.toFixed(3)}`
    ),
    atom(
      `sum:coping:${selfId}`,
      selfId,
      coping,
      [idCtx('control'), idCtx('scarcity'), idCtx('timePressure'), ...used],
      { control, scarcity, timePressure, formula: '0.55*control + 0.25*(1-scarcity) + 0.20*(1-timePressure)' },
      `coping=${coping.toFixed(3)}`
    ),
    atom(
      `sum:tension:${selfId}`,
      selfId,
      tension,
      [idEmo('fear'), idEmo('anger'), idEmo('shame'), ...used],
      { fear, anger, shame, formula: '0.5*fear + 0.3*anger + 0.2*shame' },
      `tension=${tension.toFixed(3)}`
    ),
    atom(
      `sum:clarity:${selfId}`,
      selfId,
      clarity,
      [idCtx('uncertainty'), idCtx('surveillance'), ...used],
      { uncertainty, surveillance, formula: '0.85*(1-uncertainty) + 0.15*surveillance' },
      `clarity=${clarity.toFixed(3)}`
    ),
    atom(
      `sum:socialExposure:${selfId}`,
      selfId,
      socialExposure,
      [idCtx('publicness'), idCtx('surveillance'), ...used],
      { publicness, surveillance, formula: '0.6*publicness + 0.4*surveillance' },
      `socialExposure=${socialExposure.toFixed(3)}`
    ),
    atom(
      `sum:normRisk:${selfId}`,
      selfId,
      normRisk,
      [idCtx('normPressure'), `sum:socialExposure:${selfId}`, ...used],
      { normPressure, socialExposure, formula: '0.7*normPressure + 0.3*socialExposure' },
      `normRisk=${normRisk.toFixed(3)}`
    ),
    atom(
      `sum:intimacyIndex:${selfId}`,
      selfId,
      intimacyIndex,
      [idCtx('intimacy'), ...used],
      { intimacy, formula: 'intimacy' },
      `intimacyIndex=${intimacyIndex.toFixed(3)}`
    ),
  ];
}
