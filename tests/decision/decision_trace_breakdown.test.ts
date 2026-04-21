import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '@/lib/goal-lab/types';
import type { ActionCandidate } from '@/lib/decision/actionCandidate';
import { decideAction } from '@/lib/decision/decide';

function mkAtom(id: string, magnitude: number): ContextAtom {
  return {
    id,
    kind: 'scalar',
    ns: id.startsWith('ctx:') ? 'ctx' : id.startsWith('util:') ? 'util' : 'misc',
    source: 'test',
    magnitude,
    confidence: 1,
    origin: 'derived',
  } as any;
}

describe('decision: action trace carries scoring breakdown', () => {
  it('includes why.usedAtomIds, modifiers and Q decomposition in decision atom', () => {
    const action: ActionCandidate = {
      id: 'action:hide',
      kind: 'hide',
      actorId: 'A',
      deltaGoals: { safety: 0.8, affiliation: -0.2 },
      cost: 0.1,
      confidence: 0.75,
      supportAtoms: [
        mkAtom('util:activeGoal:A:safety', 1),
        mkAtom('ctx:final:danger:A', 0.9),
      ],
      why: {
        usedAtomIds: ['ctx:final:danger:A', 'belief:chosen:action:A', 'util:activeGoal:A:safety'],
        notes: ['context danger boost', 'repetition penalty'],
        parts: { source: 'test-case', stage: 'unit' },
        modifiers: [
          {
            stage: 'context',
            label: 'danger-boost',
            goalId: 'safety',
            multiplier: 1.2,
            usedAtomIds: ['ctx:final:danger:A'],
          },
          {
            stage: 'repetition',
            label: 'same-kind',
            delta: -0.15,
            usedAtomIds: ['belief:chosen:action:A'],
          },
        ],
      },
    };

    const res = decideAction({
      actions: [action],
      goalEnergy: { safety: 1, affiliation: 0.5 },
      temperature: 0.2,
      rng: () => 0.5,
    });

    const atom = res.atoms.find((a) => a.id === 'action:score:A:action:hide');
    expect(atom).toBeTruthy();
    expect(atom?.trace?.usedAtomIds).toContain('ctx:final:danger:A');
    expect(atom?.trace?.usedAtomIds).toContain('belief:chosen:action:A');
    expect(atom?.trace?.usedAtomIds?.some((id) => id.startsWith('goal:'))).toBe(false);
    expect(atom?.trace?.parts?.goalContribs?.safety).toBeCloseTo(0.8, 6);
    expect(atom?.trace?.parts?.riskPenalty).toBeGreaterThan(0);
    expect(Array.isArray(atom?.trace?.parts?.modifiers)).toBe(true);
    expect(atom?.trace?.parts?.why?.source).toBe('test-case');
    expect(atom?.trace?.parts?.chosen).toBe(true);
  });
});
