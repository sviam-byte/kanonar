import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const clamp11 = (x: number) => (Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0): number {
  const a: any = atoms.find(x => x?.id === id);
  const m = Number(a?.magnitude);
  return Number.isFinite(m) ? m : fb;
}

function mk(selfId: string, otherId: string, value: number, usedAtomIds: string[], parts: Record<string, number>): ContextAtom {
  return normalizeAtom({
    id: `social:rank:diff:${selfId}:${otherId}`,
    ns: 'social',
    kind: 'social_rank_diff',
    origin: 'derived',
    source: 'derived',
    subject: selfId,
    target: otherId,
    magnitude: clamp11(value),
    confidence: 0.75,
    label: `social.rank.diff:${Math.round(clamp11(value) * 100)}%`,
    trace: {
      usedAtomIds: Array.from(new Set(usedAtomIds.filter(Boolean))),
      notes: ['Derived social rank differential from authority/reputation/deference'],
      parts,
    },
  } as any);
}

/**
 * Derive signed rank differential for each dyad.
 * Positive value => target is socially higher than self.
 */
export function deriveSocialStandingAtoms(args: {
  atoms: ContextAtom[];
  selfId: string;
  otherIds: string[];
}): ContextAtom[] {
  const { atoms, selfId, otherIds } = args;
  const out: ContextAtom[] = [];

  for (const otherId of otherIds) {
    if (!otherId || otherId === selfId) continue;

    const selfAuthorityId = `rel:state:${selfId}:${otherId}:respect`;
    const otherAuthorityId = `rel:state:${otherId}:${selfId}:respect`;
    const selfReputationId = `soc:reputation:${selfId}`;
    const otherReputationId = `soc:reputation:${otherId}`;
    const selfDeferenceId = `tom:dyad:${selfId}:${otherId}:respect`;
    const otherDeferenceId = `tom:dyad:${otherId}:${selfId}:respect`;

    // Mix direct relation and global social signals.
    const selfAuthority = clamp01(getMag(atoms, selfAuthorityId, 0.4));
    const otherAuthority = clamp01(getMag(atoms, otherAuthorityId, 0.4));
    const selfReputation = clamp01(getMag(atoms, selfReputationId, 0.5));
    const otherReputation = clamp01(getMag(atoms, otherReputationId, 0.5));
    const selfDeference = clamp01(getMag(atoms, selfDeferenceId, 0.4));
    const otherDeference = clamp01(getMag(atoms, otherDeferenceId, 0.4));

    const selfRank = clamp01(0.45 * selfAuthority + 0.35 * selfReputation + 0.20 * selfDeference);
    const otherRank = clamp01(0.45 * otherAuthority + 0.35 * otherReputation + 0.20 * otherDeference);
    const rankDiff = clamp11(otherRank - selfRank);

    out.push(mk(
      selfId,
      otherId,
      rankDiff,
      [selfAuthorityId, otherAuthorityId, selfReputationId, otherReputationId, selfDeferenceId, otherDeferenceId],
      { selfAuthority, otherAuthority, selfReputation, otherReputation, selfDeference, otherDeference, selfRank, otherRank }
    ));
  }

  return out;
}
