import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '@/lib/context/v2/types';
import type { Possibility } from '@/lib/context/possibilities/types';
import { decideAction } from '@/lib/decision/decide';
import { RNG } from '@/lib/core/noise';

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

    const p: Possibility = {
      id: 'aff:doThing',
      kind: 'affordance',
      actionId: 'doThing',
      label: 'Do the thing',
      magnitude: 1,
      enabled: true,
    };

    const atoms: ContextAtom[] = [
      // Goal-layer atoms exist in the context (for UI/debug), but Action must not read them.
      mkAtom(`goal:domain:exploration:${selfId}`, 'goal', 0.9),
      mkAtom(`goal:active:exploration:${selfId}`, 'goal', 1.0),
      mkAtom(`goal:activeGoal:${selfId}:explore`, 'goal', 1.0),
      mkAtom(`goal:hint:allow:explore:${p.actionId}`, 'goal', 1.0),

      // Util-layer projections (these are what the Action layer is allowed to consume).
      mkAtom(`util:domain:exploration:${selfId}`, 'util', 0.9),
      mkAtom(`util:active:exploration:${selfId}`, 'util', 1.0),
      mkAtom(`util:activeGoal:${selfId}:explore`, 'util', 1.0),
      mkAtom(`util:hint:allow:explore:${p.actionId}`, 'util', 1.0),
    ];

    const res = decideAction({
      selfId,
      atoms,
      possibilities: [{ ...p, actionKey: p.actionId } as any],
      temperature: 0.15,
      rng: new RNG(123456),
    });

    expect(res.best?.p.actionId).toBe('doThing');

    const actionAtom = res.best?.atoms?.find((a) => a.id.startsWith('action:'));
    const used = actionAtom?.trace?.usedAtomIds ?? [];
    expect(used.some((id) => id.startsWith('goal:'))).toBe(false);
    expect(used.some((id) => id.startsWith('util:'))).toBe(true);
  });
});
