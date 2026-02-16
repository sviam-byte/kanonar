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

describe('decision: qSamplingOverrides', () => {
  it('changes stochastic choice logits without changing ranked q reporting', () => {
    const actions: ActionCandidate[] = [
      mkAction('action:best-base', 1.0),
      mkAction('action:override-wins', 0.5),
    ];

    const base = decideAction({
      actions,
      goalEnergy: { explore: 1 },
      temperature: 0.2,
      rng: () => 0.5,
    });

    const withOverride = decideAction({
      actions,
      goalEnergy: { explore: 1 },
      temperature: 0.2,
      rng: () => 0.5,
      qSamplingOverrides: {
        'action:override-wins': 10,
      },
    });

    expect(base.best?.id).toBe('action:best-base');
    expect(withOverride.best?.id).toBe('action:override-wins');

    // Ranking/reporting remains canonical and unchanged by sampling override.
    expect(withOverride.ranked.map((r) => r.action.id)).toEqual(base.ranked.map((r) => r.action.id));
    expect(withOverride.ranked.map((r) => r.q)).toEqual(base.ranked.map((r) => r.q));
  });

  it('ignores non-finite overrides and falls back to base q', () => {
    const actions: ActionCandidate[] = [
      mkAction('action:best-base', 1.0),
      mkAction('action:bad-override', 0.5),
    ];

    const res = decideAction({
      actions,
      goalEnergy: { explore: 1 },
      temperature: 0.2,
      rng: () => 0.5,
      qSamplingOverrides: {
        'action:bad-override': Number.NaN,
      },
    });

    expect(res.best?.id).toBe('action:best-base');
  });
});
