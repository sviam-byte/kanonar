// tests/simkit/canonical_relations.test.ts
import { describe, it, expect } from 'vitest';
import { writeRelation, readRelation } from '../../lib/simkit/relations/canonicalWrite';
import type { SimWorld } from '../../lib/simkit/core/types';

function makeWorld(): SimWorld {
  return {
    tickIndex: 0,
    seed: 0,
    characters: {
      a: { id: 'a', name: 'A', locId: 'l', stress: 0, health: 1, energy: 1 },
      b: { id: 'b', name: 'B', locId: 'l', stress: 0, health: 1, energy: 1 },
    },
    locations: { l: { id: 'l', name: 'L', neighbors: [] } },
    facts: {} as any,
    events: [],
  };
}

describe('canonicalWrite', () => {
  it('writes to both nested and flat keys', () => {
    const w = makeWorld();
    writeRelation(w, 'a', 'b', { trust: 0.7, threat: 0.2 });
    const facts: any = w.facts;

    expect(facts.relations.a.b.trust).toBe(0.7);
    expect(facts.relations.a.b.threat).toBe(0.2);
    expect(facts['rel:trust:a:b']).toBe(0.7);
    expect(facts['rel:a:b:trust']).toBe(0.7);
    expect(facts['rel:threat:a:b']).toBe(0.2);
  });

  it('readRelation finds data from either source', () => {
    const w = makeWorld();
    writeRelation(w, 'a', 'b', { trust: 0.8, familiarity: 0.3 });
    const r = readRelation(w, 'a', 'b');
    expect(r.trust).toBe(0.8);
    expect(r.familiarity).toBe(0.3);
  });

  it('readRelation returns defaults for unknown pair', () => {
    const w = makeWorld();
    const r = readRelation(w, 'a', 'b');
    expect(r.trust).toBe(0.5);
    expect(r.threat).toBe(0.3);
  });

  it('partial update preserves existing fields', () => {
    const w = makeWorld();
    writeRelation(w, 'a', 'b', { trust: 0.8, threat: 0.1 });
    writeRelation(w, 'a', 'b', { familiarity: 0.6 });
    const facts: any = w.facts;
    expect(facts.relations.a.b.trust).toBe(0.8);
    expect(facts.relations.a.b.familiarity).toBe(0.6);
  });
});
