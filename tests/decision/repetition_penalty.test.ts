import { describe, it, expect } from 'vitest';
import { buildActionCandidates } from '../../lib/decision/actionCandidateUtils';
import { normalizeAtom } from '../../lib/context/v2/infer';

function mkAtom(id: string, magnitude: number, meta?: any) {
  return normalizeAtom({ id, magnitude, confidence: 1, origin: 'test', meta } as any);
}

describe('repetition penalty', () => {
  const selfId = 'a1';

  it('repeated action kind gets lower deltaGoals', () => {
    const baseAtoms = [
      mkAtom(`goal:domain:safety:${selfId}`, 0.6),
      mkAtom(`goal:domain:affiliation:${selfId}`, 0.4),
      // Previous tick: chose 'talk' targeting 'a2'
      mkAtom(`belief:chosen:action:${selfId}`, 0.5, { kind: 'talk', targetId: 'a2', tick: 0 }),
      // Hint atoms for talk
      mkAtom('goal:hint:allow:maintain_cohesion:talk', 0.7),
    ];

    const possibilities = [
      { id: 'aff:talk:a1:a2', kind: 'aff', magnitude: 0.5, confidence: 1, subjectId: selfId, targetId: 'a2' },
      { id: 'aff:comfort:a1:a2', kind: 'aff', magnitude: 0.5, confidence: 1, subjectId: selfId, targetId: 'a2' },
    ];

    const withRepetition = buildActionCandidates({ selfId, atoms: baseAtoms, possibilities: possibilities as any });
    const withoutRepetition = buildActionCandidates({
      selfId,
      atoms: baseAtoms.filter(a => !String(a.id).startsWith('belief:chosen:')) as any,
      possibilities: possibilities as any,
    });

    const talkWithPenalty = withRepetition.actions.find(a => a.kind === 'talk');
    const talkWithoutPenalty = withoutRepetition.actions.find(a => a.kind === 'talk');

    expect(talkWithPenalty).toBeDefined();
    expect(talkWithoutPenalty).toBeDefined();

    if (talkWithPenalty && talkWithoutPenalty) {
      const talkQPenalty = Object.values(talkWithPenalty.deltaGoals).reduce((sum, v) => sum + v, 0);
      const talkQBase = Object.values(talkWithoutPenalty.deltaGoals).reduce((sum, v) => sum + v, 0);
      expect(talkQPenalty).toBeLessThan(talkQBase);
      expect(talkWithPenalty.why?.parts?.repetition?.prevKind).toBe('talk');
      expect(Array.isArray(talkWithPenalty.why?.modifiers)).toBe(true);
      expect(talkWithPenalty.why?.usedAtomIds).toContain(`belief:chosen:action:${selfId}`);
    }
  });
});
