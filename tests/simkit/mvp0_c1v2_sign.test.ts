// tests/simkit/mvp0_c1v2_sign.test.ts
//
// I-2.4 C1-v2 observation: independent confirmation of the engagement /
// retention signature seen after the frozen A5-STAKES yield prediction failed.
// Runs ONLY with MVP0_C1V2=1, AFTER the freeze commit; writes
// kanonar_behavior_lab/data/reports/mvp0_c1v2_sign.json.
//
// PRE-REGISTERED (frozen with this file, BEFORE the observation):
// - scene: makeMvp0StakesWorld; B holds the token;
// - both FC.communication.speechThreatV1 and FC.objects.contextAxesV1 are ON;
// - twin: +threaten(A→B, magnitude 0.7) at t0;
// - readout: B's applied action and trace at tick 1;
// - fresh holdout seeds 33..64 (the exploratory A5-STAKES cell used 1..32).
//
// C1-v2 is a VERSIONED alternative signature, not a retroactive PASS for the
// falsified A5 yield prediction. The old classes and result remain unchanged.
// Frozen readouts:
//   engagement = {negotiate}; voluntary_yield = {give, share};
//   S1: dSafetyNeed > 0 OR dFear > 0;
//   S2: dConfront <= 0 (the v0 frozen CONFRONT class);
//   S3a engagement: dNegotiate > 0;
//   S3b retention: dVoluntaryYield <= 0;
//   min-PASS: dNegotiate >= +0.10 AND dVoluntaryYield <= 0.
// The 0.10 bar is frozen before the holdout run. If direction fires below it,
// grade DIRECTIONAL-UNDER-BAR; do not change classes or rerun these seeds.

import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { FC } from '../../lib/config/formulaConfig';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import type { SimWorld } from '../../lib/simkit/core/types';
import { injectSpeechAtomTransform } from '../../lib/simkit/mvp0/runTwins';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { makeMvp0StakesWorld, MVP0_AGENT_A, MVP0_AGENT_B } from '../../lib/simkit/scenarios/mvp0Scene';

const RUN = process.env.MVP0_C1V2 === '1';
const REPORTS = path.resolve(__dirname, '../../kanonar_behavior_lab/data/reports');

const CONFRONT = new Set(['confront', 'attack', 'threaten', 'challenge', 'accuse', 'harm', 'suppress', 'betray']);
const ENGAGEMENT = new Set(['negotiate']);
const VOLUNTARY_YIELD = new Set(['give', 'share']);

type Readout = { seed: number; kind: string; safetyNeed: number; fear: number };

function runTick1(seed: number, transform: ((world: SimWorld) => SimWorld) | null): Readout {
  const base = makeMvp0StakesWorld(seed);
  const sim = new SimKitSimulator({
    scenarioId: 'c1v2',
    seed,
    initialWorld: transform ? transform(base) : base,
    plugins: [
      makeGoalLabDeciderPlugin({ storePipeline: false }),
      makeGoalLabPipelinePlugin(),
      makePerceptionMemoryPlugin(),
    ],
    maxRecords: 8,
  });
  sim.step();
  const record = sim.step();
  const applied = (record.trace.actionsApplied || []).find((action) => String(action?.actorId) === MVP0_AGENT_B);
  const trace = (sim.world.facts as Record<string, unknown>)[`sim:trace:${MVP0_AGENT_B}`] as
    | { drivers?: { safetyNeed?: unknown }; emotions?: { fear?: unknown } }
    | undefined;
  return {
    seed,
    kind: String(applied?.meta?.goalLabKind ?? applied?.kind ?? ''),
    safetyNeed: Number(trace?.drivers?.safetyNeed ?? 0),
    fear: Number(trace?.emotions?.fear ?? 0),
  };
}

const share = (rows: Readout[], actionClass: Set<string>) =>
  rows.filter((row) => actionClass.has(row.kind)).length / rows.length;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const countByKind = (rows: Readout[]) => {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  return counts;
};

describe.runIf(RUN)('C1-v2 engagement/retention observation (fresh seeds 33-64)', () => {
  it('measures the frozen holdout signature and writes the report', () => {
    const communicationFlag = FC.communication.speechThreatV1 as { enabled: boolean };
    const objectFlag = FC.objects.contextAxesV1 as { enabled: boolean };
    const seeds = Array.from({ length: 32 }, (_, index) => index + 33);

    communicationFlag.enabled = true;
    objectFlag.enabled = true;
    let base: Readout[];
    let twin: Readout[];
    try {
      base = seeds.map((seed) => runTick1(seed, null));
      twin = seeds.map((seed) =>
        runTick1(seed, injectSpeechAtomTransform({ from: MVP0_AGENT_A, to: MVP0_AGENT_B })),
      );
    } finally {
      communicationFlag.enabled = false;
      objectFlag.enabled = false;
    }

    const dNegotiate = share(twin, ENGAGEMENT) - share(base, ENGAGEMENT);
    const dVoluntaryYield = share(twin, VOLUNTARY_YIELD) - share(base, VOLUNTARY_YIELD);
    const dConfront = share(twin, CONFRONT) - share(base, CONFRONT);
    const dSafetyNeed = mean(twin.map((row, index) => row.safetyNeed - base[index].safetyNeed));
    const dFear = mean(twin.map((row, index) => row.fear - base[index].fear));

    const report = {
      metadata: {
        generated_by: 'tests/simkit/mvp0_c1v2_sign.test.ts',
        date: new Date().toISOString().slice(0, 10),
        seeds,
        scene: 'makeMvp0StakesWorld (B holds the token)',
        design: 'holdout twin pairs: base vs +threaten(A→B, mag 0.7) at t0; readout B at tick 1',
        frozen_predictions: {
          S1_danger: 'dSafetyNeed > 0 OR dFear > 0',
          S2_confront: 'dConfront <= 0',
          S3a_engagement: 'dNegotiate > 0',
          S3b_retention: 'dVoluntaryYield <= 0',
          C1_V2_min_pass: 'dNegotiate >= 0.10 AND dVoluntaryYield <= 0',
          engagement_class: [...ENGAGEMENT],
          voluntary_yield_class: [...VOLUNTARY_YIELD].sort(),
          confront_class: [...CONFRONT].sort(),
        },
      },
      aggregates: {
        p_base: {
          negotiate: share(base, ENGAGEMENT),
          voluntary_yield: share(base, VOLUNTARY_YIELD),
          confront: share(base, CONFRONT),
        },
        p_twin: {
          negotiate: share(twin, ENGAGEMENT),
          voluntary_yield: share(twin, VOLUNTARY_YIELD),
          confront: share(twin, CONFRONT),
        },
        dNegotiate,
        dVoluntaryYield,
        dConfront,
        dSafetyNeed,
        dFear,
        kinds_base: countByKind(base),
        kinds_twin: countByKind(twin),
        signs_observed: {
          S1_danger: dSafetyNeed > 0 || dFear > 0,
          S2_confront: dConfront <= 0,
          S3a_engagement: dNegotiate > 0,
          S3b_retention: dVoluntaryYield <= 0,
          C1_V2_min_pass: dNegotiate >= 0.1 && dVoluntaryYield <= 0,
        },
      },
      perSeed: seeds.map((seed, index) => ({ seed, base: base[index], twin: twin[index] })),
    };

    writeFileSync(path.join(REPORTS, 'mvp0_c1v2_sign.json'), JSON.stringify(report, null, 1), 'utf8');
    console.log('C1-v2:', JSON.stringify(report.aggregates, null, 1));

    expect(base).toHaveLength(32);
    expect(twin).toHaveLength(32);
    expect(base.every((row) => Number.isFinite(row.safetyNeed) && Number.isFinite(row.fear))).toBe(true);
    expect(twin.every((row) => Number.isFinite(row.safetyNeed) && Number.isFinite(row.fear))).toBe(true);
  }, 600000);
});
