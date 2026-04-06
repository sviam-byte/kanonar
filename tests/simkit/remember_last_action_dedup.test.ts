import { describe, expect, it } from 'vitest';

import { rememberLastAction } from '@/lib/simkit/core/subjective';

describe('rememberLastAction', () => {
  it('stores lastAction without mutating behaviorMemory directly', () => {
    const world: any = { tickIndex: 7, facts: {}, characters: {} };

    rememberLastAction(world, { actorId: 'A', kind: 'talk', targetId: 'B' } as any);

    expect(world.facts['lastAction:A']).toEqual({ kind: 'talk', targetId: 'B', tick: 7 });
    expect(world.facts['behaviorMemory:A']).toBeUndefined();
  });
});
