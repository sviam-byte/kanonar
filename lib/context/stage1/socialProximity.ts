// lib/context/stage1/socialProximity.ts
import type { AtomNamespace, ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return typeof m === 'number' && Number.isFinite(m) ? m : fb;
}

function hasTag(atoms: ContextAtom[], id: string) {
  return atoms.some(a => a.id === id && (a.magnitude ?? 0) > 0.5);
}

function mk(
  ns: AtomNamespace | any,
  kind: string,
  id: string,
  selfId: string,
  otherId: string,
  magnitude: number,
  parts: any,
  usedAtomIds: string[]
): ContextAtom {
  return normalizeAtom({
    id,
    kind,
    ns,
    origin: 'derived',
    source: 'socialProximity',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: selfId,
    target: otherId,
    relatedAgentId: otherId,
    tags: [String(ns), 'socialProximity', kind],
    trace: { usedAtomIds: Array.from(new Set(usedAtomIds)), notes: [], parts },
  } as any);
}

export function deriveSocialProximityAtoms(args: { selfId: string; atoms: ContextAtom[] }): { atoms: ContextAtom[] } {
  const { selfId, atoms } = args;
  const out: ContextAtom[] = [];

  const nearby = atoms.filter(a => typeof a.id === 'string' && a.id.startsWith(`obs:nearby:${selfId}:`));

  for (const n of nearby) {
    const otherId = String((n.id as string).split(':')[3] ?? '');
    if (!otherId || otherId === selfId) continue;

    const close = clamp01((n as any).magnitude ?? 0);
    if (close <= 0) continue;

    const trust = getMag(atoms, `tom:dyad:${selfId}:${otherId}:trust`, 0.45);
    const threat = getMag(atoms, `tom:dyad:${selfId}:${otherId}:threat`, clamp01(1 - trust));

    const tagFriend = hasTag(atoms, `rel:tag:${selfId}:${otherId}:friend`);
    const tagEnemy = hasTag(atoms, `rel:tag:${selfId}:${otherId}:enemy`);

    const friend = tagFriend || (trust >= 0.65 && threat <= 0.45);
    const enemy = tagEnemy || (threat >= 0.65 && trust <= 0.45);
    const neutral = !friend && !enemy;

    const used = [n.id, `tom:dyad:${selfId}:${otherId}:trust`, `tom:dyad:${selfId}:${otherId}:threat`];
    if (tagFriend) used.push(`rel:tag:${selfId}:${otherId}:friend`);
    if (tagEnemy) used.push(`rel:tag:${selfId}:${otherId}:enemy`);

    if (friend) {
      // Pure proximity stays in prox:*
      out.push(
        mk('map', 'proximity_friend', `prox:friend:${selfId}:${otherId}`, selfId, otherId, close, { close, trust, threat }, used),
      );
      // Social meaning becomes soc:*
      out.push(
        mk('soc', 'social_support', `soc:support:${selfId}:${otherId}`, selfId, otherId, close * trust, { close, trust, threat, friend: true }, used),
      );
      out.push(
        mk('soc', 'tom_trusted_ally_near', `tom:trusted_ally_near:${selfId}:${otherId}`, selfId, otherId, close * trust, { close, trust, threat, friend: true }, used),
      );
      out.push(
        mk('soc', 'social_support_near', `soc:support_near:${selfId}:${otherId}`, selfId, otherId, close * trust, { close, trust, threat, friend: true }, used),
      );
    } else if (enemy) {
      out.push(
        mk('map', 'proximity_enemy', `prox:enemy:${selfId}:${otherId}`, selfId, otherId, close, { close, trust, threat }, used),
      );
      out.push(
        mk('soc', 'social_threat', `soc:threat:${selfId}:${otherId}`, selfId, otherId, close * threat, { close, trust, threat, enemy: true }, used),
      );
      out.push(
        mk('soc', 'tom_threatening_other_near', `tom:threatening_other_near:${selfId}:${otherId}`, selfId, otherId, close * threat, { close, trust, threat, enemy: true }, used),
      );
      out.push(
        mk('soc', 'social_threat_near', `soc:threat_near:${selfId}:${otherId}`, selfId, otherId, close * threat, { close, trust, threat, enemy: true }, used),
      );
    } else if (neutral) {
      out.push(
        mk('map', 'proximity_neutral', `prox:neutral:${selfId}:${otherId}`, selfId, otherId, close, { close, trust, threat }, used)
      );
    }
  }

  return { atoms: out };
}
