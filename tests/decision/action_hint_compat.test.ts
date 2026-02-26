import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '@/lib/context/v2/types';
import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';
import type { Possibility } from '@/lib/possibilities/catalog';

function mkAtom(id: string, magnitude: number): ContextAtom {
  const ns: ContextAtom['ns'] = id.startsWith('goal:')
    ? 'goal'
    : id.startsWith('util:')
      ? 'util'
      : id.startsWith('ctx:')
        ? 'ctx'
        : 'world';

  return {
    id,
    kind: 'scalar',
    ns,
    source: { origin: 'derived' } as any,
    magnitude,
  };
}

describe('decision hint compatibility', () => {
  it('accepts both util:hint:allow:* and goal:hint:allow:* link atoms', () => {
    const selfId = 'A';
    const p: Possibility = {
      id: 'aff:talk:A:B',
      actorId: selfId,
      targetId: 'B',
      label: 'Talk',
      kind: 'aff',
      magnitude: 0.4,
      blockedBy: [],
      confidence: 1,
      trace: { usedAtomIds: [] },
      source: 'rules',
      meta: {},
    } as any;

    const utilAtoms: ContextAtom[] = [
      mkAtom(`util:activeGoal:${selfId}:deescalate`, 1),
      mkAtom('util:hint:allow:deescalate:talk', 0.9),
    ];
    const goalAtoms: ContextAtom[] = [
      mkAtom(`util:activeGoal:${selfId}:deescalate`, 1),
      mkAtom('goal:hint:allow:deescalate:talk', 0.9),
    ];

    const utilRes = buildActionCandidates({ selfId, atoms: utilAtoms, possibilities: [p] });
    const goalRes = buildActionCandidates({ selfId, atoms: goalAtoms, possibilities: [p] });

    expect(utilRes.actions[0].deltaGoals.deescalate).toBeCloseTo(0.9, 6);
    expect(goalRes.actions[0].deltaGoals.deescalate).toBeCloseTo(0.9, 6);
  });

  it('falls back to multi-goal projection when no hint atoms exist', () => {
    const selfId = 'A';
    const p: Possibility = {
      id: 'cog:help:A:B',
      actorId: selfId,
      targetId: 'B',
      label: 'Help',
      kind: 'cog',
      magnitude: 0.4,
      blockedBy: [],
      confidence: 1,
      trace: { usedAtomIds: [] },
      source: 'rules',
      meta: {},
    } as any;

    const atoms: ContextAtom[] = [
      mkAtom(`util:activeGoal:${selfId}:social`, 0.8),
      mkAtom(`util:activeGoal:${selfId}:wellbeing`, 0.6),
    ];

    const res = buildActionCandidates({ selfId, atoms, possibilities: [p] });
    const dg = res.actions[0].deltaGoals;

    expect(Object.keys(dg).length).toBeGreaterThan(1);
    expect(dg.social).toBeGreaterThan(0);
    expect(dg.wellbeing).toBeGreaterThan(0);
  });


  it('modulates target-specific aggressive deltas using ToM + physical/social dyads', () => {
    const selfId = 'A';
    const confrontB: Possibility = {
      id: 'aff:confront:A:B',
      actorId: selfId,
      targetId: 'B',
      label: 'Confront B',
      kind: 'aff',
      magnitude: 0.4,
      blockedBy: [],
      confidence: 1,
      trace: { usedAtomIds: [] },
      source: 'rules',
      meta: {},
    } as any;
    const confrontC: Possibility = {
      id: 'aff:confront:A:C',
      actorId: selfId,
      targetId: 'C',
      label: 'Confront C',
      kind: 'aff',
      magnitude: 0.4,
      blockedBy: [],
      confidence: 1,
      trace: { usedAtomIds: [] },
      source: 'rules',
      meta: {},
    } as any;

    const atoms: ContextAtom[] = [
      mkAtom(`util:activeGoal:${selfId}:safety`, 0.8),
      mkAtom(`util:activeGoal:${selfId}:status`, 0.7),
      mkAtom('util:hint:allow:safety:confront', 0.4),
      mkAtom('util:hint:allow:status:confront', 0.4),

      // Friend-like target B: high trust/intimacy + lower threat.
      mkAtom('tom:dyad:A:B:trust', 0.9),
      mkAtom('tom:dyad:A:B:intimacy', 0.8),
      mkAtom('tom:dyad:A:B:threat', 0.2),
      mkAtom('phys:threat:A:B', 0.2),
      mkAtom('social:rank:diff:A:B', 0.6),

      // Threat-like target C: low trust/intimacy + high threat.
      mkAtom('tom:dyad:A:C:trust', 0.1),
      mkAtom('tom:dyad:A:C:intimacy', 0.1),
      mkAtom('tom:dyad:A:C:threat', 0.9),
      mkAtom('phys:threat:A:C', 0.8),
      mkAtom('social:rank:diff:A:C', -0.2),
    ];

    const res = buildActionCandidates({ selfId, atoms, possibilities: [confrontB, confrontC] });
    const aB = res.actions.find(a => a.targetId === 'B');
    const aC = res.actions.find(a => a.targetId === 'C');

    expect(aB).toBeDefined();
    expect(aC).toBeDefined();
    expect((aB as any).deltaGoals.status).toBeLessThan((aC as any).deltaGoals.status);
  });

});
