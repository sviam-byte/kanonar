import { describe, it, expect } from 'vitest';

import { sweepAxis, sweepAxisFull, toCsvPerSeed, linspace } from '@/lib/goal-lab/probe/sweep';
import { S_defection } from '@/lib/goal-lab/probe/scenes';

// WP-A / I-0.1 contract: per-seed export invariants.
//
// The per-seed table is the carrier for the seed-aware interaction statistic
// D = mean_s(b_{0.1,s} - b_{0.9,s}) (interaction_perseed.py). Its validity
// rests on three exact identities pinned here, not on grader goodwill:
//   (P) projection      — sweepAxis(o) === sweepAxisFull(o).aggregate;
//   (I) aggregation     — for each axis value and outcome label L,
//                         mean_s 1[outcome_s = L] === aggregate p(L)
//                         (hence, by OLS linearity in y, mean_s b_s === b_agg);
//   (D) determinism     — same seed list => identical per-seed rows.

const OPTS = {
  axis: 'A_Care_Compassion',
  scene: S_defection,
  values: linspace(0, 1, 3),
  seeds: [1, 2, 3, 4],
};

describe('per-seed export (WP-A contract)', () => {
  const full = sweepAxisFull(OPTS);

  it('(P) aggregate is a pure projection — pre-WP-A output is byte-identical', () => {
    expect(sweepAxis(OPTS)).toEqual(full.aggregate);
  });

  it('(D) deterministic under the same seed list', () => {
    expect(sweepAxisFull(OPTS).perSeed).toEqual(full.perSeed);
  });

  it('each (value, seed) carries exactly one chosen action and unit outcome mass', () => {
    for (const value of OPTS.values) {
      for (const seed of OPTS.seeds) {
        const rows = full.perSeed.filter(r => r.value === value && r.seed === seed);
        const acts = rows.filter(r => r.layer === 'S8' && r.readout.startsWith('act:'));
        expect(acts, `act rows @value=${value} seed=${seed}`).toHaveLength(1);
        expect(acts[0].result).toBe(1);
        const labels = rows.filter(r => r.readout.startsWith('outcome:'));
        const mass = labels.reduce((s, r) => s + r.result, 0);
        expect(mass, `outcome mass @value=${value} seed=${seed}`).toBe(1);
        for (const name of ['coop', 'unclassified']) {
          const r = rows.find(x => x.readout === name);
          expect(r, `${name} row present`).toBeTruthy();
          expect([0, 1]).toContain(r!.result);
        }
      }
    }
  });

  it('(I) aggregation identity: mean over seeds of indicators === aggregate p', () => {
    for (const value of OPTS.values) {
      const seedRows = full.perSeed.filter(r => r.value === value);
      const nSeeds = new Set(
        seedRows.filter(r => r.readout.startsWith('act:')).map(r => r.seed),
      ).size;
      expect(nSeeds).toBe(OPTS.seeds.length);

      // outcome:<label> — absent per-seed rows are structural zeros.
      const aggLabels = full.aggregate.filter(
        r => r.value === value && r.readout.startsWith('outcome:'),
      );
      expect(aggLabels.length).toBeGreaterThan(0);
      for (const agg of aggLabels) {
        const meanIndicator =
          seedRows.filter(r => r.readout === agg.readout).reduce((s, r) => s + r.result, 0) / nSeeds;
        expect(meanIndicator, `${agg.readout} @value=${value}`).toBeCloseTo(agg.result, 12);
      }

      // coop / payoff means.
      const pairs: Array<[string, string]> = [
        ['coop', 'coop_rate'],
        ['unclassified', 'unclassified_rate'],
        ['outcome_self', 'outcome_mean_self'],
        ['outcome_other', 'outcome_mean_other'],
      ];
      for (const [seedName, aggName] of pairs) {
        const mean =
          seedRows.filter(r => r.readout === seedName).reduce((s, r) => s + r.result, 0) / nSeeds;
        const agg = full.aggregate.find(r => r.value === value && r.readout === aggName);
        expect(agg, `${aggName} present`).toBeTruthy();
        expect(mean, `${seedName} vs ${aggName} @value=${value}`).toBeCloseTo(agg!.result, 12);
      }
    }
  });

  it('per-seed CSV schema is the long format + seed column', () => {
    const csv = toCsvPerSeed(full.perSeed.slice(0, 2));
    expect(csv.split('\n')[0]).toBe('axis,value,scene,layer,readout,result,seed');
  });
});
