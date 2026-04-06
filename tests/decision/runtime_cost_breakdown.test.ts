import { describe, expect, it } from 'vitest';

import { normalizeAtom } from '@/lib/context/v2/infer';
import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';
import { decideAction } from '@/lib/decision/decide';

function mkAtom(id: string, magnitude: number) {
  return normalizeAtom({ id, magnitude, confidence: 1, origin: 'test' } as any);
}

describe('runtime cost breakdown on decision path', () => {
  it('blends base possibility cost with runtime cost and surfaces breakdown in decision atom', () => {
    const selfId = 'A';
    const atoms = [
      mkAtom(`goal:domain:safety:${selfId}`, 0.9),
      mkAtom(`feat:char:${selfId}:body.fatigue`, 0.8),
      mkAtom(`feat:char:${selfId}:body.pain`, 0.3),
      mkAtom(`feat:char:${selfId}:body.stress`, 0.4),
      mkAtom(`ctx:proceduralStrict:${selfId}`, 0.7),
      mkAtom(`world:tick:5`, 1),
    ] as any;

    const possibilities = [
      {
        id: `aff:attack:${selfId}:B`,
        kind: 'aff',
        magnitude: 0.6,
        confidence: 1,
        subjectId: selfId,
        targetId: 'B',
        cost: 0.2,
        costAtomId: `cost:attack:${selfId}:B`,
      },
    ] as any;

    const built = buildActionCandidates({ selfId, atoms, possibilities });
    const action = built.actions[0];

    expect(Number(action.cost)).toBeGreaterThan(0.2);
    expect(action.why?.parts?.costBreakdown?.baseCost).toBeCloseTo(0.2, 6);
    expect(Number(action.why?.parts?.costBreakdown?.runtimeCost ?? 0)).toBeGreaterThan(0.2);
    expect(action.why?.usedAtomIds).toContain(`feat:char:${selfId}:body.fatigue`);

    const decided = decideAction({
      actions: built.actions,
      goalEnergy: built.goalEnergy,
      temperature: 0.2,
      rng: () => 0.5,
    });

    const atom = decided.atoms.find((a) => a.id === `action:score:${selfId}:aff:attack:${selfId}:B`);
    expect(atom).toBeTruthy();
    expect((atom as any).trace?.parts?.costBreakdown?.selectedCost).toBeCloseTo(Number(action.cost), 6);
  });
});
