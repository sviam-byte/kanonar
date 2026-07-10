import { describe, expect, it, vi } from 'vitest';

import { calculateSocialEventImpacts } from '../../lib/social-events';

describe('social event decay determinism', () => {
  it('depends on explicit/model time rather than the wall clock', () => {
    const day = 24 * 60 * 60 * 1000;
    const character = {
      entityId: 'A',
      storyTime: 200 * day,
      social: { dynamic_ties: { B: { trust: 0.5 } } },
    } as any;
    const events = [{
      id: 'event:ally',
      actorId: 'A',
      targetId: 'B',
      t: 20 * day,
      scope: 'private',
      veracity: 1,
      polarity: 1,
      intensity: 0.8,
      domain: 'ally',
    }] as any;

    vi.spyOn(Date, 'now').mockReturnValue(1_000 * day);
    const first = calculateSocialEventImpacts(character, events, {});
    vi.spyOn(Date, 'now').mockReturnValue(2_000 * day);
    const second = calculateSocialEventImpacts(character, events, {});

    expect(second).toEqual(first);
    expect(first.paramDeltas['social.dynamic_ties.B.trust']).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
