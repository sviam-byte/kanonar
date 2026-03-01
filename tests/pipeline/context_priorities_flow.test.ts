import { describe, expect, it } from 'vitest';

import { deriveContextPriorities } from '@/lib/context/priorities/deriveContextPriorities';
import type { ContextAtom } from '@/lib/context/v2/types';

/**
 * Regression guard for S6 priorities derivation:
 * ensure pipeline receives stable ctx:prio:* atoms with non-empty magnitudes.
 */
describe('deriveContextPriorities', () => {
  it('produces ctx:prio:* atoms for danger when trait/context signals exist', () => {
    const selfId = 'A';
    const atoms: ContextAtom[] = [
      {
        id: `feat:char:${selfId}:trait.paranoia`,
        kind: 'feat',
        source: 'test',
        magnitude: 0.9,
        confidence: 1,
      },
      {
        id: `ctx:danger:${selfId}`,
        kind: 'ctx',
        source: 'test',
        magnitude: 0.8,
        confidence: 1,
      },
    ];

    const result = deriveContextPriorities({ selfId, atoms });
    const dangerPrio = result.atoms.find((a) => a.id === `ctx:prio:danger:${selfId}`);

    expect(result.atoms.length).toBeGreaterThan(0);
    expect(dangerPrio).toBeDefined();
    expect(dangerPrio?.magnitude ?? 0).toBeGreaterThan(0.5);
  });

  it('returns neutral-ish priorities even without input traits', () => {
    const selfId = 'B';
    const result = deriveContextPriorities({ selfId, atoms: [] });
    const prios = result.atoms.filter((a) => a.id.startsWith('ctx:prio:'));

    expect(prios.length).toBeGreaterThan(0);
    for (const p of prios) {
      expect(p.magnitude).toBeGreaterThanOrEqual(0.3);
      expect(p.magnitude).toBeLessThanOrEqual(1);
    }
  });
});
