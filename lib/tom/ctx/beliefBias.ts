// lib/tom/ctx/beliefBias.ts
import { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';

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
  atoms: ContextAtom[],
  selfId: string
): { bias: number; atoms: ContextAtom[] } {
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
