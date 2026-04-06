import { describe, expect, it } from 'vitest';

import { normalizeAtom } from '@/lib/context/v2/infer';
import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';

function mkAtom(id: string, magnitude: number, meta?: any) {
  return normalizeAtom({ id, magnitude, confidence: 1, origin: 'test', meta } as any);
}

describe('decision: final ctx is preferred on action-building path', () => {
  it('uses ctx:final:* for contextual delta modulation and explainability', () => {
    const selfId = 'A';
    const possibilities = [
      { id: 'off:hide:A:self', kind: 'off', magnitude: 0.4, confidence: 1, subjectId: selfId },
    ];

    const withFinal = buildActionCandidates({
      selfId,
      atoms: [
        mkAtom(`util:activeGoal:${selfId}:safety`, 1),
        mkAtom(`ctx:danger:${selfId}`, 0.1),
        mkAtom(`ctx:final:danger:${selfId}`, 0.9),
      ] as any,
      possibilities: possibilities as any,
    });

    const withoutFinal = buildActionCandidates({
      selfId,
      atoms: [
        mkAtom(`util:activeGoal:${selfId}:safety`, 1),
        mkAtom(`ctx:danger:${selfId}`, 0.1),
      ] as any,
      possibilities: possibilities as any,
    });

    const aFinal = withFinal.actions[0];
    const aBase = withoutFinal.actions[0];

    expect(Number(aFinal.deltaGoals.safety ?? 0)).toBeGreaterThan(Number(aBase.deltaGoals.safety ?? 0));
    expect(aFinal.why?.usedAtomIds).toContain(`ctx:final:danger:${selfId}`);
    expect(aFinal.why?.parts?.contextSignals?.danger?.atomId).toBe(`ctx:final:danger:${selfId}`);
    expect(aFinal.why?.parts?.contextSignals?.danger?.layer).toBe('final');
  });
});
