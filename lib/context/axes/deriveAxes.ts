
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

function atom(id: string, magnitude: number, usedAtomIds: string[], parts: any): ContextAtom {
  return {
    id,
    ns: 'ctx',
    kind: 'ctx_axis',
    origin: 'derived',
    source: 'deriveAxes',
    magnitude: clamp01(magnitude),
    confidence: 1,
    trace: { usedAtomIds, parts },
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
  const privacy = get(atoms, `world:loc:privacy:${selfId}`, 0);
  const control = get(atoms, `world:loc:control_level:${selfId}`, 0);
  const crowd = get(atoms, `world:loc:crowd:${selfId}`, 0);
  const normPressure = get(atoms, `world:loc:normative_pressure:${selfId}`, 0);

  const cover = get(atoms, `world:map:cover:${selfId}`, 0);
  const escape = get(atoms, `world:map:escape:${selfId}`, 0);
  const danger = Math.max(
    get(atoms, `world:map:danger:${selfId}`, 0),
    get(atoms, `world:env:hazard:${selfId}`, 0)
  );

  // Observational quality (from patch 54). If missing -> moderate.
  const infoAdequacy = get(atoms, `obs:infoAdequacy:${selfId}`, 0.6);
  const uncertainty = clamp01(1 - infoAdequacy);

  // Axes
  const publicness = clamp01(1 - privacy);
  const surveillance = clamp01(0.75 * control + 0.25 * publicness);
  const hierarchy = clamp01(0.7 * control + 0.3 * normPressure);

  const ctxDanger = clamp01(0.65 * danger + 0.20 * (1 - escape) + 0.15 * (1 - cover));
  const ctxCrowd = clamp01(crowd);
  const ctxNormPressure = clamp01(0.5 * normPressure + 0.3 * surveillance + 0.2 * publicness);
  const ctxIntimacy = clamp01(privacy * 0.7 + (1-surveillance)*0.3);

  // Pain (ctx:pain) from feature if available
  const featPain = get(atoms, `feat:char:${selfId}:body.pain`, 0);
  
  const used = [
    `world:loc:privacy:${selfId}`,
    `world:loc:control_level:${selfId}`,
    `world:loc:crowd:${selfId}`,
    `world:loc:normative_pressure:${selfId}`,
    `world:map:cover:${selfId}`,
    `world:map:escape:${selfId}`,
    `world:map:danger:${selfId}`,
    `world:env:hazard:${selfId}`,
    `obs:infoAdequacy:${selfId}`,
    `feat:char:${selfId}:body.pain`
  ];

  const outAtoms = [
    atom(`ctx:privacy:${selfId}`, privacy, used, { privacy }),
    atom(`ctx:publicness:${selfId}`, publicness, used, { publicness, privacy }),
    atom(`ctx:surveillance:${selfId}`, surveillance, used, { surveillance, control, publicness }),
    atom(`ctx:hierarchy:${selfId}`, hierarchy, used, { hierarchy, control, normPressure }),
    atom(`ctx:crowd:${selfId}`, ctxCrowd, used, { crowd }),
    atom(`ctx:normPressure:${selfId}`, ctxNormPressure, used, { normPressure, surveillance, publicness }),
    atom(`ctx:uncertainty:${selfId}`, uncertainty, used, { uncertainty, infoAdequacy }),
    atom(`ctx:danger:${selfId}`, ctxDanger, used, { ctxDanger, danger, escape, cover }),
    atom(`ctx:intimacy:${selfId}`, ctxIntimacy, used, { ctxIntimacy, privacy, surveillance }),
    atom(`ctx:pain:${selfId}`, featPain, used, { featPain })
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
};

export function deriveContextVectors(args: {
  frame?: any;
  world?: any;
  atoms?: ContextAtomLike[] | null;
  domainMix?: Record<string, number> | null;
  tuning?: ContextTuning | null;
}): DeriveAxesResult {
  const { atoms, tuning } = args;
  const raw = defaultAxes();
  const atomsUsed: DeriveAxesResult['atomsUsed'] = {};
  const idx = buildAtomIndex(atoms ?? null);

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

  return { raw, tuned, atomsUsed, tuningApplied: tuning ?? undefined };
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
