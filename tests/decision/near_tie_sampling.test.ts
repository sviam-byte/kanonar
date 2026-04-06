import { describe, expect, it } from 'vitest';

import type { ActionCandidate } from '@/lib/decision/actionCandidate';
import { decideAction } from '@/lib/decision/decide';

function mkAction(id: string, gain: number): ActionCandidate {
  return {
    id,
    kind: id,
    actorId: 'A',
    deltaGoals: { explore: gain },
    cost: 0,
    confidence: 1,
    supportAtoms: [],
  };
}

describe('decision near-tie telemetry', () => {
  it('marks close alternatives as tie-band candidates and surfaces telemetry on atoms', () => {
    const res = decideAction({
      actions: [mkAction('a1', 1.0), mkAction('a2', 0.96), mkAction('a3', 0.5)],
      goalEnergy: { explore: 1 },
      temperature: 0.2,
      rng: () => 0.5,
    });

    const tieRanked = res.ranked.filter((r) => r.inTieBand);
    expect(tieRanked.length).toBeGreaterThanOrEqual(2);

    const atom = res.atoms.find((a) => a.id === 'action:score:A:a1')!;
    expect(Array.isArray((atom as any).trace?.parts?.nearTieActionIds)).toBe(true);
    expect(Number((atom as any).trace?.parts?.effectiveTemperature ?? 0)).toBeGreaterThan(0.2);
  });
});
