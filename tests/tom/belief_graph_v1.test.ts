// R7-FOUNDATION-0 first pure-domain slice regression. Pins the sparse directed
// belief graph contract: the N·(N−1) directed bound, self-belief isolation,
// deterministic folding, and fail-closed construction. No runtime is wired here.

import { describe, expect, it } from 'vitest';

import { makeNeutralOpponentBeliefPriorV1 } from '@/lib/tom/opponentBelief/builder';
import {
  BELIEF_GRAPH_SCHEMA_VERSION,
  buildBeliefGraphV1,
  maxDirectedEdgesV1,
} from '@/lib/tom/opponentBelief/beliefGraph';
import type { OpponentBeliefV1 } from '@/lib/tom/opponentBelief/types';

const edge = (observerId: string, targetId: string): OpponentBeliefV1 =>
  makeNeutralOpponentBeliefPriorV1({ observerId, targetId, tick: 0 });

// The neutral prior builder forbids observer === target, so a self node is a
// directed prior with its target overridden back to the observer.
const selfNode = (id: string): OpponentBeliefV1 => ({
  ...makeNeutralOpponentBeliefPriorV1({ observerId: id, targetId: `${id}_placeholder`, tick: 0 }),
  targetId: id,
  beliefId: `belief:self:${id}`,
});

function fullyConnected(participants: readonly string[]): OpponentBeliefV1[] {
  const beliefs: OpponentBeliefV1[] = [];
  for (const o of participants) for (const t of participants) if (o !== t) beliefs.push(edge(o, t));
  return beliefs;
}

describe('R7 belief-graph-v1', () => {
  it('folds a dyadic graph with directed edges and separate self nodes', () => {
    const res = buildBeliefGraphV1({
      participants: ['B', 'A'],
      beliefs: [edge('A', 'B'), edge('B', 'A'), selfNode('A'), selfNode('B')],
    });
    if (res.ok) {
      expect(res.value.schemaVersion).toBe(BELIEF_GRAPH_SCHEMA_VERSION);
      expect(res.value.participants).toEqual(['A', 'B']); // sorted, unique
      expect(res.value.directed).toHaveLength(2);
      expect(res.value.selfBeliefs).toHaveLength(2);
    } else {
      throw new Error('expected ok for the dyadic graph');
    }
  });

  it('bounds directed edges by N·(N−1) and never counts self nodes in that bound', () => {
    for (const n of [2, 3, 4, 5]) {
      const participants = Array.from({ length: n }, (_, i) => `P${i}`);
      const beliefs = [...fullyConnected(participants), ...participants.map(selfNode)];
      const res = buildBeliefGraphV1({ participants, beliefs });
      if (res.ok) {
        expect(maxDirectedEdgesV1(n)).toBe(n * (n - 1));
        expect(res.value.directed.length).toBe(maxDirectedEdgesV1(n));
        expect(res.value.directed.length).toBeLessThanOrEqual(maxDirectedEdgesV1(n));
        expect(res.value.selfBeliefs).toHaveLength(n); // self counted separately
      } else {
        throw new Error(`expected ok for N=${n}`);
      }
    }
  });

  it('keeps self and directed strictly separated', () => {
    const res = buildBeliefGraphV1({
      participants: ['A', 'B', 'C'],
      beliefs: [edge('A', 'B'), edge('C', 'A'), selfNode('A'), selfNode('B')],
    });
    if (res.ok) {
      expect(res.value.directed.every((b) => b.observerId !== b.targetId)).toBe(true);
      expect(res.value.selfBeliefs.every((b) => b.observerId === b.targetId)).toBe(true);
    } else {
      throw new Error('expected ok');
    }
  });

  it('is deterministic regardless of input belief order', () => {
    const participants = ['A', 'B', 'C'];
    const beliefs = [...fullyConnected(participants), ...participants.map(selfNode)];
    const forward = buildBeliefGraphV1({ participants, beliefs });
    const reversed = buildBeliefGraphV1({ participants: [...participants].reverse(), beliefs: [...beliefs].reverse() });
    if (forward.ok && reversed.ok) {
      expect(forward.value).toEqual(reversed.value);
    } else {
      throw new Error('expected both ok');
    }
  });

  it('fails closed on an empty participant set', () => {
    const res = buildBeliefGraphV1({ participants: [], beliefs: [] });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'empty_participants')).toBe(true);
    }
  });

  it('fails closed on duplicate participants', () => {
    const res = buildBeliefGraphV1({ participants: ['A', 'A', 'B'], beliefs: [] });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'duplicate_participant')).toBe(true);
    }
  });

  it('fails closed when an edge references an unknown participant', () => {
    const res = buildBeliefGraphV1({ participants: ['A', 'B'], beliefs: [edge('A', 'Z')] });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'unknown_participant' && e.participantId === 'Z')).toBe(true);
    }
  });

  it('fails closed on a duplicate (observer, target) pair', () => {
    const res = buildBeliefGraphV1({ participants: ['A', 'B'], beliefs: [edge('A', 'B'), edge('A', 'B')] });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.code === 'duplicate_belief')).toBe(true);
    }
  });
});
