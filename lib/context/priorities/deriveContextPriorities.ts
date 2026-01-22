import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0): number {
  const a = atoms.find((x) => String((x as any)?.id) === id) as any;
  const m = Number(a?.magnitude);
  return Number.isFinite(m) ? m : fb;
}

function uniq(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function mkPrio(selfId: string, axis: string, v: number, usedAtomIds: string[], parts: any) {
  const id = `ctx:prio:${axis}:${selfId}`;
  return normalizeAtom({
    id,
    ns: 'ctx' as any,
    kind: 'ctx_priority' as any,
    origin: 'derived',
    source: 'context_priorities',
    subject: selfId,
    target: selfId,
    magnitude: clamp01(v),
    confidence: 1,
    tags: ['ctx', 'prio', axis],
    label: `prio.${axis}:${Math.round(clamp01(v) * 100)}%`,
    trace: {
      usedAtomIds: uniq(usedAtomIds),
      notes: ['context priority (what the agent attends to / weights)'],
      parts,
    },
  } as any);
}

/**
 * Context priorities (personal): produces ctx:prio:* atoms.
 * These do NOT describe the world; they describe "importance weights" for this character.
 */
export function deriveContextPriorities(args: { selfId: string; atoms: ContextAtom[] }): { atoms: ContextAtom[] } {
  const { selfId, atoms } = args;

  // traits (0..1)
  const paranoia = getMag(atoms, `feat:char:${selfId}:trait.paranoia`, 0.5);
  const sensitivity = getMag(atoms, `feat:char:${selfId}:trait.sensitivity`, 0.5);
  const experience = getMag(atoms, `feat:char:${selfId}:trait.experience`, 0.5);
  const ambiguityTol = getMag(atoms, `feat:char:${selfId}:trait.ambiguityTolerance`, 0.5);
  const normSens = getMag(atoms, `feat:char:${selfId}:trait.normSensitivity`, sensitivity);
  const hpa = getMag(atoms, `feat:char:${selfId}:trait.hpaReactivity`, 0.5);

  // body/caps
  const stress = getMag(atoms, `feat:char:${selfId}:body.stress`, 0.3);
  const fatigue = getMag(atoms, `feat:char:${selfId}:body.fatigue`, 0.3);

  // life-domain "values" (optional, neutral 0.5)
  const lifeSafety = getMag(atoms, `goal:lifeDomain:safety:${selfId}`, 0.5);
  const lifeAff = getMag(atoms, `goal:lifeDomain:affiliation:${selfId}`, 0.5);
  const lifeStatus = getMag(atoms, `goal:lifeDomain:status:${selfId}`, 0.5);
  const lifeExplore = getMag(atoms, `goal:lifeDomain:exploration:${selfId}`, 0.5);
  const lifeOrder = getMag(atoms, `goal:lifeDomain:order:${selfId}`, 0.5);

  // ctx final axes (if available) are useful for "situational salience" modulation
  const danger = getMag(atoms, `ctx:final:danger:${selfId}`, getMag(atoms, `ctx:danger:${selfId}`, 0));
  const unc = getMag(atoms, `ctx:final:uncertainty:${selfId}`, getMag(atoms, `ctx:uncertainty:${selfId}`, 0));
  const pub = getMag(atoms, `ctx:final:publicness:${selfId}`, getMag(atoms, `ctx:publicness:${selfId}`, 0));
  const surv = getMag(atoms, `ctx:final:surveillance:${selfId}`, getMag(atoms, `ctx:surveillance:${selfId}`, 0));
  const crowd = getMag(atoms, `ctx:final:crowd:${selfId}`, getMag(atoms, `ctx:crowd:${selfId}`, 0));
  const norm = getMag(atoms, `ctx:final:normPressure:${selfId}`, getMag(atoms, `ctx:normPressure:${selfId}`, 0));
  const control = getMag(atoms, `ctx:final:control:${selfId}`, getMag(atoms, `ctx:control:${selfId}`, 0));
  const timeP = getMag(atoms, `ctx:final:timePressure:${selfId}`, getMag(atoms, `ctx:timePressure:${selfId}`, 0));
  const secrecy = getMag(atoms, `ctx:final:secrecy:${selfId}`, getMag(atoms, `ctx:secrecy:${selfId}`, 0));
  const legitimacy = getMag(atoms, `ctx:final:legitimacy:${selfId}`, getMag(atoms, `ctx:legitimacy:${selfId}`, 0));
  const hierarchy = getMag(atoms, `ctx:final:hierarchy:${selfId}`, getMag(atoms, `ctx:hierarchy:${selfId}`, 0));
  const intimacy = getMag(atoms, `ctx:final:intimacy:${selfId}`, getMag(atoms, `ctx:intimacy:${selfId}`, 0));

  // A) baseline attentional biases from traits
  const attThreat = clamp01(0.45 + 0.55 * paranoia + 0.25 * hpa + 0.20 * stress);
  const attNorm = clamp01(0.35 + 0.70 * normSens + 0.15 * pub);
  const attSocial = clamp01(0.30 + 0.65 * sensitivity + 0.10 * (1 - paranoia));
  const attOrder = clamp01(0.35 + 0.55 * (lifeOrder - 0.5) + 0.25 * normSens + 0.15 * experience);
  const attExplore = clamp01(0.25 + 0.65 * (lifeExplore - 0.5) + 0.45 * ambiguityTol + 0.15 * (1 - fatigue));

  // B) situational modulation (small): priorities are personal, but can shift a bit under pressure
  const press = clamp01(0.55 * danger + 0.30 * unc + 0.15 * timeP);

  // Compute priorities (0..1). 0.5 is neutral.
  const prioDanger = clamp01(0.35 + 0.65 * attThreat + 0.20 * press);
  const prioUnc = clamp01(0.30 + 0.55 * (1 - ambiguityTol) + 0.25 * (1 - experience) + 0.20 * press);
  const prioNorm = clamp01(0.25 + 0.75 * attNorm);
  const prioPublic = clamp01(0.20 + 0.60 * attSocial + 0.20 * attNorm);
  const prioSurv = clamp01(0.25 + 0.70 * paranoia + 0.25 * attThreat);
  const prioCrowd = clamp01(0.20 + 0.55 * sensitivity + 0.35 * stress);
  const prioIntim = clamp01(0.25 + 0.55 * attSocial + 0.20 * lifeAff);
  const prioControl = clamp01(0.25 + 0.70 * attOrder + 0.25 * (1 - control));
  const prioTime = clamp01(0.25 + 0.60 * (1 - ambiguityTol) + 0.35 * fatigue + 0.20 * timeP);
  const prioSecrecy = clamp01(0.20 + 0.75 * paranoia + 0.20 * (surv + pub) + 0.15 * secrecy);
  const prioLegit = clamp01(0.25 + 0.55 * experience + 0.25 * normSens + 0.20 * legitimacy);
  const prioHier = clamp01(0.20 + 0.60 * normSens + 0.30 * paranoia + 0.15 * hierarchy);

  const used = [
    `feat:char:${selfId}:trait.paranoia`,
    `feat:char:${selfId}:trait.sensitivity`,
    `feat:char:${selfId}:trait.experience`,
    `feat:char:${selfId}:trait.ambiguityTolerance`,
    `feat:char:${selfId}:trait.normSensitivity`,
    `feat:char:${selfId}:trait.hpaReactivity`,
    `feat:char:${selfId}:body.stress`,
    `feat:char:${selfId}:body.fatigue`,
    `goal:lifeDomain:safety:${selfId}`,
    `goal:lifeDomain:affiliation:${selfId}`,
    `goal:lifeDomain:status:${selfId}`,
    `goal:lifeDomain:exploration:${selfId}`,
    `goal:lifeDomain:order:${selfId}`,
    `ctx:final:danger:${selfId}`,
    `ctx:final:uncertainty:${selfId}`,
    `ctx:final:publicness:${selfId}`,
    `ctx:final:surveillance:${selfId}`,
    `ctx:final:crowd:${selfId}`,
    `ctx:final:normPressure:${selfId}`,
    `ctx:final:control:${selfId}`,
    `ctx:final:timePressure:${selfId}`,
    `ctx:final:secrecy:${selfId}`,
    `ctx:final:legitimacy:${selfId}`,
    `ctx:final:hierarchy:${selfId}`,
    `ctx:final:intimacy:${selfId}`,
  ];

  const out: ContextAtom[] = [
    mkPrio(selfId, 'danger', prioDanger, used, { attThreat, press, danger }),
    mkPrio(selfId, 'uncertainty', prioUnc, used, { ambiguityTol, experience, press, unc }),
    mkPrio(selfId, 'normPressure', prioNorm, used, { attNorm, normSens, norm }),
    mkPrio(selfId, 'publicness', prioPublic, used, { attSocial, attNorm, pub }),
    mkPrio(selfId, 'surveillance', prioSurv, used, { paranoia, attThreat, surv }),
    mkPrio(selfId, 'crowd', prioCrowd, used, { sensitivity, stress, crowd }),
    mkPrio(selfId, 'intimacy', prioIntim, used, { attSocial, lifeAff, intimacy }),
    mkPrio(selfId, 'control', prioControl, used, { attOrder, control }),
    mkPrio(selfId, 'timePressure', prioTime, used, { ambiguityTol, fatigue, timeP }),
    mkPrio(selfId, 'secrecy', prioSecrecy, used, { paranoia, surv, pub, secrecy }),
    mkPrio(selfId, 'legitimacy', prioLegit, used, { experience, normSens, legitimacy }),
    mkPrio(selfId, 'hierarchy', prioHier, used, { normSens, paranoia, hierarchy }),
  ];

  return { atoms: out };
}
