import { describe, it, expect } from 'vitest';
import { scoreOfferSubjective } from '../../lib/simkit/core/subjective';
import type { SimWorld, ActionOffer } from '../../lib/simkit/core/types';

function makeWorld(): SimWorld {
  return {
    tickIndex: 1,
    seed: 1,
    characters: {
      a: { id: 'a', name: 'A', locId: 'room', stress: 0.2, health: 0.8, energy: 0.8 },
    },
    locations: { room: { id: 'room', name: 'Room', neighbors: [] } },
    facts: { 'ctx:danger:a': 0.95 } as any,
    events: [],
  };
}

describe('scoreOfferSubjective', () => {
  it('prefers ctx:final over raw ctx when scoring subjective danger', () => {
    const offer: ActionOffer = { actorId: 'a', kind: 'rest', score: 1 } as any;
    const rawOnly = makeWorld();
    const finalLow = makeWorld();
    (finalLow.facts as any)['ctx:final:danger:a'] = 0.1;

    const sRawOnly = scoreOfferSubjective(rawOnly, offer);
    const sFinalLow = scoreOfferSubjective(finalLow, offer);
    expect(sFinalLow).toBeGreaterThan(sRawOnly);
  });
});
