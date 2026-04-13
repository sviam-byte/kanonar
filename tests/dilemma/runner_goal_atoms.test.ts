import { describe, expect, it } from 'vitest';

import { extractAgentAtoms } from '@/lib/dilemma/runner';

describe('dilemma runner goal atom extraction', () => {
  it('creates util:activeGoal atoms from explicit goal/domain payloads when available', () => {
    const agent: any = {
      id: 'A',
      entityId: 'A',
      behavioralParams: { T0: 1 },
      goalEcology: {
        execute: [
          { id: 'goal:keep_safe', domain: 'safety', activation_score: 0.9, priority: 0.8, weight: 0.7 },
          { id: 'goal:belong', domain: 'affiliation', activation_score: 0.8, priority: 0.6, weight: 0.5 },
        ],
      },
      goals: { control: 0.76 },
      drivers: { status: 0.64 },
    };

    const atoms = extractAgentAtoms(agent, 'A');
    const byId = new Map(atoms.map((a) => [a.id, a]));

    expect(byId.get('util:activeGoal:A:safety')?.magnitude).toBeCloseTo(0.9, 6);
    expect(byId.get('util:activeGoal:A:affiliation')?.magnitude).toBeCloseTo(0.8, 6);
    expect(byId.get('util:activeGoal:A:control')?.magnitude).toBeCloseTo(0.76, 6);
    expect(byId.get('util:activeGoal:A:status')?.magnitude).toBeCloseTo(0.64, 6);
  });

  it('falls back to trait-based goal inference when explicit goals are absent', () => {
    const agent: any = {
      id: 'B',
      entityId: 'B',
      behavioralParams: {
        T0: 1,
        safety: 0.95,
        care: 0.9,
        powerDrive: 0.1,
        autonomy: 0.8,
        order: 0.7,
        normSensitivity: 0.6,
        paranoia: 0.2,
      },
    };

    const atoms = extractAgentAtoms(agent, 'B');
    const byId = new Map(atoms.map((a) => [a.id, a]));

    expect(byId.get('util:activeGoal:B:safety')?.magnitude ?? 0).toBeGreaterThanOrEqual(0.8);
    expect(byId.get('util:activeGoal:B:affiliation')?.magnitude ?? 0).toBeGreaterThan(0.7);
    expect(byId.get('util:activeGoal:B:control')?.magnitude ?? 1).toBeLessThan(0.4);
    expect(byId.get('util:activeGoal:B:autonomy')?.magnitude ?? 0).toBeGreaterThan(0.6);
  });
});
