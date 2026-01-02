
import type { ContextAxesVector, ContextAxisId, ContextTuning, ContextAtomLike, ContextSignalId } from './types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

const AXES: ContextAxisId[] = [
  'danger',
  'control',
  'intimacy',
  'hierarchy',
  'publicness',
  'normPressure',
  'surveillance',
  'scarcity',
  'timePressure',
  'uncertainty',
  'legitimacy',
  'secrecy',
  'grief',
  'pain',
];

export function defaultAxes(): ContextAxesVector {
  return Object.fromEntries(AXES.map((k) => [k, 0])) as ContextAxesVector;
}

// Atom lookup (exact match; no substring heuristics)
type AtomIndex = {
  byKindId: Map<string, ContextAtomLike>;
  byId: Map<string, ContextAtomLike>;
};

function normKey(s: any) {
  return String(s ?? '').toLowerCase();
}

function buildAtomIndex(atoms: ContextAtomLike[] | null | undefined): AtomIndex {
  const byKindId = new Map<string, ContextAtomLike>();
  const byId = new Map<string, ContextAtomLike>();
  for (const a of atoms ?? []) {
    const kind = normKey((a as any).kind);
    const id = normKey((a as any).id);
    if (id) byId.set(id, a);
    byKindId.set(`${kind}:${id}`, a);
  }
  return { byKindId, byId };
}

function pickAtomExact(
  idx: AtomIndex,
  args: { kind?: string; id: string; targetId?: string }
) {
  const idN = normKey(args.id);
  const kindN = normKey(args.kind);
  let a = idx.byId.get(idN);
  if (!a && kindN) a = idx.byKindId.get(`${kindN}:${idN}`);
  if (!a) return { value: 0, confidence: undefined as number | undefined, from: 'none' };
  if (args.targetId && (a as any).targetId && (a as any).targetId !== args.targetId) {
    return { value: 0, confidence: undefined as number | undefined, from: 'none' };
  }
  const v = typeof (a as any).magnitude === 'number' ? clamp01((a as any).magnitude) : 0;
  const c = typeof (a as any).confidence === 'number' ? clamp01((a as any).confidence) : undefined;
  return { value: v, confidence: c, from: (a as any).kind ?? (a as any).id ?? args.id };
}

export type DeriveAxesResult = {
  raw: ContextAxesVector;
  tuned: ContextAxesVector;
  atomsUsed: Partial<Record<ContextSignalId, { value: number; confidence?: number; from: string }>>;
  tuningApplied?: ContextTuning;
};

// Main derivation from frame + atoms + situation + goals
export function deriveContextAxes(args: {
  selfId?: string;
  frame: any;
  world: any;
  atoms?: ContextAtomLike[] | null;
  domainMix?: Record<string, number> | null;
  tuning?: ContextTuning | null;
}): DeriveAxesResult {
  const { selfId, frame, world, atoms, domainMix, tuning } = args;
  const raw = defaultAxes();
  const atomsUsed: DeriveAxesResult['atomsUsed'] = {};
  const idx = buildAtomIndex(atoms ?? null);

  const pick = (id: string, kind?: string) => {
    if (selfId) {
      const withSelf = `${id}:${selfId}`;
      const a = pickAtomExact(idx, { kind, id: withSelf });
      if (a.from !== 'none') return a;
    }
    return pickAtomExact(idx, { kind, id });
  };

  // ---- location tags / situation flags
  const locTags: string[] = frame?.where?.locationTags ?? [];
  const isSafeHub = locTags.includes('safe_hub');
  const isPrivateTag = locTags.includes('private') || isSafeHub;
  const isFormal = !!(world?.situation?.isFormal ?? frame?.what?.isFormal);
  const isPrivate = !!(world?.situation?.isPrivate ?? frame?.what?.isPrivate ?? isPrivateTag);

  // ---- norms if present
  const norms = frame?.tom?.norms ?? {};
  const publicExposureNorm = typeof norms.publicExposure === 'number' ? clamp01(norms.publicExposure) : (isPrivate ? 0.2 : 0.8);
  const privacyNorm = typeof norms.privacy === 'number' ? clamp01(norms.privacy) : (isPrivate ? 0.9 : 0.2);
  const normPressureNorm = typeof norms.normPressure === 'number' ? clamp01(norms.normPressure) : 0.2;
  const surveillanceNorm = typeof norms.surveillance === 'number' ? clamp01(norms.surveillance) : 0.1;

  // ---- scene metrics if exist
  const sceneThreat01 = typeof world?.scene?.metrics?.threat === 'number' ? clamp01(world.scene.metrics.threat / 100) : 0;
  const sceneChaos01 = typeof world?.scene?.metrics?.chaos === 'number' ? clamp01(world.scene.metrics.chaos / 100) : 0;

  // ---- map hazard if exists
  const mapHazard01 = typeof frame?.where?.map?.hazard === 'number' ? clamp01(frame.where.map.hazard) : 0;

  // ---- atoms (global)
  const A = {
    soc_publicness: pick('soc_publicness'),
    soc_surveillance: pick('soc_surveillance'),
    soc_norm_pressure: pick('soc_norm_pressure'),
    ctx_publicness: pick('ctx:publicness'),
    ctx_surveillance: pick('ctx:surveillance'),
    ctx_norm_pressure: pick('ctx:normPressure'),

    // canonical ctx axes atoms: ids like "ctx:danger"
    ctx_danger: pick('ctx:danger'),
    ctx_control: pick('ctx:control'),
    ctx_intimacy: pick('ctx:intimacy'),
    ctx_hierarchy: pick('ctx:hierarchy'),
    ctx_scarcity: pick('ctx:scarcity'),
    ctx_time_pressure: pick('ctx:timePressure'),
    ctx_uncertainty: pick('ctx:uncertainty'),
    ctx_legitimacy: pick('ctx:legitimacy'),
    ctx_secrecy: pick('ctx:secrecy'),
    ctx_grief: pick('ctx:grief'),
    ctx_pain: pick('ctx:pain'),
  };

  // register used atom signals
  (Object.keys(A) as Array<keyof typeof A>).forEach((k) => {
    atomsUsed[k as unknown as ContextSignalId] = { value: A[k].value, confidence: A[k].confidence, from: A[k].from };
  });

  const pickPreferred = (
    primary: { value: number; confidence?: number; from: string },
    fallback: { value: number; confidence?: number; from: string }
  ) => (primary.from === 'none' ? fallback : primary);

  const publicnessAtom = pickPreferred(A.soc_publicness, A.ctx_publicness);
  const normPressureAtom = pickPreferred(A.soc_norm_pressure, A.ctx_norm_pressure);
  const surveillanceAtom = pickPreferred(A.soc_surveillance, A.ctx_surveillance);

  // ---- derive raw axes (0..1)
  // danger: hazards + explicit ctx_danger + scene threat, damped if safe/private and low hazard
  const dangerBase = clamp01(Math.max(A.ctx_danger.value, mapHazard01, sceneThreat01, (domainMix?.danger ?? 0) as number));
  raw.danger = isPrivate && mapHazard01 < 0.2 ? clamp01(dangerBase * 0.35) : dangerBase;

  // intimacy: privacy + private affordance + explicit ctx_intimacy + goal mix
  raw.intimacy = clamp01(
    0.55 * privacyNorm +
      (isPrivate ? 0.20 : 0) +
      0.35 * A.ctx_intimacy.value +
      0.25 * ((domainMix?.intimacy ?? domainMix?.personal_bond ?? 0) as number) -
      0.25 * publicExposureNorm
  );

  // hierarchy: explicit + norms + goals
  raw.hierarchy = clamp01(
    0.45 * A.ctx_hierarchy.value +
      0.30 * normPressureNorm +
      0.20 * surveillanceNorm +
      0.20 * ((domainMix?.hierarchy ?? domainMix?.status ?? 0) as number) +
      (isFormal ? 0.15 : 0)
  );

  // publicness: norms + atom + inverse privacy
  raw.publicness = clamp01(
    0.45 * publicExposureNorm +
      0.25 * publicnessAtom.value +
      0.20 * (1 - privacyNorm) +
      (isFormal ? 0.10 : 0)
  );

  raw.normPressure = clamp01(Math.max(normPressureNorm, normPressureAtom.value, (domainMix?.normPressure ?? 0) as number));
  raw.surveillance = clamp01(Math.max(surveillanceNorm, surveillanceAtom.value, (domainMix?.surveillance ?? 0) as number));

  // scarcity: explicit atom + world scarcity signal + goal mix
  const worldScarcity = typeof world?.scene?.metrics?.scarcity === 'number' ? clamp01(world.scene.metrics.scarcity / 100) : 0;
  raw.scarcity = clamp01(Math.max(A.ctx_scarcity.value, worldScarcity, (domainMix?.scarcity ?? 0) as number));

  // time pressure: explicit atom + world urgency + goals
  const worldUrgency = typeof world?.scene?.metrics?.urgency === 'number' ? clamp01(world.scene.metrics.urgency / 100) : 0;
  raw.timePressure = clamp01(Math.max(A.ctx_time_pressure.value, worldUrgency, (domainMix?.timePressure ?? 0) as number));

  // uncertainty: explicit atom + chaos + inverse info adequacy
  const infoAdequacy01 = typeof frame?.what?.infoAdequacy01 === 'number' ? clamp01(frame.what.infoAdequacy01) : 0.3;
  raw.uncertainty = clamp01(Math.max(A.ctx_uncertainty.value, sceneChaos01, 1 - infoAdequacy01, (domainMix?.uncertainty ?? 0) as number));

  // control: explicit axis + inverse danger/uncertainty/timePressure
  const ctrlFromCtx = clamp01(
    0.65 * A.ctx_control.value +
    0.20 * (1 - raw.danger) +
    0.10 * (1 - raw.timePressure) +
    0.05 * (1 - raw.uncertainty)
  );
  raw.control = clamp01(Math.max(ctrlFromCtx, (domainMix?.control ?? domainMix?.order ?? 0) as number));

  // legitimacy: explicit atom + inverse surveillance/normPressure (если сильные нормы без легитимности — падает)
  const legAtom = A.ctx_legitimacy.value;
  const legFromContext = clamp01(0.55 * legAtom + 0.25 * (1 - raw.surveillance) + 0.20 * (1 - raw.normPressure));
  raw.legitimacy = clamp01(Math.max(legFromContext, (domainMix?.legitimacy ?? 0) as number));

  // secrecy: explicit atom + surveillance/publicness + “private reduces”
  raw.secrecy = clamp01(
    0.55 * A.ctx_secrecy.value +
      0.25 * raw.surveillance +
      0.20 * raw.publicness -
      (isPrivate ? 0.15 : 0)
  );

  // grief/pain: explicit atoms + world cues
  const worldGrief = typeof world?.scene?.metrics?.loss === 'number' ? clamp01(world.scene.metrics.loss / 100) : 0;
  raw.grief = clamp01(Math.max(A.ctx_grief.value, worldGrief, (domainMix?.grief ?? 0) as number));

  const bodyPain = typeof frame?.how?.pain01 === 'number' ? clamp01(frame.how.pain01) : 0;
  raw.pain = clamp01(Math.max(A.ctx_pain.value, bodyPain, (domainMix?.pain ?? 0) as number));

  // tuned axes
  const tuned = applyTuning(raw, tuning ?? null, { isFormal, isPrivate });

  return { raw, tuned, atomsUsed, tuningApplied: tuning ?? undefined };
}

export function applyTuning(
  raw: ContextAxesVector,
  tuning: ContextTuning | null,
  env?: { isFormal?: boolean; isPrivate?: boolean }
): ContextAxesVector {
  const out = { ...raw };

  if (!tuning) return out;

  const gain = typeof tuning.gain === 'number' ? clamp01(tuning.gain) : 1;

  for (const k of AXES) {
    const lock = tuning.lock?.[k];
    if (typeof lock === 'number') {
      out[k] = clamp01(lock);
      continue;
    }

    const add = typeof tuning.add?.[k] === 'number' ? clamp(tuning.add[k]!, -1, 1) : 0;
    const mul = typeof tuning.mul?.[k] === 'number' ? clamp(tuning.mul[k]!, 0, 2) : 1;

    // gain affects how much overrides shift
    const v = out[k];
    const tuned = clamp01((v * mul + add) * (0.35 + 0.65 * gain));
    out[k] = tuned;
  }

  // safety: private space usually implies higher intimacy & lower publicness/surveillance unless explicitly locked
  if (env?.isPrivate) {
    out.intimacy = clamp01(Math.max(out.intimacy, 0.45));
    out.publicness = clamp01(Math.min(out.publicness, 0.55));
    out.surveillance = clamp01(Math.min(out.surveillance, 0.65));
  }

  return out;
}

// Per-dyad axes: start from tuned global axes, then merge V3 domains/norms and perTarget tuning
export function axesForDyad(args: {
  global: ContextAxesVector;
  dyadDomains?: Record<string, number> | null;
  dyadNorms?: Record<string, number> | null;
  tuning?: ContextTuning | null;
  targetId: string;
}): ContextAxesVector {
  const { global, dyadDomains, dyadNorms, tuning, targetId } = args;
  const out = { ...global };

  const dom = dyadDomains ?? {};
  const norms = dyadNorms ?? {};

  // allow V3 domains to override some axes (if they exist)
  out.danger = clamp01(Math.max(out.danger, Number(dom.danger ?? 0)));
  out.intimacy = clamp01(Math.max(out.intimacy, Number(dom.intimacy ?? 0)));
  out.hierarchy = clamp01(Math.max(out.hierarchy, Number(dom.hierarchy ?? 0)));
  out.scarcity = clamp01(Math.max(out.scarcity, Number(dom.scarcity ?? 0)));
  out.timePressure = clamp01(Math.max(out.timePressure, Number(dom.timePressure ?? 0)));
  out.uncertainty = clamp01(Math.max(out.uncertainty, Number(dom.uncertainty ?? 0)));
  out.legitimacy = clamp01(Math.max(out.legitimacy, Number(dom.legitimacy ?? 0)));
  out.secrecy = clamp01(Math.max(out.secrecy, Number(dom.secrecy ?? 0)));
  out.grief = clamp01(Math.max(out.grief, Number(dom.grief ?? 0)));
  out.pain = clamp01(Math.max(out.pain, Number(dom.pain ?? 0)));

  // norms to override publicness/normPressure/surveillance/intimacy
  if (typeof norms.publicExposure === 'number') out.publicness = clamp01(Math.max(out.publicness, norms.publicExposure));
  if (typeof norms.normPressure === 'number') out.normPressure = clamp01(Math.max(out.normPressure, norms.normPressure));
  if (typeof norms.surveillance === 'number') out.surveillance = clamp01(Math.max(out.surveillance, norms.surveillance));
  if (typeof norms.privacy === 'number') out.intimacy = clamp01(Math.max(out.intimacy, norms.privacy));

  // perTarget tuning
  const per = tuning?.perTarget?.[targetId] ?? null;
  return applyTuning(out, per, undefined);
}
