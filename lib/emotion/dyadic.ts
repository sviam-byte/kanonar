import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { collectDyadEntries, getDyadMag } from '../tom/layers';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function maxProximity(atoms: ContextAtom[], selfId: string, otherId: string) {
  let best = 0;
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id.includes(`:${selfId}:`) || !id.endsWith(`:${otherId}`)) continue;
    if (!id.startsWith('prox:') && !id.startsWith('soc:')) continue;
    best = Math.max(best, clamp01((a as any)?.magnitude ?? 0));
  }
  return best;
}

function effId(selfId: string, otherId: string, metric: string) {
  return `tom:effective:dyad:${selfId}:${otherId}:${metric}`;
}

export function deriveDyadicEmotionAtoms(args: { selfId: string; atoms: ContextAtom[] }) {
  const { selfId, atoms } = args;

  // собрать всех target’ов из effective dyads и tom:dyad:* (final→base)
  const targets = new Set<string>();
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith(`tom:effective:dyad:${selfId}:`)) continue;
    const parts = id.split(':'); // tom:effective:dyad:self:target:metric
    if (parts.length >= 6) targets.add(parts[4]);
  }
  for (const entry of collectDyadEntries(atoms, selfId)) {
    if (entry?.target) targets.add(entry.target);
  }

  const control = getMag(atoms, `app:control:${selfId}`, 0.4);
  const globalFear = getMag(atoms, `emo:fear:${selfId}`, 0);

  const out: ContextAtom[] = [];
  for (const otherId of targets) {
    const trustP = getDyadMag(atoms, selfId, otherId, 'trust', 0.5);
    const threatP = getDyadMag(atoms, selfId, otherId, 'threat', 0.0);
    const supportP = getDyadMag(atoms, selfId, otherId, 'support', 0.0);

    const trust = clamp01(trustP.mag);
    const threat = clamp01(threatP.mag);
    const support = clamp01(supportP.mag);
    const respect = getMag(atoms, effId(selfId, otherId, 'respect'), 0);
    const intimacy = getMag(atoms, effId(selfId, otherId, 'intimacy'), 0);

    const close = clamp01(maxProximity(atoms, selfId, otherId));

    // dyadic emotions
    const fearOf = clamp01(close * threat * (1 - control) * (0.65 + 0.35 * globalFear));
    const affinity = clamp01(close * trust * (1 - threat) * (0.55 + 0.45 * intimacy));
    const hostility = clamp01(close * threat * (1 - trust));
    const gratitude = clamp01(close * support * trust);

    const used = [
      trustP.id,
      threatP.id,
      supportP.id,
      effId(selfId, otherId, 'respect'),
      effId(selfId, otherId, 'intimacy'),
      `app:control:${selfId}`,
      `emo:fear:${selfId}`,
    ].filter(id => atoms.some(a => a.id === id));

    const mk = (key: string, v: number, parts: any) =>
      normalizeAtom({
        id: `emo:dyad:${key}:${selfId}:${otherId}`,
        ns: 'emo' as any,
        kind: 'emotion_dyad' as any,
        origin: 'derived',
        source: 'emotion_dyadic',
        magnitude: clamp01(v),
        confidence: 1,
        subject: selfId,
        target: otherId,
        tags: ['emo', 'dyad', key],
        label: `emo.${key}→${otherId}:${Math.round(clamp01(v) * 100)}%`,
        trace: { usedAtomIds: used, notes: ['derived dyadic emotion'], parts },
      } as any);

    out.push(
      mk('fearOf', fearOf, { close, threat, control, globalFear, fearOf }),
      mk('affinity', affinity, { close, trust, threat, intimacy, affinity }),
      mk('hostility', hostility, { close, threat, trust, hostility }),
      mk('gratitude', gratitude, { close, support, trust, gratitude }),
      mk('respect', clamp01(close * respect), { close, respect }),
    );
  }

  return { atoms: out };
}
