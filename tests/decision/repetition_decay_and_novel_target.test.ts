import { describe, expect, it } from 'vitest';

import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';
import { normalizeAtom } from '@/lib/context/v2/infer';

function mkAtom(id: string, magnitude: number, meta?: Record<string, any>) {
  return normalizeAtom({ id, magnitude, confidence: 1, origin: 'test', meta } as any);
}

function sumGoals(x: Record<string, number>) {
  return Object.values(x).reduce((acc, v) => acc + Number(v || 0), 0);
}

describe('decision repetition decay and target novelty', () => {
  it('decays repetition penalty when the previously chosen action is older', () => {
    const selfId = 'A';
    const baseAtoms = [
      mkAtom(`goal:domain:affiliation:${selfId}`, 1),
      mkAtom(`belief:chosen:${selfId}`, 0.8, { tick: 10, kind: 'talk', targetId: 'B' }),
    ];
    const possibilities = [
      { id: 'aff:talk:A:B', kind: 'aff', magnitude: 0.8, confidence: 1, subjectId: selfId, targetId: 'B' },
    ];

    const near = buildActionCandidates({ selfId, atoms: baseAtoms as any, possibilities: possibilities as any, currentTick: 11 });
    const old = buildActionCandidates({ selfId, atoms: baseAtoms as any, possibilities: possibilities as any, currentTick: 15 });

    expect(sumGoals(old.actions[0].deltaGoals)).toBeGreaterThan(sumGoals(near.actions[0].deltaGoals));
  });

  it('treats same-kind new-target actions as a meaningful novelty relief on the decision path', () => {
    const selfId = 'A';
    const atoms = [
      mkAtom(`goal:domain:affiliation:${selfId}`, 1),
      mkAtom(`belief:chosen:${selfId}`, 0.8, { tick: 10, kind: 'talk', targetId: 'B' }),
    ];
    const possibilities = [
      { id: 'aff:talk:A:B', kind: 'aff', magnitude: 0.8, confidence: 1, subjectId: selfId, targetId: 'B' },
      { id: 'aff:talk:A:C', kind: 'aff', magnitude: 0.8, confidence: 1, subjectId: selfId, targetId: 'C' },
    ];

    const res = buildActionCandidates({ selfId, atoms: atoms as any, possibilities: possibilities as any, currentTick: 11 });
    const sameTarget = res.actions.find((a) => a.targetId === 'B')!;
    const newTarget = res.actions.find((a) => a.targetId === 'C')!;

    expect(sumGoals(newTarget.deltaGoals)).toBeGreaterThan(sumGoals(sameTarget.deltaGoals));
    const labels = (newTarget.why?.modifiers || []).map((m) => m.label);
    expect(labels).toContain('same-kind-novel-target');
  });
});
