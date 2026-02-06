import { describe, expect, it } from 'vitest';
import { makeAgentRNG, setGlobalRunSeed, sampleGumbel } from './noise';

describe('core/noise determinism', () => {
  it('makeAgentRNG is deterministic for same (global seed, agent id, channel)', () => {
    setGlobalRunSeed(123456);

    const r1 = makeAgentRNG('agent:A', 7);
    const r2 = makeAgentRNG('agent:A', 7);

    const xs1 = Array.from({ length: 10 }, () => r1.nextFloat());
    const xs2 = Array.from({ length: 10 }, () => r2.nextFloat());

    expect(xs1).toEqual(xs2);
  });

  it('sampleGumbel is deterministic given a deterministic rng', () => {
    setGlobalRunSeed(42);
    const r = makeAgentRNG('agent:Z', 999);

    const g1 = Array.from({ length: 5 }, () => sampleGumbel(1, r));

    setGlobalRunSeed(42);
    const rAgain = makeAgentRNG('agent:Z', 999);
    const g2 = Array.from({ length: 5 }, () => sampleGumbel(1, rAgain));

    expect(g1).toEqual(g2);
  });
});
