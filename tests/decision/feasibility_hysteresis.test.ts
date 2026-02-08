import { describe, expect, it } from 'vitest';

import type { ActionCandidate } from '@/lib/decision/actionCandidate';
import { decideAction } from '@/lib/decision/decide';

const rng = () => 0.5;

function mkAction(overrides: Partial<ActionCandidate>): ActionCandidate {
  return {
    id: overrides.id ?? 'action:a',
    kind: overrides.kind ?? 'test',
    actorId: overrides.actorId ?? 'agent-1',
    deltaGoals: overrides.deltaGoals ?? { survive: 1 },
    cost: overrides.cost ?? 0,
    confidence: overrides.confidence ?? 1,
    supportAtoms: overrides.supportAtoms ?? [],
    targetId: overrides.targetId ?? null,
  };
}

describe('decideAction feasibility and hysteresis', () => {
  it('drops actions below minConfidence when at least one feasible exists', () => {
    const actions: ActionCandidate[] = [
      mkAction({ id: 'action:infeasible', deltaGoals: { survive: 10 }, confidence: 0.1 }),
      mkAction({ id: 'action:feasible', deltaGoals: { survive: 1 }, confidence: 0.9 }),
    ];

    const res = decideAction({
      actions,
      goalEnergy: { survive: 1 },
      temperature: 0.2,
      rng,
      minConfidence: 0.2,
    });

    expect(res.best?.id).toBe('action:feasible');
  });

  it('falls back to full list when all actions are below minConfidence', () => {
    const actions: ActionCandidate[] = [
      mkAction({ id: 'action:low-a', deltaGoals: { survive: 3 }, confidence: 0.1 }),
      mkAction({ id: 'action:low-b', deltaGoals: { survive: 1 }, confidence: 0.05 }),
    ];

    const res = decideAction({
      actions,
      goalEnergy: { survive: 1 },
      temperature: 0.2,
      rng,
      minConfidence: 0.2,
    });

    expect(res.best?.id).toBe('action:low-a');
  });

  it('adds momentumBonus to the previous action to reduce jitter', () => {
    const actions: ActionCandidate[] = [
      mkAction({ id: 'action:alpha', deltaGoals: { survive: 1.0 }, confidence: 1 }),
      mkAction({ id: 'action:beta', deltaGoals: { survive: 0.9 }, confidence: 1 }),
    ];

    const res = decideAction({
      actions,
      goalEnergy: { survive: 1 },
      temperature: 0.2,
      rng,
      prevActionId: 'action:beta',
      momentumBonus: 0.25,
      minConfidence: 0,
    });

    expect(res.best?.id).toBe('action:beta');
  });
});
