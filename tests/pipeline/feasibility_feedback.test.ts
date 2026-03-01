import { describe, expect, it } from 'vitest';

/**
 * Unit-level check for the feasibility damping formula used by pipeline lookahead.
 * This keeps the goal-energy feedback stable when all top actions worsen a goal.
 */
describe('POMDP feasibility feedback', () => {
  it('dampens goalEnergy for goals that worsen across top actions', () => {
    const goalEnergy: Record<string, number> = { safety: 0.8, exploration: 0.6 };

    const perAction = Array.from({ length: 5 }, () => ({
      v0PerGoal: { safety: 0.3, exploration: 0.5 },
      v1PerGoal: { safety: 0.35, exploration: 0.3 },
    }));

    const bestDeltaPerGoal: Record<string, number> = {};
    for (const ev of perAction.slice(0, 5)) {
      for (const [gid, v1Raw] of Object.entries(ev.v1PerGoal)) {
        const v0 = Number(ev.v0PerGoal[gid as keyof typeof ev.v0PerGoal] ?? 0);
        const delta = Number(v1Raw) - v0;
        bestDeltaPerGoal[gid] = Math.max(bestDeltaPerGoal[gid] ?? -Infinity, delta);
      }
    }

    for (const [gid, bestDelta] of Object.entries(bestDeltaPerGoal)) {
      if (bestDelta < -0.005 && goalEnergy[gid] !== undefined) {
        const factor = Math.max(0, Math.min(1, 1 + bestDelta * 2));
        goalEnergy[gid] *= factor;
      }
    }

    expect(goalEnergy.safety).toBeCloseTo(0.8, 4);
    expect(goalEnergy.exploration).toBeLessThan(0.6);
    expect(goalEnergy.exploration).toBeCloseTo(0.36, 4);
  });
});
