import { describe, expect, it } from 'vitest';

import type { ActionOffer, SimWorld } from '@/lib/simkit/core/types';
import { applyRepetitionDamping, boostNovelActions, recordAction } from '@/lib/simkit/core/repetitionDamper';
import { summarizeBehaviorPattern } from '@/lib/simkit/core/behaviorMemory';

function mkWorld(): SimWorld {
  return {
    characters: {
      A: { id: 'A', name: 'A', locId: 'room', stress: 0.1, health: 1, energy: 1 },
    } as any,
    locations: { room: { id: 'room', name: 'Room', neighbors: [] } } as any,
    facts: {},
    events: [],
    tickIndex: 10,
    seed: 1,
  } as any;
}

describe('behavior variety memory', () => {
  it('penalizes exact repeats more than same-family new-target offers', () => {
    const world = mkWorld();
    recordAction(world.facts as any, 'A', 'talk', 'B', 7);
    recordAction(world.facts as any, 'A', 'talk', 'B', 8);

    const offers: ActionOffer[] = [
      { kind: 'talk', actorId: 'A', targetId: 'B', score: 1 },
      { kind: 'negotiate', actorId: 'A', targetId: 'C', score: 1 },
    ] as any;

    const res = applyRepetitionDamping(world, offers, 'A');
    const exact = res.find((o) => o.targetId === 'B')!;
    const familyNovel = res.find((o) => o.targetId === 'C')!;

    expect(exact.score).toBeLessThan(familyNovel.score);
  });

  it('tracks exact/family streaks and novel target status', () => {
    const world = mkWorld();
    recordAction(world.facts as any, 'A', 'talk', 'B', 7);
    recordAction(world.facts as any, 'A', 'talk', 'B', 8);
    recordAction(world.facts as any, 'A', 'negotiate', 'C', 9);

    const sameFamilyNewTarget = summarizeBehaviorPattern(world.facts as any, 'A', 'talk', 'D');
    expect(sameFamilyNewTarget.family).toBe('social');
    expect(sameFamilyNewTarget.familyStreak).toBeGreaterThan(0);
    expect(sameFamilyNewTarget.seenTargetInFamily).toBe(false);
  });

  it('gives novelty bonus to a new target inside an active family', () => {
    const world = mkWorld();
    recordAction(world.facts as any, 'A', 'help', 'B', 7);
    const offers: ActionOffer[] = [
      { kind: 'help', actorId: 'A', targetId: 'C', score: 1 },
    ] as any;
    const res = boostNovelActions(world, offers, 'A');
    expect(res[0].score).toBeGreaterThan(1);
  });
});
