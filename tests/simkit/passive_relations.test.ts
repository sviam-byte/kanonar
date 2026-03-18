// tests/simkit/passive_relations.test.ts
import { describe, it, expect } from 'vitest';
import { passiveRelationUpdate, indirectEvidenceUpdate } from '../../lib/simkit/relations/passiveUpdate';
import type { SimWorld, SimAction } from '../../lib/simkit/core/types';

function makeWorld(charIds: string[], locs: Record<string, string>): SimWorld {
  const characters: any = {};
  for (const id of charIds) {
    characters[id] = { id, name: id, locId: locs[id] || 'loc1', stress: 0.3, health: 0.8, energy: 0.7 };
  }
  return {
    tickIndex: 5, seed: 42,
    characters,
    locations: { loc1: { id: 'loc1', name: 'L1', neighbors: ['loc2'] }, loc2: { id: 'loc2', name: 'L2', neighbors: ['loc1'] } },
    facts: { relations: {} } as any,
    events: [],
  };
}

describe('passiveRelationUpdate', () => {
  it('cooperative co-action → trust increase', () => {
    const w = makeWorld(['a', 'b'], { a: 'loc1', b: 'loc1' });
    const actions: SimAction[] = [
      { id: 'act1', kind: 'help', actorId: 'a', targetId: 'b' },
      { id: 'act2', kind: 'treat', actorId: 'b', targetId: 'a' },
    ];
    passiveRelationUpdate(w, actions);
    const t = (w.facts as any).relations?.a?.b?.trust ?? 0.5;
    expect(t).toBeGreaterThan(0.5);
  });

  it('separation → familiarity decays', () => {
    const w = makeWorld(['a', 'b'], { a: 'loc1', b: 'loc2' });
    (w.facts as any).relations = { a: { b: { trust: 0.5, familiarity: 0.5 } }, b: { a: { trust: 0.5, familiarity: 0.5 } } };
    passiveRelationUpdate(w, []);
    const f = (w.facts as any).relations.a.b.familiarity;
    expect(f).toBeLessThan(0.5);
  });
});

describe('indirectEvidenceUpdate', () => {
  it('A sees B attack C (A\'s friend) → A trust in B drops', () => {
    const w = makeWorld(['a', 'b', 'c'], { a: 'loc1', b: 'loc1', c: 'loc1' });
    (w.facts as any).relations = {
      a: { b: { trust: 0.5 }, c: { trust: 0.8 } },
      b: { a: { trust: 0.5 }, c: { trust: 0.5 } },
      c: { a: { trust: 0.8 }, b: { trust: 0.5 } },
    };
    const actions: SimAction[] = [
      { id: 'act1', kind: 'attack', actorId: 'b', targetId: 'c' },
    ];
    indirectEvidenceUpdate(w, actions);
    const trustAB = (w.facts as any).relations.a.b.trust;
    expect(trustAB).toBeLessThan(0.5);
  });

  it('A sees B help C (A\'s friend) → A trust in B rises', () => {
    const w = makeWorld(['a', 'b', 'c'], { a: 'loc1', b: 'loc1', c: 'loc1' });
    (w.facts as any).relations = {
      a: { b: { trust: 0.5 }, c: { trust: 0.8 } },
      b: { a: { trust: 0.5 }, c: { trust: 0.5 } },
      c: { a: { trust: 0.8 }, b: { trust: 0.5 } },
    };
    const actions: SimAction[] = [
      { id: 'act1', kind: 'help', actorId: 'b', targetId: 'c' },
    ];
    indirectEvidenceUpdate(w, actions);
    const trustAB = (w.facts as any).relations.a.b.trust;
    expect(trustAB).toBeGreaterThan(0.5);
  });
});
