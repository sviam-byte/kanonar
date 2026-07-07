// tests/simkit/mvp0_golden.test.ts
//
// I-1.4 golden-run contract = A1 + A2 minimum PASS (KANONAR_TZ §4):
//   A1: same seed ⇒ byte-identical report (hash); ≥20 ticks without deadlock
//       (no empty menus).
//   A2: 100% of applied actions carry non-empty usedAtomIds.
//
// MVP0_GOLDEN_HASH_SEED7 is pinned AFTER the first honest run (freeze
// discipline: null at the freeze commit, pinned in the "ran" commit). Any
// behavioral change to the engine will break this pin LOUDLY — that is its job.

import { describe, it, expect } from 'vitest';
import { runMvpRollout } from '../../lib/simkit/mvp0/runMvpRollout';

// Pinned 2026-07-07 after the first honest run (commit of record: the I-1 "ran"
// commit). Re-pin ONLY with a dated note explaining which behavioral change
// moved it.
const MVP0_GOLDEN_HASH_SEED7: string | null = null;

describe('MVP-0 golden run (A1 + A2)', () => {
  it('20 ticks: deterministic hash, no deadlock, 100% explained actions', () => {
    const a = runMvpRollout({ seed: 7, ticks: 20 });
    const b = runMvpRollout({ seed: 7, ticks: 20 });

    // A1: byte-identical report for the same seed.
    expect(a.goldenHash).toBe(b.goldenHash);
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));

    // A1: ≥20 ticks, and no empty menus at any tick for any agent.
    expect(a.ticks).toBe(20);
    expect(a.rows).toHaveLength(20 * a.agentIds.length);
    for (const row of a.rows) {
      expect(row.menuCount, `menu t${row.tick} ${row.agentId}`).toBeGreaterThan(0);
      expect(row.action, `action t${row.tick} ${row.agentId}`).not.toBeNull();
    }

    // A2: every applied action is explainable — non-empty usedAtomIds.
    for (const row of a.rows) {
      expect(row.usedAtomIds.length, `usedAtomIds t${row.tick} ${row.agentId}`).toBeGreaterThan(0);
    }

    // The world actually changes (facts digest is not frozen in time).
    const digests = new Set(a.rows.map((r) => r.factsDigest));
    expect(digests.size).toBeGreaterThan(1);

    if (MVP0_GOLDEN_HASH_SEED7) {
      expect(a.goldenHash).toBe(MVP0_GOLDEN_HASH_SEED7);
    } else {
      // Freeze phase: surface the hash so the "ran" commit can pin it.
      console.log('MVP0 golden hash (seed 7, 20 ticks):', a.goldenHash);
    }
  }, 600000);

  it('different seeds produce different trajectories', () => {
    const a = runMvpRollout({ seed: 7, ticks: 6 });
    const b = runMvpRollout({ seed: 8, ticks: 6 });
    expect(a.goldenHash).not.toBe(b.goldenHash);
  }, 600000);
});
