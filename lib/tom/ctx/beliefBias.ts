// lib/tom/ctx/beliefBias.ts
import { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';

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

  const uncertainty = clamp01(
    getMag(atoms, `ctx:uncertainty:${selfId}`, 1 - getMag(atoms, `obs:infoAdequacy:${selfId}`, 0.6))
  );
  const danger = clamp01(getMag(atoms, `ctx:danger:${selfId}`, 0));

  const surveillance = clamp01(pickFinite(
    beliefSurv,
    getMag(atoms, `ctx:surveillance:${selfId}`, NaN),
    getMag(atoms, `world:loc:control_level:${selfId}`, NaN),
  ) ?? 0);

  const publicness = clamp01(pickFinite(
    beliefPub,
    getMag(atoms, `ctx:publicness:${selfId}`, NaN),
    getMag(atoms, `world:loc:publicness:${selfId}`, NaN),
  ) ?? 0);

  const normPressure = clamp01(getMag(atoms, `ctx:normPressure:${selfId}`, getMag(atoms, `world:loc:normative_pressure:${selfId}`, 0)));

  const hostility = clamp01(believedHostility ?? 0);

  const bias = clamp01(
    0.40 * hostility +
    0.20 * uncertainty +
    0.15 * surveillance +
    0.10 * publicness +
    0.10 * normPressure +
    0.05 * danger
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
        `ctx:uncertainty:${selfId}`,
        `ctx:danger:${selfId}`,
        `ctx:surveillance:${selfId}`,
        `ctx:publicness:${selfId}`,
        `ctx:normPressure:${selfId}`,
        `world:loc:control_level:${selfId}`,
        `world:loc:publicness:${selfId}`,
        `world:loc:normative_pressure:${selfId}`,
        `obs:infoAdequacy:${selfId}`,
      ],
      notes: [
        'bias = 0.40*hostility + 0.20*unc + 0.15*surv + 0.10*pub + 0.10*norm + 0.05*danger',
      ],
      parts: { hostility, uncertainty, surveillance, publicness, normPressure, danger }
    }
  } as any));

  return { bias, atoms: out };
}
