import { describe, expect, it } from 'vitest';

import { derivePossibilities } from '@/lib/context/possibilities/derivePossibilities';
import { normalizeAtom } from '@/lib/context/v2/infer';

const A = (atom: any) => normalizeAtom(atom);

function findAttack(poss: Array<{ id: string; enabled?: boolean }>, otherId: string) {
  return poss.find((p) => p.id === `aff:attack:${otherId}`);
}

describe('Possibilities: attack gating', () => {
  it('disables attack without threat/anger/harm even when close + armed', () => {
    const selfId = 'self';
    const otherId = 'other';
    const atoms = [
      A({ id: `obs:nearby:${otherId}:closeness`, ns: 'obs', origin: 'world', magnitude: 0.9, confidence: 1, target: otherId }),
      A({ id: `access:weapon:${selfId}`, ns: 'access', origin: 'world', magnitude: 1.0, confidence: 1 }),
      A({ id: `ctx:danger:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.05, confidence: 1 }),
      A({ id: `sum:threatLevel:${selfId}`, ns: 'sum', origin: 'derived', magnitude: 0.05, confidence: 1 }),
      A({ id: `affect:e:anger:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.05, confidence: 1 }),
      A({ id: `affect:e:fear:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.05, confidence: 1 }),
      A({ id: `affect:stress:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.05, confidence: 1 }),
    ];

    const { possibilities } = derivePossibilities(atoms, selfId);
    const attack = findAttack(possibilities, otherId);
    expect(attack?.enabled).toBe(false);
  });

  it('enables attack when aggression drive is high and weapon access is present', () => {
    const selfId = 'self';
    const otherId = 'other';
    const atoms = [
      A({ id: `obs:nearby:${otherId}:closeness`, ns: 'obs', origin: 'world', magnitude: 0.4, confidence: 1, target: otherId }),
      A({ id: `access:weapon:${selfId}`, ns: 'access', origin: 'world', magnitude: 1.0, confidence: 1 }),
      A({ id: `ctx:danger:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.7, confidence: 1 }),
      A({ id: `sum:threatLevel:${selfId}`, ns: 'sum', origin: 'derived', magnitude: 0.4, confidence: 1 }),
      A({ id: `affect:e:anger:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.8, confidence: 1 }),
    ];

    const { possibilities } = derivePossibilities(atoms, selfId);
    const attack = findAttack(possibilities, otherId);
    expect(attack?.enabled).toBe(true);
  });

  it('disables attack when protocol strict is high even with violence drive', () => {
    const selfId = 'self';
    const otherId = 'other';
    const atoms = [
      A({ id: `obs:nearby:${otherId}:closeness`, ns: 'obs', origin: 'world', magnitude: 0.5, confidence: 1, target: otherId }),
      A({ id: `access:weapon:${selfId}`, ns: 'access', origin: 'world', magnitude: 1.0, confidence: 1 }),
      A({ id: `ctx:danger:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.7, confidence: 1 }),
      A({ id: `sum:threatLevel:${selfId}`, ns: 'sum', origin: 'derived', magnitude: 0.6, confidence: 1 }),
      A({ id: `affect:e:anger:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.8, confidence: 1 }),
      A({ id: `ctx:proceduralStrict:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.95, confidence: 1 }),
    ];

    const { possibilities } = derivePossibilities(atoms, selfId);
    const attack = findAttack(possibilities, otherId);
    expect(attack?.enabled).toBe(false);
  });
});
