import { describe, expect, it } from 'vitest';

import { markIntentCooldown, readIntentCooldown } from '@/lib/simkit/core/behaviorMemory';

describe('intent cooldown family memory', () => {
  it('stores exact and family cooldown entries together', () => {
    const facts: Record<string, any> = {};
    markIntentCooldown(facts, 'A', 'talk', 'B', 10);

    const exact = readIntentCooldown(facts, 'A', 'talk', 'B', 11);
    const family = readIntentCooldown(facts, 'A', 'negotiate', 'B', 11);

    expect(exact.exactGap).toBe(1);
    expect(exact.familyGap).toBe(1);
    expect(family.familyGap).toBe(1);
  });
});
