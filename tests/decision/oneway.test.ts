import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '@/lib/context/v2/types';
import type { ActionCandidate } from '@/lib/decision/actionCandidate';
import { decideAction } from '@/lib/decision/decide';

function mkAtom(id: string, ns: ContextAtom['ns'], magnitude: number): ContextAtom {
  return {
    id,
    ns,
    kind: 'scalar',
    source: 'test',
    magnitude,
  };
}

describe('Decision layer one-way dependency', () => {
  it('does not read goal:* atoms when util:* projections are present', () => {
    const selfId = 'A';

    const action: ActionCandidate = {
      id: 'action:doThing',
      kind: 'doThing',
      actorId: selfId,
      deltaGoals: { explore: 1 },
      cost: 0,
      confidence: 1,
      supportAtoms: [],
    };

    const atoms: ContextAtom[] = [
      // Goal-layer atoms exist in the context (for UI/debug), but Action must not read them.
      mkAtom(`goal:domain:exploration:${selfId}`, 'goal', 0.9),
      mkAtom(`goal:active:exploration:${selfId}`, 'goal', 1.0),
      mkAtom(`goal:activeGoal:${selfId}:explore`, 'goal', 1.0),
      mkAtom(`goal:hint:allow:explore:doThing`, 'goal', 1.0),

      // Util-layer projections (these are what the Action layer is allowed to consume).
      mkAtom(`util:domain:exploration:${selfId}`, 'util', 0.9),
      mkAtom(`util:active:exploration:${selfId}`, 'util', 1.0),
      mkAtom(`util:activeGoal:${selfId}:explore`, 'util', 1.0),
      mkAtom(`util:hint:allow:explore:doThing`, 'util', 1.0),
    ];

    const res = decideAction({
      actions: [
        {
          ...action,
          supportAtoms: atoms,
        },
      ],
      goalEnergy: { explore: 1 },
      temperature: 0.15,
      rng: () => 0.5,
    });

    expect(res.best?.id).toBe('action:doThing');

    const actionAtom = res.atoms.find((a) => a.id.startsWith('action:score:'));
    const used = actionAtom?.trace?.usedAtomIds ?? [];
    expect(used.some((id) => id.startsWith('goal:'))).toBe(false);
    expect(used.some((id) => id.startsWith('util:'))).toBe(true);
  });
});
