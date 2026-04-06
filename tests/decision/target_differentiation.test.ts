import { describe, expect, it } from 'vitest';

import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';
import { normalizeAtom } from '@/lib/context/v2/infer';

function mkAtom(id: string, magnitude: number) {
  return normalizeAtom({ id, magnitude, confidence: 1, origin: 'test' } as any);
}

describe('decision target differentiation', () => {
  it('ranks cooperative candidates by target trust/alignment/support', () => {
    const selfId = 'A';
    const atoms = [
      mkAtom(`goal:domain:affiliation:${selfId}`, 0.9),
      mkAtom(`goal:domain:control:${selfId}`, 0.3),
      mkAtom(`tom:dyad:final:trust:${selfId}:B`, 0.9),
      mkAtom(`tom:dyad:final:alignment:${selfId}:B`, 0.8),
      mkAtom(`tom:dyad:final:support:${selfId}:B`, 0.9),
      mkAtom(`tom:dyad:final:trust:${selfId}:C`, 0.2),
      mkAtom(`tom:dyad:final:alignment:${selfId}:C`, 0.1),
      mkAtom(`tom:dyad:final:support:${selfId}:C`, 0.2),
    ];

    const possibilities = [
      { id: 'aff:help:A:B', kind: 'aff', magnitude: 0.6, confidence: 1, subjectId: selfId, targetId: 'B' },
      { id: 'aff:help:A:C', kind: 'aff', magnitude: 0.6, confidence: 1, subjectId: selfId, targetId: 'C' },
    ];

    const res = buildActionCandidates({ selfId, atoms: atoms as any, possibilities: possibilities as any });
    const towardB = res.actions.find((a) => a.targetId === 'B')!;
    const towardC = res.actions.find((a) => a.targetId === 'C')!;

    const sum = (x: Record<string, number>) => Object.values(x).reduce((acc, v) => acc + Number(v || 0), 0);
    expect(sum(towardB.deltaGoals)).toBeGreaterThan(sum(towardC.deltaGoals));
  });
});
