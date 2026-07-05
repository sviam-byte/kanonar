import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  sweepAxis, sweepAxisFull, toCsv, toCsvPerSeed, linspace,
  type ProbeRecord, type PerSeedRecord, type SweepResult,
} from '@/lib/goal-lab/probe/sweep';
import {
  S_contest, S_defection, S_neutral,
  S_contest_pressure, S_defection_pressure, S_coercive_order,
} from '@/lib/goal-lab/probe/scenes';
import { FC } from '@/lib/config/formulaConfig';

// T1.5 factorial exporter (permanent; runs ONLY with OUTCOME_SWEEP=1 so the
// normal gate stays fast). Emits the pre-registered v3 cells
// (outcomeSignTableV3.ts) into two CSVs by priorInfluence flag:
//   kanonar_behavior_lab/data/reports/outcome_sweep_off.csv
//   kanonar_behavior_lab/data/reports/outcome_sweep_on.csv  (+ @T0.1/@T0.9 cells)
// Consumed by kanonar_behavior_lab/src/basis/outcome_triage_v3.py.
// Run AFTER the freeze commit only (pre-registration discipline).

const REPORTS = path.resolve(__dirname, '../../kanonar_behavior_lab/data/reports');
const RUN = process.env.OUTCOME_SWEEP === '1';
const values = linspace(0, 1, 7);
const seeds = [1, 2, 3, 4, 5, 6, 7, 8];

/** Re-tag records with a cell-suffixed scene id (schema stays 6 columns). */
function tagScene(records: ProbeRecord[], sceneTag: string): ProbeRecord[] {
  return records.map(r => ({ ...r, scene: sceneTag }));
}

/** Same re-tag for a full sweep result (aggregate + per-seed rows). */
function tagSceneFull(result: SweepResult, sceneTag: string): SweepResult {
  return {
    aggregate: tagScene(result.aggregate, sceneTag),
    perSeed: result.perSeed.map(r => ({ ...r, scene: sceneTag })),
  };
}

describe.runIf(RUN)('T1.5 factorial export (v3 pre-registered cells)', () => {
  it('exports the priorInfluence=OFF cells', () => {
    const PI = (FC.actionScoring as any).priorInfluence;
    PI.enabled = false;
    const records: ProbeRecord[] = [
      ...sweepAxis({ axis: 'A_Power_Sovereignty', scene: S_contest, values, seeds }),
      ...sweepAxis({ axis: 'A_Power_Sovereignty', scene: S_contest_pressure, values, seeds }),
      ...sweepAxis({ axis: 'A_Power_Sovereignty', scene: S_neutral, values, seeds }),
    ];
    expect(records.some(r => r.layer === 'OUTCOME')).toBe(true);
    writeFileSync(path.join(REPORTS, 'outcome_sweep_off.csv'), toCsv(records), 'utf8');
  }, 600000);

  it('exports the priorInfluence=ON cells v4 (+ temperature-interaction cells)', () => {
    // v4 (outcomeSignTableV4.ts): 32 seeds — declared at freeze; expected
    // effects are few-percent probability shifts that 8 seeds cannot resolve.
    // S_neutral controls are not re-run (v3 verdicts stand; OFF path is
    // bit-identical legacy order).
    const seedsV4 = Array.from({ length: 32 }, (_, i) => i + 1);
    const PI = (FC.actionScoring as any).priorInfluence;
    PI.enabled = true;
    try {
      // WP-A: same runs, two tables — the aggregate CSV (byte-identical schema
      // to the v4 freeze run) and its per-seed twin (`seed` column added),
      // consumed by kanonar_behavior_lab/src/basis/interaction_perseed.py.
      const cells: SweepResult[] = [
        sweepAxisFull({ axis: 'A_Care_Compassion', scene: S_defection, values, seeds: seedsV4 }),
        sweepAxisFull({ axis: 'A_Power_Sovereignty', scene: S_contest_pressure, values, seeds: seedsV4 }),
        sweepAxisFull({ axis: 'A_Care_Compassion', scene: S_defection_pressure, values, seeds: seedsV4 }),
        sweepAxisFull({ axis: 'A_Liberty_Autonomy', scene: S_coercive_order, values, seeds: seedsV4 }),
        tagSceneFull(
          sweepAxisFull({
            axis: 'A_Power_Sovereignty', scene: S_contest_pressure, values, seeds: seedsV4,
            baseAxisOverrides: { B_decision_temperature: 0.1 },
          }),
          'S_contest_pressure@T0.1',
        ),
        tagSceneFull(
          sweepAxisFull({
            axis: 'A_Power_Sovereignty', scene: S_contest_pressure, values, seeds: seedsV4,
            baseAxisOverrides: { B_decision_temperature: 0.9 },
          }),
          'S_contest_pressure@T0.9',
        ),
      ];
      const records: ProbeRecord[] = cells.flatMap(c => c.aggregate);
      const perSeed: PerSeedRecord[] = cells.flatMap(c => c.perSeed);
      expect(records.some(r => r.layer === 'OUTCOME')).toBe(true);
      expect(perSeed.some(r => r.layer === 'OUTCOME')).toBe(true);
      writeFileSync(path.join(REPORTS, 'outcome_sweep_on_v4.csv'), toCsv(records), 'utf8');
      writeFileSync(path.join(REPORTS, 'outcome_sweep_on_v4_perseed.csv'), toCsvPerSeed(perSeed), 'utf8');
    } finally {
      PI.enabled = false;
    }
  }, 600000);
});

// Keep the file discoverable by vitest even when the export is skipped.
describe('outcome sweep exporter', () => {
  it('is env-guarded (OUTCOME_SWEEP=1 to run)', () => {
    expect(typeof RUN).toBe('boolean');
  });
});
