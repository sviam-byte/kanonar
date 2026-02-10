import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '@/lib/context/v2/types';
import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';
import type { Possibility } from '@/lib/possibilities/catalog';

function mkAtom(id: string, magnitude: number): ContextAtom {
  const ns: ContextAtom['ns'] = id.startsWith('goal:')
    ? 'goal'
    : id.startsWith('util:')
      ? 'util'
      : id.startsWith('ctx:')
        ? 'ctx'
        : 'world';

  return {
    id,
    kind: 'scalar',
    ns,
    source: { origin: 'derived' } as any,
    magnitude,
  };
}

describe('decision hint compatibility', () => {
  it('accepts both util:hint:allow:* and goal:hint:allow:* link atoms', () => {
    const selfId = 'A';
    const p: Possibility = {
      id: 'aff:talk:A:B',
      actorId: selfId,
      targetId: 'B',
      label: 'Talk',
      kind: 'aff',
      magnitude: 0.4,
      blockedBy: [],
      confidence: 1,
      trace: { usedAtomIds: [] },
      source: 'rules',
      meta: {},
    } as any;

    const utilAtoms: ContextAtom[] = [
      mkAtom(`util:activeGoal:${selfId}:deescalate`, 1),
      mkAtom('util:hint:allow:deescalate:talk', 0.9),
    ];
    const goalAtoms: ContextAtom[] = [
      mkAtom(`util:activeGoal:${selfId}:deescalate`, 1),
      mkAtom('goal:hint:allow:deescalate:talk', 0.9),
    ];

    const utilRes = buildActionCandidates({ selfId, atoms: utilAtoms, possibilities: [p] });
    const goalRes = buildActionCandidates({ selfId, atoms: goalAtoms, possibilities: [p] });

    expect(utilRes.actions[0].deltaGoals.deescalate).toBeCloseTo(0.9, 6);
    expect(goalRes.actions[0].deltaGoals.deescalate).toBeCloseTo(0.9, 6);
  });
});
