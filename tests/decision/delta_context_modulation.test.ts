import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '@/lib/goal-lab/types';
import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';
import type { Possibility } from '@/lib/possibilities/catalog';

function mkAtom(id: string, magnitude: number): ContextAtom {
  const ns: ContextAtom['ns'] = id.startsWith('util:')
    ? 'util'
    : id.startsWith('ctx:')
      ? 'ctx'
      : id.startsWith('world:')
        ? 'world'
        : 'misc';
  return {
    id,
    kind: 'scalar',
    ns,
    source: 'test' as any,
    magnitude,
    confidence: 1,
  };
}

describe('buildActionCandidates context modulation', () => {
  it('amplifies positive safety delta in high danger compared with low danger', () => {
    const selfId = 'A';
    const hide: Possibility = {
      id: `aff:hide:${selfId}:B`,
      actorId: selfId,
      targetId: 'B',
      label: 'Hide',
      kind: 'aff',
      magnitude: 0.3,
      blockedBy: [],
      confidence: 1,
      trace: { usedAtomIds: [] },
      source: 'rules',
      meta: {},
    } as any;

    const baseAtoms: ContextAtom[] = [
      mkAtom(`util:activeGoal:${selfId}:safety`, 1),
      mkAtom(`util:activeGoal:${selfId}:affiliation`, 0.5),
    ];

    const low = buildActionCandidates({
      selfId,
      atoms: [...baseAtoms, mkAtom(`ctx:danger:${selfId}`, 0.1)],
      possibilities: [hide],
    });
    const high = buildActionCandidates({
      selfId,
      atoms: [...baseAtoms, mkAtom(`ctx:danger:${selfId}`, 0.9)],
      possibilities: [hide],
    });

    const lowSafety = Number(low.actions[0]?.deltaGoals?.safety ?? 0);
    const highSafety = Number(high.actions[0]?.deltaGoals?.safety ?? 0);

    expect(lowSafety).toBeGreaterThan(0);
    expect(highSafety).toBeGreaterThan(lowSafety);
  });
});
