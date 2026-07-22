import { describe, expect, it } from 'vitest';

import { makeNeutralOpponentBeliefPriorV1, makeNeutralSelfBeliefPriorV1 } from '@/lib/tom/opponentBelief/builder';
import {
  BELIEF_GRAPH_SCHEMA_VERSION,
  beliefGraphEdgeKeyV1,
  buildBeliefGraphV1,
  maxDirectedEdgesV1,
} from '@/lib/tom/opponentBelief/beliefGraph';
import type { OpponentBeliefV1 } from '@/lib/tom/opponentBelief/types';

const edge = (observerId: string, targetId: string): OpponentBeliefV1 =>
  makeNeutralOpponentBeliefPriorV1({ observerId, targetId, tick: 0 });

function fullyConnected(participants: readonly string[]): OpponentBeliefV1[] {
  const beliefs: OpponentBeliefV1[] = [];
  for (const observerId of participants) {
    for (const targetId of participants) {
      if (observerId !== targetId) beliefs.push(edge(observerId, targetId));
    }
  }
  return beliefs;
}

describe('R7 belief-graph-v1', () => {
  it('folds independently validated directed and self beliefs', () => {
    const result = buildBeliefGraphV1({
      participants: ['B', 'A'],
      directedBeliefs: [edge('A', 'B'), edge('B', 'A')],
      selfBeliefs: [makeNeutralSelfBeliefPriorV1({ participantId: 'A', tick: 0 }), makeNeutralSelfBeliefPriorV1({ participantId: 'B', tick: 0 })],
    });
    if (result.ok === false) throw new Error('expected graph construction to succeed');
    expect(result.value.schemaVersion).toBe(BELIEF_GRAPH_SCHEMA_VERSION);
    expect(result.value.participants).toEqual(['A', 'B']);
    expect(result.value.directedBeliefs).toHaveLength(2);
    expect(result.value.selfBeliefs.map(item => item.participantId)).toEqual(['A', 'B']);
  });

  it('bounds directed edges by N·(N−1) without counting self beliefs', () => {
    for (const n of [2, 3, 4, 5]) {
      const participants = Array.from({ length: n }, (_, index) => `P${index}`);
      const result = buildBeliefGraphV1({
        participants,
        directedBeliefs: fullyConnected(participants),
        selfBeliefs: participants.map(participantId => makeNeutralSelfBeliefPriorV1({ participantId, tick: 0 })),
      });
      if (result.ok === false) throw new Error('expected graph construction to succeed');
      expect(result.value.directedBeliefs).toHaveLength(maxDirectedEdgesV1(n));
      expect(result.value.selfBeliefs).toHaveLength(n);
    }
  });

  it('is deterministic regardless of input order', () => {
    const participants = ['A', 'B', 'C'];
    const directedBeliefs = fullyConnected(participants);
    const selfBeliefs = participants.map(participantId => makeNeutralSelfBeliefPriorV1({ participantId, tick: 0 }));
    const forward = buildBeliefGraphV1({ participants, directedBeliefs, selfBeliefs });
    const reversed = buildBeliefGraphV1({ participants: [...participants].reverse(), directedBeliefs: [...directedBeliefs].reverse(), selfBeliefs: [...selfBeliefs].reverse() });
    expect(forward).toEqual(reversed);
  });

  it('uses collision-free tuple keys for arbitrary participant ids', () => {
    expect(beliefGraphEdgeKeyV1('a', 'a->a')).not.toBe(beliefGraphEdgeKeyV1('a->a', 'a'));
    const result = buildBeliefGraphV1({
      participants: ['a', 'a->a'],
      directedBeliefs: [edge('a', 'a->a'), edge('a->a', 'a')],
      selfBeliefs: [],
    });
    if (result.ok === false) throw new Error('tuple-safe keys must not collide');
    expect(result.value.directedBeliefs).toHaveLength(2);
  });

  it('fails closed on participant, reference, duplicate, and belief validation errors', () => {
    expect(buildBeliefGraphV1({ participants: [], directedBeliefs: [], selfBeliefs: [] }).ok).toBe(false);
    expect(buildBeliefGraphV1({ participants: ['A', 'A'], directedBeliefs: [], selfBeliefs: [] }).ok).toBe(false);

    const unknown = buildBeliefGraphV1({ participants: ['A', 'B'], directedBeliefs: [edge('A', 'Z')], selfBeliefs: [] });
    expect(unknown.ok).toBe(false);
    if (unknown.ok === false) expect(unknown.errors.some(error => error.code === 'unknown_participant')).toBe(true);

    const duplicate = buildBeliefGraphV1({ participants: ['A', 'B'], directedBeliefs: [edge('A', 'B'), edge('A', 'B')], selfBeliefs: [] });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok === false) expect(duplicate.errors.some(error => error.code === 'duplicate_belief')).toBe(true);

    const malformedDirected = { ...edge('A', 'B'), targetId: 'A' };
    const invalid = buildBeliefGraphV1({ participants: ['A', 'B'], directedBeliefs: [malformedDirected], selfBeliefs: [] });
    expect(invalid.ok).toBe(false);
    if (invalid.ok === false) expect(invalid.errors.some(error => error.code === 'invalid_belief')).toBe(true);
  });

  it('returns graph-owned copies', () => {
    const directedBelief = edge('A', 'B');
    const selfBelief = makeNeutralSelfBeliefPriorV1({ participantId: 'A', tick: 0 });
    const result = buildBeliefGraphV1({ participants: ['A', 'B'], directedBeliefs: [directedBelief], selfBeliefs: [selfBelief] });
    if (result.ok === false) throw new Error('expected graph construction to succeed');

    directedBelief.estimates.trust.value = 0.9;
    selfBelief.estimates.trust.value = 0.1;
    expect(result.value.directedBeliefs[0].estimates.trust.value).toBe(0.5);
    expect(result.value.selfBeliefs[0].estimates.trust.value).toBe(0.5);
  });
});
