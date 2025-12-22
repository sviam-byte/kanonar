
// lib/context/axes/deriveAxes.ts
import { ContextAtom, ContextAxesVector, ContextTuning, ContextAtomLike, ContextSignalId } from '../v2/types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function get(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

type PartEntry = { name: string; val: number; w?: number; contrib?: number };

function buildParts(entries: PartEntry[], formula?: string) {
  const parts: Record<string, any> = {};
  for (const e of entries) {
    parts[e.name] = {
      val: e.val,
      w: e.w,
      contrib: e.contrib ?? (typeof e.w === 'number' ? e.val * e.w : undefined),
    };
  }
  if (formula) parts.formula = formula;
  return parts;
}

function atom(
  id: string,
  magnitude: number,
  usedAtomIds: string[],
  parts: any,
  kind: string = 'ctx_axis',
  notes: string[] = ['axis from deriveAxes'],
): ContextAtom {
  return {
    id,
    ns: 'ctx',
    kind,
    origin: 'derived',
    source: 'deriveAxes',
    magnitude: clamp01(magnitude),
    confidence: 1,
    trace: { usedAtomIds, parts, notes },
    label: `${id.split(':')[1]}:${Math.round(clamp01(magnitude) * 100)}%`
  } as any;
}

const AXES = [
  'danger', 'intimacy', 'hierarchy', 'publicness',
  'normPressure', 'surveillance', 'scarcity', 'timePressure',
  'uncertainty', 'legitimacy', 'secrecy', 'grief', 'pain'
];

export function defaultAxes(): ContextAxesVector {
  return Object.fromEntries(AXES.map((k) => [k, 0])) as any;
}

/**
 * Derives context axes atoms from canonical world/map/obs atoms.
 */
export function deriveAxes(args: { selfId: string; atoms: ContextAtom[]; tuning?: any }): { atoms: ContextAtom[] } {
  const { selfId, atoms } = args;

  // Inputs (canonical from patch 52 + patch 54)
  const locPrivacy = get(atoms, `world:loc:privacy:${selfId}`, 0);
  const locControl = get(atoms, `world:loc:control_level:${selfId}`, 0);
  const locCrowd = get(atoms, `world:loc:crowd:${selfId}`, 0);
  const locNormPressure = get(atoms, `world:loc:normative_pressure:${selfId}`, 0);

  const scCrowd = get(atoms, `ctx:src:scene:crowd:${selfId}`, 0);
  const scHostility = get(atoms, `ctx:src:scene:hostility:${selfId}`, 0);
  const scUrgency = get(atoms, `ctx:src:scene:urgency:${selfId}`, 0);
  const scScarcity = get(atoms, `ctx:src:scene:scarcity:${selfId}`, 0);
  const scChaos = get(atoms, `ctx:src:scene:chaos:${selfId}`, 0);
  const scNovelty = get(atoms, `ctx:src:scene:novelty:${selfId}`, 0);
  const scLoss = get(atoms, `ctx:src:scene:loss:${selfId}`, 0);
  const scResourceAccess = get(atoms, `ctx:src:scene:resourceAccess:${selfId}`, 0);
  const scThreat = get(atoms, `ctx:src:scene:threat:${selfId}`, 0);

  const normPrivacy = get(atoms, `ctx:src:norm:privacy:${selfId}`, 0);
  const normPublicExposure = get(atoms, `ctx:src:norm:publicExposure:${selfId}`, 0);
  const normSurveillance = get(atoms, `ctx:src:norm:surveillance:${selfId}`, 0);
  const normNormPressure = get(atoms, `ctx:src:norm:normPressure:${selfId}`, 0);
  const normProceduralStrict = get(atoms, `ctx:src:norm:proceduralStrict:${selfId}`, 0);

  const cover = get(atoms, `world:map:cover:${selfId}`, 0);
  // escape может отсутствовать, тогда берём exits как прокси (если есть)
  const exits = get(atoms, `world:map:exits:${selfId}`, NaN);
  const escape = Number.isFinite(exits)
    ? clamp01(Math.max(get(atoms, `world:map:escape:${selfId}`, 0), exits))
    : get(atoms, `world:map:escape:${selfId}`, 0);
  const danger = Math.max(
    get(atoms, `world:map:danger:${selfId}`, 0),
    get(atoms, `world:env:hazard:${selfId}`, 0)
  );

  // Observational quality (from patch 54). If missing -> moderate.
  const infoAdequacy = get(atoms, `obs:infoAdequacy:${selfId}`, 0.6);
  const uncertainty = clamp01(1 - infoAdequacy);

  // Axes
  const privacy = clamp01(0.7 * locPrivacy + 0.3 * normPrivacy);
  const publicnessFromLoc = clamp01(1 - locPrivacy);
  const publicness = clamp01(0.7 * publicnessFromLoc + 0.3 * normPublicExposure);
  const control = locControl;
  const surveillance = clamp01(0.55 * control + 0.20 * publicness + 0.25 * normSurveillance);
  const crowd = clamp01(0.6 * locCrowd + 0.4 * scCrowd);
  const normPressure = clamp01(0.55 * locNormPressure + 0.45 * normNormPressure);
  const hierarchy = clamp01(0.55 * control + 0.25 * normPressure + 0.20 * normProceduralStrict);
  const dangerBase = clamp01(0.65 * danger + 0.20 * (1 - escape) + 0.15 * (1 - cover));
  const dangerSocial = clamp01(0.55 * scHostility + 0.45 * scThreat);
  const ctxDanger = clamp01(0.75 * dangerBase + 0.25 * dangerSocial);
  const ctxCrowd = crowd;
  const ctxNormPressure = clamp01(0.45 * normPressure + 0.30 * surveillance + 0.15 * publicness + 0.10 * normProceduralStrict);
  const ctxIntimacy = clamp01(privacy * 0.7 + (1 - surveillance) * 0.3);

  const ctxTimePressure = clamp01(0.7 * scUrgency + 0.3 * (1 - escape));
  const ctxScarcity = clamp01(0.75 * scScarcity + 0.25 * (1 - scResourceAccess));
  const ctxGrief = clamp01(scLoss);

  // legitimacy: насколько “режим/правила” воспринимаются законными и устойчивыми
  // proxy: меньше хаоса + выше процедурная строгость + (немного) контроль как "работающие институты"
  const ctxLegitimacy = clamp01(0.45 * (1 - scChaos) + 0.35 * normProceduralStrict + 0.20 * control);

  // secrecy: насколько опасно “светиться/говорить” (наблюдаемость+публичность+угроза+низкая приватность)
  const ctxSecrecy = clamp01(0.35 * surveillance + 0.20 * publicness + 0.25 * scThreat + 0.20 * (1 - privacy));

  // Pain (ctx:pain) from feature if available
  const featPain = get(atoms, `feat:char:${selfId}:body.pain`, 0);

  // Additional ctx signals used by downstream systems
  const ctxProceduralStrict = clamp01(normProceduralStrict);
  const ctxCover = clamp01(cover);
  const ctxEscape = clamp01(escape);
  
  const outAtoms = [
    atom(
      `ctx:privacy:${selfId}`,
      privacy,
      [`world:loc:privacy:${selfId}`, `ctx:src:norm:privacy:${selfId}`],
      buildParts([
        { name: 'locPrivacy', val: locPrivacy, w: 0.7 },
        { name: 'normPrivacy', val: normPrivacy, w: 0.3 },
      ], 'privacy = 0.7*locPrivacy + 0.3*normPrivacy')
    ),
    atom(
      `ctx:publicness:${selfId}`,
      publicness,
      [`world:loc:privacy:${selfId}`, `ctx:src:norm:publicExposure:${selfId}`],
      buildParts([
        { name: 'publicnessFromLoc', val: publicnessFromLoc, w: 0.7 },
        { name: 'normPublicExposure', val: normPublicExposure, w: 0.3 },
      ], 'publicness = 0.7*(1-privacy) + 0.3*normPublicExposure')
    ),
    atom(
      `ctx:surveillance:${selfId}`,
      surveillance,
      [`world:loc:control_level:${selfId}`, `ctx:publicness:${selfId}`, `ctx:src:norm:surveillance:${selfId}`],
      buildParts([
        { name: 'control', val: control, w: 0.55 },
        { name: 'publicness', val: publicness, w: 0.20 },
        { name: 'normSurveillance', val: normSurveillance, w: 0.25 },
      ], 'surveillance = 0.55*control + 0.20*publicness + 0.25*normSurveillance')
    ),
    atom(
      `ctx:hierarchy:${selfId}`,
      hierarchy,
      [`world:loc:control_level:${selfId}`, `ctx:normPressure:${selfId}`, `ctx:src:norm:proceduralStrict:${selfId}`],
      buildParts([
        { name: 'control', val: control, w: 0.55 },
        { name: 'normPressure', val: normPressure, w: 0.25 },
        { name: 'normProceduralStrict', val: normProceduralStrict, w: 0.20 },
      ], 'hierarchy = 0.55*control + 0.25*normPressure + 0.20*proceduralStrict')
    ),
    atom(
      `ctx:crowd:${selfId}`,
      ctxCrowd,
      [`world:loc:crowd:${selfId}`, `ctx:src:scene:crowd:${selfId}`],
      buildParts([
        { name: 'locCrowd', val: locCrowd, w: 0.6 },
        { name: 'sceneCrowd', val: scCrowd, w: 0.4 },
      ], 'crowd = 0.6*locCrowd + 0.4*sceneCrowd')
    ),
    atom(
      `ctx:normPressure:${selfId}`,
      ctxNormPressure,
      [`world:loc:normative_pressure:${selfId}`, `ctx:surveillance:${selfId}`, `ctx:publicness:${selfId}`, `ctx:src:norm:normPressure:${selfId}`, `ctx:src:norm:proceduralStrict:${selfId}`],
      buildParts([
        { name: 'locNormPressure', val: locNormPressure, w: 0.45 },
        { name: 'surveillance', val: surveillance, w: 0.30 },
        { name: 'publicness', val: publicness, w: 0.15 },
        { name: 'normProceduralStrict', val: normProceduralStrict, w: 0.10 },
      ], 'normPressure = 0.45*locNormPressure + 0.30*surveillance + 0.15*publicness + 0.10*proceduralStrict')
    ),
    atom(
      `ctx:uncertainty:${selfId}`,
      uncertainty,
      [`obs:infoAdequacy:${selfId}`],
      buildParts([
        { name: 'infoAdequacy', val: infoAdequacy, w: -1, contrib: -(1 - infoAdequacy) },
        { name: 'uncertainty', val: uncertainty },
      ], 'uncertainty = 1 - infoAdequacy')
    ),
    atom(
      `ctx:danger:${selfId}`,
      ctxDanger,
      [`world:map:danger:${selfId}`, `world:env:hazard:${selfId}`, `world:map:escape:${selfId}`, `world:map:cover:${selfId}`, `ctx:src:scene:hostility:${selfId}`, `ctx:src:scene:threat:${selfId}`],
      buildParts([
        { name: 'dangerBase', val: dangerBase, w: 0.75 },
        { name: 'dangerSocial', val: dangerSocial, w: 0.25 },
        { name: 'mapDanger', val: danger, w: 0.65 },
        { name: 'escape', val: escape, w: -0.20, contrib: -0.20 * escape },
        { name: 'cover', val: cover, w: -0.15, contrib: -0.15 * cover },
        { name: 'sceneHostility', val: scHostility, w: 0.55 },
        { name: 'sceneThreat', val: scThreat, w: 0.45 },
      ], 'danger = 0.75*(0.65*danger + 0.20*(1-escape)+0.15*(1-cover)) + 0.25*(0.55*hostility + 0.45*sceneThreat)')
    ),
    atom(
      `ctx:intimacy:${selfId}`,
      ctxIntimacy,
      [`ctx:privacy:${selfId}`, `ctx:surveillance:${selfId}`],
      buildParts([
        { name: 'privacy', val: privacy, w: 0.7 },
        { name: 'surveillance', val: surveillance, w: -0.3, contrib: -0.3 * surveillance },
      ], 'intimacy = 0.7*privacy + 0.3*(1-surveillance)')
    ),
    atom(
      `ctx:timePressure:${selfId}`,
      ctxTimePressure,
      [`ctx:src:scene:urgency:${selfId}`, `world:map:escape:${selfId}`],
      buildParts([
        { name: 'sceneUrgency', val: scUrgency, w: 0.7 },
        { name: 'escape', val: escape, w: -0.3, contrib: -0.3 * escape },
      ], 'timePressure = 0.7*urgency + 0.3*(1-escape)')
    ),
    atom(
      `ctx:scarcity:${selfId}`,
      ctxScarcity,
      [`ctx:src:scene:scarcity:${selfId}`, `ctx:src:scene:resourceAccess:${selfId}`],
      buildParts([
        { name: 'sceneScarcity', val: scScarcity, w: 0.75 },
        { name: 'resourceAccess', val: scResourceAccess, w: -0.25, contrib: -0.25 * scResourceAccess },
      ], 'scarcity = 0.75*sceneScarcity + 0.25*(1-resourceAccess)')
    ),

    atom(
      `ctx:legitimacy:${selfId}`,
      ctxLegitimacy,
      [`ctx:src:scene:chaos:${selfId}`, `ctx:src:norm:proceduralStrict:${selfId}`, `world:loc:control_level:${selfId}`],
      buildParts([
        { name: 'chaos', val: scChaos, w: -0.45, contrib: -0.45 * scChaos },
        { name: 'proceduralStrict', val: normProceduralStrict, w: 0.35 },
        { name: 'control', val: control, w: 0.20 },
      ], 'legitimacy = 0.45*(1-chaos) + 0.35*proceduralStrict + 0.20*control')
    ),
    atom(
      `ctx:secrecy:${selfId}`,
      ctxSecrecy,
      [`ctx:surveillance:${selfId}`, `ctx:publicness:${selfId}`, `ctx:src:scene:threat:${selfId}`, `ctx:privacy:${selfId}`],
      buildParts([
        { name: 'surveillance', val: surveillance, w: 0.35 },
        { name: 'publicness', val: publicness, w: 0.20 },
        { name: 'sceneThreat', val: scThreat, w: 0.25 },
        { name: 'privacy', val: privacy, w: -0.20, contrib: -0.20 * privacy },
      ], 'secrecy = 0.35*surveillance + 0.20*publicness + 0.25*sceneThreat + 0.20*(1-privacy)')
    ),
    // Aux ctx signals used by action/possibility models
    atom(
      `ctx:proceduralStrict:${selfId}`,
      ctxProceduralStrict,
      [`ctx:src:norm:proceduralStrict:${selfId}`],
      buildParts([{ name: 'proceduralStrict', val: normProceduralStrict }], 'proceduralStrict = norm.proceduralStrict'),
      'ctx_aux'
    ),
    atom(
      `ctx:cover:${selfId}`,
      ctxCover,
      [`world:map:cover:${selfId}`],
      buildParts([{ name: 'cover', val: cover }], 'cover = map.cover'),
      'ctx_aux'
    ),
    atom(
      `ctx:escape:${selfId}`,
      ctxEscape,
      [`world:map:escape:${selfId}`],
      buildParts([{ name: 'escape', val: escape }], 'escape = map.escape'),
      'ctx_aux'
    ),

    atom(
      `ctx:grief:${selfId}`,
      ctxGrief,
      [`ctx:src:scene:loss:${selfId}`],
      buildParts([{ name: 'sceneLoss', val: scLoss }], 'grief = scene.loss')
    ),
    atom(
      `ctx:pain:${selfId}`,
      featPain,
      [`feat:char:${selfId}:body.pain`],
      buildParts([{ name: 'bodyPain', val: featPain }], 'pain = body.pain')
    )
  ];

  return { atoms: outAtoms };
}

// --------------------------------------------------------
// Vector Calculator (Legacy/Advanced Usage)
// Calculates full vectors for decision logic, potentially tuning them.
// Now relies on finding the ctx atoms we just derived above.
// --------------------------------------------------------

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
  const v = typeof (a as any).magnitude === 'number' ? clamp01((a as any).magnitude) : 0;
  return { value: v, confidence: (a as any)?.confidence, from: (a as any)?.id };
}

export type DeriveAxesResult = {
  raw: ContextAxesVector;
  tuned: ContextAxesVector;
  atomsUsed: Partial<Record<ContextSignalId, { value: number; confidence?: number; from: string }>>;
  tuningApplied?: ContextTuning;
  atoms?: ContextAtom[];
};

export function deriveContextVectors(args: {
  selfId?: string;
  frame?: any;
  world?: any;
  atoms?: ContextAtomLike[] | null;
  domainMix?: Record<string, number> | null;
  tuning?: ContextTuning | null;
}): DeriveAxesResult {
  const { atoms, tuning } = args;
  const raw = defaultAxes();
  const atomsUsed: DeriveAxesResult['atomsUsed'] = {};

  // Look for the specific atoms derived by `deriveAxes` (atom generator)
  // We assume selfId is embedded in atom IDs or we search by prefix/kind if needed.
  // For simplicity, we search by kind `ctx_axis` and id `ctx:danger:SELFID`.
  // Since we might not know selfId here easily without parsing, we can search by id prefix `ctx:danger`
  // But wait, atoms usually come with specific IDs. 
  // Let's iterate atoms to find ctx axes if possible, or fallback to exact lookup if we assume standard IDs.
  
  // Actually, we can just use the provided atoms list. 
  // `deriveAxes` produced atoms like `ctx:danger:${selfId}`.
  // The consumer of this function usually has the full atom list.
  
  // We will scan for atoms starting with `ctx:` to fill the vector.
  if (atoms) {
    for (const a of atoms) {
      if (a.id && a.id.startsWith('ctx:')) {
        const key = a.id.split(':')[1]; // ctx:danger:xyz -> danger
        if (key && key in raw) {
          // @ts-ignore
          raw[key] = Math.max(raw[key], clamp01(a.magnitude || 0));
          // @ts-ignore
          atomsUsed[`ctx_${key}`] = { value: raw[key], confidence: a.confidence, from: a.id };
        }
      }
    }
  }

  // Tuned axes
  // Note: we can detect isFormal/isPrivate from atoms too now if needed
  const tuned = applyTuning(raw, tuning ?? null);

  // Infer selfId from any ctx:* atom id (ctx:axis:self), skipping ctx:src:* atoms
  const inferSelfId = (): string | null => {
    if (args.selfId) return args.selfId;
    for (const a of atoms ?? []) {
      const id = String((a as any)?.id || '');
      if (!id.startsWith('ctx:')) continue;
      if (id.startsWith('ctx:src:')) continue;
      const parts = id.split(':');
      if (parts.length === 3) {
        const axis = parts[1];
        if (axis && (axis in raw)) return parts[2];
      }
    }
    return null;
  };

  const selfId = inferSelfId();

  const outAtoms: ContextAtom[] = [];
  if (selfId) {
    for (const k of Object.keys(tuned)) {
      const id = `ctx:${k}:${selfId}`;
      const v = clamp01((tuned as any)[k]);
      outAtoms.push({
        id,
        ns: 'ctx',
        kind: 'ctx_axis',
        origin: 'derived',
        source: 'deriveContextVectors',
        magnitude: v,
        confidence: 1,
        tags: ['ctx', 'axis', 'tuned'],
        trace: {
          usedAtomIds: [id],
          notes: ['tuning overlay (raw -> tuned)'],
          parts: { raw: (raw as any)[k] ?? 0, tuned: v, tuning: tuning ?? null },
        },
        label: `${k}:${Math.round(v * 100)}%`
      } as any);
    }
  }

  return { raw, tuned, atomsUsed, tuningApplied: tuning ?? undefined, atoms: outAtoms };
}

// Deprecated export for backward compatibility if needed, though replaced
export const deriveContextAxesFromFrame = deriveContextVectors;

export function applyTuning(
  raw: ContextAxesVector,
  tuning: ContextTuning | null,
  env?: { isFormal?: boolean; isPrivate?: boolean }
): ContextAxesVector {
  const out = { ...raw };

  if (!tuning) return out;

  const gain = typeof tuning.gain === 'number' ? clamp01(tuning.gain) : 1;
  const AXES = Object.keys(raw);

  for (const k of AXES) {
    const lock = tuning.lock?.[k as keyof ContextAxesVector];
    if (typeof lock === 'number') {
      // @ts-ignore
      out[k] = clamp01(lock);
      continue;
    }

    const add = typeof tuning.add?.[k as keyof ContextAxesVector] === 'number' ? clamp(tuning.add[k as keyof ContextAxesVector]!, -1, 1) : 0;
    const mul = typeof tuning.mul?.[k as keyof ContextAxesVector] === 'number' ? clamp(tuning.mul[k as keyof ContextAxesVector]!, 0, 2) : 1;

    // @ts-ignore
    const v = out[k];
    const tuned = clamp01((v * mul + add) * (0.35 + 0.65 * gain));
    // @ts-ignore
    out[k] = tuned;
  }

  return out;
}
