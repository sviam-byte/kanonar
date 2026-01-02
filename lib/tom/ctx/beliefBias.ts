// lib/tom/ctx/beliefBias.ts
import { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';
import { getCtx, pickCtxId } from '../../context/layers';
import { getDyadMag } from '../layers';

function unpackAtomsAndSelfId(
  arg1: ContextAtom[] | { atoms?: unknown; selfId?: unknown } | null | undefined,
  arg2?: unknown
): { atoms: ContextAtom[]; selfId: string } {
  if (Array.isArray(arg1)) {
    return { atoms: arg1 as ContextAtom[], selfId: String(arg2 ?? '') };
  }

  if (arg1 && typeof arg1 === 'object') {
    const a: any = arg1;
    const rawAtoms = a.atoms;
    const atoms = Array.isArray(rawAtoms)
      ? rawAtoms
      : rawAtoms && typeof rawAtoms === 'object'
        ? Object.values(rawAtoms)
        : [];

    return { atoms: atoms as ContextAtom[], selfId: String(a.selfId ?? arg2 ?? '') };
  }

  return { atoms: [] as ContextAtom[], selfId: String(arg2 ?? '') };
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

function pickFinite(...vals: Array<number | undefined>) {
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}

function meanDyad(atoms: ContextAtom[], selfId: string, metric: 'trust' | 'threat', fb: number): { mean: number; used: string[] } {
  const used: string[] = [];
  const vals: number[] = [];
  for (const a of atoms as any[]) {
    const id = String(a?.id ?? '');
    if (!id.startsWith('tom:dyad:')) continue;

    const parts = id.split(':');
    let s = '';
    let t = '';
    let m = '';
    if (parts[2] === 'final') {
      s = parts[3];
      t = parts[4];
      m = parts[5];
    } else {
      s = parts[2];
      t = parts[3];
      m = parts[4];
    }

    if (s !== selfId || !t || m !== metric) continue;

    const picked = getDyadMag(atoms, selfId, t, metric, fb);
    if (picked.id !== id) continue;
    vals.push(clamp01(picked.mag));
    used.push(picked.id);
  }
  if (!vals.length) return { mean: fb, used: [] };
  return { mean: vals.reduce((a, b) => a + b, 0) / vals.length, used };
}

/**
 * Output:
 * - tom:ctx:bias:self in [0..1], where higher => more suspicious / threat-biased interpretation.
 */
export function buildBeliefToMBias(
  arg1: ContextAtom[] | { atoms?: unknown; selfId?: unknown },
  arg2?: string
): { bias: number; atoms: ContextAtom[] } {
  const { atoms, selfId } = unpackAtomsAndSelfId(arg1 as any, arg2);
  const out: ContextAtom[] = [];

  const believedHostility = pickFinite(
    getMag(atoms, `belief:scene:hostility:${selfId}`, NaN),
    getMag(atoms, `belief:scene:hostility`, NaN) // legacy
  );
  const beliefSurv = pickFinite(
    getMag(atoms, `belief:norm:surveillance:${selfId}`, NaN),
    getMag(atoms, `belief:norm:surveillance`, NaN)
  );
  const beliefPub = pickFinite(
    getMag(atoms, `belief:norm:publicness:${selfId}`, NaN),
    getMag(atoms, `belief:norm:publicness`, NaN)
  );

  const uncP = getCtx(atoms, selfId, 'uncertainty', 1 - getMag(atoms, `obs:infoAdequacy:${selfId}`, 0.6));
  const survP = getCtx(atoms, selfId, 'surveillance', 0);
  const normP = getCtx(atoms, selfId, 'normPressure', 0);
  const uncertainty = clamp01(uncP.magnitude);
  const danger = clamp01(getCtx(atoms, selfId, 'danger', 0).magnitude);

  const surveillance = clamp01(pickFinite(
    beliefSurv,
    survP.magnitude,
    getMag(atoms, `world:loc:control_level:${selfId}`, NaN),
  ) ?? 0);

  const publicness = clamp01(pickFinite(
    beliefPub,
    getCtx(atoms, selfId, 'publicness', NaN).magnitude,
    getMag(atoms, `world:loc:publicness:${selfId}`, NaN),
  ) ?? 0);

  const normPressure = clamp01(pickFinite(
    normP.magnitude,
    getMag(atoms, `world:loc:normative_pressure:${selfId}`, NaN),
  ) ?? 0);

  const hostility = clamp01(believedHostility ?? 0);
  const meanTrust = meanDyad(atoms, selfId, 'trust', 0.5);
  const meanThreat = meanDyad(atoms, selfId, 'threat', 0.0);
  const socialSusp = clamp01(0.50 * (1 - meanTrust.mean) + 0.50 * meanThreat.mean);

  const bias = clamp01(
    0.45 * hostility +
    0.25 * uncertainty +
    0.15 * surveillance +
    0.15 * normPressure +
    0.25 * socialSusp
  );

  out.push(normalizeAtom({
    id: `tom:ctx:bias:${selfId}`,
    kind: 'tom_ctx',
    ns: 'tom',
    origin: 'derived',
    source: 'tom_ctx',
    magnitude: bias,
    confidence: 1,
    subject: selfId,
    target: selfId,
    tags: ['tom', 'ctx'],
    label: `bias:${Math.round(bias * 100)}%`,
    trace: {
      usedAtomIds: [
        `belief:scene:hostility:${selfId}`,
        `belief:norm:surveillance:${selfId}`,
        `belief:norm:publicness:${selfId}`,
        ...(uncP.id ? [uncP.id] : pickCtxId('uncertainty', selfId)),
        ...(survP.id ? [survP.id] : pickCtxId('surveillance', selfId)),
        ...(normP.id ? [normP.id] : pickCtxId('normPressure', selfId)),
        `world:loc:control_level:${selfId}`,
        `world:loc:publicness:${selfId}`,
        `world:loc:normative_pressure:${selfId}`,
        `obs:infoAdequacy:${selfId}`,
        ...meanTrust.used,
        ...meanThreat.used,
      ],
      notes: [
        'bias = 0.45*hostility + 0.25*unc + 0.15*surv + 0.15*norm + 0.25*socialSusp',
      ],
      parts: { hostility, uncertainty, surveillance, publicness, normPressure, danger, meanTrust: meanTrust.mean, meanThreat: meanThreat.mean, socialSusp, bias }
    }
  } as any));

  return { bias, atoms: out };
}
