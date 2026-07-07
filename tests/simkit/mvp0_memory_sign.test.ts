// tests/simkit/mvp0_memory_sign.test.ts
//
// I-2.5 A3 observation. Runs ONLY with MVP0_MEM=1, AFTER the freeze commit;
// writes kanonar_behavior_lab/data/reports/mvp0_memory_sign.json.
//
// PRE-REGISTERED before observation:
// - seed 3: selected because the already-frozen C1-v1 report establishes that
//   this seed is threat-responsive (talk→negotiate), not from an A3 probe;
// - common setup in both twins: threaten(A→B, magnitude 0.7) at t0;
// - only intervention: wipe B's memory immediately before t2;
// - readout: B's applied decisions at t2..t6 inclusive;
// - A3 behavior min-PASS (KANONAR_TZ §4): first B divergence ≤5 ticks after
//   wipe, i.e. first divergence tick ≤6;
// - A3 decay min-PASS: discrete half-life 23 is within ×2 of the frozen
//   continuous prediction ln(0.5)/ln(0.97)=22.7566 ticks.
// If behavior does not diverge, grade MEMORY-STATE-REAL / BEHAVIOR-DECORATIVE;
// do not change the seed, wipe tick, horizon, or readout after the freeze.

import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { FC } from '../../lib/config/formulaConfig';
import { runTwins } from '../../lib/simkit/mvp0/runTwins';
import { MVP0_AGENT_A, MVP0_AGENT_B } from '../../lib/simkit/scenarios/mvp0Scene';

const RUN = process.env.MVP0_MEM === '1';
const REPORTS = path.resolve(__dirname, '../../kanonar_behavior_lab/data/reports');

describe.runIf(RUN)('A3 threat-memory wipe observation (pre-registered)', () => {
  it('writes the frozen seed-3 report', () => {
    const memoryFlag = FC.memory.threatTraceV1 as { enabled: boolean } & typeof FC.memory.threatTraceV1;
    const communicationFlag = FC.communication.speechThreatV1 as { enabled: boolean };
    memoryFlag.enabled = true;
    communicationFlag.enabled = true;
    let diff: ReturnType<typeof runTwins>;
    try {
      diff = runTwins({
        seed: 3,
        ticks: 7,
        setup: { kind: 'injectSpeechAtom', from: MVP0_AGENT_A, to: MVP0_AGENT_B, magnitude: 0.7 },
        intervention: { kind: 'wipeMemory', agentId: MVP0_AGENT_B, atTick: 2 },
      });
    } finally {
      memoryFlag.enabled = false;
      communicationFlag.enabled = false;
    }

    const baseB = diff.baseRows.filter((row) => row.agentId === MVP0_AGENT_B);
    const twinB = diff.twinRows.filter((row) => row.agentId === MVP0_AGENT_B);
    const firstBDivergence = baseB.find((row, index) =>
      row.tick >= 2 && JSON.stringify(row.action) !== JSON.stringify(twinB[index]?.action),
    )?.tick ?? null;
    const divergenceLag = firstBDivergence == null ? null : firstBDivergence - 2;
    const divergenceIndex = firstBDivergence == null ? -1 : baseB.findIndex((row) => row.tick === firstBDivergence);
    const baseAtoms = new Set(divergenceIndex >= 0 ? baseB[divergenceIndex].usedAtomIds : []);
    const twinAtoms = new Set(divergenceIndex >= 0 ? twinB[divergenceIndex].usedAtomIds : []);
    const onlyBase = [...baseAtoms].filter((id) => !twinAtoms.has(id)).sort();
    const onlyTwin = [...twinAtoms].filter((id) => !baseAtoms.has(id)).sort();

    const predictedHalfLife = Math.log(0.5) / Math.log(memoryFlag.decayPerTick);
    const discreteHalfLife = Math.ceil(predictedHalfLife);
    const report = {
      metadata: {
        generated_by: 'tests/simkit/mvp0_memory_sign.test.ts',
        date: new Date().toISOString().slice(0, 10),
        freeze_design: {
          seed: 3,
          seed_basis: 'already-frozen C1-v1 threat-responsive seed (talk→negotiate)',
          setup: 'common threaten(A→B, magnitude 0.7) at t0',
          intervention: 'wipe B memory immediately before t2',
          readout: 'B applied decisions, t2..t6',
        },
        frozen_predictions: {
          A3_behavior: 'first B decision divergence tick <= 6 (lag <= 4 within the five post-wipe ticks)',
          A3_decay: 'discrete half-life within ×2 of ln(0.5)/ln(0.97)',
        },
      },
      decay: {
        decayPerTick: memoryFlag.decayPerTick,
        predictedHalfLife,
        discreteHalfLife,
        ratio: discreteHalfLife / predictedHalfLife,
        withinFactorTwo: discreteHalfLife / predictedHalfLife >= 0.5 && discreteHalfLife / predictedHalfLife <= 2,
      },
      behavior: {
        interventionTick: diff.interventionTick,
        firstDivergenceTickAnyAgent: diff.firstDivergenceTick,
        firstBDivergenceTick: firstBDivergence,
        divergenceLag,
        divergedAtoms: { onlyBase, onlyTwin },
        baseGoldenHash: diff.baseGoldenHash,
        twinGoldenHash: diff.twinGoldenHash,
        perTickB: baseB.map((row, index) => ({
          tick: row.tick,
          baseAction: row.action,
          twinAction: twinB[index]?.action ?? null,
          baseMemoryAtomIds: row.usedAtomIds.filter((id) => id.startsWith('mem:speech:threat:')),
          twinMemoryAtomIds: (twinB[index]?.usedAtomIds ?? []).filter((id) => id.startsWith('mem:speech:threat:')),
        })),
        signs_observed: {
          preWipePrefixIdentical: baseB.filter((row) => row.tick < 2).every((row, index) =>
            JSON.stringify(row.action) === JSON.stringify(twinB[index]?.action),
          ),
          A3_behavior_min_pass: firstBDivergence != null && firstBDivergence <= 6,
        },
      },
    };

    writeFileSync(path.join(REPORTS, 'mvp0_memory_sign.json'), JSON.stringify(report, null, 1), 'utf8');
    console.log('A3 memory:', JSON.stringify({ decay: report.decay, behavior: report.behavior.signs_observed, firstBDivergence }));

    expect(baseB).toHaveLength(7);
    expect(twinB).toHaveLength(7);
    expect(report.behavior.signs_observed.preWipePrefixIdentical).toBe(true);
  }, 600000);
});
