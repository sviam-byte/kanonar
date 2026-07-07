// tests/simkit/mvp0_stakes_sign.test.ts
//
// I-2.3 staked C1 observation — the A4 (outcome level) and A5 (full bar)
// cells on the scene where the object IS the stake (ТЗ's С1: threat over an
// object; B holds the token). Runs ONLY with MVP0_STAKES=1, AFTER the freeze
// commit; writes kanonar_behavior_lab/data/reports/mvp0_stakes_sign.json.
//
// PRE-REGISTERED (frozen with this file, BEFORE the observation; thresholds
// are KANONAR_TZ §4 frozen v1 numbers):
//
// Cell A4-OBJ (object causality on outcomes; objectContextAxesV1 ON,
// speechThreatV1 OFF, no threat): readout = A (the non-holder) at tick 1.
//   ACQUISITIVE class (frozen now): {take, seize, trade, negotiate, loot}.
//   Prediction: p(A acquisitive | staked object) − p(A acquisitive | object
//   ablated) ≥ +0.10 @32 seeds — rival-held stake (scarcity 0.7) pulls A
//   toward acquisition.
//
// Cell A5-STAKES (Communication v1 over stakes; BOTH flags ON): staked scene,
// twin = +threaten(A→B, mag 0.7)@t0 vs same staked scene without the threat.
// Readout = B (the holder) at tick 1; classes frozen from the v0 cell.
//   S1: Δdanger > 0 (safetyNeed/fear) — replication of C1-V1
//   S2: Δp(confront) ≤ 0
//   S3: Δp(retreat/give) > 0 — now reachable: B holds, `give` is in the menu
//   A5 min-PASS: Δp(retreat/give) ≥ 0.15
// Grading note (declared now): if S3 fires but < 0.15, grade A5 as
// DIRECTIONAL-UNDER-BAR — record, do not re-run without a versioned change.

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { FC } from '../../lib/config/formulaConfig';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { makeMvp0StakesWorld, MVP0_AGENT_A, MVP0_AGENT_B, MVP0_OBJECT_ID } from '../../lib/simkit/scenarios/mvp0Scene';
import { injectSpeechAtomTransform, removeObjectTransform } from '../../lib/simkit/mvp0/runTwins';
import type { SimWorld } from '../../lib/simkit/core/types';

const RUN = process.env.MVP0_STAKES === '1';
const REPORTS = path.resolve(__dirname, '../../kanonar_behavior_lab/data/reports');

// Frozen with the v0 cell (54c4c74) — do not edit.
const RETREAT_GIVE = new Set(['retreat', 'escape', 'flee', 'avoid', 'hide', 'submit', 'plead', 'give', 'share']);
const CONFRONT = new Set(['confront', 'attack', 'threaten', 'challenge', 'accuse', 'harm', 'suppress', 'betray']);
// Frozen with THIS file.
const ACQUISITIVE = new Set(['take', 'seize', 'trade', 'negotiate', 'loot']);

type Readout = { seed: number; kind: string; safetyNeed: number; fear: number };

function runTick1(seed: number, transform: ((w: SimWorld) => SimWorld) | null, agentId: string): Readout {
  const base = makeMvp0StakesWorld(seed);
  const sim = new SimKitSimulator({
    scenarioId: 'stakes',
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
  const rec = sim.step();
  const applied: any = (rec.trace.actionsApplied || []).find((a: any) => String(a?.actorId) === agentId) ?? null;
  const trace: any = (sim.world.facts as any)[`sim:trace:${agentId}`] ?? {};
  return {
    seed,
    kind: String(applied?.meta?.goalLabKind ?? applied?.kind ?? ''),
    safetyNeed: Number(trace?.drivers?.safetyNeed ?? 0),
    fear: Number(trace?.emotions?.fear ?? 0),
  };
}

const share = (rows: Readout[], cls: Set<string>) => rows.filter((r) => cls.has(r.kind)).length / rows.length;
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

describe.runIf(RUN)('staked C1 observation (32 seeds, pre-registered)', () => {
  it('cell A4-OBJ + cell A5-STAKES; writes the report', () => {
    const objFlag = (FC.objects as any).contextAxesV1;
    const commFlag = (FC.communication as any).speechThreatV1;
    const seeds = Array.from({ length: 32 }, (_, i) => i + 1);

    // ── Cell A4-OBJ: objectContextAxesV1 ON, no threat, A's acquisition.
    objFlag.enabled = true;
    let a4With: Readout[], a4Ablated: Readout[];
    try {
      a4With = seeds.map((s) => runTick1(s, null, MVP0_AGENT_A));
      a4Ablated = seeds.map((s) => runTick1(s, removeObjectTransform(MVP0_OBJECT_ID), MVP0_AGENT_A));
    } finally {
      objFlag.enabled = false;
    }
    const dAcquisitive = share(a4With, ACQUISITIVE) - share(a4Ablated, ACQUISITIVE);

    // ── Cell A5-STAKES: both flags ON, threat vs no threat on the staked scene.
    objFlag.enabled = true;
    commFlag.enabled = true;
    let a5Base: Readout[], a5Twin: Readout[];
    try {
      a5Base = seeds.map((s) => runTick1(s, null, MVP0_AGENT_B));
      a5Twin = seeds.map((s) =>
        runTick1(s, injectSpeechAtomTransform({ from: MVP0_AGENT_A, to: MVP0_AGENT_B }), MVP0_AGENT_B),
      );
    } finally {
      objFlag.enabled = false;
      commFlag.enabled = false;
    }
    const dRetreatGive = share(a5Twin, RETREAT_GIVE) - share(a5Base, RETREAT_GIVE);
    const dConfront = share(a5Twin, CONFRONT) - share(a5Base, CONFRONT);
    const dSafety = mean(a5Twin.map((r, i) => r.safetyNeed - a5Base[i].safetyNeed));
    const dFear = mean(a5Twin.map((r, i) => r.fear - a5Base[i].fear));

    const report = {
      metadata: {
        generated_by: 'tests/simkit/mvp0_stakes_sign.test.ts',
        date: new Date().toISOString().slice(0, 10),
        seeds,
        scene: 'makeMvp0StakesWorld (B holds the token)',
        frozen_predictions: {
          A4_OBJ: 'dAcquisitive >= +0.10 (A, objectContextAxesV1 ON, no threat, object vs ablated)',
          A5_S1: 'dSafety > 0 OR dFear > 0',
          A5_S2: 'dConfront <= 0',
          A5_S3: 'dRetreatGive > 0',
          A5_min_pass: 'dRetreatGive >= 0.15',
        },
      },
      cellA4: {
        p_with: { acquisitive: share(a4With, ACQUISITIVE) },
        p_ablated: { acquisitive: share(a4Ablated, ACQUISITIVE) },
        dAcquisitive,
        kinds_with: a4With.map((r) => r.kind),
        kinds_ablated: a4Ablated.map((r) => r.kind),
        signs_observed: { A4_OBJ_sign: dAcquisitive > 0, A4_OBJ_bar: dAcquisitive >= 0.1 },
      },
      cellA5: {
        p_base: { retreat_give: share(a5Base, RETREAT_GIVE), confront: share(a5Base, CONFRONT) },
        p_twin: { retreat_give: share(a5Twin, RETREAT_GIVE), confront: share(a5Twin, CONFRONT) },
        dRetreatGive,
        dConfront,
        dSafetyNeed: dSafety,
        dFear,
        kinds_base: a5Base.map((r) => r.kind),
        kinds_twin: a5Twin.map((r) => r.kind),
        signs_observed: {
          S1_danger: dSafety > 0 || dFear > 0,
          S2_confront: dConfront <= 0,
          S3_retreat_give: dRetreatGive > 0,
          A5_min_pass: dRetreatGive >= 0.15,
        },
      },
    };

    writeFileSync(path.join(REPORTS, 'mvp0_stakes_sign.json'), JSON.stringify(report, null, 1), 'utf8');
    console.log('A4-OBJ:', JSON.stringify(report.cellA4.signs_observed), 'dAcq =', dAcquisitive.toFixed(3));
    console.log('A5-STAKES:', JSON.stringify(report.cellA5.signs_observed), 'dRG =', dRetreatGive.toFixed(3), 'dSafety =', dSafety.toFixed(4));

    expect(a4With).toHaveLength(32);
    expect(a5Twin).toHaveLength(32);
  }, 600000);
});
