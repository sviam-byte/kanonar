import { describe, expect, it } from 'vitest';

import { scoreAction } from '@/lib/decision/scoreAction';

describe('scoreAction risk-penalty confidence model', () => {
  it('applies additive confidence penalty instead of multiplicative scaling', () => {
    const action = {
      deltaGoals: { safety: 1 },
      cost: 0,
      confidence: 0.5,
    } as any;

    const q = scoreAction(action, { safety: 1 });
    // rawQ=1, penalty=0.4*1*(1-0.5)=0.2
    expect(q).toBeCloseTo(0.8, 6);
  });
});
