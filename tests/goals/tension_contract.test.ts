// tests/goals/tension_contract.test.ts
//
// I-0.5 / WP-B: C(t) read-only contract + per-channel units against the
// frozen definition (docs/TENSION_FUNCTIONAL.md, FROZEN v1 2026-07-07).
//
// The contract half proves the READ-ONLY guarantee on a real pipeline run:
// the serialized pipeline result is byte-identical before and after the
// metric is computed, and the metric itself is deterministic. The unit half
// pins each channel formula to hand-computed fixtures (zero world ⇒ zero C).

import { describe, it, expect } from 'vitest';
import { runGoalLabPipelineV1 } from '../../lib/goal-lab/pipeline/runPipelineV1';
import { RNG, hashString32 } from '../../lib/core/noise';
import { buildProbeAgent, S_defection } from '../../lib/goal-lab/probe/scenes';
import {
  computeTensionVector,
  normalizeTensionChannels,
  TENSION_V1,
  type TensionState,
} from '../../lib/metrics/tension';

function runRealPipeline(seed: number) {
  const self = buildProbeAgent('A', {});
  (self as any).rngChannels = {
    ...((self as any).rngChannels ?? {}),
    decide: new RNG((hashString32(`${seed}:A:decide`) >>> 0) || 1),
  };
  const { world, agentId, participantIds } = S_defection.build(self);
  (world as any).rngSeed = seed;
  const manualAtoms = S_defection.manualAtoms?.(agentId) ?? [];
  return runGoalLabPipelineV1({ world, agentId, participantIds, manualAtoms });
}

// --- fixtures ---------------------------------------------------------------

/** Two-candidate, two-goal antagonistic fixture (TENSION_FUNCTIONAL §2.1–2.2):
 *  E = {g1: .5, g2: .4}, T = 1
 *  a: Δg = {g1: +1, g2: −1}, q = 1.0 → contrib {g1: +.5, g2: −.4}, s_a = .9
 *  b: Δg = {g1: −1, g2: +1}, q = 0.5 → contrib {g1: −.5, g2: +.4}, s_b = .9
 *  cos(Δa, Δb) = −1 ⇒ antagonistic pair (AV: dominant contribs +.5 / −.5)
 *  C_dec  = min(.9,.9)·exp(−|1−.5|/1) = .9·e^{−1/2}
 *  ρ_g1g2 = cos((1,−1),(−1,1)) = −1 ⇒ C_goal = .5·.4·1 = .2 */
function antagonisticFixture(): any {
  const mk = (id: string, q: number, d1: number, d2: number) => ({
    id,
    q,
    deltaGoals: { g1: d1, g2: d2 },
    contribByGoal: { g1: 0.5 * d1, g2: 0.4 * d2 },
  });
  return {
    stages: [
      {
        stage: 'S8',
        atoms: [],
        artifacts: {
          decisionSnapshot: {
            selfId: 'A',
            temperature: 1,
            goalEnergy: { g1: 0.5, g2: 0.4 },
            ranked: [mk('act:a', 1.0, 1, -1), mk('act:b', 0.5, -1, 1)],
          },
        },
      },
    ],
  };
}

const C_DEC_EXPECTED = 0.9 * Math.exp(-0.5); // ≈ 0.545877594
const C_GOAL_EXPECTED = 0.2;

function atomsFixture(): any {
  return {
    stages: [
      {
        stage: 'S6',
        atoms: [
          { id: 'drv:safetyNeed:A', magnitude: 0.8, trace: { parts: { shaped: 0.8, postInhibition: 0.5 } } },
          { id: 'drv:restNeed:A', magnitude: 0.2, trace: { parts: { shaped: 0.2, postInhibition: 0.4 } } },
          { id: 'emo:shame:A', magnitude: 0.5 },
          { id: 'belief:surprise:danger:A', magnitude: 0.3 },
          { id: 'belief:surprise:control:A', magnitude: 0.7 },
          { id: 'belief:surprise:danger:B', magnitude: 0.9 }, // other agent — excluded
        ],
      },
      { stage: 'S8', atoms: [], artifacts: { decisionSnapshot: { selfId: 'A', temperature: 1, goalEnergy: {}, ranked: [] } } },
    ],
  };
}

// --- contract: read-only + deterministic ------------------------------------

describe('tension read-only contract (I-0.5)', () => {
  it('leaves the pipeline result byte-identical and is deterministic', () => {
    const pipeline = runRealPipeline(7);
    const before = JSON.stringify(pipeline);
    const first = computeTensionVector(pipeline);
    const after = JSON.stringify(pipeline);
    expect(after).toBe(before);

    const second = computeTensionVector(pipeline);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.readout.raw).toBe(true);
  });

  it('computes finite channels on a real run', () => {
    const { readout } = computeTensionVector(runRealPipeline(7));
    for (const [k, v] of Object.entries(readout.channels)) {
      expect(Number.isFinite(v), `channel ${k}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

// --- units: zero world, each channel, retention ------------------------------

describe('tension channel units (frozen v1 formulas)', () => {
  it('zero world ⇒ zero C on every channel', () => {
    for (const p of [null, { stages: [] } as any]) {
      const { readout } = computeTensionVector(p);
      expect(readout.channels).toEqual({ dec: 0, goal: 0, mot: 0, refl: 0, epi: 0, total: 0 });
      expect(Object.values(readout.held).every((h) => h === false)).toBe(true);
      expect(readout.pairs).toEqual([]);
    }
  });

  it('C_dec: min-stake × exp(−ΔQ/T̂) over antagonistic pairs, typed AV', () => {
    const { readout } = computeTensionVector(antagonisticFixture());
    expect(readout.channels.dec).toBeCloseTo(C_DEC_EXPECTED, 12);
    expect(readout.pairs).toHaveLength(1);
    expect(readout.pairs[0].type).toBe('AV');
    expect(readout.pairs[0].cos).toBeCloseTo(-1, 12);
  });

  it('C_goal: E_g·E_g′·max(0,−ρ) over goal columns', () => {
    const { readout } = computeTensionVector(antagonisticFixture());
    expect(readout.channels.goal).toBeCloseTo(C_GOAL_EXPECTED, 12);
  });

  it('C_mot: Σ max(0, shaped − postInhibition); C_epi: max surprise, self only', () => {
    const { readout } = computeTensionVector(atomsFixture());
    expect(readout.channels.mot).toBeCloseTo(0.3, 12); // 0.3 + max(0, −0.2)
    expect(readout.channels.epi).toBeCloseTo(0.7, 12); // max(.3, .7); B's .9 excluded
  });

  it('C_refl: shame-only in-trace, full convolution with extras', () => {
    const inTrace = computeTensionVector(atomsFixture());
    expect(inTrace.readout.channels.refl).toBeCloseTo(0.2 * 0.5, 12);

    const full = computeTensionVector(atomsFixture(), {
      reflexiveExtras: {
        valueBehaviorGapTotal: 0.4,
        guilt: 0.2,
        archetypeTension: 0.6,
        lambda: 0.5, // 4λ(1−λ) = 1
        mixtureEntropyBits: 2, // H/2 = 1
      },
    });
    // .25·.4 + .15·.2 + .20·.5 + .15·.6 + .10·1 + .15·1 = 0.57
    expect(full.readout.channels.refl).toBeCloseTo(0.57, 12);
  });

  it('retention: EMA α=0.2, hold after m=3 ticks above θ=0.3, reset on drop', () => {
    const fx = antagonisticFixture(); // dec ≈ .546 > θ; goal = .2 < θ
    let state: TensionState | null = null;
    const ticks: Array<{ heldDec: boolean; emaDec: number }> = [];
    for (let t = 0; t < 3; t++) {
      const r = computeTensionVector(fx, { prev: state });
      state = r.state;
      ticks.push({ heldDec: r.readout.held.dec, emaDec: r.readout.ema.dec });
    }
    expect(ticks.map((x) => x.heldDec)).toEqual([false, false, true]);
    // constant input ⇒ EMA stays at the input value
    for (const x of ticks) expect(x.emaDec).toBeCloseTo(C_DEC_EXPECTED, 12);
    expect(state!.holdRun.goal).toBe(0); // .2 < θ never accumulates

    // drop to the empty world: EMA decays by (1−α), hold resets
    const dropped = computeTensionVector({ stages: [] } as any, { prev: state });
    expect(dropped.readout.ema.dec).toBeCloseTo(0.8 * C_DEC_EXPECTED, 12);
    expect(dropped.state.holdRun.dec).toBe(0);
    expect(dropped.readout.held.dec).toBe(false);
  });

  it('normalizeTensionChannels: z-score with σ=0 guard', () => {
    const { readout } = computeTensionVector(antagonisticFixture());
    const z = normalizeTensionChannels(readout.channels, {
      dec: { mean: 0.5, std: 0.25 },
      goal: { mean: 0.2, std: 0 }, // σ=0 ⇒ 0
      mot: { mean: 0, std: 1 },
      refl: { mean: 0, std: 1 },
      epi: { mean: 0, std: 1 },
    });
    expect(z.dec).toBeCloseTo((C_DEC_EXPECTED - 0.5) / 0.25, 12);
    expect(z.goal).toBe(0);
  });

  it('frozen constants match the doc (§7)', () => {
    expect(TENSION_V1.emaAlpha).toBe(0.2);
    expect(TENSION_V1.thetaHold).toBe(0.3);
    expect(TENSION_V1.holdTicks).toBe(3);
    const w = TENSION_V1.reflexiveWeights;
    const sum = Object.values(w).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 12);
  });
});
