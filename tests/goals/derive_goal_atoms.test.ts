import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '@/lib/context/v2/types';
import { deriveGoalAtoms } from '@/lib/goals/goalAtoms';

function mkCtx(id: string, magnitude: number): ContextAtom {
  return {
    id,
    kind: 'scalar',
    ns: 'ctx',
    source: { origin: 'derived' } as any,
    magnitude,
  };
}

describe('deriveGoalAtoms', () => {
  it('creates domain goal atoms from channel field and propagates energy', () => {
    const selfId = 'A';
    const atoms: ContextAtom[] = [
      mkCtx('ctx:threat:A', 0.9),
      mkCtx('ctx:uncertainty:A', 0.5),
      mkCtx('ctx:curiosity:A', 0.8),
    ];

    const out = deriveGoalAtoms(selfId, atoms, { topN: 8 });
    const ids = new Set(out.map((a) => a.id));

    // channel->domain
    expect(ids.has('goal:domain:safety:A')).toBe(true);
    expect(ids.has('goal:domain:exploration:A')).toBe(true);

    // energy should be >0 for these two under the chosen channels
    const safety = out.find((a) => a.id === 'goal:domain:safety:A')!;
    const exploration = out.find((a) => a.id === 'goal:domain:exploration:A')!;

    expect(safety.magnitude).toBeGreaterThan(0);
    expect(exploration.magnitude).toBeGreaterThan(0);
  });
});
