// tests/simkit/mvp0_c1_sign.test.ts
//
// I-1.3 Communication v0 — scene C1 proto-observation (A5 proto).
// Runs ONLY with MVP0_C1=1 (slow: 32 seeds × twin pair), AFTER the freeze
// commit; writes kanonar_behavior_lab/data/reports/mvp0_c1_sign.json.
//
// PRE-REGISTERED SIGNS (frozen with this file, BEFORE the observation;
// source: KANONAR_TZ §1.4 v0 / §4 A5, KANONAR_PHASE_I_IMPL_PLAN I-1.3):
//   twin = base + one injected threaten speech atom A→B at tick 0, so B
//   receives it in S0 at tick 1. Predicted, for B at tick 1 over 32 seeds:
//     S1: Δ danger    > 0   (danger readout: drv safetyNeed and emo fear)
//     S2: Δp(confront) ≤ 0  (confront/attack/threaten/challenge/accuse class)
//     S3: Δp(retreat/give) > 0 (retreat/escape/flee/avoid/hide/submit/plead/
//                               give/share class)
//   Threshold Δp ≥ 0.15 is I-2 (A5 full); here ONLY the sign is graded.
//   Class membership is read from goalLabKind (the pipeline's abstract kind),
//   falling back to the executed kind.

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { makeMvp0Simulator } from '../../lib/simkit/mvp0/runMvpRollout';
import { injectSpeechAtomTransform } from '../../lib/simkit/mvp0/runTwins';
import { MVP0_AGENT_A, MVP0_AGENT_B } from '../../lib/simkit/scenarios/mvp0Scene';

const RUN = process.env.MVP0_C1 === '1';
const REPORTS = path.resolve(__dirname, '../../kanonar_behavior_lab/data/reports');

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
  sim.step(); // tick 0: injection delivered through inbox → trust gate
  const rec = sim.step(); // tick 1: B decides WITH the atom in S0
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

describe.runIf(RUN)('C1 sign observation (32 seeds, pre-registered)', () => {
  it('measures Δdanger / Δp(confront) / Δp(retreat_give) and writes the report', () => {
    const seeds = Array.from({ length: 32 }, (_, i) => i + 1);
    const rows: Array<{ seed: number; base: SeedReadout; twin: SeedReadout }> = [];
    for (const seed of seeds) {
      rows.push({ seed, base: readB(seed, false), twin: readB(seed, true) });
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
        generated_by: 'tests/simkit/mvp0_c1_sign.test.ts',
        date: new Date().toISOString().slice(0, 10),
        seeds,
        design: 'twin pair per seed: base vs +threaten(A→B, mag 0.7) at t0; readout = B at tick 1',
        frozen_predictions: {
          S1_danger: 'dSafety > 0 OR dFear > 0',
          S2_confront: 'dConfront <= 0',
          S3_retreat_give: 'dRetreatGive > 0',
          threshold_note: 'sign only; dp >= 0.15 is I-2 (A5 full)',
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
        },
      },
      perSeed: rows.map((r) => ({
        seed: r.seed,
        base: { kind: r.base.actionKind, class: r.base.actionClass, safetyNeed: r.base.safetyNeed, fear: r.base.fear },
        twin: { kind: r.twin.actionKind, class: r.twin.actionClass, safetyNeed: r.twin.safetyNeed, fear: r.twin.fear },
      })),
    };

    writeFileSync(path.join(REPORTS, 'mvp0_c1_sign.json'), JSON.stringify(report, null, 1), 'utf8');
    console.log('C1 aggregates:', JSON.stringify(report.aggregates, null, 1));

    // The gate asserts the OBSERVATION EXISTS and the design held (per-seed
    // rows complete); the sign verdict is graded from the report, not here.
    expect(rows).toHaveLength(32);
    expect(rows.every((r) => Number.isFinite(r.base.safetyNeed) && Number.isFinite(r.twin.safetyNeed))).toBe(true);
  }, 600000);
});
