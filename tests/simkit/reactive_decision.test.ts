import { describe, it, expect } from 'vitest';
import { reactiveDecision } from '../../lib/simkit/core/reactiveDecision';
import type { SimWorld, ActionOffer } from '../../lib/simkit/core/types';

function makeWorld(): SimWorld {
  return {
    tickIndex: 3,
    seed: 42,
    characters: {
      a: { id: 'a', name: 'A', locId: 'room', stress: 0.2, health: 0.8, energy: 0.8 },
      b: { id: 'b', name: 'B', locId: 'room', stress: 0.2, health: 0.8, energy: 0.8 },
      c: { id: 'c', name: 'C', locId: 'room', stress: 0.2, health: 0.8, energy: 0.8 },
    },
    locations: { room: { id: 'room', name: 'Room', neighbors: [] } },
    facts: {
      'emo:anger:a': 0.9,
      'ctx:final:danger:a': 0.3,
      'ctx:final:privacy:a': 0.4,
      'rel:trust:a:b': 0.9,
      'rel:trust:a:c': 0.1,
    } as any,
    events: [],
  };
}

describe('reactiveDecision', () => {
  it('anger shortlist differentiates targets by distrust instead of first matching target', () => {
    const w = makeWorld();
    const offers: ActionOffer[] = [
      { actorId: 'a', kind: 'attack', targetId: 'b', score: 0.55 },
      { actorId: 'a', kind: 'attack', targetId: 'c', score: 0.45 },
      { actorId: 'a', kind: 'threaten', targetId: 'b', score: 0.70 },
    ] as any;

    const rr = reactiveDecision(w, 'a', offers, 3);
    expect(rr.action?.kind).toBe('attack');
    expect(rr.action?.targetId).toBe('c');
    expect(rr.trigger?.rule).toBe('anger');
    expect(rr.shortlist[0]?.targetId).toBe('c');
    expect(rr.shortlist[0]?.reasons.join(' ')).toContain('distrust');
  });
});
