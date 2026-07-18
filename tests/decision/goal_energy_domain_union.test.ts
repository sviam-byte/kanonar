// CONFLICT-PARITY-0 regression: S8 goal energy is keyed by active-goal ids,
// while external offers (conflict bridge, SimKit tactical deltas) carry
// goal-domain deltas. Legacy behavior: any active goal shadows every domain
// energy, so a domain-keyed candidate scores Q = -cost regardless of its
// deltas. goalEnergyDomainUnionV1 merges the two vocabularies (active-goal
// keys win on collision). Phase1 enables it; legacy/no-profile keep the
// historical default.

import { describe, expect, it } from 'vitest';

import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';
import { scoreAction } from '@/lib/decision/scoreAction';
import type { ContextAtom } from '@/lib/context/v2/types';
import type { Possibility } from '@/lib/possibilities/catalog';

function atom(id: string, magnitude: number): ContextAtom {
  return {
    id, kind: 'test', ns: 'test', origin: 'derived', source: 'test',
    magnitude, confidence: 1,
  } as any;
}

// Domain-keyed offer, same shape the conflict bridge emits.
function domainOffer(id: string, deltaGoals: Record<string, number>): Possibility {
  return {
    id, actionKey: 'trust', kind: 'con', label: id,
    magnitude: 0, confidence: 1, cost: 0,
    subjectId: 'A', targetId: 'B',
    trace: { usedAtomIds: [], notes: [], parts: {} },
    meta: { sim: { deltaGoals } },
  } as any;
}

const ATOMS: ContextAtom[] = [
  atom('util:activeGoal:A:maintain_cohesion', 0.5),
  atom('goal:domain:affiliation:A', 0.4),
  atom('goal:domain:safety:A', 0.2),
];

describe('goalEnergyDomainUnionV1', () => {
  it('legacy default: active goals shadow domain energies and flatten offer Q', () => {
    const offA = domainOffer('offer:a', { affiliation: 0.8 });
    const offB = domainOffer('offer:b', { affiliation: -0.8 });
    const { actions, goalEnergy } = buildActionCandidates({
      selfId: 'A', atoms: ATOMS, possibilities: [offA, offB], currentTick: 0,
    });
    expect(goalEnergy.affiliation).toBeUndefined();
    expect(goalEnergy.maintain_cohesion).toBeCloseTo(0.5, 9);
    const qs = actions.map((a) => scoreAction(a, goalEnergy));
    // Opposite affiliation deltas, identical Q — the legacy defect this
    // mechanic exists to fix (kept as the pinned default).
    expect(qs[0]).toBeCloseTo(qs[1], 9);
  });

  it('union mode: domain energies join the map and differentiate offer Q', () => {
    const offA = domainOffer('offer:a', { affiliation: 0.8 });
    const offB = domainOffer('offer:b', { affiliation: -0.8 });
    const { actions, goalEnergy } = buildActionCandidates({
      selfId: 'A', atoms: ATOMS, possibilities: [offA, offB], currentTick: 0,
      goalEnergyDomainUnionV1: true,
    });
    expect(goalEnergy.affiliation).toBeCloseTo(0.4, 9);
    expect(goalEnergy.safety).toBeCloseTo(0.2, 9);
    expect(goalEnergy.maintain_cohesion).toBeCloseTo(0.5, 9);
    const byId = new Map(actions.map((a) => [String(a.id), a]));
    const qA = scoreAction(byId.get('offer:a') as any, goalEnergy);
    const qB = scoreAction(byId.get('offer:b') as any, goalEnergy);
    expect(qA).toBeGreaterThan(qB);
    const sources = (byId.get('offer:a')?.why?.parts.goalEnergySources ?? []) as Array<{ goalId: string; atomId: string }>;
    expect(sources).toContainEqual({ goalId: 'affiliation', atomId: 'goal:domain:affiliation:A' });
  });

  it('keeps the first/newest atom when a domain id occurs more than once', () => {
    const atoms = [
      atom('goal:domain:safety:A', 0.77),
      atom('goal:domain:safety:A', 0),
    ];
    const { actions, goalEnergy } = buildActionCandidates({
      selfId: 'A', atoms, possibilities: [domainOffer('offer:a', { safety: 0.5 })], currentTick: 0,
      goalEnergyDomainUnionV1: true,
    });
    expect(goalEnergy.safety).toBeCloseTo(0.77, 9);
    expect(actions[0].why?.parts.goalEnergySources).toContainEqual({
      goalId: 'safety', atomId: 'goal:domain:safety:A',
    });
  });

  it('union mode: active-goal keys keep precedence over a colliding domain key', () => {
    const atoms = [
      atom('util:activeGoal:A:safety', 0.9),
      atom('goal:domain:safety:A', 0.1),
    ];
    const { goalEnergy } = buildActionCandidates({
      selfId: 'A', atoms, possibilities: [domainOffer('offer:a', { safety: 0.5 })], currentTick: 0,
      goalEnergyDomainUnionV1: true,
    });
    expect(goalEnergy.safety).toBeCloseTo(0.9, 9);
  });

  it('no active goals: union mode equals the legacy domain fallback', () => {
    const atoms = [
      atom('goal:domain:affiliation:A', 0.4),
      atom('goal:domain:safety:A', 0.2),
    ];
    const legacy = buildActionCandidates({
      selfId: 'A', atoms, possibilities: [domainOffer('offer:a', { affiliation: 0.5 })], currentTick: 0,
    });
    const union = buildActionCandidates({
      selfId: 'A', atoms, possibilities: [domainOffer('offer:a', { affiliation: 0.5 })], currentTick: 0,
      goalEnergyDomainUnionV1: true,
    });
    expect(JSON.stringify(union.goalEnergy)).toBe(JSON.stringify(legacy.goalEnergy));
  });
});
