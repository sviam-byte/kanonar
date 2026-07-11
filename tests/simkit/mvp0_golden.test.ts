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

// Corrected 2026-07-07 during the I-2.4 audit: clean checkouts of the freeze
// commit 54c4c74 and later commits reproduce 124e3434…; the ran commit
// 3dd9cf3 accidentally pinned an unsupported 73eaf2ce… value. Re-pin ONLY with
// a dated note explaining which behavioral change moved it.
// 2026-07-10: provenance-only re-pin for 1740492. Applied actions, events, and
// menu counts remain byte-stable against 7b68c1e (semantic-subset hash
// efa018b3...), while sim:trace.best now names the seeded Gumbel winner and the
// trace adds chosen/contextAxes/topByQ readouts. Those intentional provenance
// and diagnostic-shape changes alter usedAtomIds and the whole-facts digest.
// 2026-07-11: the hash history has TWO per-environment lineages (this machine:
// 73eaf2ce->4352ad74; the 2026-07-07/1740492 toolchain: 124e3434->451edc9d).
// Neither was "wrong": localeCompare sorts in the semantic path made the order
// ICU/locale-dependent. All semantic sorts now use codeUnitCompare
// (lib/utils/compare.ts, gated by tests/determinism/collation_boundary.test.ts).
// The hash below is unchanged by that fix on this machine. Cross-toolchain
// equality still requires an independent run; this test proves the local pin
// and the boundary test prevents reintroducing locale-dependent comparison.
const MVP0_GOLDEN_HASH_SEED7: string | null =
  '4352ad740f0c5cb8accba616b1c668148a2ea617c5d9ac32490879682820180a';

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
