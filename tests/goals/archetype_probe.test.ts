import { describe, it, expect } from 'vitest';

import {
  effectReadout,
  behaviorReadout,
  representativeByMu,
  lambdaSweep,
  archetypesByMu,
} from '@/lib/goal-lab/probe/archetypeProbe';
import { MU_SIGNATURES, type Mu } from '@/lib/goal-lab/probe/archetypeSignTable';

const MUS: Mu[] = ['SR', 'SN', 'ON', 'OR'];

describe('archetype probe: effect vectors', () => {
  it('each μ produces its pre-registered preferredTags', () => {
    const rep = representativeByMu();
    for (const mu of MUS) {
      const eff = effectReadout(rep[mu]);
      for (const tag of MU_SIGNATURES[mu].preferredTags) {
        expect(eff.preferredTags, `${mu} preferredTags missing ${tag}`).toContain(tag);
      }
    }
  });

  it('effect readout is deterministic and non-empty', () => {
    const a = effectReadout('H-1-SR');
    const b = effectReadout('H-1-SR');
    expect(a).toEqual(b);
    expect(a.preferredTags.length).toBeGreaterThan(0);
    expect(Object.keys(a.actionBiases).length).toBeGreaterThan(0);
  });

  it('catalog covers all four μ poles', () => {
    const by = archetypesByMu();
    for (const mu of MUS) expect(by[mu].length).toBeGreaterThan(0);
  });
});

describe('archetype probe: behavior wiring', () => {
  it('μ poles produce distinct top actions matching pre-registration', () => {
    const rep = representativeByMu();
    const tops: Record<string, string | null> = {};
    for (const mu of MUS) {
      const beh = behaviorReadout(rep[mu]);
      tops[mu] = beh.top;
      expect(MU_SIGNATURES[mu].expectedTopActions, `${mu} top=${beh.top}`).toContain(beh.top);
    }
    expect(new Set(Object.values(tops)).size).toBeGreaterThanOrEqual(3);
  });

  it('λ blend shifts the top behavior from actual toward shadow', () => {
    // actual SR (→rebel), shadow SN (→coordinate): top must move as λ→1.
    const sweep = lambdaSweep('H-1-SR', 'H-1-SN', 5);
    expect(sweep[0].top).not.toBe(sweep[sweep.length - 1].top);
  });
});
