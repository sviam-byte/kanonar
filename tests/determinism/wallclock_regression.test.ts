// tests/determinism/wallclock_regression.test.ts
//
// DET-HIGH closure (DETERMINISM_SWEEP_0): wall-clock must not enter
// persisted/semantic state. Guards the three fixed sites — acquaintance
// lastSeenAt, biography latent anchor, scenario initial world — plus a
// static tripwire so Date.now cannot quietly return to them.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { touchSeen } from '../../lib/social/acquaintance';
import { getEffectiveCharacterBasis } from '../../lib/biography';
import type { AcquaintanceEdge, CharacterEntity } from '../../types';

function edge(): AcquaintanceEdge {
  return { tier: 'unknown', kind: 'stranger', familiarity: 0, idConfidence: 0, notes: [] };
}

function characterWithBio(storyTime?: number): CharacterEntity {
  return {
    entityId: 'c1',
    storyTime,
    vector_base: { A_Safety_Care: 0.5, A_Power_Sovereignty: 0.5 },
    biography: {
      characterId: 'c1',
      events: [
        { id: 'ev1', time: 1_000, kind: 'achievement', valence: 1, intensity: 0.8 },
        { id: 'ev2', time: 500_000, kind: 'betrayal_experienced', valence: -1, intensity: 0.9 },
      ],
    },
  } as unknown as CharacterEntity;
}

describe('wall-clock regression (DET-HIGH)', () => {
  it('touchSeen stamps exactly the supplied tick', () => {
    const e = edge();
    touchSeen(e, 42, { idBoost: 0.1, famBoost: 0.1 });
    expect(e.lastSeenAt).toBe(42);
    touchSeen(e, 43);
    expect(e.lastSeenAt).toBe(43);
  });

  it('biography basis without storyTime is deterministic and anchored to the latest event', () => {
    const withoutStoryTime1 = getEffectiveCharacterBasis(characterWithBio());
    const withoutStoryTime2 = getEffectiveCharacterBasis(characterWithBio());
    expect(withoutStoryTime2).toEqual(withoutStoryTime1);

    const pinnedToLatestEvent = getEffectiveCharacterBasis(characterWithBio(500_000));
    expect(withoutStoryTime1.vectorBase).toEqual(pinnedToLatestEvent.vectorBase);
    expect(withoutStoryTime1.bioState?.latent.vector).toEqual(pinnedToLatestEvent.bioState?.latent.vector);
  });

  it('the fixed files no longer reference Date.now', () => {
    const files = [
      'lib/social/acquaintance.ts',
      'lib/biography.ts',
      'lib/scenario/registry.ts',
    ];
    const offenders = files.filter(file =>
      readFileSync(join(process.cwd(), file), 'utf8').includes('Date.now'));
    expect(offenders).toEqual([]);
  });
});
