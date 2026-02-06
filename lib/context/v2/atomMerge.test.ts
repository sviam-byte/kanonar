import { describe, expect, it } from 'vitest';
import { mergeAtomsPreferNewer } from './atomMerge';
import type { ContextAtom } from './types';

function a(id: string, magnitude = 0.5): ContextAtom {
  return {
    id,
    ns: 'ctx',
    kind: 'scalar',
    source: 'derived',
    magnitude,
    confidence: 1,
  };
}

describe('mergeAtomsPreferNewer', () => {
  it('prefers added atoms on collision and keeps stage barrier ordering (added first)', () => {
    const prev = [a('ctx:threat:A', 0.2), a('ctx:resource:A', 0.9)];
    const added = [a('ctx:threat:A', 0.8), a('ctx:uncertainty:A', 0.1)];

    const m = mergeAtomsPreferNewer(prev, added);

    expect(m.newIds).toEqual(['ctx:uncertainty:A']);
    expect(m.overriddenIds).toEqual(['ctx:threat:A']);
    expect(m.atoms.map((x) => x.id)).toEqual([
      'ctx:threat:A',
      'ctx:uncertainty:A',
      'ctx:resource:A',
    ]);
    expect(m.atoms.find((x) => x.id === 'ctx:threat:A')?.magnitude).toBe(0.8);
  });
});
