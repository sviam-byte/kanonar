// tests/simkit/mvp0_c1_sign_v1.test.ts
//
// I-2.2 Communication v1 — scene C1 re-run with speechThreatV1 ON (A5 full).
// Runs ONLY with MVP0_C1_V1=1, AFTER the freeze commit; writes
// kanonar_behavior_lab/data/reports/mvp0_c1_sign_v1.json.
//
// PRE-REGISTERED (frozen with this file, BEFORE the observation; source:
// KANONAR_TZ §4 A5 + impl plan I-2.2). Same design as the v0 cell
// (mvp0_c1_sign.test.ts): twin = base + threaten(A→B, mag 0.7) @t0, readout =
// B at tick 1, 32 seeds; classes UNCHANGED from the v0 freeze. Predictions:
//   S1: Δ danger > 0 (safetyNeed / fear)               [was 0.0 exactly in v0]
//   S2: Δp(confront) ≤ 0
//   S3: Δp(retreat/give) > 0
//   A5 min-PASS: Δp(retreat/give) ≥ 0.15  (KANONAR_TZ §4, frozen v1 numbers)
// Grading note (declared now): if S1 fires but S3 stays 0 because the class
// is unreachable in the prosocial menu, that is a located Q-side/menu break —
// record, do not tune classes post hoc.

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { FC } from '../../lib/config/formulaConfig';
import { makeMvp0Simulator } from '../../lib/simkit/mvp0/runMvpRollout';
import { injectSpeechAtomTransform } from '../../lib/simkit/mvp0/runTwins';
import { MVP0_AGENT_A, MVP0_AGENT_B } from '../../lib/simkit/scenarios/mvp0Scene';

const RUN = process.env.MVP0_C1_V1 === '1';
const REPORTS = path.resolve(__dirname, '../../kanonar_behavior_lab/data/reports');

// Frozen with the v0 cell (54c4c74) — do not edit.
const RETREAT_GIVE = new Set(['retreat', 'escape', 'flee', 'avoid', 'hide', 'submit', 'plead', 'give', 'share']);
const CONFRONT = new Set(['confront', 'attack', 'threaten', 'challenge', 'accuse', 'harm', 'suppress', 'betray']);

type SeedReadout = {
  seed: number;
  actionClass: 'retreat_give' | 'confront' | 'other';
  actionKind: string;
  safetyNeed: number;
  fear: number;
};

function readB(seed: number, inject: boolean): SeedReadout {
  const sim = makeMvp0Simulator(
    seed,
    inject ? injectSpeechAtomTransform({ from: MVP0_AGENT_A, to: MVP0_AGENT_B }) : undefined,
  );
  sim.step();
  const rec = sim.step();
  const applied: any = (rec.trace.actionsApplied || []).find((a: any) => String(a?.actorId) === MVP0_AGENT_B) ?? null;
  const kind = String(applied?.meta?.goalLabKind ?? applied?.kind ?? '');
  const trace: any = (sim.world.facts as any)[`sim:trace:${MVP0_AGENT_B}`] ?? {};
  return {
    seed,
    actionClass: RETREAT_GIVE.has(kind) ? 'retreat_give' : CONFRONT.has(kind) ? 'confront' : 'other',
    actionKind: kind,
    safetyNeed: Number(trace?.drivers?.safetyNeed ?? 0),
    fear: Number(trace?.emotions?.fear ?? 0),
  };
}

describe.runIf(RUN)('C1-v1 sign observation (speechThreatV1 ON, 32 seeds, pre-registered)', () => {
  it('measures Δdanger / Δp(confront) / Δp(retreat_give) against the A5 bar', () => {
    const flag = (FC.communication as any).speechThreatV1;
    flag.enabled = true;
    let rows: Array<{ seed: number; base: SeedReadout; twin: SeedReadout }>;
    try {
      const seeds = Array.from({ length: 32 }, (_, i) => i + 1);
      rows = seeds.map((seed) => ({ seed, base: readB(seed, false), twin: readB(seed, true) }));
    } finally {
      flag.enabled = false;
    }

    const p = (side: 'base' | 'twin', cls: SeedReadout['actionClass']) =>
      rows.filter((r) => r[side].actionClass === cls).length / rows.length;
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

    const dRetreatGive = p('twin', 'retreat_give') - p('base', 'retreat_give');
    const dConfront = p('twin', 'confront') - p('base', 'confront');
    const dSafety = mean(rows.map((r) => r.twin.safetyNeed - r.base.safetyNeed));
    const dFear = mean(rows.map((r) => r.twin.fear - r.base.fear));

    const report = {
      metadata: {
        generated_by: 'tests/simkit/mvp0_c1_sign_v1.test.ts',
        date: new Date().toISOString().slice(0, 10),
        flag: 'FC.communication.speechThreatV1.enabled = true',
        seeds: rows.map((r) => r.seed),
        design: 'twin pair per seed: base vs +threaten(A→B, mag 0.7) at t0; readout = B at tick 1',
        frozen_predictions: {
          S1_danger: 'dSafety > 0 OR dFear > 0',
          S2_confront: 'dConfront <= 0',
          S3_retreat_give: 'dRetreatGive > 0',
          A5_min_pass: 'dRetreatGive >= 0.15',
        },
      },
      aggregates: {
        p_base: {
          retreat_give: p('base', 'retreat_give'),
          confront: p('base', 'confront'),
          other: p('base', 'other'),
        },
        p_twin: {
          retreat_give: p('twin', 'retreat_give'),
          confront: p('twin', 'confront'),
          other: p('twin', 'other'),
        },
        dRetreatGive,
        dConfront,
        dSafetyNeed: dSafety,
        dFear,
        signs_observed: {
          S1_danger: dSafety > 0 || dFear > 0,
          S2_confront: dConfront <= 0,
          S3_retreat_give: dRetreatGive > 0,
          A5_min_pass: dRetreatGive >= 0.15,
        },
      },
      perSeed: rows.map((r) => ({
        seed: r.seed,
        base: { kind: r.base.actionKind, class: r.base.actionClass, safetyNeed: r.base.safetyNeed, fear: r.base.fear },
        twin: { kind: r.twin.actionKind, class: r.twin.actionClass, safetyNeed: r.twin.safetyNeed, fear: r.twin.fear },
      })),
    };

    writeFileSync(path.join(REPORTS, 'mvp0_c1_sign_v1.json'), JSON.stringify(report, null, 1), 'utf8');
    console.log('C1-v1 aggregates:', JSON.stringify(report.aggregates, null, 1));

    expect(rows).toHaveLength(32);
    expect(rows.every((r) => Number.isFinite(r.base.safetyNeed) && Number.isFinite(r.twin.safetyNeed))).toBe(true);
  }, 600000);
});
