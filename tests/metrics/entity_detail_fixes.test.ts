// R2 metric fixes (METRIC-INVENTORY-0 decisions):
// - goalTension/frustration false zeros -> connected to the real goal ecology;
// - RAP performance -> live SDE Pv instead of the Pv_norm=0 filler;
// - scenario `warn` -> rendered as warn, not fail.

import { describe, expect, it } from 'vitest';

import { calculateAllCharacterMetrics } from '@/lib/metrics';
import { calculateDerivedMetrics } from '@/lib/derived-metrics';
import { recomputeV42WithLivePv } from '@/lib/metrics/liveV42';
import { scenarioStatusPresentation } from '@/components/ScenarioDisplay';
import { Branch } from '@/types';

import { mockAgent } from '../pipeline/fixtures';

function fixtureCharacter() {
  const agent = mockAgent('metrics-fixture') as any;
  agent.type = 'CHARACTER';
  return agent;
}

describe('goalTension/frustration false zeros -> honest unknown', () => {
  it('calculateDerivedMetrics passes computed ecology values through and nulls the rest', () => {
    const withEcology = calculateDerivedMetrics({}, {}, {}, { tension: 0.7, frustration: 0.3 } as any);
    expect(withEcology.goalTension).toBeCloseTo(0.7, 9);
    expect(withEcology.frustration).toBeCloseTo(3.0, 9);

    // A REAL zero from a producer stays a zero…
    const realZero = calculateDerivedMetrics({}, {}, {}, { tension: 0, frustration: 0 } as any);
    expect(realZero.goalTension).toBe(0);
    expect(realZero.frustration).toBe(0);

    // …but an absent ecology or uncomputed values are null, never 0.00.
    const withoutEcology = calculateDerivedMetrics({}, {}, {}, null);
    expect(withoutEcology.goalTension).toBeNull();
    expect(withoutEcology.frustration).toBeNull();
    const uncomputed = calculateDerivedMetrics({}, {}, {}, { tension: null, frustration: null } as any);
    expect(uncomputed.goalTension).toBeNull();
    expect(uncomputed.frustration).toBeNull();
  });

  it('static catalog path reports unknown, not a confirmed neutral 0.00 (wiring regression)', () => {
    const result = calculateAllCharacterMetrics(fixtureCharacter(), Branch.Current, []);
    expect(result.goalEcology).toBeTruthy();
    // deriveGoalCatalog does not compute ecology-level tension/frustration —
    // the honest contract is null all the way to the dashboard.
    expect(result.goalEcology?.tension).toBeNull();
    expect(result.goalEcology?.frustration).toBeNull();
    expect(result.derivedMetrics.goalTension).toBeNull();
    expect(result.derivedMetrics.frustration).toBeNull();
  });
});

describe('RAP live Pv (connect real source)', () => {
  it('recomputeV42WithLivePv makes RAP respond to the SDE viability input', () => {
    const calculations = calculateAllCharacterMetrics(fixtureCharacter(), Branch.Current, []);
    const base = {
      eventAdjustedFlatParams: calculations.eventAdjustedFlatParams,
      latents: calculations.latents,
      tomV2Metrics: calculations.tomV2Metrics,
    };
    const rapAtZero = recomputeV42WithLivePv({ ...base, pv: 0 }).RAP_t;
    const rapAtHigh = recomputeV42WithLivePv({ ...base, pv: 80 }).RAP_t;
    expect(rapAtHigh).toBeGreaterThan(rapAtZero);

    // Pv_norm=0 must reproduce the legacy static filler exactly: the fix
    // changes the input source, not the formula.
    expect(recomputeV42WithLivePv({ ...base, pv: 0 })).toEqual(calculations.v42metrics);
  });

  it('is deterministic for identical inputs', () => {
    const calculations = calculateAllCharacterMetrics(fixtureCharacter(), Branch.Current, []);
    const args = {
      eventAdjustedFlatParams: calculations.eventAdjustedFlatParams,
      latents: calculations.latents,
      tomV2Metrics: calculations.tomV2Metrics,
      pv: 63.5,
    };
    expect(JSON.stringify(recomputeV42WithLivePv(args))).toBe(JSON.stringify(recomputeV42WithLivePv(args)));
  });
});

describe('scenario status presentation (warn is not fail)', () => {
  it('maps each status to its own label and palette', () => {
    const ok = scenarioStatusPresentation('ok');
    const warn = scenarioStatusPresentation('warn');
    const fail = scenarioStatusPresentation('fail');

    expect(ok.label).toBe('ok');
    expect(warn.label).toBe('warn');
    expect(fail.label).toBe('fail');

    expect(warn.bgColor).not.toBe(fail.bgColor);
    expect(warn.textColor).not.toBe(fail.textColor);
    expect(warn.borderColor).not.toBe(fail.borderColor);
  });

  it('keeps unknown statuses loud as fail', () => {
    expect(scenarioStatusPresentation('nonsense' as any).label).toBe('fail');
  });
});
