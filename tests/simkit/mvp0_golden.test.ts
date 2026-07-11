// tests/simkit/mvp0_golden.test.ts
//
// I-1.4 golden-run contract = A1 + A2 minimum PASS (KANONAR_TZ §4):
//   A1: same seed ⇒ byte-identical report (hash); ≥20 ticks without deadlock
//       (no empty menus).
//   A2: 100% of applied actions carry non-empty usedAtomIds.
//
// MVP0_SEMANTIC_HASH_SEED7 pins applied dynamics after the honest freeze/run
// sequence. Same-environment full-row equality separately guards deterministic
// diagnostic output without treating factsDigest as cross-toolchain semantics.

import { describe, it, expect } from 'vitest';
import { runMvpRollout } from '../../lib/simkit/mvp0/runMvpRollout';
import { canonicalStringify, sha256Hex } from '../../lib/simkit/mvp0/hash';

// Corrected 2026-07-07 during the I-2.4 audit: clean checkouts of the freeze
// commit 54c4c74 and later commits reproduce 124e3434…; the ran commit
// 3dd9cf3 accidentally pinned an unsupported 73eaf2ce… value. Re-pin ONLY with
// a dated note explaining which behavioral change moved it.
// 2026-07-10: provenance-only re-pin for 1740492. Applied actions, events, and
// menu counts remain byte-stable against 7b68c1e (semantic-subset hash
// efa018b3...), while sim:trace.best now names the seeded Gumbel winner and the
// trace adds chosen/contextAxes/topByQ readouts. Those intentional provenance
// and diagnostic-shape changes alter usedAtomIds and the whole-facts digest.
// 2026-07-11 oracle re-scope: the full-row hash is per-ENVIRONMENT, not
// broken. Verified same day with clean worktrees (unchanged lockfile,
// ms-playwright-go Node v24.11.1): env A reproduces 4352ad74... exactly at
// both 7be8f15 (the pin commit) and 2822bff. The 07-07/1740492 toolchain
// produced 124e3434...->451edc9d...; a third sandbox produced e925be50...
// Three stable lineages prove factsDigest (diagnostic/provenance shape) is
// not a cross-toolchain contract. Full-row equality stays as a
// same-environment determinism check; the frozen cross-environment pin is
// the applied-dynamics subset tick/agent/action/events/menuCount, which
// agrees across all three environments (first recorded in the 1740492
// provenance-only repair).
const MVP0_SEMANTIC_HASH_SEED7 =
  'efa018b311fe889bbb1c2600f360c4cf207918289f9d23ed1757144c0d6dabb6';

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

    const semanticRows = a.rows.map(({ tick, agentId, action, events, menuCount }) => ({
      tick, agentId, action, events, menuCount,
    }));
    expect(sha256Hex(canonicalStringify(semanticRows))).toBe(MVP0_SEMANTIC_HASH_SEED7);
  }, 600000);

  it('different seeds produce different trajectories', () => {
    const a = runMvpRollout({ seed: 7, ticks: 6 });
    const b = runMvpRollout({ seed: 8, ticks: 6 });
    expect(a.goldenHash).not.toBe(b.goldenHash);
  }, 600000);
});
