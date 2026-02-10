import { describe, expect, it } from 'vitest';

import { derivePossibilitiesRegistry } from '@/lib/possibilities/derive';

describe('derivePossibilitiesRegistry fallback', () => {
  it('adds cog:wait fallback when no defs produce possibilities', () => {
    const selfId = 'self';
    const out = derivePossibilitiesRegistry({
      selfId,
      atoms: [],
      defs: [
        {
          id: 'none',
          build: () => null,
        } as any,
      ],
    });

    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(`cog:wait:${selfId}`);
    expect(out[0]?.meta?.fallback).toBe(true);
    expect(out[0]?.trace?.notes).toContain('fallback: no possibilities met thresholds');
  });
});
