import { describe, expect, it } from 'vitest';

import { buildTransitionSnapshot } from '@/lib/goal-lab/pipeline/lookahead';

/**
 * Ensures observation-lite knobs are deterministic and observable in z1 projection.
 */
describe('observation -> lookahead flow', () => {
  it('applies deterministic observation noise when observationLite is provided', () => {
    const baseArgs = {
      selfId: 'A',
      tick: 7,
      seed: 777,
      gamma: 1,
      riskAversion: 0,
      atoms: [],
      goalEnergy: { social: 1 },
      actions: [{ id: 'action:cooperate', kind: 'cooperate', qNow: 0 }],
    };

    const plain = buildTransitionSnapshot(baseArgs);
    const observedA = buildTransitionSnapshot({
      ...baseArgs,
      observationLite: { visibleAgentIds: ['B', 'C'], noiseSigma: 0.35 },
    });
    const observedB = buildTransitionSnapshot({
      ...baseArgs,
      observationLite: { visibleAgentIds: ['B', 'C'], noiseSigma: 0.35 },
    });

    expect(observedA.perAction[0]?.z1.socialTrust).toBeCloseTo(observedB.perAction[0]?.z1.socialTrust ?? 0, 10);
    expect(observedA.perAction[0]?.z1.emotionValence).toBeCloseTo(observedB.perAction[0]?.z1.emotionValence ?? 0, 10);

    const plainTrust = plain.perAction[0]?.z1.socialTrust ?? 0;
    const observedTrust = observedA.perAction[0]?.z1.socialTrust ?? 0;
    expect(Math.abs(observedTrust - plainTrust)).toBeGreaterThan(0);
  });
});
