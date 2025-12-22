import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}
function firstIdByPrefix(atoms: ContextAtom[], prefix: string) {
  return atoms.find(a => typeof a?.id === 'string' && a.id.startsWith(prefix))?.id || null;
}

export function deriveAppraisalAtoms(args: { selfId: string; atoms: ContextAtom[] }) {
  const { selfId, atoms } = args;

  const threatId = `threat:final:${selfId}`;
  const threat = getMag(atoms, threatId, getMag(atoms, 'threat:final', 0));

  const unc = getMag(atoms, `ctx:uncertainty:${selfId}`, 0);
  const norm = getMag(atoms, `ctx:normPressure:${selfId}`, 0);
  const pub = getMag(atoms, `ctx:publicness:${selfId}`, 0);
  const intimacy = getMag(atoms, `ctx:intimacy:${selfId}`, 0);

  const coverId =
    firstIdByPrefix(atoms, `world:map:cover:${selfId}`) ||
    firstIdByPrefix(atoms, `map:cover:${selfId}`) ||
    firstIdByPrefix(atoms, `ctx:cover:${selfId}`);
  const escapeId =
    firstIdByPrefix(atoms, `world:map:escape:${selfId}`) ||
    firstIdByPrefix(atoms, `map:escape:${selfId}`) ||
    firstIdByPrefix(atoms, `ctx:escape:${selfId}`);

  const cover = coverId ? getMag(atoms, coverId, 0) : 0;
  const escape = escapeId ? getMag(atoms, escapeId, 0) : 0;

  // важное: "контроль" — это не просто отсутствие угрозы, это *возможность влиять*
  const control = clamp01(0.45 * cover + 0.35 * escape + 0.20 * (1 - unc));

  // "давление" = нормы/публичность (позже можно включить hierarchy/surveillance)
  const pressure = clamp01(0.65 * norm + 0.35 * pub);

  // "привязанность к ситуации" (как прокси для "есть что терять / есть кто рядом") — базово от интимности
  const attachment = clamp01(0.75 * intimacy + 0.25 * (1 - pub));

  // "loss" — оси deriveAxes уже имеют grief/pain
  const grief = getMag(atoms, `ctx:grief:${selfId}`, 0);
  const pain = getMag(atoms, `ctx:pain:${selfId}`, 0);
  const loss = clamp01(0.65 * grief + 0.35 * pain);

  // "goalBlock" (пока прокси): timePressure + scarcity
  const tp = getMag(atoms, `ctx:timePressure:${selfId}`, 0);
  const sc = getMag(atoms, `ctx:scarcity:${selfId}`, 0);
  const goalBlock = clamp01(0.55 * tp + 0.45 * sc);

  const used = [
    threatId,
    `ctx:uncertainty:${selfId}`,
    `ctx:normPressure:${selfId}`,
    `ctx:publicness:${selfId}`,
    `ctx:intimacy:${selfId}`,
    coverId,
    escapeId,
    `ctx:grief:${selfId}`,
    `ctx:pain:${selfId}`,
    `ctx:timePressure:${selfId}`,
    `ctx:scarcity:${selfId}`,
  ].filter(Boolean) as string[];

  const mk = (key: string, v: number, parts: any) =>
    normalizeAtom({
      id: `app:${key}:${selfId}`,
      ns: 'app' as any,
      kind: 'appraisal' as any,
      origin: 'derived',
      source: 'emotion_appraisal',
      magnitude: clamp01(v),
      confidence: 1,
      subject: selfId,
      tags: ['appraisal', key],
      label: `app.${key}:${Math.round(clamp01(v) * 100)}%`,
      trace: { usedAtomIds: used, notes: ['derived appraisal'], parts },
    } as any);

  const atomsOut: ContextAtom[] = [
    mk('threat', threat, { threat }),
    mk('uncertainty', unc, { unc }),
    mk('control', control, { cover, escape, unc, control }),
    mk('pressure', pressure, { norm, pub, pressure }),
    mk('attachment', attachment, { intimacy, pub, attachment }),
    mk('loss', loss, { grief, pain, loss }),
    mk('goalBlock', goalBlock, { tp, sc, goalBlock }),
  ];

  return {
    appraisal: { threat, uncertainty: unc, control, pressure, attachment, loss, goalBlock },
    atoms: atomsOut,
    usedAtomIds: used,
  };
}
